const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pool = require('../config/db');
const { authenticate, optionalAuth, requireActiveUser } = require('../middleware/auth');
const { toPublicAuthor } = require('../utils/helpers');

const router = express.Router();

// Ensure uploads/posts directory exists
const postsUploadDir = path.join(__dirname, '..', 'uploads', 'posts');
if (!fs.existsSync(postsUploadDir)) {
  fs.mkdirSync(postsUploadDir, { recursive: true });
}

// Multer storage for post images & videos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, postsUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'post-' + uniqueSuffix + ext);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max for images and video clips
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      'video/mp4', 'video/webm', 'video/quicktime', 'video/ogg'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only images and video files are supported.'));
    }
  },
});

// POST /api/v1/posts/upload-media - Upload image or video
router.post('/upload-media', authenticate, upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'No file provided' } });
    }
    const isVideo = req.file.mimetype.startsWith('video/');
    res.json({
      url: `/uploads/posts/${req.file.filename}`,
      media_type: isVideo ? 'video' : 'image',
      filename: req.file.originalname,
      size: req.file.size,
    });
  } catch (err) {
    console.error('Upload post media error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to upload media' } });
  }
});

// GET /api/v1/posts - feed (all communities or filtered)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { community_id, project_id, saved, sort, type, search, limit = 30, offset = 0 } = req.query;

    let orderBy = 'p.created_at DESC';
    if (sort === 'top') orderBy = '(p.upvotes - p.downvotes) DESC, p.created_at DESC';
    if (sort === 'trending') orderBy = '(p.upvotes - p.downvotes + p.comment_count * 2) DESC';

    let where = 'p.deleted_at IS NULL';
    const params = [];

    if (community_id) {
      where += ' AND p.community_id = ?';
      params.push(community_id);
    }
    if (project_id) {
      where += ' AND p.project_id = ?';
      params.push(project_id);
    }
    if (saved === 'true') {
      if (!req.user?.id) {
        return res.json([]);
      }
      where += ' AND p.id IN (SELECT post_id FROM saved_posts WHERE user_id = ?)';
      params.push(req.user.id);
    }
    if (type) {
      where += ' AND p.post_type = ?';
      params.push(type);
    }
    if (search) {
      where += ' AND (p.title LIKE ? OR p.body LIKE ? OR p.required_skills LIKE ? OR p.custom_category LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    params.push(parseInt(limit), parseInt(offset));

    const [posts] = await pool.query(
      `SELECT p.*, 
        u.alias as author_alias, u.username as author_username, u.name as author_name, u.avatar_url as author_avatar,
        c.name as community_name, c.slug as community_slug,
        p_proj.name as project_name, p_proj.visibility as project_visibility
       FROM posts p
       JOIN users u ON p.author_id = u.id
       LEFT JOIN communities c ON p.community_id = c.id
       LEFT JOIN projects p_proj ON p.project_id = p_proj.id
       WHERE ${where}
       ORDER BY ${orderBy}
       LIMIT ? OFFSET ?`,
      params
    );

    const userId = req.user?.id || null;
    
    // Get user votes and saved status if authenticated
    let userVotes = {};
    let savedPostIds = new Set();
    if (userId && posts.length > 0) {
      const postIds = posts.map(p => p.id);
      const [votes] = await pool.query(
        'SELECT post_id, vote_type FROM post_votes WHERE user_id = ? AND post_id IN (?)',
        [userId, postIds]
      );
      votes.forEach(v => { userVotes[v.post_id] = v.vote_type; });

      const [savedRows] = await pool.query(
        'SELECT post_id FROM saved_posts WHERE user_id = ? AND post_id IN (?)',
        [userId, postIds]
      );
      savedRows.forEach(r => savedPostIds.add(r.post_id));
    }

    const serialized = posts.map(p => ({
      id: p.id,
      title: p.title,
      body: p.body,
      post_type: p.post_type,
      identity_mode: p.identity_mode,
      required_skills: p.required_skills,
      team_size: p.team_size,
      collab_status: p.collab_status,
      custom_category: p.custom_category || null,
      media_url: p.media_url || null,
      media_type: p.media_type || null,
      upvotes: p.upvotes,
      downvotes: p.downvotes,
      score: p.upvotes - p.downvotes,
      comment_count: p.comment_count,
      created_at: p.created_at,
      community: p.community_id ? { id: p.community_id, name: p.community_name, slug: p.community_slug } : null,
      project: p.project_id ? { id: p.project_id, name: p.project_name, visibility: p.project_visibility } : null,
      author: toPublicAuthor(p, userId),
      user_vote: userVotes[p.id] || null,
      is_saved: savedPostIds.has(p.id),
    }));

    res.json(serialized);
  } catch (err) {
    console.error('Feed error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch posts' } });
  }
});

