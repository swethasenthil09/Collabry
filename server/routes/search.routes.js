const express = require('express');
const pool = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/v1/search/omni - Global Omnisearch across posts, communities, projects, users, broadcasts
router.get('/omni', authenticate, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const category = req.query.category || 'all';
    const limitNum = Math.min(parseInt(req.query.limit, 10) || 6, 20);

    const term = `%${q}%`;

    const results = {
      posts: [],
      projects: [],
      communities: [],
      users: [],
      broadcasts: [],
    };

    if (!q || q.length < 1) {
      // Suggest top trending items when query is empty
      const [topPosts] = await pool.query(
        `SELECT p.id, p.title, p.post_type, p.custom_category, p.created_at, u.username, u.name, u.alias
         FROM posts p
         JOIN users u ON p.author_id = u.id
         WHERE p.deleted_at IS NULL
         ORDER BY p.upvotes DESC, p.created_at DESC LIMIT 5`
      ).catch(e => { console.error('Omnisearch topPosts err:', e); return [[]]; });

      const [topCommunities] = await pool.query(
        'SELECT id, name, slug, description, visibility, member_count FROM communities ORDER BY member_count DESC LIMIT 5'
      ).catch(e => { console.error('Omnisearch topCommunities err:', e); return [[]]; });

      const [topProjects] = await pool.query(
        'SELECT id, name, description, github_repo, member_count FROM projects WHERE deleted_at IS NULL ORDER BY member_count DESC LIMIT 5'
      ).catch(e => { console.error('Omnisearch topProjects err:', e); return [[]]; });

      return res.json({
        query: '',
        total: topPosts.length + topCommunities.length + topProjects.length,
        results: {
          posts: topPosts,
          projects: topProjects,
          communities: topCommunities,
          users: [],
          broadcasts: [],
        },
      });
    }

    const promises = [];

    // 1. Search Posts
    if (category === 'all' || category === 'posts') {
      promises.push(
        pool.query(
          `SELECT p.id, p.title, p.post_type, p.custom_category, p.created_at, p.upvotes,
             u.username, u.name, u.alias, c.name as community_name
           FROM posts p
           JOIN users u ON p.author_id = u.id
           LEFT JOIN communities c ON p.community_id = c.id
           WHERE p.deleted_at IS NULL AND (p.title LIKE ? OR p.body LIKE ? OR p.custom_category LIKE ? OR p.required_skills LIKE ?)
           ORDER BY p.upvotes DESC, p.created_at DESC
           LIMIT ?`,
          [term, term, term, term, limitNum]
        ).then(([rows]) => { results.posts = rows; })
         .catch(err => { console.error('Omnisearch posts error:', err); results.posts = []; })
      );
    }

    // 2. Search Projects
    if (category === 'all' || category === 'projects') {
      promises.push(
        pool.query(
          `SELECT p.id, p.name, p.description, p.github_repo, p.member_count, p.created_at
           FROM projects p
           WHERE (p.deleted_at IS NULL) AND (p.name LIKE ? OR p.description LIKE ?)
           ORDER BY p.member_count DESC
           LIMIT ?`,
          [term, term, limitNum]
        ).then(([rows]) => { results.projects = rows; })
         .catch(err => { console.error('Omnisearch projects error:', err); results.projects = []; })
      );
    }

    // 3. Search Communities
    if (category === 'all' || category === 'communities') {
      promises.push(
        pool.query(
          `SELECT c.id, c.name, c.slug, c.description, c.visibility, c.member_count, c.icon_url
           FROM communities c
           WHERE c.name LIKE ? OR c.description LIKE ? OR c.slug LIKE ?
           ORDER BY c.member_count DESC
           LIMIT ?`,
          [term, term, term, limitNum]
        ).then(([rows]) => { results.communities = rows; })
         .catch(err => { console.error('Omnisearch communities error:', err); results.communities = []; })
      );
    }

    // 4. Search Users
    if (category === 'all' || category === 'users') {
      promises.push(
        pool.query(
          `SELECT u.id, u.username, u.name, u.alias, u.avatar_url, u.bio
           FROM users u
           WHERE u.deleted_at IS NULL AND (u.username LIKE ? OR u.name LIKE ? OR u.alias LIKE ? OR u.bio LIKE ?)
           LIMIT ?`,
          [term, term, term, term, limitNum]
        ).then(([rows]) => { results.users = rows; })
         .catch(err => { console.error('Omnisearch users error:', err); results.users = []; })
      );
    }

    // 5. Search Broadcasts (live_sessions)
    if (category === 'all' || category === 'broadcasts') {
      promises.push(
        pool.query(
          `SELECT ls.id, ls.title, ls.session_type, ls.viewer_count, ls.status, ls.created_at,
             u.username as host_username, u.name as host_name
           FROM live_sessions ls
           JOIN users u ON ls.host_id = u.id
           WHERE ls.title LIKE ? OR ls.description LIKE ? OR u.username LIKE ? OR u.name LIKE ?
           ORDER BY (ls.status = 'live') DESC, ls.viewer_count DESC
           LIMIT ?`,
          [term, term, term, term, limitNum]
        ).then(([rows]) => { results.broadcasts = rows; })
         .catch(err => { console.error('Omnisearch broadcasts error:', err); results.broadcasts = []; })
      );
    }

    await Promise.all(promises);

    const total = (results.posts?.length || 0) +
      (results.projects?.length || 0) +
      (results.communities?.length || 0) +
      (results.users?.length || 0) +
      (results.broadcasts?.length || 0);

    res.json({
      query: q,
      total,
      results,
    });
  } catch (err) {
    console.error('Omnisearch error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Search query failed' } });
  }
});

module.exports = router;
