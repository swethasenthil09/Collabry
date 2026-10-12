const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../../config/db');
const { authenticate } = require('../../middleware/auth');
const { logProjectActivity } = require('../../utils/helpers');

const router = express.Router();

// Project files storage setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const projDir = path.join(__dirname, '../../uploads/projects', String(req.params.id));
    if (!fs.existsSync(projDir)) {
      fs.mkdirSync(projDir, { recursive: true });
    }
    cb(null, projDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e6);
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${base}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1 GB (1024 MB) max per file
});

function getFileCategory(filename, mimetype) {
  const ext = path.extname(filename).toLowerCase();
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'];
  const codeExts = ['.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.cpp', '.c', '.cs', '.go', '.rs', '.php', '.html', '.css', '.sql', '.json', '.xml', '.yaml', '.yml'];
  const archiveExts = ['.zip', '.tar', '.gz', '.rar', '.7z'];
  const docExts = ['.pdf', '.doc', '.docx', '.txt', '.md', '.csv', '.xlsx', '.xls', '.pptx', '.ppt'];

  if (imageExts.includes(ext) || mimetype?.startsWith('image/')) return 'image';
  if (codeExts.includes(ext)) return 'code';
  if (archiveExts.includes(ext)) return 'archive';
  if (docExts.includes(ext) || mimetype?.includes('pdf') || mimetype?.includes('document')) return 'document';
  return 'other';
}

// GET /api/v1/projects/:id/files - list project files
router.get('/:id/files', authenticate, async (req, res) => {
  try {
    const projectId = req.params.id;

    // Check project exists
    const [project] = await pool.query('SELECT visibility FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
    if (project.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    }

    // Verify access
    const [membership] = await pool.query('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, req.user.id]);
    if (project[0].visibility === 'private' && membership.length === 0) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    }

    const [files] = await pool.query(
      `SELECT f.*, 
        u.name as uploader_name, u.username as uploader_username, u.avatar_url as uploader_avatar
       FROM files f
       JOIN users u ON f.uploader_id = u.id
       WHERE f.project_id = ? AND f.deleted_at IS NULL
       ORDER BY f.is_pinned DESC, f.created_at DESC`,
      [projectId]
    );

    const userRole = membership.length > 0 ? membership[0].role : null;
    const enriched = files.map(f => ({
      ...f,
      can_delete: f.uploader_id === req.user.id || userRole === 'owner' || userRole === 'maintainer' || userRole === 'admin',
    }));

    res.json(enriched);
  } catch (err) {
    console.error('Fetch project files error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch project files' } });
  }
});

// POST /api/v1/projects/:id/files - upload file OR add external link resource
router.post('/:id/files', authenticate, upload.single('file'), async (req, res) => {
  try {
    const projectId = req.params.id;

    // Verify membership and ensure not viewer
    const [membership] = await pool.query('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, req.user.id]);
    if (membership.length === 0) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Must be a workspace member to upload files' } });
    }
    if (membership[0].role === 'viewer') {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Viewers have read-only access and cannot upload files' } });
    }

    // Support external resource link
    if (!req.file && req.body.url) {
      const { name, url, category = 'link' } = req.body;
      const [result] = await pool.query(
        `INSERT INTO files (project_id, uploader_id, name, file_url, file_size, mime_type, category)
         VALUES (?, ?, ?, ?, 0, 'link', ?)`,
        [projectId, req.user.id, name || url, url, category]
      );

      const [userRow] = await pool.query('SELECT name, username, avatar_url FROM users WHERE id = ?', [req.user.id]);
      const linkRecord = {
        id: result.insertId,
        project_id: Number(projectId),
        uploader_id: req.user.id,
        name: name || url,
        file_url: url,
        file_size: 0,
        mime_type: 'link',
        category: 'link',
        is_pinned: false,
        created_at: new Date(),
        uploader_name: userRow[0]?.name,
        uploader_username: userRow[0]?.username,
        uploader_avatar: userRow[0]?.avatar_url,
        can_delete: true,
      };

      const io = req.app.get('io');
      if (io) {
        io.to(`project:${projectId}`).emit('project:file_uploaded', linkRecord);
      }
      return res.status(201).json(linkRecord);
    }

    if (!req.file) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'No file or resource URL provided' } });
    }

    const relativeUrl = `/uploads/projects/${projectId}/${req.file.filename}`;
    const category = getFileCategory(req.file.originalname, req.file.mimetype);
    const folderPath = req.body.folder_path || null;

    const [result] = await pool.query(
      `INSERT INTO files (project_id, uploader_id, name, file_url, file_size, mime_type, category, folder_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [projectId, req.user.id, req.file.originalname, relativeUrl, req.file.size, req.file.mimetype, category, folderPath]
    );

    const fileId = result.insertId;

    const [userRow] = await pool.query('SELECT name, username, avatar_url FROM users WHERE id = ?', [req.user.id]);
    const fileRecord = {
      id: fileId,
      project_id: Number(projectId),
      uploader_id: req.user.id,
      name: req.file.originalname,
      file_url: relativeUrl,
      file_size: req.file.size,
      mime_type: req.file.mimetype,
      category,
      folder_path: folderPath,
      is_pinned: false,
      created_at: new Date(),
      uploader_name: userRow[0]?.name,
      uploader_username: userRow[0]?.username,
      uploader_avatar: userRow[0]?.avatar_url,
      can_delete: true,
    };

    // Emit real-time notification to project members
    const io = req.app.get('io');
    if (io) {
      io.to(`project:${projectId}`).emit('project:file_uploaded', fileRecord);
    }

    res.status(201).json(fileRecord);
  } catch (err) {
    console.error('Upload file error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to upload file' } });
  }
});

// POST /api/v1/projects/:id/files/batch - upload multiple files / folder
router.post('/:id/files/batch', authenticate, upload.array('files', 200), async (req, res) => {
  try {
    const projectId = req.params.id;
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'No files provided for batch upload' } });
    }

    // Verify membership
    const [membership] = await pool.query('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, req.user.id]);
    if (membership.length === 0) {
      req.files.forEach(f => { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); });
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Must be a workspace member to upload files' } });
    }

    let paths = [];
    try {
      if (req.body.folder_paths) {
        paths = JSON.parse(req.body.folder_paths);
      }
    } catch (e) {}

    const [userRow] = await pool.query('SELECT name, username, avatar_url FROM users WHERE id = ?', [req.user.id]);
    const savedRecords = [];

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const folderPath = paths[i] || null;
      const relativeUrl = `/uploads/projects/${projectId}/${file.filename}`;
      const category = getFileCategory(file.originalname, file.mimetype);

      const [result] = await pool.query(
        `INSERT INTO files (project_id, uploader_id, name, file_url, file_size, mime_type, category, folder_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [projectId, req.user.id, file.originalname, relativeUrl, file.size, file.mimetype, category, folderPath]
      );

      const record = {
        id: result.insertId,
        project_id: Number(projectId),
        uploader_id: req.user.id,
        name: file.originalname,
        file_url: relativeUrl,
        file_size: file.size,
        mime_type: file.mimetype,
        category,
        folder_path: folderPath,
        is_pinned: false,
        created_at: new Date(),
        uploader_name: userRow[0]?.name,
        uploader_username: userRow[0]?.username,
        uploader_avatar: userRow[0]?.avatar_url,
        can_delete: true,
      };
      savedRecords.push(record);
    }

    const io = req.app.get('io');
    if (io) {
      savedRecords.forEach(rec => {
        io.to(`project:${projectId}`).emit('project:file_uploaded', rec);
      });
    }

    res.status(201).json(savedRecords);
  } catch (err) {
    console.error('Batch upload error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to upload folder files' } });
  }
});