// GET /api/v1/posts/:id
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const [posts] = await pool.query(
      `SELECT p.*, 
        u.alias as author_alias, u.username as author_username, u.name as author_name, u.avatar_url as author_avatar,
        c.name as community_name, c.slug as community_slug,
        p_proj.name as project_name, p_proj.visibility as project_visibility
       FROM posts p
       JOIN users u ON p.author_id = u.id
       LEFT JOIN communities c ON p.community_id = c.id
       LEFT JOIN projects p_proj ON p.project_id = p_proj.id
       WHERE p.id = ? AND p.deleted_at IS NULL`,
      [req.params.id]
    );

    if (posts.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Post not found' } });
    }

    const p = posts[0];
    const userId = req.user?.id || null;

    // Get user vote and bookmark status on post
    let userVote = null;
    let userInterest = null;
    let isSaved = false;
    if (userId) {
      const [votes] = await pool.query(
        'SELECT vote_type FROM post_votes WHERE post_id = ? AND user_id = ?',
        [p.id, userId]
      );
      if (votes.length > 0) userVote = votes[0].vote_type;

      const [interests] = await pool.query(
        'SELECT * FROM post_interests WHERE post_id = ? AND user_id = ?',
        [p.id, userId]
      );
      if (interests.length > 0) userInterest = interests[0];

      const [saved] = await pool.query(
        'SELECT id FROM saved_posts WHERE post_id = ? AND user_id = ?',
        [p.id, userId]
      );
      if (saved.length > 0) isSaved = true;
    }

    // Get comments
    const [comments] = await pool.query(
      `SELECT c.*, 
        u.alias as author_alias, u.username as author_username, u.name as author_name, u.avatar_url as author_avatar
       FROM comments c
       JOIN users u ON c.author_id = u.id
       WHERE c.post_id = ? AND c.deleted_at IS NULL
       ORDER BY c.created_at ASC`,
      [p.id]
    );

    let commentVotes = {};
    let reactionsByComment = {};
    if (userId && comments.length > 0) {
      const commentIds = comments.map(c => c.id);
      const [cVotes] = await pool.query(
        'SELECT comment_id, vote_type FROM comment_votes WHERE user_id = ? AND comment_id IN (?)',
        [userId, commentIds]
      );
      cVotes.forEach(v => { commentVotes[v.comment_id] = v.vote_type; });
    }

    if (comments.length > 0) {
      const commentIds = comments.map(c => c.id);
      const [reactionRows] = await pool.query(
        'SELECT comment_id, user_id, emoji FROM comment_reactions WHERE comment_id IN (?)',
        [commentIds]
      );
      for (const r of reactionRows) {
        if (!reactionsByComment[r.comment_id]) reactionsByComment[r.comment_id] = {};
        if (!reactionsByComment[r.comment_id][r.emoji]) {
          reactionsByComment[r.comment_id][r.emoji] = { emoji: r.emoji, count: 0, user_ids: [], has_reacted: false };
        }
        reactionsByComment[r.comment_id][r.emoji].count += 1;
        reactionsByComment[r.comment_id][r.emoji].user_ids.push(r.user_id);
        if (userId && r.user_id === userId) {
          reactionsByComment[r.comment_id][r.emoji].has_reacted = true;
        }
      }
    }

    const serializedComments = comments.map(c => ({
      id: c.id,
      body: c.body,
      parent_comment_id: c.parent_comment_id,
      depth: c.depth,
      upvotes: c.upvotes,
      downvotes: c.downvotes,
      score: c.upvotes - c.downvotes,
      created_at: c.created_at,
      author: toPublicAuthor(c, userId),
      user_vote: commentVotes[c.id] || null,
      reactions: Object.values(reactionsByComment[c.id] || {}),
    }));

    res.json({
      id: p.id,
      title: p.title,
      body: p.body,
      post_type: p.post_type,
      identity_mode: p.identity_mode,
      required_skills: p.required_skills,
      team_size: p.team_size,
      collab_status: p.collab_status,
      custom_category: p.custom_category || null,
      media_url: p.media_url || null,
      media_type: p.media_type || null,
      upvotes: p.upvotes,
      downvotes: p.downvotes,
      score: p.upvotes - p.downvotes,
      comment_count: p.comment_count,
      created_at: p.created_at,
      community: p.community_id ? { id: p.community_id, name: p.community_name, slug: p.community_slug } : null,
      project: p.project_id ? { id: p.project_id, name: p.project_name, visibility: p.project_visibility } : null,
      author: toPublicAuthor(p, userId),
      user_vote: userVote,
      user_interest: userInterest,
      is_saved: isSaved,
      is_author: userId === p.author_id,
      comments: serializedComments,
    });
  } catch (err) {
    console.error('Get post error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch post' } });
  }
});

