const express = require('express');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

/**
 * Preset Reason Categories available to users:
 * 1. Harassment or Hate Speech
 * 2. Spam, Scam, or Phishing
 * 3. Inappropriate or Offensive Content
 * 4. Impersonation or Fake Identity
 * 5. Misleading Information or Fraud
 * 6. Other / Custom Reason
 */

// POST /api/v1/reports - Report a user, post, comment, or message
router.post('/', authenticate, async (req, res) => {
  try {
    const { target_type, target_id, reason_category, custom_reason } = req.body;

    if (!target_type || !target_id || !reason_category) {
      return res.status(400).json({
        error: { code: 'VALIDATION', message: 'Target type, target ID, and reason category are required' }
      });
    }

    if (!['user', 'post', 'comment', 'message'].includes(target_type)) {
      return res.status(400).json({
        error: { code: 'VALIDATION', message: 'Invalid target type. Must be user, post, comment, or message' }
      });
    }

    // Resolve reported user ID based on target type
    let reportedUserId = null;

    if (target_type === 'user') {
      reportedUserId = Number(target_id);
    } else if (target_type === 'post') {
      const [posts] = await pool.query('SELECT author_id FROM posts WHERE id = ?', [target_id]);
      if (posts.length === 0) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Post not found' } });
      reportedUserId = posts[0].author_id;
    } else if (target_type === 'comment') {
      const [comments] = await pool.query('SELECT author_id FROM comments WHERE id = ?', [target_id]);
      if (comments.length === 0) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Comment not found' } });
      reportedUserId = comments[0].author_id;
    } else if (target_type === 'message') {
      const [msgs] = await pool.query('SELECT sender_id FROM messages WHERE id = ?', [target_id]);
      if (msgs.length === 0) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Message not found' } });
      reportedUserId = msgs[0].sender_id;
    }

    if (!reportedUserId) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Could not determine reported user' } });
    }

    if (reportedUserId === req.user.id) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'You cannot report your own account or content' } });
    }

    // Check if target user exists and get their current status
    const [targetUsers] = await pool.query(
      'SELECT id, username, email, report_count, status, role FROM users WHERE id = ?',
      [reportedUserId]
    );

    if (targetUsers.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Reported user does not exist' } });
    }

    const targetUser = targetUsers[0];

    // Build complete report reason string
    const finalReason = custom_reason && custom_reason.trim()
      ? `${reason_category}: ${custom_reason.trim()}`
      : reason_category;

    // Check if reporter already reported this exact target to prevent duplicate spam
    const [existingReport] = await pool.query(
      'SELECT id FROM reports WHERE reporter_id = ? AND target_type = ? AND target_id = ?',
      [req.user.id, target_type, target_id]
    );

    if (existingReport.length > 0) {
      return res.status(409).json({
        error: { code: 'ALREADY_REPORTED', message: 'You have already submitted a report for this item.' }
      });
    }

    // 1. Insert report record
    const [reportResult] = await pool.query(
      `INSERT INTO reports (reporter_id, target_type, target_id, reported_user_id, reason, reason_category, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [req.user.id, target_type, target_id, reportedUserId, finalReason, reason_category]
    );

    // 2. Increment reported user's report_count
    const newReportCount = (targetUser.report_count || 0) + 1;
    let actionTaken = 'frozen';

    // 3. User Moderation Rule:
    // If reported > 3 times (i.e. >= 3 reports): automatically permanently blocked
    // Otherwise: send warning and freeze account for 1 week (7 days)
    if (newReportCount >= 3) {
      actionTaken = 'blocked';
      await pool.query(
        `UPDATE users 
         SET report_count = ?, status = 'blocked', frozen_until = NULL, freeze_reason = ? 
         WHERE id = ?`,
        [newReportCount, `Account blocked after receiving ${newReportCount} reports: ${finalReason}`, reportedUserId]
      );

      // Send critical blocking notification
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, body, reference_type, reference_id)
         VALUES (?, 'warning', 'Account Permanently Blocked', ?, 'user', ?)`,
        [
          reportedUserId,
          `Your account has been automatically blocked after receiving 3 violation reports. Reason: ${finalReason}. You may submit an appeal to the system admin.`,
          reportedUserId,
        ]
      );
    } else {
      actionTaken = 'frozen';
      const freezeDays = 7;
      await pool.query(
        `UPDATE users 
         SET report_count = ?, status = 'frozen', frozen_until = DATE_ADD(NOW(), INTERVAL ? DAY), freeze_reason = ? 
         WHERE id = ?`,
        [newReportCount, freezeDays, finalReason, reportedUserId]
      );

      // Send 1-week warning & frozen notification
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, body, reference_type, reference_id)
         VALUES (?, 'warning', 'Account Warning: Account Frozen for 1 Week', ?, 'user', ?)`,
        [
          reportedUserId,
          `Your account was reported for "${reason_category}" and is frozen for 7 days. Posting and messaging are temporarily restricted. You may submit an appeal request to the system admin.`,
          reportedUserId,
        ]
      );
    }

    // Record action on report record
    await pool.query('UPDATE reports SET action_taken = ? WHERE id = ?', [actionTaken, reportResult.insertId]);

    res.status(201).json({
      message: 'Report submitted successfully. The user account has been reviewed and flagged.',
      report_id: reportResult.insertId,
      action_taken: actionTaken,
      report_count: newReportCount,
    });
  } catch (err) {
    console.error('Submit report error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to submit report' } });
  }
});

// POST /api/v1/reports/appeal - Submit an appeal to the admin to unfreeze user account
router.post('/appeal', authenticate, async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Please provide an explanation for your unfreeze appeal.' } });
    }

    // Verify user is currently frozen or blocked
    const [users] = await pool.query(
      'SELECT id, username, status, frozen_until, freeze_reason, report_count FROM users WHERE id = ?',
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    const u = users[0];
    if (u.status === 'active') {
      return res.status(400).json({ error: { code: 'NOT_FROZEN', message: 'Your account is already active.' } });
    }

    // Check if there is already a pending appeal
    const [pendingAppeals] = await pool.query(
      'SELECT id, created_at FROM unfreeze_appeals WHERE user_id = ? AND status = "pending"',
      [req.user.id]
    );

    if (pendingAppeals.length > 0) {
      return res.status(409).json({
        error: { code: 'PENDING_APPEAL', message: 'You already have an appeal under review by the system administration.' }
      });
    }

    const [result] = await pool.query(
      'INSERT INTO unfreeze_appeals (user_id, reason, status) VALUES (?, ?, "pending")',
      [req.user.id, reason.trim()]
    );

    // Send confirmation notification
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, reference_type, reference_id)
       VALUES (?, 'system', 'Unfreeze Appeal Submitted', 'Your appeal has been received. A system administrator will review your case.', 'appeal', ?)`,
      [req.user.id, result.insertId]
    );

    res.status(201).json({
      message: 'Unfreeze appeal submitted successfully. An administrator will review your request.',
      appeal_id: result.insertId,
    });
  } catch (err) {
    console.error('Submit appeal error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to submit unfreeze appeal' } });
  }
});

// GET /api/v1/reports/my-status - Check current user's moderation & appeal status
router.get('/my-status', authenticate, async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT id, username, status, frozen_until, freeze_reason, report_count FROM users WHERE id = ?',
      [req.user.id]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    const u = users[0];

    const [appeals] = await pool.query(
      'SELECT id, reason, status, admin_notes, created_at, reviewed_at FROM unfreeze_appeals WHERE user_id = ? ORDER BY created_at DESC LIMIT 5',
      [req.user.id]
    );

    res.json({
      status: u.status,
      frozen_until: u.frozen_until,
      freeze_reason: u.freeze_reason,
      report_count: u.report_count,
      latest_appeal: appeals[0] || null,
      appeals,
    });
  } catch (err) {
    console.error('Get my status error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to get moderation status' } });
  }
});

module.exports = router;
