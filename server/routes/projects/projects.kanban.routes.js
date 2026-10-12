const express = require('express');
const pool = require('../../config/db');
const { authenticate } = require('../../middleware/auth');
const { logProjectActivity } = require('../../utils/helpers');

const router = express.Router();

// GET /api/v1/projects/:id/tasks
router.get('/:id/tasks', authenticate, async (req, res) => {
  try {
    const [proj] = await pool.query('SELECT visibility, creator_id FROM projects WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
    if (proj.length === 0) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });

    const [mem] = await pool.query('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', [req.params.id, req.user.id]);
    const isMember = mem.length > 0 || proj[0].creator_id === req.user.id;
    if (proj[0].visibility === 'private' && !isMember) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'This workspace is private. Request to join to access tasks.' } });
    }

    const [tasks] = await pool.query(
      `SELECT t.*, 
        u.username as assignee_username, u.name as assignee_name, u.avatar_url as assignee_avatar
       FROM tasks t
       LEFT JOIN users u ON t.assignee_id = u.id
       WHERE t.project_id = ? AND t.deleted_at IS NULL
       ORDER BY t.created_at DESC`,
      [req.params.id]
    );
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch tasks' } });
  }
});

// POST /api/v1/projects/:id/tasks
router.post('/:id/tasks', authenticate, async (req, res) => {
  try {
    const { title, description, status, priority, assignee_id, due_date } = req.body;
    if (!title) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Task title is required' } });
    }

    // Check membership and ensure not viewer
    const [mem] = await pool.query(
      'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (mem.length === 0) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Must be a project member' } });
    }
    if (mem[0].role === 'viewer') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Viewers have read-only access and cannot create tasks' } });
    }

    const [result] = await pool.query(
      `INSERT INTO tasks (project_id, title, description, status, priority, assignee_id, creator_id, due_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, title, description || null, status || 'todo', priority || 'medium', assignee_id || null, req.user.id, due_date || null]
    );

    // Notify assignee
    if (assignee_id && assignee_id !== req.user.id) {
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, body, reference_type, reference_id)
         VALUES (?, 'task_assigned', 'You were assigned a task', ?, 'task', ?)`,
        [assignee_id, title, result.insertId]
      );
    }

    await logProjectActivity(req.params.id, req.user.id, 'task_created', {
      taskId: result.insertId,
      title,
      status: status || 'todo',
    });

    res.status(201).json({ id: result.insertId, message: 'Task created' });
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to create task' } });
  }
});

// PATCH /api/v1/projects/:projectId/tasks/:taskId
router.patch('/:projectId/tasks/:taskId', authenticate, async (req, res) => {
  try {
    const { status, title, description, priority, assignee_id, due_date } = req.body;

    const [mem] = await pool.query(
      'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
      [req.params.projectId, req.user.id]
    );
    if (mem.length === 0) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Must be a project member' } });
    }
    if (mem[0].role === 'viewer') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Viewers have read-only access and cannot edit tasks' } });
    }

    const updates = [];
    const params = [];

    if (status) { updates.push('status = ?'); params.push(status); }
    if (title) { updates.push('title = ?'); params.push(title); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (priority) { updates.push('priority = ?'); params.push(priority); }
    if (assignee_id !== undefined) { updates.push('assignee_id = ?'); params.push(assignee_id); }
    if (due_date !== undefined) { updates.push('due_date = ?'); params.push(due_date); }

    if (updates.length === 0) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'No fields to update' } });
    }

    params.push(req.params.taskId, req.params.projectId);

    await pool.query(
      `UPDATE tasks SET ${updates.join(', ')} WHERE id = ? AND project_id = ?`,
      params
    );

    // Fetch task title for log
    const [tRow] = await pool.query('SELECT title FROM tasks WHERE id = ?', [req.params.taskId]);
    const taskTitle = tRow[0]?.title || 'Task';

    await logProjectActivity(req.params.projectId, req.user.id, status ? 'task_status_changed' : 'task_updated', {
      taskId: parseInt(req.params.taskId, 10),
      title: taskTitle,
      status: status || undefined,
    });

    res.json({ message: 'Task updated' });
  } catch (err) {
    console.error('Update task error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to update task' } });
  }
});

// DELETE /api/v1/projects/:projectId/tasks/:taskId
router.delete('/:projectId/tasks/:taskId', authenticate, async (req, res) => {
  try {
    const [membership] = await pool.query(
      'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
      [req.params.projectId, req.user.id]
    );
    if (membership.length === 0) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Must be a workspace member' } });
    }
    if (membership[0].role === 'viewer') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Viewers have read-only access and cannot delete tasks' } });
    }

    const [tRow] = await pool.query('SELECT title FROM tasks WHERE id = ?', [req.params.taskId]);
    const taskTitle = tRow[0]?.title || 'Task';

    await pool.query(
      'UPDATE tasks SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?',
      [req.params.taskId, req.params.projectId]
    );

    await logProjectActivity(req.params.projectId, req.user.id, 'task_deleted', {
      taskId: parseInt(req.params.taskId, 10),
      title: taskTitle,
    });

    res.json({ message: 'Task deleted' });
  } catch (err) {
    console.error('Delete task error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to delete task' } });
  }
});

module.exports = router;