// POST /api/v1/posts - create post
router.post('/', authenticate, requireActiveUser, async (req, res) => {
  try {
    const {
      community_id,
      project_id,
      title,
      body,
      post_type,
      identity_mode,
      required_skills,
      team_size,
      custom_category,
      media_url,
      media_type
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Post title is required' } });
    }

    // If community_id is provided, verify membership
    if (community_id) {
      const [membership] = await pool.query(
        'SELECT id FROM community_members WHERE community_id = ? AND user_id = ?',
        [community_id, req.user.id]
      );
      if (membership.length === 0) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Must be a community member to post in this community' } });
      }
    }

    // If project_id is provided, verify project exists and user is a member
    if (project_id) {
      const [proj] = await pool.query(
        'SELECT id FROM projects WHERE id = ? AND deleted_at IS NULL',
        [project_id]
      );
      if (proj.length === 0) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Tagged project not found' } });
      }
      const [projMem] = await pool.query(
        'SELECT id FROM project_members WHERE project_id = ? AND user_id = ?',
        [project_id, req.user.id]
      );
      if (projMem.length === 0) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Must be a member of the workspace to tag it in a post' } });
      }
    }

    const [result] = await pool.query(
      `INSERT INTO posts (
        community_id, project_id, author_id, title, body, post_type, identity_mode,
        required_skills, team_size, collab_status, custom_category, media_url, media_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        community_id || null,
        project_id || null,
        req.user.id,
        title.trim(),
        body || null,
        post_type || 'discussion',
        identity_mode || 'alias',
        required_skills ? JSON.stringify(required_skills) : null,
        team_size || null,
        post_type === 'collaboration_request' ? 'open' : null,
        custom_category ? custom_category.trim() : (!community_id ? 'General' : null),
        media_url || null,
        media_type || null,
      ]
    );

    res.status(201).json({ id: result.insertId, message: 'Post created' });
  } catch (err) {
    console.error('Create post error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to create post' } });
  }
});

// POST /api/v1/posts/:id/save - Toggle bookmark/save post
router.post('/:id/save', authenticate, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id;

    const [existing] = await pool.query(
      'SELECT id FROM saved_posts WHERE user_id = ? AND post_id = ?',
      [userId, postId]
    );

    if (existing.length > 0) {
      await pool.query('DELETE FROM saved_posts WHERE user_id = ? AND post_id = ?', [userId, postId]);
      return res.json({ saved: false, message: 'Post removed from saved bookmarks' });
    } else {
      await pool.query('INSERT INTO saved_posts (user_id, post_id) VALUES (?, ?)', [userId, postId]);
      return res.json({ saved: true, message: 'Post saved to bookmarks' });
    }
  } catch (err) {
    console.error('Bookmark post error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to bookmark post' } });
  }
});

// Alias for bookmark
router.post('/:id/bookmark', authenticate, async (req, res) => {
  try {
    const postId = req.params.id;
    const userId = req.user.id;

    const [existing] = await pool.query(
      'SELECT id FROM saved_posts WHERE user_id = ? AND post_id = ?',
      [userId, postId]
    );

    if (existing.length > 0) {
      await pool.query('DELETE FROM saved_posts WHERE user_id = ? AND post_id = ?', [userId, postId]);
      return res.json({ saved: false, message: 'Post removed from saved bookmarks' });
    } else {
      await pool.query('INSERT INTO saved_posts (user_id, post_id) VALUES (?, ?)', [userId, postId]);
      return res.json({ saved: true, message: 'Post saved to bookmarks' });
    }
  } catch (err) {
    console.error('Bookmark post error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to bookmark post' } });
  }
});

// POST /api/v1/posts/:id/vote
router.post('/:id/vote', authenticate, async (req, res) => {
  try {
    const { vote_type } = req.body; // 'up', 'down', or 'none'
    const postId = req.params.id;

    if (vote_type === 'none') {
      // Remove vote
      const [existing] = await pool.query(
        'SELECT vote_type FROM post_votes WHERE post_id = ? AND user_id = ?',
        [postId, req.user.id]
      );
      if (existing.length > 0) {
        const oldVote = existing[0].vote_type;
        await pool.query('DELETE FROM post_votes WHERE post_id = ? AND user_id = ?', [postId, req.user.id]);
        if (oldVote === 'up') {
          await pool.query('UPDATE posts SET upvotes = GREATEST(upvotes - 1, 0) WHERE id = ?', [postId]);
        } else {
          await pool.query('UPDATE posts SET downvotes = GREATEST(downvotes - 1, 0) WHERE id = ?', [postId]);
        }
      }
    } else {
      const [existing] = await pool.query(
        'SELECT vote_type FROM post_votes WHERE post_id = ? AND user_id = ?',
        [postId, req.user.id]
      );

      if (existing.length > 0) {
        const oldVote = existing[0].vote_type;
        if (oldVote === vote_type) {
          return res.json({ message: 'Already voted' });
        }
        // Change vote
        await pool.query(
          'UPDATE post_votes SET vote_type = ? WHERE post_id = ? AND user_id = ?',
          [vote_type, postId, req.user.id]
        );
        if (vote_type === 'up') {
          await pool.query('UPDATE posts SET upvotes = upvotes + 1, downvotes = GREATEST(downvotes - 1, 0) WHERE id = ?', [postId]);
        } else {
          await pool.query('UPDATE posts SET downvotes = downvotes + 1, upvotes = GREATEST(upvotes - 1, 0) WHERE id = ?', [postId]);
        }
      } else {
        // New vote
        await pool.query(
          'INSERT INTO post_votes (post_id, user_id, vote_type) VALUES (?, ?, ?)',
          [postId, req.user.id, vote_type]
        );
        if (vote_type === 'up') {
          await pool.query('UPDATE posts SET upvotes = upvotes + 1 WHERE id = ?', [postId]);
        } else {
          await pool.query('UPDATE posts SET downvotes = downvotes + 1 WHERE id = ?', [postId]);
        }
      }
    }

    const [post] = await pool.query('SELECT upvotes, downvotes FROM posts WHERE id = ?', [postId]);
    res.json({ upvotes: post[0].upvotes, downvotes: post[0].downvotes, score: post[0].upvotes - post[0].downvotes });
  } catch (err) {
    console.error('Vote error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Vote failed' } });
  }
});

// POST /api/v1/posts/:id/comments - add comment
router.post('/:id/comments', authenticate, requireActiveUser, async (req, res) => {
  try {
    const { body, parent_comment_id, identity_mode } = req.body;
    if (!body) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Comment body is required' } });
    }

    let depth = 0;
    if (parent_comment_id) {
      const [parent] = await pool.query('SELECT depth FROM comments WHERE id = ?', [parent_comment_id]);
      if (parent.length > 0 && parent[0].depth < 5) {
        depth = parent[0].depth + 1;
      }
    }

    const [result] = await pool.query(
      `INSERT INTO comments (post_id, author_id, parent_comment_id, body, identity_mode, depth)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.params.id, req.user.id, parent_comment_id || null, body, identity_mode || 'alias', depth]
    );

    await pool.query('UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?', [req.params.id]);

    res.status(201).json({ id: result.insertId, message: 'Comment added' });
  } catch (err) {
    console.error('Comment error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to add comment' } });
  }
});

