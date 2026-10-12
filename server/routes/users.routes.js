const express = require('express');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Banner image storage
const bannerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/banners');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `banner-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});

const bannerUpload = multer({
  storage: bannerStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

// Avatar image storage
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/avatars');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `avatar-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});

const avatarUpload = multer({
  storage: avatarStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// Helper to compute user badges
async function computeUserBadges(userId) {
  const badges = [];
  if (userId <= 100) {
    badges.push({ id: 'early_builder', title: 'Early Builder', type: 'early_builder', desc: 'Platform pioneer' });
  }
  const [owned] = await pool.query('SELECT COUNT(*) as count FROM project_members WHERE user_id = ? AND role = "owner"', [userId]);
  if (owned[0]?.count > 0) {
    badges.push({ id: 'workspace_leader', title: 'Workspace Leader', type: 'workspace_leader', desc: 'Leads collaborative workspaces' });
  }
  const [allProj] = await pool.query('SELECT COUNT(*) as count FROM project_members WHERE user_id = ?', [userId]);
  if (allProj[0]?.count >= 2) {
    badges.push({ id: 'top_collaborator', title: 'Top Collaborator', type: 'top_collaborator', desc: 'Active in multiple workspaces' });
  }
  return badges;
}

// POST /api/v1/users/banner - upload profile banner image
router.post('/banner', authenticate, bannerUpload.single('banner'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Banner file is required' } });
    }
    const banner_url = `/uploads/banners/${req.file.filename}`;
    await pool.query('UPDATE users SET banner_url = ? WHERE id = ?', [banner_url, req.user.id]);
    res.json({ banner_url });
  } catch (err) {
    console.error('Banner upload error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to upload banner' } });
  }
});

// POST /api/v1/users/avatar - upload profile avatar image
router.post('/avatar', authenticate, avatarUpload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Avatar file is required' } });
    }
    const avatar_url = `/uploads/avatars/${req.file.filename}`;
    await pool.query('UPDATE users SET avatar_url = ? WHERE id = ?', [avatar_url, req.user.id]);
    res.json({ avatar_url });
  } catch (err) {
    console.error('Avatar upload error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to upload avatar' } });
  }
});

// GET /api/v1/users/profile
router.get('/profile', authenticate, async (req, res) => {
  try {
    const [users] = await pool.query(
      `SELECT id, username, email, name, alias, avatar_url, banner_url, bio,
         github_url, linkedin_url, twitter_url, portfolio_url, pinned_project_id,
         custom_status_text, custom_status_emoji,
         email_verified, created_at
       FROM users WHERE id = ?`,
      [req.user.id]
    );
    if (users.length === 0) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });

    const [skills] = await pool.query('SELECT skill FROM user_skills WHERE user_id = ?', [req.user.id]);
    const user = users[0];
    user.skills = skills.map(s => s.skill);

    if (user.pinned_project_id) {
      const [pinned] = await pool.query(
        'SELECT id, name, description, github_repo, member_count FROM projects WHERE id = ?',
        [user.pinned_project_id]
      );
      user.pinned_project = pinned[0] || null;
    }

    user.badges = await computeUserBadges(user.id);

    res.json(user);
  } catch (err) {
    console.error('Profile fetch error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch profile' } });
  }
});

// GET /api/v1/users/:id/portfolio - public portfolio and showcase
router.get('/:id/portfolio', authenticate, async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const [users] = await pool.query(
      `SELECT id, username, name, alias, avatar_url, banner_url, bio,
         github_url, linkedin_url, twitter_url, portfolio_url, pinned_project_id,
         custom_status_text, custom_status_emoji, created_at
       FROM users WHERE id = ? AND deleted_at IS NULL`,
      [targetUserId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    const user = users[0];
    const [skills] = await pool.query('SELECT skill FROM user_skills WHERE user_id = ?', [targetUserId]);
    user.skills = skills.map(s => s.skill);

    if (user.pinned_project_id) {
      const [pinned] = await pool.query(
        'SELECT id, name, description, github_repo, member_count FROM projects WHERE id = ?',
        [user.pinned_project_id]
      );
      user.pinned_project = pinned[0] || null;
    }

    user.badges = await computeUserBadges(user.id);

    // Fetch user's public workspaces
    const [projects] = await pool.query(
      `SELECT p.id, p.name, p.description, p.github_repo, p.member_count, pm.role
       FROM projects p
       JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = ?
       ORDER BY p.updated_at DESC
       LIMIT 6`,
      [targetUserId]
    );
    user.projects = projects;

    res.json(user);
  } catch (err) {
    console.error('Portfolio error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch portfolio' } });
  }
});

// PATCH /api/v1/users/profile
router.patch('/profile', authenticate, async (req, res) => {
  try {
    const {
      name,
      bio,
      skills,
      banner_url,
      avatar_url,
      github_url,
      linkedin_url,
      twitter_url,
      portfolio_url,
      pinned_project_id,
    } = req.body;

    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name.trim()); }
    if (bio !== undefined) { updates.push('bio = ?'); params.push(bio); }
    if (banner_url !== undefined) { updates.push('banner_url = ?'); params.push(banner_url); }
    if (avatar_url !== undefined) { updates.push('avatar_url = ?'); params.push(avatar_url); }
    if (github_url !== undefined) { updates.push('github_url = ?'); params.push(github_url ? github_url.trim() : null); }
    if (linkedin_url !== undefined) { updates.push('linkedin_url = ?'); params.push(linkedin_url ? linkedin_url.trim() : null); }
    if (twitter_url !== undefined) { updates.push('twitter_url = ?'); params.push(twitter_url ? twitter_url.trim() : null); }
    if (portfolio_url !== undefined) { updates.push('portfolio_url = ?'); params.push(portfolio_url ? portfolio_url.trim() : null); }
    if (pinned_project_id !== undefined) { updates.push('pinned_project_id = ?'); params.push(pinned_project_id ? Number(pinned_project_id) : null); }

    if (updates.length > 0) {
      params.push(req.user.id);
      await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    if (skills && Array.isArray(skills)) {
      await pool.query('DELETE FROM user_skills WHERE user_id = ?', [req.user.id]);
      for (const skill of skills) {
        if (skill && skill.trim()) {
          await pool.query(
            'INSERT INTO user_skills (user_id, skill) VALUES (?, ?)',
            [req.user.id, skill.trim()]
          );
        }
      }
    }

    res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to update profile' } });
  }
});

