const express = require('express');
const pool = require('../config/db');
const { authenticate, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/v1/communities - list all public communities
router.get('/', optionalAuth, async (req, res) => {
  try {
    const [communities] = await pool.query(
      `SELECT c.*, 
        (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) as member_count
       FROM communities c 
       WHERE c.visibility = 'public'
       ORDER BY c.member_count DESC, c.created_at DESC`
    );

    // If user is authenticated, mark which ones they've joined
    if (req.user) {
      const [memberships] = await pool.query(
        'SELECT community_id FROM community_members WHERE user_id = ?',
        [req.user.id]
      );
      const joinedIds = new Set(memberships.map(m => m.community_id));
      communities.forEach(c => {
        c.is_joined = joinedIds.has(c.id);
      });
    }

    res.json(communities);
  } catch (err) {
    console.error('List communities error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch communities' } });
  }
});

// GET /api/v1/communities/:slug
router.get('/:slug', optionalAuth, async (req, res) => {
  try {
    const [communities] = await pool.query(
      `SELECT c.*, 
        (SELECT COUNT(*) FROM community_members WHERE community_id = c.id) as member_count
       FROM communities c WHERE c.slug = ?`,
      [req.params.slug]
    );
    if (communities.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Community not found' } });
    }

    const community = communities[0];

    if (community.pinned_post_id) {
      const [pinnedPosts] = await pool.query(
        `SELECT p.*, u.username, u.name, u.alias, u.avatar_url
         FROM posts p
         JOIN users u ON p.author_id = u.id
         WHERE p.id = ? AND p.deleted_at IS NULL`,
        [community.pinned_post_id]
      );
      community.pinned_post = pinnedPosts[0] || null;
    }

    if (req.user) {
      const [mem] = await pool.query(
        'SELECT role FROM community_members WHERE community_id = ? AND user_id = ?',
        [community.id, req.user.id]
      );
      community.is_joined = mem.length > 0;
      community.user_role = mem.length > 0 ? mem[0].role : null;
    }

    res.json(community);
  } catch (err) {
    console.error('Get community error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch community' } });
  }
});

// POST /api/v1/communities - create community
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Community name is required' } });
    }

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const [existing] = await pool.query('SELECT id FROM communities WHERE slug = ?', [slug]);
    if (existing.length > 0) {
      return res.status(409).json({ error: { code: 'CONFLICT', message: 'A community with this name already exists' } });
    }

    const [result] = await pool.query(
      'INSERT INTO communities (name, slug, description, creator_id) VALUES (?, ?, ?, ?)',
      [name, slug, description || null, req.user.id]
    );

    // Creator becomes owner
    await pool.query(
      'INSERT INTO community_members (community_id, user_id, role) VALUES (?, ?, ?)',
      [result.insertId, req.user.id, 'owner']
    );

    res.status(201).json({ id: result.insertId, name, slug, description });
  } catch (err) {
    console.error('Create community error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to create community' } });
  }
});

// POST /api/v1/communities/:id/join
router.post('/:id/join', authenticate, async (req, res) => {
  try {
    const communityId = req.params.id;

    const [existing] = await pool.query(
      'SELECT id FROM community_members WHERE community_id = ? AND user_id = ?',
      [communityId, req.user.id]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: { code: 'ALREADY_JOINED', message: 'Already a member' } });
    }

    await pool.query(
      'INSERT INTO community_members (community_id, user_id, role) VALUES (?, ?, ?)',
      [communityId, req.user.id, 'member']
    );

    await pool.query(
      'UPDATE communities SET member_count = member_count + 1 WHERE id = ?',
      [communityId]
    );

    res.json({ message: 'Joined community' });
  } catch (err) {
    console.error('Join community error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to join community' } });
  }
});

// POST /api/v1/communities/:id/leave
router.post('/:id/leave', authenticate, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM community_members WHERE community_id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    await pool.query(
      'UPDATE communities SET member_count = GREATEST(member_count - 1, 0) WHERE id = ?',
      [req.params.id]
    );
    res.json({ message: 'Left community' });
  } catch (err) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to leave community' } });
  }
});

// GET /api/v1/communities/:id/members - list members with roles
router.get('/:id/members', optionalAuth, async (req, res) => {
  try {
    const [members] = await pool.query(
      `SELECT cm.user_id, cm.role, cm.joined_at, u.username, u.name, u.alias, u.avatar_url
       FROM community_members cm
       JOIN users u ON cm.user_id = u.id
       WHERE cm.community_id = ?
       ORDER BY (cm.role = 'owner') DESC, (cm.role = 'moderator') DESC, cm.joined_at ASC`,
      [req.params.id]
    );
    res.json(members);
  } catch (err) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch members' } });
  }
});

// PATCH /api/v1/communities/:id/members/:userId - change member role (owner only)
router.patch('/:id/members/:userId', authenticate, async (req, res) => {
  try {
    const { role } = req.body;
    if (!['moderator', 'member'].includes(role)) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Role must be moderator or member' } });
    }

    const [adminCheck] = await pool.query(
      'SELECT role FROM community_members WHERE community_id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (adminCheck.length === 0 || adminCheck[0].role !== 'owner') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only community owners can assign roles' } });
    }

    await pool.query(
      'UPDATE community_members SET role = ? WHERE community_id = ? AND user_id = ?',
      [role, req.params.id, req.params.userId]
    );
    res.json({ message: `Role updated to ${role}`, role });
  } catch (err) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to update member role' } });
  }
});

// DELETE /api/v1/communities/:id/members/:userId - kick member from community (owner or moderator)
router.delete('/:id/members/:userId', authenticate, async (req, res) => {
  try {
    const [callerRole] = await pool.query(
      'SELECT role FROM community_members WHERE community_id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (callerRole.length === 0 || !['owner', 'moderator'].includes(callerRole[0].role)) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only owners and moderators can remove members' } });
    }

    const [targetRole] = await pool.query(
      'SELECT role FROM community_members WHERE community_id = ? AND user_id = ?',
      [req.params.id, req.params.userId]
    );
    if (targetRole.length > 0 && targetRole[0].role === 'owner') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Cannot remove the community owner' } });
    }

    await pool.query(
      'DELETE FROM community_members WHERE community_id = ? AND user_id = ?',
      [req.params.id, req.params.userId]
    );
    await pool.query(
      'UPDATE communities SET member_count = GREATEST(member_count - 1, 0) WHERE id = ?',
      [req.params.id]
    );
    res.json({ message: 'Member removed from community' });
  } catch (err) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to remove member' } });
  }
});

// POST /api/v1/communities/:id/pin-post - pin or unpin announcement post (owner or moderator)
router.post('/:id/pin-post', authenticate, async (req, res) => {
  try {
    const { post_id } = req.body;
    const [callerRole] = await pool.query(
      'SELECT role FROM community_members WHERE community_id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (callerRole.length === 0 || !['owner', 'moderator'].includes(callerRole[0].role)) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only owners and moderators can pin announcements' } });
    }

    await pool.query(
      'UPDATE communities SET pinned_post_id = ? WHERE id = ?',
      [post_id || null, req.params.id]
    );
    res.json({ message: post_id ? 'Announcement pinned' : 'Announcement unpinned', pinned_post_id: post_id || null });
  } catch (err) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to update pinned post' } });
  }
});

module.exports = router;