// POST /api/v1/posts/:id/interests - express interest in collaboration
router.post('/:id/interests', authenticate, requireActiveUser, async (req, res) => {
  try {
    const { message, skills_offered } = req.body;

    const [post] = await pool.query(
      'SELECT post_type, collab_status, author_id FROM posts WHERE id = ? AND deleted_at IS NULL',
      [req.params.id]
    );
    if (post.length === 0 || post[0].post_type !== 'collaboration_request') {
      return res.status(400).json({ error: { code: 'INVALID', message: 'Not a collaboration request post' } });
    }
    if (post[0].collab_status !== 'open') {
      return res.status(400).json({ error: { code: 'CLOSED', message: 'This collaboration is no longer accepting interest' } });
    }

    await pool.query(
      `INSERT INTO post_interests (post_id, user_id, message, skills_offered) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE message = VALUES(message), skills_offered = VALUES(skills_offered), status = 'pending'`,
      [req.params.id, req.user.id, message || null, skills_offered ? JSON.stringify(skills_offered) : null]
    );

    // Notify post author
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, reference_type, reference_id)
       VALUES (?, 'interest', 'Someone is interested in your collaboration post', ?, 'post', ?)`,
      [post[0].author_id, message || 'A user expressed interest', req.params.id]
    );

    res.status(201).json({ message: 'Interest expressed' });
  } catch (err) {
    console.error('Interest error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to express interest' } });
  }
});

// POST /api/v1/posts/:id/convert-to-project - convert collaboration post to project
router.post('/:id/convert-to-project', authenticate, async (req, res) => {
  try {
    const [posts] = await pool.query(
      'SELECT * FROM posts WHERE id = ? AND author_id = ? AND post_type = ? AND deleted_at IS NULL',
      [req.params.id, req.user.id, 'collaboration_request']
    );

    if (posts.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Post not found or not authorized' } });
    }

    const post = posts[0];

    // Create project
    const [projectResult] = await pool.query(
      `INSERT INTO projects (name, description, status, creator_id, source_post_id) VALUES (?, ?, 'idea', ?, ?)`,
      [post.title, post.body, req.user.id, post.id]
    );

    const projectId = projectResult.insertId;

    // Add creator as owner
    await pool.query(
      'INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)',
      [projectId, req.user.id, 'owner']
    );

    // Create default channel
    const [channelResult] = await pool.query(
      `INSERT INTO conversations (type, name, project_id) VALUES ('channel', 'general', ?)`,
      [projectId]
    );

    // Add creator to channel
    await pool.query(
      'INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)',
      [channelResult.insertId, req.user.id]
    );

    // Send invitations to accepted interests
    const [acceptedInterests] = await pool.query(
      'SELECT user_id FROM post_interests WHERE post_id = ? AND status = ?',
      [post.id, 'accepted']
    );

    for (const interest of acceptedInterests) {
      await pool.query(
        'INSERT INTO project_invitations (project_id, inviter_id, invitee_id) VALUES (?, ?, ?)',
        [projectId, req.user.id, interest.user_id]
      );
      await pool.query(
        `INSERT INTO notifications (user_id, type, title, body, reference_type, reference_id)
         VALUES (?, 'invitation', 'You have been invited to a project', ?, 'project', ?)`,
        [interest.user_id, `You are invited to join "${post.title}"`, projectId]
      );
    }

    // Update post status
    await pool.query(
      "UPDATE posts SET collab_status = 'converted' WHERE id = ?",
      [post.id]
    );

    res.status(201).json({ project_id: projectId, message: 'Project created from post' });
  } catch (err) {
    console.error('Convert error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to convert post to project' } });
  }
});

// GET /api/v1/posts/:id/interests - list applicants/interests for collaboration post
router.get('/:id/interests', authenticate, async (req, res) => {
  try {
    const [posts] = await pool.query(
      'SELECT author_id FROM posts WHERE id = ? AND deleted_at IS NULL',
      [req.params.id]
    );

    if (posts.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Post not found' } });
    }

    const isAuthor = posts[0].author_id === req.user.id;

    let query = `
      SELECT pi.*, 
        u.username, u.name, u.alias, u.avatar_url, u.bio
      FROM post_interests pi
      JOIN users u ON pi.user_id = u.id
      WHERE pi.post_id = ?
    `;
    const params = [req.params.id];

    // If not author, only see own interest
    if (!isAuthor) {
      query += ' AND pi.user_id = ?';
      params.push(req.user.id);
    } else {
      query += ' ORDER BY pi.created_at DESC';
    }

    const [interests] = await pool.query(query, params);

    // Fetch skills for applicants
    if (interests.length > 0) {
      const userIds = interests.map(i => i.user_id);
      const [skills] = await pool.query(
        'SELECT user_id, skill FROM user_skills WHERE user_id IN (?)',
        [userIds]
      );
      const skillsMap = {};
      skills.forEach(s => {
        if (!skillsMap[s.user_id]) skillsMap[s.user_id] = [];
        skillsMap[s.user_id].push(s.skill);
      });
      interests.forEach(i => {
        i.user_skills = skillsMap[i.user_id] || [];
        if (typeof i.skills_offered === 'string') {
          try { i.skills_offered = JSON.parse(i.skills_offered); } catch (e) { i.skills_offered = []; }
        }
      });
    }

    res.json(interests);
  } catch (err) {
    console.error('Fetch interests error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch applicants' } });
  }
});

// PATCH /api/v1/posts/:id/interests/:userId - accept or decline applicant
router.patch('/:id/interests/:userId', authenticate, async (req, res) => {
  try {
    const { status } = req.body; // 'accepted', 'declined', 'pending'
    if (!['accepted', 'declined', 'pending'].includes(status)) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invalid status' } });
    }

    const [posts] = await pool.query(
      'SELECT author_id, title FROM posts WHERE id = ? AND deleted_at IS NULL',
      [req.params.id]
    );

    if (posts.length === 0 || posts[0].author_id !== req.user.id) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only post author can manage applicants' } });
    }

    await pool.query(
      'UPDATE post_interests SET status = ? WHERE post_id = ? AND user_id = ?',
      [status, req.params.id, req.params.userId]
    );

    // Notify applicant of status update
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, reference_type, reference_id)
       VALUES (?, 'interest_status', ?, ?, 'post', ?)`,
      [
        req.params.userId,
        `Your application was ${status}`,
        `Your collaboration application for "${posts[0].title}" has been ${status}.`,
        req.params.id
      ]
    );

    res.json({ message: `Applicant ${status}` });
  } catch (err) {
    console.error('Update interest status error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to update applicant' } });
  }
});

