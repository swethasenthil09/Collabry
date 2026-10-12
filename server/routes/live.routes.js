const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authenticate, optionalAuth } = require('../middleware/auth');

// GET /api/v1/live - List live, scheduled, or ended sessions
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { type, community_id, status = 'live' } = req.query;
    const currentUserId = req.user ? req.user.id : null;
    const params = [];

    let where = '1=1';
    if (status && status !== 'all') {
      where += ' AND ls.status = ?';
      params.push(status);
    }

    if (type && type !== 'all') {
      where += ' AND ls.session_type = ?';
      params.push(type);
    }
    if (community_id) {
      where += ' AND ls.community_id = ?';
      params.push(community_id);
    }

    const rsvpSelect = currentUserId
      ? `(SELECT COUNT(*) FROM live_rsvps lr WHERE lr.session_id = ls.id AND lr.user_id = ${pool.escape(currentUserId)}) > 0 AS is_rsvpd,`
      : '0 AS is_rsvpd,';

    let orderBy = 'ls.created_at DESC';
    if (status === 'scheduled') {
      orderBy = 'COALESCE(ls.scheduled_for, ls.created_at) ASC';
    } else if (status === 'ended') {
      orderBy = 'COALESCE(ls.ended_at, ls.created_at) DESC';
    }

    const [sessions] = await pool.query(`
      SELECT 
        ls.id,
        ls.title,
        ls.description,
        ls.host_id,
        ls.community_id,
        ls.session_type,
        ls.status,
        ls.viewer_count,
        ls.created_at,
        ls.ended_at,
        ls.scheduled_for,
        TIMESTAMPDIFF(SECOND, ls.created_at, COALESCE(ls.ended_at, NOW())) as duration_seconds,
        (SELECT COUNT(*) FROM live_rsvps lr WHERE lr.session_id = ls.id) as rsvp_count,
        ${rsvpSelect}
        u.name as host_name,
        u.username as host_username,
        u.alias as host_alias,
        u.avatar_url as host_avatar,
        c.name as community_name
      FROM live_sessions ls
      JOIN users u ON ls.host_id = u.id
      LEFT JOIN communities c ON ls.community_id = c.id
      WHERE ${where}
      ORDER BY ${orderBy}
    `, params);

    res.json(sessions);
  } catch (err) {
    console.error('Fetch live sessions error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch live sessions' } });
  }
});

// POST /api/v1/live - Start a new live session or schedule one
router.post('/', authenticate, async (req, res) => {
  try {
    const { title, description, community_id, session_type = 'video', scheduled_for, is_scheduled } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Session title is required' } });
    }

    const isScheduling = Boolean(is_scheduled || scheduled_for);

    if (isScheduling) {
      // Create scheduled session
      const parsedDate = scheduled_for ? new Date(scheduled_for) : new Date(Date.now() + 3600000);
      const sqlDate = isNaN(parsedDate.getTime())
        ? new Date(Date.now() + 3600000).toISOString().slice(0, 19).replace('T', ' ')
        : parsedDate.toISOString().slice(0, 19).replace('T', ' ');

      const [result] = await pool.query(
        `INSERT INTO live_sessions (title, description, host_id, community_id, session_type, status, viewer_count, scheduled_for)
         VALUES (?, ?, ?, ?, ?, 'scheduled', 0, ?)`,
        [title.trim(), description ? description.trim() : null, req.user.id, community_id || null, session_type === 'voice' ? 'voice' : 'video', sqlDate]
      );

      const [newSession] = await pool.query(`
        SELECT 
          ls.*,
          0 as is_rsvpd,
          0 as rsvp_count,
          u.name as host_name,
          u.username as host_username,
          u.alias as host_alias,
          u.avatar_url as host_avatar,
          c.name as community_name
        FROM live_sessions ls
        JOIN users u ON ls.host_id = u.id
        LEFT JOIN communities c ON ls.community_id = c.id
        WHERE ls.id = ?
      `, [result.insertId]);

      const sessionData = newSession[0];
      const io = req.app.get('io');
      if (io) {
        io.emit('live:session_scheduled', sessionData);
      }

      return res.status(201).json(sessionData);
    }

    // Live Now: End any existing live session by the same host
    await pool.query(
      "UPDATE live_sessions SET status = 'ended', ended_at = NOW() WHERE host_id = ? AND status = 'live'",
      [req.user.id]
    );

    const [result] = await pool.query(
      `INSERT INTO live_sessions (title, description, host_id, community_id, session_type, status, viewer_count)
       VALUES (?, ?, ?, ?, ?, 'live', 1)`,
      [title.trim(), description ? description.trim() : null, req.user.id, community_id || null, session_type === 'voice' ? 'voice' : 'video']
    );

    const sessionId = result.insertId;

    const [newSession] = await pool.query(`
      SELECT 
        ls.*,
        u.name as host_name,
        u.username as host_username,
        u.alias as host_alias,
        u.avatar_url as host_avatar,
        c.name as community_name
      FROM live_sessions ls
      JOIN users u ON ls.host_id = u.id
      LEFT JOIN communities c ON ls.community_id = c.id
      WHERE ls.id = ?
    `, [sessionId]);

    const sessionData = newSession[0];

    // Emit live stream started event to all clients via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.emit('live:stream_started', sessionData);
    }

    res.status(201).json(sessionData);
  } catch (err) {
    console.error('Start live session error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to start live session' } });
  }
});