// PATCH /api/v1/users/status - update custom status text and mood emoji
router.patch('/status', authenticate, async (req, res) => {
  try {
    const { status_text, status_emoji } = req.body;
    const text = status_text !== undefined ? (status_text ? String(status_text).trim().substring(0, 120) : null) : undefined;
    const emoji = status_emoji !== undefined ? (status_emoji ? String(status_emoji).trim().substring(0, 16) : null) : undefined;

    const updates = [];
    const params = [];
    if (text !== undefined) { updates.push('custom_status_text = ?'); params.push(text); }
    if (emoji !== undefined) { updates.push('custom_status_emoji = ?'); params.push(emoji); }

    if (updates.length > 0) {
      params.push(req.user.id);
      await pool.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    const [user] = await pool.query('SELECT custom_status_text, custom_status_emoji FROM users WHERE id = ?', [req.user.id]);

    const io = req.app.get('io');
    if (io) {
      io.emit('user:status_updated', {
        userId: req.user.id,
        custom_status_text: user[0]?.custom_status_text,
        custom_status_emoji: user[0]?.custom_status_emoji,
      });
    }

    res.json({
      message: 'Status updated successfully',
      custom_status_text: user[0]?.custom_status_text,
      custom_status_emoji: user[0]?.custom_status_emoji,
    });
  } catch (err) {
    console.error('Update status error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to update status' } });
  }
});

// GET /api/v1/users/invitations - user's pending invitations
router.get('/invitations', authenticate, async (req, res) => {
  try {
    const [invitations] = await pool.query(
      `SELECT pi.*, p.name as project_name, p.description as project_description,
        u.username as inviter_username, u.name as inviter_name
       FROM project_invitations pi
       JOIN projects p ON pi.project_id = p.id
       JOIN users u ON pi.inviter_id = u.id
       WHERE pi.invitee_id = ? AND pi.status = 'pending'
       ORDER BY pi.created_at DESC`,
      [req.user.id]
    );
    res.json(invitations);
  } catch (err) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed' } });
  }
});

// POST /api/v1/users/invitations/:id/accept
router.post('/invitations/:id/accept', authenticate, async (req, res) => {
  try {
    const [inv] = await pool.query(
      "SELECT * FROM project_invitations WHERE id = ? AND invitee_id = ? AND status = 'pending'",
      [req.params.id, req.user.id]
    );
    if (inv.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Invitation not found' } });
    }

    const invitation = inv[0];

    // Accept invitation
    await pool.query("UPDATE project_invitations SET status = 'accepted' WHERE id = ?", [invitation.id]);

    // Add as member
    await pool.query(
      'INSERT IGNORE INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)',
      [invitation.project_id, req.user.id, 'member']
    );

    // Add to all project channels
    const [channels] = await pool.query(
      "SELECT id FROM conversations WHERE project_id = ? AND type = 'channel'",
      [invitation.project_id]
    );
    for (const ch of channels) {
      await pool.query(
        'INSERT IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)',
        [ch.id, req.user.id]
      );
    }

    // Update member count
    await pool.query('UPDATE projects SET member_count = member_count + 1 WHERE id = ?', [invitation.project_id]);

    res.json({ message: 'Invitation accepted. Your profile is now visible to the project team.' });
  } catch (err) {
    console.error('Accept invitation error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed' } });
  }
});

// POST /api/v1/users/invitations/:id/decline
router.post('/invitations/:id/decline', authenticate, async (req, res) => {
  try {
    const [inv] = await pool.query(
      "SELECT * FROM project_invitations WHERE id = ? AND invitee_id = ? AND status = 'pending'",
      [req.params.id, req.user.id]
    );
    if (inv.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Invitation not found' } });
    }

    await pool.query("UPDATE project_invitations SET status = 'declined' WHERE id = ?", [req.params.id]);
    await pool.query(
      "UPDATE notifications SET is_read = 1 WHERE user_id = ? AND reference_type = 'project' AND reference_id = ?",
      [req.user.id, inv[0].project_id]
    );
    res.json({ message: 'Invitation declined' });
  } catch (err) {
    console.error('Decline invitation error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed' } });
  }
});

// GET /api/v1/users/search - search users for invites
router.get('/search', authenticate, async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json([]);

    const [users] = await pool.query(
      `SELECT id, username, name, alias, avatar_url 
       FROM users 
       WHERE (username LIKE ? OR name LIKE ? OR alias LIKE ?) AND id != ? AND deleted_at IS NULL
       LIMIT 10`,
      [`%${q}%`, `%${q}%`, `%${q}%`, req.user.id]
    );

    res.json(users);
  } catch (err) {
    console.error('Search users error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to search users' } });
  }
});

module.exports = router;