// POST /api/v1/posts/comments/:id/vote - upvote/downvote comment
router.post('/comments/:id/vote', authenticate, async (req, res) => {
  try {
    const { vote_type } = req.body; // 'up', 'down', 'none'
    const commentId = req.params.id;

    if (vote_type === 'none') {
      const [existing] = await pool.query(
        'SELECT vote_type FROM comment_votes WHERE comment_id = ? AND user_id = ?',
        [commentId, req.user.id]
      );
      if (existing.length > 0) {
        const oldVote = existing[0].vote_type;
        await pool.query('DELETE FROM comment_votes WHERE comment_id = ? AND user_id = ?', [commentId, req.user.id]);
        if (oldVote === 'up') {
          await pool.query('UPDATE comments SET upvotes = GREATEST(upvotes - 1, 0) WHERE id = ?', [commentId]);
        } else {
          await pool.query('UPDATE comments SET downvotes = GREATEST(downvotes - 1, 0) WHERE id = ?', [commentId]);
        }
      }
    } else {
      const [existing] = await pool.query(
        'SELECT vote_type FROM comment_votes WHERE comment_id = ? AND user_id = ?',
        [commentId, req.user.id]
      );

      if (existing.length > 0) {
        const oldVote = existing[0].vote_type;
        if (oldVote === vote_type) return res.json({ message: 'Already voted' });

        await pool.query(
          'UPDATE comment_votes SET vote_type = ? WHERE comment_id = ? AND user_id = ?',
          [vote_type, commentId, req.user.id]
        );
        if (vote_type === 'up') {
          await pool.query('UPDATE comments SET upvotes = upvotes + 1, downvotes = GREATEST(downvotes - 1, 0) WHERE id = ?', [commentId]);
        } else {
          await pool.query('UPDATE comments SET downvotes = downvotes + 1, upvotes = GREATEST(upvotes - 1, 0) WHERE id = ?', [commentId]);
        }
      } else {
        await pool.query(
          'INSERT INTO comment_votes (comment_id, user_id, vote_type) VALUES (?, ?, ?)',
          [commentId, req.user.id, vote_type]
        );
        if (vote_type === 'up') {
          await pool.query('UPDATE comments SET upvotes = upvotes + 1 WHERE id = ?', [commentId]);
        } else {
          await pool.query('UPDATE comments SET downvotes = downvotes + 1 WHERE id = ?', [commentId]);
        }
      }
    }

    const [comment] = await pool.query('SELECT upvotes, downvotes FROM comments WHERE id = ?', [commentId]);
    if (comment.length === 0) return res.status(404).json({ error: { message: 'Comment not found' } });
    res.json({ upvotes: comment[0].upvotes, downvotes: comment[0].downvotes, score: comment[0].upvotes - comment[0].downvotes });
  } catch (err) {
    console.error('Comment vote error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Comment vote failed' } });
  }
});