// PATCH /api/v1/projects/:id/files/:fileId/pin - toggle file pin status
router.patch('/:id/files/:fileId/pin', authenticate, async (req, res) => {
  try {
    const { id: projectId, fileId } = req.params;

    const [membership] = await pool.query('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, req.user.id]);
    if (membership.length === 0) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Must be a workspace member' } });
    }

    const [files] = await pool.query('SELECT is_pinned FROM files WHERE id = ? AND project_id = ? AND deleted_at IS NULL', [fileId, projectId]);
    if (files.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'File not found' } });
    }

    const newPinned = !files[0].is_pinned;
    await pool.query('UPDATE files SET is_pinned = ? WHERE id = ?', [newPinned, fileId]);

    const io = req.app.get('io');
    if (io) {
      io.to(`project:${projectId}`).emit('project:file_pinned', { file_id: Number(fileId), is_pinned: newPinned });
    }

    res.json({ message: 'Pin updated', file_id: Number(fileId), is_pinned: newPinned });
  } catch (err) {
    console.error('Toggle pin error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to toggle pin' } });
  }
});

// DELETE /api/v1/projects/:id/files/:fileId - delete file
router.delete('/:id/files/:fileId', authenticate, async (req, res) => {
  try {
    const { id: projectId, fileId } = req.params;

    const [files] = await pool.query('SELECT * FROM files WHERE id = ? AND project_id = ? AND deleted_at IS NULL', [fileId, projectId]);
    if (files.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'File not found' } });
    }

    const file = files[0];

    const [membership] = await pool.query('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, req.user.id]);
    const role = membership.length > 0 ? membership[0].role : null;

    if (file.uploader_id !== req.user.id && role !== 'owner' && role !== 'maintainer' && role !== 'admin') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only the uploader or project maintainer can delete this file' } });
    }

    await pool.query('UPDATE files SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [fileId]);

    await logProjectActivity(projectId, req.user.id, 'file_deleted', {
      fileId: Number(fileId),
      fileName: file.name,
    });

    // Emit real-time deletion
    const io = req.app.get('io');
    if (io) {
      io.to(`project:${projectId}`).emit('project:file_deleted', { file_id: Number(fileId) });
    }

    res.json({ message: 'File deleted successfully', file_id: Number(fileId) });
  } catch (err) {
    console.error('Delete file error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to delete file' } });
  }
});

// DELETE /api/v1/projects/:id/files - delete all project resources (owner/admin/maintainer)
router.delete('/:id/files', authenticate, async (req, res) => {
  try {
    const projectId = req.params.id;

    const [membership] = await pool.query('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, req.user.id]);
    const role = membership.length > 0 ? membership[0].role : null;

    if (role !== 'owner' && role !== 'maintainer' && role !== 'admin') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only project owners or maintainers can clear all resources' } });
    }

    await pool.query('UPDATE files SET deleted_at = CURRENT_TIMESTAMP WHERE project_id = ? AND deleted_at IS NULL', [projectId]);

    await logProjectActivity(projectId, req.user.id, 'all_files_cleared', {});

    const io = req.app.get('io');
    if (io) {
      io.to(`project:${projectId}`).emit('project:all_files_deleted');
    }

    res.json({ message: 'All project resources cleared successfully' });
  } catch (err) {
    console.error('Delete all files error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to delete all files' } });
  }
});

module.exports = router;