// POST /api/v1/live/:id/start - Host starts a previously scheduled session
router.post('/:id/start', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const [session] = await pool.query(
      'SELECT * FROM live_sessions WHERE id = ?',
      [id]
    );

    if (session.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found' } });
    }

    if (session[0].host_id !== req.user.id) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only the host can start this session' } });
    }

    // End any current live session by the host
    await pool.query(
      "UPDATE live_sessions SET status = 'ended', ended_at = NOW() WHERE host_id = ? AND status = 'live' AND id != ?",
      [req.user.id, id]
    );

    await pool.query(
      "UPDATE live_sessions SET status = 'live', viewer_count = 1, created_at = NOW() WHERE id = ?",
      [id]
    );

    const [updated] = await pool.query(`
      SELECT 
        ls.*,
        u.name as host_name,
        u.username as host_username,
        u.alias as host_alias,
        u.avatar_url as host_avatar,
        c.name as community_name
      FROM live_sessions ls
      JOIN users u ON ls.host_id = u.id
      LEFT JOIN communities c ON ls.community_id = c.id
      WHERE ls.id = ?
    `, [id]);

    const sessionData = updated[0];
    const io = req.app.get('io');
    if (io) {
      io.emit('live:stream_started', sessionData);
      io.emit('live:scheduled_started', { sessionId: parseInt(id, 10) });
    }

    res.json(sessionData);
  } catch (err) {
    console.error('Start scheduled session error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to start scheduled session' } });
  }
});

// POST /api/v1/live/:id/rsvp - Toggle RSVP / Reminder for an upcoming space
router.post('/:id/rsvp', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const [existing] = await pool.query(
      'SELECT id FROM live_rsvps WHERE session_id = ? AND user_id = ?',
      [id, userId]
    );

    let isRsvpd = false;
    if (existing.length > 0) {
      await pool.query('DELETE FROM live_rsvps WHERE session_id = ? AND user_id = ?', [id, userId]);
      isRsvpd = false;
    } else {
      await pool.query('INSERT INTO live_rsvps (session_id, user_id) VALUES (?, ?)', [id, userId]);
      isRsvpd = true;
    }

    const [countResult] = await pool.query(
      'SELECT COUNT(*) as count FROM live_rsvps WHERE session_id = ?',
      [id]
    );
    const rsvpCount = countResult[0]?.count || 0;

    res.json({ is_rsvpd: isRsvpd, rsvp_count: rsvpCount });
  } catch (err) {
    console.error('RSVP error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to toggle RSVP' } });
  }
});

// DELETE /api/v1/live/:id - Host cancels / deletes scheduled broadcast
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const [session] = await pool.query('SELECT * FROM live_sessions WHERE id = ?', [id]);
    if (session.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found' } });
    }

    if (session[0].host_id !== req.user.id) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only the host can delete this session' } });
    }

    await pool.query('DELETE FROM live_sessions WHERE id = ?', [id]);

    const io = req.app.get('io');
    if (io) {
      io.emit('live:session_deleted', { sessionId: parseInt(id, 10) });
    }

    res.json({ message: 'Session deleted successfully' });
  } catch (err) {
    console.error('Delete session error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to delete session' } });
  }
});

// POST /api/v1/live/:id/end - End a live session
router.post('/:id/end', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const [session] = await pool.query(
      'SELECT * FROM live_sessions WHERE id = ? AND status = "live"',
      [id]
    );

    if (session.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Active live session not found' } });
    }

    if (session[0].host_id !== req.user.id) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only the host can end this live session' } });
    }

    await pool.query(
      'UPDATE live_sessions SET status = "ended", ended_at = NOW() WHERE id = ?',
      [id]
    );

    const io = req.app.get('io');
    if (io) {
      io.emit('live:stream_ended', { sessionId: parseInt(id, 10) });
      io.to(`live:${id}`).emit('live:ended', { sessionId: parseInt(id, 10) });
    }

    res.json({ message: 'Live broadcast ended successfully' });
  } catch (err) {
    console.error('End live session error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to end live session' } });
  }
});

// POST /api/v1/live/:id/remove-user - Host removes/kicks a user from the live broadcast
router.post('/:id/remove-user', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    const [session] = await pool.query(
      'SELECT * FROM live_sessions WHERE id = ? AND status = "live"',
      [id]
    );

    if (session.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Active live session not found' } });
    }

    if (session[0].host_id !== req.user.id) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only the host can remove participants' } });
    }

    if (String(session[0].host_id) === String(userId)) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Host cannot remove themselves' } });
    }

    const io = req.app.get('io');
    if (io) {
      io.to(`live:${id}`).emit('live:user_removed', {
        sessionId: parseInt(id, 10),
        userId: parseInt(userId, 10) || userId,
      });
    }

    res.json({ message: 'User removed from broadcast successfully' });
  } catch (err) {
    console.error('Remove user error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to remove user' } });
  }
});

// POST /api/v1/live/:id/viewers - Update live viewer count
router.post('/:id/viewers', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { count, change } = req.body;

    if (count !== undefined) {
      await pool.query('UPDATE live_sessions SET viewer_count = ? WHERE id = ?', [Math.max(1, count), id]);
    } else {
      const delta = change === -1 ? -1 : 1;
      await pool.query(
        'UPDATE live_sessions SET viewer_count = GREATEST(1, viewer_count + ?) WHERE id = ?',
        [delta, id]
      );
    }

    const [session] = await pool.query('SELECT viewer_count FROM live_sessions WHERE id = ?', [id]);
    const viewerCount = session[0]?.viewer_count || 1;

    const io = req.app.get('io');
    if (io) {
      io.to(`live:${id}`).emit('live:viewer_count', { sessionId: parseInt(id, 10), count: viewerCount });
    }

    res.json({ viewer_count: viewerCount });
  } catch (err) {
    console.error('Update viewers error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to update viewer count' } });
  }
});

module.exports = router;