// POST /api/v1/posts/comments/:id/reactions - toggle emoji reaction on comment
router.post('/comments/:id/reactions', authenticate, async (req, res) => {
  try {
    const commentId = req.params.id;
    const { emoji } = req.body;
    if (!emoji || typeof emoji !== 'string') {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Emoji string is required' } });
    }

    const trimmedEmoji = emoji.trim().substring(0, 32);

    const [existing] = await pool.query(
      'SELECT id FROM comment_reactions WHERE comment_id = ? AND user_id = ? AND emoji = ?',
      [commentId, req.user.id, trimmedEmoji]
    );

    if (existing.length > 0) {
      await pool.query('DELETE FROM comment_reactions WHERE id = ?', [existing[0].id]);
    } else {
      await pool.query(
        'INSERT INTO comment_reactions (comment_id, user_id, emoji) VALUES (?, ?, ?)',
        [commentId, req.user.id, trimmedEmoji]
      );
    }

    const [allReactions] = await pool.query(
      'SELECT emoji, user_id FROM comment_reactions WHERE comment_id = ?',
      [commentId]
    );

    const agg = {};
    for (const r of allReactions) {
      if (!agg[r.emoji]) {
        agg[r.emoji] = { emoji: r.emoji, count: 0, user_ids: [], has_reacted: false };
      }
      agg[r.emoji].count += 1;
      agg[r.emoji].user_ids.push(r.user_id);
      if (r.user_id === req.user.id) {
        agg[r.emoji].has_reacted = true;
      }
    }

    res.json({
      comment_id: parseInt(commentId, 10),
      reactions: Object.values(agg),
    });
  } catch (err) {
    console.error('Comment reaction error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to update reaction' } });
  }
});

// DELETE /api/v1/posts/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const [result] = await pool.query(
      'UPDATE posts SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND author_id = ?',
      [req.params.id, req.user.id]
    );
    if (result.affectedRows === 0) {
      return res.status(403).json({ error: { message: 'Post not found or unauthorized' } });
    }
    res.json({ message: 'Post deleted' });
  } catch (err) {
    console.error('Delete post error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to delete post' } });
  }
});

// DELETE /api/v1/posts/:id/comments/:commentId
router.delete('/:id/comments/:commentId', authenticate, async (req, res) => {
  try {
    const { id: postId, commentId } = req.params;
    const [result] = await pool.query(
      'UPDATE comments SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND post_id = ? AND author_id = ?',
      [commentId, postId, req.user.id]
    );
    if (result.affectedRows === 0) {
      return res.status(403).json({ error: { message: 'Comment not found or unauthorized' } });
    }
    res.json({ message: 'Comment deleted' });
  } catch (err) {
    console.error('Delete comment error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to delete comment' } });
  }
});

module.exports = router;
