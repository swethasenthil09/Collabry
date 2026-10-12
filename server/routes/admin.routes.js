const express = require('express');
const pool = require('../config/db');
const { authenticate, requireSystemAdmin } = require('../middleware/auth');

const router = express.Router();

// All routes here require authentication and system admin role
router.use(authenticate, requireSystemAdmin);

// GET /api/v1/admin/stats - Overview statistics
router.get('/stats', async (req, res) => {
  try {
    const [userStats] = await pool.query(`
      SELECT 
        COUNT(*) as total_users,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_users,
        SUM(CASE WHEN status = 'frozen' THEN 1 ELSE 0 END) as frozen_users,
        SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) as blocked_users,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admin_users
      FROM users WHERE deleted_at IS NULL
    `);

    const [reportStats] = await pool.query(`
      SELECT 
        COUNT(*) as total_reports,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_reports,
        SUM(CASE WHEN status = 'reviewed' THEN 1 ELSE 0 END) as reviewed_reports,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolved_reports,
        SUM(CASE WHEN status = 'dismissed' THEN 1 ELSE 0 END) as dismissed_reports
      FROM reports
    `);

    const [appealStats] = await pool.query(`
      SELECT 
        COUNT(*) as total_appeals,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_appeals,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_appeals,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_appeals
      FROM unfreeze_appeals
    `);

    res.json({
      users: userStats[0],
      reports: reportStats[0],
      appeals: appealStats[0],
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch admin statistics' } });
  }
});

// GET /api/v1/admin/reports - List all user reports
router.get('/reports', async (req, res) => {
  try {
    const { status, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT 
        r.id,
        r.reporter_id,
        r.target_type,
        r.target_id,
        r.reported_user_id,
        r.reason,
        r.reason_category,
        r.status,
        r.action_taken,
        r.admin_notes,
        r.created_at,
        reporter.username as reporter_username,
        reporter.email as reporter_email,
        reporter.avatar_url as reporter_avatar,
        reported.username as reported_username,
        reported.email as reported_email,
        reported.avatar_url as reported_avatar,
        reported.status as reported_current_status,
        reported.report_count as reported_total_reports,
        reported.frozen_until as reported_frozen_until
      FROM reports r
      LEFT JOIN users reporter ON r.reporter_id = reporter.id
      LEFT JOIN users reported ON r.reported_user_id = reported.id
    `;

    const params = [];

    if (status && status !== 'all') {
      query += ' WHERE r.status = ? ';
      params.push(status);
    }

    query += ' ORDER BY r.created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const [reports] = await pool.query(query, params);

    res.json({ reports });
  } catch (err) {
    console.error('Admin reports error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch reports' } });
  }
});

// PATCH /api/v1/admin/reports/:id - Update report status or dismiss
router.patch('/reports/:id', async (req, res) => {
  try {
    const { status, admin_notes, dismiss_penalty } = req.body;

    const [reports] = await pool.query('SELECT * FROM reports WHERE id = ?', [req.params.id]);
    if (reports.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Report not found' } });
    }

    const report = reports[0];

    await pool.query(
      'UPDATE reports SET status = COALESCE(?, status), admin_notes = COALESCE(?, admin_notes) WHERE id = ?',
      [status, admin_notes, req.params.id]
    );

    // If dismissed and requested to remove penalty, reset/decrement report_count
    if (status === 'dismissed' && dismiss_penalty && report.reported_user_id) {
      await pool.query(
        'UPDATE users SET report_count = GREATEST(0, report_count - 1), status = "active", frozen_until = NULL, freeze_reason = NULL WHERE id = ?',
        [report.reported_user_id]
      );

      await pool.query(
        `INSERT INTO notifications (user_id, type, title, body, reference_type, reference_id)
         VALUES (?, 'system', 'Report Dismissed: Account Restored', 'A system administrator reviewed and dismissed a previous report against your account. Your account is fully active.', 'report', ?)`,
        [report.reported_user_id, req.params.id]
      );
    }

    res.json({ message: 'Report updated successfully' });
  } catch (err) {
    console.error('Update report error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to update report' } });
  }
});

// GET /api/v1/admin/appeals - List all unfreeze appeals
router.get('/appeals', async (req, res) => {
  try {
    const { status = 'all' } = req.query;

    let query = `
      SELECT 
        a.id,
        a.user_id,
        a.reason as appeal_reason,
        a.status,
        a.admin_notes,
        a.created_at,
        a.reviewed_at,
        u.username,
        u.email,
        u.name,
        u.avatar_url,
        u.status as user_status,
        u.frozen_until,
        u.freeze_reason,
        u.report_count,
        reviewer.username as reviewed_by_username
      FROM unfreeze_appeals a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN users reviewer ON a.reviewed_by = reviewer.id
    `;

    const params = [];
    if (status !== 'all') {
      query += ' WHERE a.status = ? ';
      params.push(status);
    }

    query += ' ORDER BY a.created_at DESC';

    const [appeals] = await pool.query(query, params);
    res.json({ appeals });
  } catch (err) {
    console.error('Admin appeals error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch appeals' } });
  }
});

// POST /api/v1/admin/appeals/:id/review - Review and give access or decline
router.post('/appeals/:id/review', async (req, res) => {
  try {
    const { action, admin_notes } = req.body; // action: 'approve' | 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Action must be approve or reject' } });
    }

    const [appeals] = await pool.query('SELECT * FROM unfreeze_appeals WHERE id = ?', [req.params.id]);
    if (appeals.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Appeal request not found' } });
    }

    const appeal = appeals[0];
    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    await pool.query(
      `UPDATE unfreeze_appeals 
       SET status = ?, admin_notes = ?, reviewed_at = NOW(), reviewed_by = ? 
       WHERE id = ?`,
      [newStatus, admin_notes || null, req.user.id, req.params.id]
    );

    if (action === 'approve') {
      // Restore user access immediately
      await pool.query(
        `UPDATE users 
         SET status = 'active', frozen_until = NULL, freeze_reason = NULL 
         WHERE id = ?`,
        [appeal.user_id]
      );

      // Send unfreeze approval notification to user
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, body, reference_type, reference_id)
         VALUES (?, 'system', 'Unfreeze Appeal Approved!', ?, 'appeal', ?)`,
        [
          appeal.user_id,
          `A system administrator reviewed your appeal and has restored your full account access. ${admin_notes ? `Admin note: "${admin_notes}"` : ''}`,
          req.params.id,
        ]
      );
    } else {
      // Appeal rejected - user remains frozen or penalty stands
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, body, reference_type, reference_id)
         VALUES (?, 'warning', 'Unfreeze Appeal Declined', ?, 'appeal', ?)`,
        [
          appeal.user_id,
          `Your unfreeze appeal request was reviewed and declined by the system administrator. ${admin_notes ? `Admin note: "${admin_notes}"` : 'Your penalty period remains in effect.'}`,
          req.params.id,
        ]
      );
    }

    res.json({
      message: action === 'approve' ? 'Appeal approved and user access restored.' : 'Appeal rejected.',
      appeal_id: req.params.id,
      new_status: newStatus,
    });
  } catch (err) {
    console.error('Review appeal error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to review appeal' } });
  }
});

// GET /api/v1/admin/users - Search and manage all users
router.get('/users', async (req, res) => {
  try {
    const { q, status, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT 
        id, username, email, name, alias, avatar_url, role, status, 
        frozen_until, freeze_reason, report_count, email_verified, created_at
      FROM users
      WHERE deleted_at IS NULL
    `;

    const params = [];

    if (q && q.trim()) {
      query += ' AND (username LIKE ? OR email LIKE ? OR name LIKE ?) ';
      const searchPattern = `%${q.trim()}%`;
      params.push(searchPattern, searchPattern, searchPattern);
    }

    if (status && status !== 'all') {
      query += ' AND status = ? ';
      params.push(status);
    }

    query += ' ORDER BY report_count DESC, created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const [users] = await pool.query(query, params);
    res.json({ users });
  } catch (err) {
    console.error('Admin users error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to list users' } });
  }
});

