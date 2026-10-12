const express = require('express');
const pool = require('../../config/db');
const { authenticate } = require('../../middleware/auth');
const { logProjectActivity } = require('../../utils/helpers');

const router = express.Router();

// =========================================================================
// COLLABORATIVE CANVAS & WHITEBOARD
// =========================================================================

// GET /api/v1/projects/:id/canvas - fetch saved canvas data
router.get('/:id/canvas', authenticate, async (req, res) => {
  try {
    const projectId = req.params.id;
    const [membership] = await pool.query(
      'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
      [projectId, req.user.id]
    );
    if (membership.length === 0) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Must be a workspace member' } });
    }

    const [rows] = await pool.query(
      `SELECT pc.*, u.name as updater_name, u.username as updater_username
       FROM project_canvas pc
       LEFT JOIN users u ON pc.updated_by = u.id
       WHERE pc.project_id = ?`,
      [projectId]
    );

    if (rows.length === 0) {
      return res.json({ canvas_data: null, updated_at: null });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Fetch canvas error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch canvas' } });
  }
});

// PUT /api/v1/projects/:id/canvas - save canvas data
router.put('/:id/canvas', authenticate, async (req, res) => {
  try {
    const projectId = req.params.id;
    const { canvas_data } = req.body;

    const [membership] = await pool.query(
      'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
      [projectId, req.user.id]
    );
    if (membership.length === 0) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Must be a workspace member' } });
    }
    if (membership[0].role === 'viewer') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Viewers have read-only access and cannot edit the canvas' } });
    }

    const jsonString = typeof canvas_data === 'string' ? canvas_data : JSON.stringify(canvas_data || {});

    await pool.query(
      `INSERT INTO project_canvas (project_id, canvas_data, updated_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE canvas_data = VALUES(canvas_data), updated_by = VALUES(updated_by), updated_at = NOW()`,
      [projectId, jsonString, req.user.id]
    );

    await logProjectActivity(projectId, req.user.id, 'canvas_updated', {});

    const io = req.app.get('io');
    if (io) {
      io.to(`project:${projectId}`).emit('project:canvas_updated', {
        projectId,
        updatedBy: req.user.id,
        updatedAt: new Date().toISOString(),
      });
    }

    res.json({ message: 'Canvas saved successfully' });
  } catch (err) {
    console.error('Save canvas error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to save canvas' } });
  }
});

// =========================================================================
// COLLABORATIVE LIVE NOTES & DOCS
// =========================================================================

// GET /api/v1/projects/:id/notes - fetch project notes
router.get('/:id/notes', authenticate, async (req, res) => {
  try {
    const projectId = req.params.id;
    const [membership] = await pool.query(
      'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
      [projectId, req.user.id]
    );
    if (membership.length === 0) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Must be a workspace member' } });
    }

    const [rows] = await pool.query(
      `SELECT pn.*, u.name as updater_name, u.username as updater_username
       FROM project_notes pn
       LEFT JOIN users u ON pn.updated_by = u.id
       WHERE pn.project_id = ?`,
      [projectId]
    );

    if (rows.length === 0) {
      return res.json({
        title: 'Project Notes & Architecture Specs',
        content: '# Project Overview\n\nWelcome to the collaborative notes space! Share specs, API schemas, and architecture decisions here.\n\n### Milestones\n- [ ] Core Prototype\n- [ ] Live Sync Testing\n- [ ] Production Deploy',
        updated_at: null,
      });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Fetch notes error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch notes' } });
  }
});

// PUT /api/v1/projects/:id/notes - save project notes
router.put('/:id/notes', authenticate, async (req, res) => {
  try {
    const projectId = req.params.id;
    const { title = 'Project Notes & Architecture Specs', content = '' } = req.body;

    const [membership] = await pool.query(
      'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
      [projectId, req.user.id]
    );
    if (membership.length === 0) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Must be a workspace member' } });
    }
    if (membership[0].role === 'viewer') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Viewers have read-only access and cannot edit specs' } });
    }

    await pool.query(
      `INSERT INTO project_notes (project_id, title, content, updated_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE title = VALUES(title), content = VALUES(content), updated_by = VALUES(updated_by), updated_at = NOW()`,
      [projectId, title, content, req.user.id]
    );

    await logProjectActivity(projectId, req.user.id, 'notes_updated', { title });

    const io = req.app.get('io');
    if (io) {
      io.to(`project:${projectId}`).emit('project:notes_updated', {
        projectId,
        title,
        content,
        updatedBy: req.user.id,
        updatedAt: new Date().toISOString(),
      });
    }

    res.json({ message: 'Notes saved successfully' });
  } catch (err) {
    console.error('Save notes error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to save notes' } });
  }
});


module.exports = router;