// POST /api/v1/admin/users/:id/moderation - Directly moderate a user
router.post('/users/:id/moderation', async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const { action, freeze_days = 7, reason = '', role } = req.body;

    const [users] = await pool.query('SELECT * FROM users WHERE id = ?', [targetUserId]);
    if (users.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    const targetUser = users[0];

    // Prevent demoting site creator
    if (targetUser.username === 'goshh' && action === 'set_role' && role !== 'admin') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Cannot modify primary administrator' } });
    }

    if (action === 'unfreeze') {
      await pool.query(
        'UPDATE users SET status = "active", frozen_until = NULL, freeze_reason = NULL WHERE id = ?',
        [targetUserId]
      );
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, body, reference_type, reference_id)
         VALUES (?, 'system', 'Account Unfrozen by Administrator', 'A system administrator has manually unfreezed your account. You can now use all platform features.', 'user', ?)`,
        [targetUserId, targetUserId]
      );
      return res.json({ message: 'User unfreezed successfully', status: 'active' });
    }

    if (action === 'freeze') {
      const days = Number(freeze_days) || 7;
      await pool.query(
        'UPDATE users SET status = "frozen", frozen_until = DATE_ADD(NOW(), INTERVAL ? DAY), freeze_reason = ? WHERE id = ?',
        [days, reason || 'Administrative freeze action', targetUserId]
      );
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, body, reference_type, reference_id)
         VALUES (?, 'warning', 'Account Notice: Frozen by Admin', ?, 'user', ?)`,
        [targetUserId, `Your account was frozen by an administrator for ${days} days. Reason: ${reason || 'Terms of service violation'}.`, targetUserId]
      );
      return res.json({ message: `User frozen for ${days} days`, status: 'frozen' });
    }

    if (action === 'block') {
      await pool.query(
        'UPDATE users SET status = "blocked", frozen_until = NULL, freeze_reason = ? WHERE id = ?',
        [reason || 'Administrative permanent block', targetUserId]
      );
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, body, reference_type, reference_id)
         VALUES (?, 'warning', 'Account Blocked', ?, 'user', ?)`,
        [targetUserId, `Your account has been permanently blocked by an administrator. Reason: ${reason || 'Community violation'}.`, targetUserId]
      );
      return res.json({ message: 'User blocked permanently', status: 'blocked' });
    }

    if (action === 'reset_reports') {
      await pool.query(
        'UPDATE users SET report_count = 0 WHERE id = ?',
        [targetUserId]
      );
      return res.json({ message: 'User report count reset to 0', report_count: 0 });
    }

    if (action === 'set_role') {
      if (!['user', 'admin'].includes(role)) {
        return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid role' } });
      }
      await pool.query('UPDATE users SET role = ? WHERE id = ?', [role, targetUserId]);
      return res.json({ message: `User role updated to ${role}`, role });
    }

    res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid action specified' } });
  } catch (err) {
    console.error('Moderate user error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to moderate user' } });
  }
});

module.exports = router;
