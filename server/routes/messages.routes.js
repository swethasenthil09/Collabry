const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../config/db');
const { authenticate, requireActiveUser } = require('../middleware/auth');

const router = express.Router();

// Audio Voice Notes upload configuration
const audioStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads/audio');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.webm';
    cb(null, `voice-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  },
});

const audioUpload = multer({
  storage: audioStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max for voice notes
});

// POST /api/v1/messages/upload-voice - upload voice recording audio blob
router.post('/upload-voice', authenticate, audioUpload.single('audio'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Audio file is required' } });
    }
    const media_url = `/uploads/audio/${req.file.filename}`;
    res.json({ media_url, filename: req.file.filename });
  } catch (err) {
    console.error('Upload voice error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to upload voice note' } });
  }
});

// GET /api/v1/messages/dms - list user's private DM conversations
router.get('/dms', authenticate, async (req, res) => {
  try {
    const [dms] = await pool.query(
      `SELECT c.id, c.type, c.created_at,
         u.id as recipient_id, u.username as recipient_username, u.name as recipient_name, u.alias as recipient_alias, u.avatar_url as recipient_avatar,
         (SELECT body FROM messages WHERE conversation_id = c.id AND deleted_at IS NULL ORDER BY id DESC LIMIT 1) as last_message,
         (SELECT message_type FROM messages WHERE conversation_id = c.id AND deleted_at IS NULL ORDER BY id DESC LIMIT 1) as last_message_type,
         (SELECT status FROM messages WHERE conversation_id = c.id AND deleted_at IS NULL ORDER BY id DESC LIMIT 1) as last_message_status,
         (SELECT created_at FROM messages WHERE conversation_id = c.id AND deleted_at IS NULL ORDER BY id DESC LIMIT 1) as last_message_at,
         (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != ? AND status != 'read' AND deleted_at IS NULL) as unread_count
       FROM conversations c
       JOIN conversation_members cm1 ON c.id = cm1.conversation_id AND cm1.user_id = ?
       JOIN conversation_members cm2 ON c.id = cm2.conversation_id AND cm2.user_id != ?
       JOIN users u ON cm2.user_id = u.id
       WHERE c.type = 'dm'
       ORDER BY COALESCE(last_message_at, c.created_at) DESC`,
      [req.user.id, req.user.id, req.user.id]
    );

    res.json(dms);
  } catch (err) {
    console.error('List DMs error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch direct messages' } });
  }
});

// POST /api/v1/messages/dms - get or create DM conversation with a user
router.post('/dms', authenticate, async (req, res) => {
  try {
    const target_user_id = req.body.target_user_id || req.body.recipient_id;
    if (!target_user_id) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Target user ID is required' } });
    }

    if (parseInt(target_user_id) === req.user.id) {
      return res.status(400).json({ error: { code: 'INVALID', message: 'Cannot create DM with yourself' } });
    }

    // Check if target user exists
    const [targetUser] = await pool.query(
      'SELECT id, username, name, alias, avatar_url FROM users WHERE id = ? AND deleted_at IS NULL',
      [target_user_id]
    );
    if (targetUser.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    // Check if DM conversation already exists
    const [existing] = await pool.query(
      `SELECT c.id FROM conversations c
       JOIN conversation_members cm1 ON c.id = cm1.conversation_id AND cm1.user_id = ?
       JOIN conversation_members cm2 ON c.id = cm2.conversation_id AND cm2.user_id = ?
       WHERE c.type = 'dm'
       LIMIT 1`,
      [req.user.id, target_user_id]
    );

    if (existing.length > 0) {
      return res.json({ id: existing[0].id, conversation_id: existing[0].id, recipient: targetUser[0], is_new: false });
    }

    // Create new DM conversation
    const [convResult] = await pool.query("INSERT INTO conversations (type) VALUES ('dm')");
    const convId = convResult.insertId;

    await pool.query(
      'INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?), (?, ?)',
      [convId, req.user.id, convId, target_user_id]
    );

    res.status(201).json({ id: convId, conversation_id: convId, recipient: targetUser[0], is_new: true });
  } catch (err) {
    console.error('Create DM error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to start DM conversation' } });
  }
});

// GET /api/v1/messages/groups - list user's group conversations
router.get('/groups', authenticate, async (req, res) => {
  try {
    const [groups] = await pool.query(
      `SELECT c.id, c.name, c.avatar_url, c.type, c.created_at, c.created_by,
         cm.role as user_role,
         (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = c.id) as member_count,
         (SELECT body FROM messages WHERE conversation_id = c.id AND deleted_at IS NULL ORDER BY id DESC LIMIT 1) as last_message,
         (SELECT message_type FROM messages WHERE conversation_id = c.id AND deleted_at IS NULL ORDER BY id DESC LIMIT 1) as last_message_type,
         (SELECT created_at FROM messages WHERE conversation_id = c.id AND deleted_at IS NULL ORDER BY id DESC LIMIT 1) as last_message_at,
         (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != ? AND status != 'read' AND deleted_at IS NULL) as unread_count
       FROM conversations c
       JOIN conversation_members cm ON c.id = cm.conversation_id AND cm.user_id = ?
       WHERE c.type = 'group'
       ORDER BY COALESCE(last_message_at, c.created_at) DESC`,
      [req.user.id, req.user.id]
    );

    res.json(groups);
  } catch (err) {
    console.error('List groups error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch group chats' } });
  }
});

// POST /api/v1/messages/groups - create new group chat
router.post('/groups', authenticate, async (req, res) => {
  try {
    const { name, member_ids = [], avatar_url = null } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Group name is required' } });
    }

    const [convResult] = await pool.query(
      "INSERT INTO conversations (type, name, created_by, avatar_url) VALUES ('group', ?, ?, ?)",
      [name.trim(), req.user.id, avatar_url]
    );
    const convId = convResult.insertId;

    // Add creator as admin
    await pool.query(
      "INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, 'admin')",
      [convId, req.user.id]
    );

    // Add selected members
    const cleanMemberIds = Array.isArray(member_ids)
      ? [...new Set(member_ids.map(Number))].filter(id => id && id !== req.user.id)
      : [];

    for (const memberId of cleanMemberIds) {
      await pool.query(
        "INSERT INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, 'member')",
        [convId, memberId]
      );
    }

    // System welcome message
    await pool.query(
      "INSERT INTO messages (conversation_id, sender_id, body, message_type, status) VALUES (?, ?, ?, 'text', 'sent')",
      [convId, req.user.id, `Created group "${name.trim()}"`, 'text']
    );

    // Fetch created group with full member count
    const [createdGroup] = await pool.query(
      `SELECT c.id, c.name, c.avatar_url, c.type, c.created_at, c.created_by,
         (SELECT COUNT(*) FROM conversation_members WHERE conversation_id = c.id) as member_count
       FROM conversations c WHERE c.id = ?`,
      [convId]
    );

    res.status(201).json(createdGroup[0]);
  } catch (err) {
    console.error('Create group error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to create group chat' } });
  }
});

// PUT /api/v1/messages/groups/:id - update group name or avatar
router.put('/groups/:id', authenticate, async (req, res) => {
  try {
    const convId = req.params.id;
    const { name, avatar_url } = req.body;

    const [membership] = await pool.query(
      'SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
      [convId, req.user.id]
    );
    if (membership.length === 0) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a member of this group' } });
    }

    const updates = [];
    const params = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(name.trim()); }
    if (avatar_url !== undefined) { updates.push('avatar_url = ?'); params.push(avatar_url); }

    if (updates.length > 0) {
      params.push(convId);
      await pool.query(`UPDATE conversations SET ${updates.join(', ')} WHERE id = ? AND type = 'group'`, params);
    }

    res.json({ message: 'Group updated successfully' });
  } catch (err) {
    console.error('Update group error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to update group' } });
  }
});

// POST /api/v1/messages/groups/:id/members - add members to group
router.post('/groups/:id/members', authenticate, async (req, res) => {
  try {
    const convId = req.params.id;
    const { member_ids = [] } = req.body;

    const [membership] = await pool.query(
      'SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
      [convId, req.user.id]
    );
    if (membership.length === 0) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a member of this group' } });
    }

    const cleanMemberIds = Array.isArray(member_ids)
      ? [...new Set(member_ids.map(Number))].filter(Boolean)
      : [];

    for (const memberId of cleanMemberIds) {
      await pool.query(
        "INSERT IGNORE INTO conversation_members (conversation_id, user_id, role) VALUES (?, ?, 'member')",
        [convId, memberId]
      );
    }

    res.json({ message: 'Members added to group successfully' });
  } catch (err) {
    console.error('Add group members error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to add members to group' } });
  }
});

// DELETE /api/v1/messages/groups/:id/members/:userId - remove member or leave group
router.delete('/groups/:id/members/:userId', authenticate, async (req, res) => {
  try {
    const convId = req.params.id;
    const targetUserId = parseInt(req.params.userId, 10);

    const [membership] = await pool.query(
      'SELECT role FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
      [convId, req.user.id]
    );
    if (membership.length === 0) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a member of this group' } });
    }

    // Must be admin or leaving oneself
    if (targetUserId !== req.user.id && membership[0].role !== 'admin') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only group admins can remove other members' } });
    }

    await pool.query(
      'DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
      [convId, targetUserId]
    );

    res.json({ message: 'Member removed from group' });
  } catch (err) {
    console.error('Remove group member error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to remove member from group' } });
  }
});

// POST /api/v1/messages/:conversationId/read - mark messages in conversation as read
router.post('/:conversationId/read', authenticate, async (req, res) => {
  try {
    const convId = req.params.conversationId;

    // Verify membership
    const [members] = await pool.query(
      'SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
      [convId, req.user.id]
    );
    if (members.length === 0) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a member of this conversation' } });
    }

    await pool.query(
      "UPDATE messages SET status = 'read', read_at = NOW() WHERE conversation_id = ? AND sender_id != ? AND status != 'read'",
      [convId, req.user.id]
    );

    const io = req.app.get('io');
    if (io) {
      io.to(`conversation:${convId}`).emit('messages_read', {
        conversationId: parseInt(convId, 10),
        readerId: req.user.id,
        readAt: new Date().toISOString(),
      });
    }

    res.json({ message: 'Messages marked as read' });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to mark messages as read' } });
  }
});

// POST /api/v1/messages/:conversationId - send message (text or audio) via REST
router.post('/:conversationId', authenticate, requireActiveUser, async (req, res) => {
  try {
    const { body, message_type = 'text', media_url = null, duration = null } = req.body;
    const convId = req.params.conversationId;

    if (!body && !media_url) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Message content is required' } });
    }

    // Check membership
    const [members] = await pool.query(
      'SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
      [convId, req.user.id]
    );
    if (members.length === 0) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a member of this conversation' } });
    }

    const textBody = body ? body.trim() : (message_type === 'audio' ? 'Voice Message' : '');

    const [result] = await pool.query(
      'INSERT INTO messages (conversation_id, sender_id, body, message_type, media_url, duration, status) VALUES (?, ?, ?, ?, ?, ?, "sent")',
      [convId, req.user.id, textBody, message_type, media_url, duration]
    );

    const messageId = result.insertId;
    const [inserted] = await pool.query(
      `SELECT m.*, u.username as sender_username, u.name as sender_name, u.alias as sender_alias, u.avatar_url as sender_avatar
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE m.id = ?`,
      [messageId]
    );

    const message = inserted[0];
    const io = req.app.get('io');
    if (io) {
      io.to(`conversation:${convId}`).emit('new_message', message);
    }

    res.status(201).json(message);
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to send message' } });
  }
});

// GET /api/v1/messages/conversations/:id
router.get('/conversations/:id', authenticate, async (req, res) => {
  try {
    const [conv] = await pool.query(
      `SELECT c.* FROM conversations c
       JOIN conversation_members cm ON c.id = cm.conversation_id AND cm.user_id = ?
       WHERE c.id = ?`,
      [req.user.id, req.params.id]
    );

    if (conv.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Conversation not found' } });
    }

    const conversation = conv[0];

    if (conversation.type === 'dm') {
      const [recipient] = await pool.query(
        `SELECT u.id, u.username, u.name, u.alias, u.avatar_url, u.bio
         FROM conversation_members cm
         JOIN users u ON cm.user_id = u.id
         WHERE cm.conversation_id = ? AND cm.user_id != ?`,
        [conversation.id, req.user.id]
      );
      conversation.recipient = recipient[0] || null;
    } else if (conversation.type === 'group') {
      const [members] = await pool.query(
        `SELECT u.id, u.username, u.name, u.alias, u.avatar_url, u.bio, cm.role, cm.joined_at
         FROM conversation_members cm
         JOIN users u ON cm.user_id = u.id
         WHERE cm.conversation_id = ?
         ORDER BY (cm.role = 'admin') DESC, u.name ASC`,
        [conversation.id]
      );
      conversation.members = members;
      conversation.is_admin = members.some(m => m.id === req.user.id && m.role === 'admin');
    }

    res.json(conversation);
  } catch (err) {
    console.error('Get conversation error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch conversation' } });
  }
});

async function getReactionsForMessages(messageIds, currentUserId) {
  if (!messageIds || messageIds.length === 0) return {};
  const [rows] = await pool.query(
    'SELECT message_id, emoji, user_id FROM message_reactions WHERE message_id IN (?)',
    [messageIds]
  );
  const map = {};
  for (const row of rows) {
    if (!map[row.message_id]) map[row.message_id] = {};
    if (!map[row.message_id][row.emoji]) {
      map[row.message_id][row.emoji] = { emoji: row.emoji, count: 0, user_ids: [], has_reacted: false };
    }
    map[row.message_id][row.emoji].count += 1;
    map[row.message_id][row.emoji].user_ids.push(row.user_id);
    if (row.user_id === currentUserId) {
      map[row.message_id][row.emoji].has_reacted = true;
    }
  }
  const result = {};
  for (const mid of messageIds) {
    result[mid] = map[mid] ? Object.values(map[mid]) : [];
  }
  return result;
}

// GET /api/v1/messages/search - full-text search across messages
router.get('/search', authenticate, async (req, res) => {
  try {
    const { q, conversation_id, project_id, limit = 30 } = req.query;
    if (!q || !q.trim()) {
      return res.json([]);
    }

    const searchTerm = `%${q.trim()}%`;
    let where = 'm.deleted_at IS NULL AND m.body LIKE ?';
    const params = [searchTerm];

    if (conversation_id) {
      // Verify membership
      const [mem] = await pool.query(
        'SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
        [conversation_id, req.user.id]
      );
      if (mem.length === 0) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied to this conversation' } });
      }
      where += ' AND m.conversation_id = ?';
      params.push(conversation_id);
    } else if (project_id) {
      // Verify workspace access
      const [proj] = await pool.query('SELECT visibility FROM projects WHERE id = ? AND deleted_at IS NULL', [project_id]);
      if (proj.length === 0) return res.status(404).json({ error: { message: 'Project not found' } });
      const [pMem] = await pool.query('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', [project_id, req.user.id]);
      if (proj[0].visibility === 'private' && pMem.length === 0) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied to private workspace' } });
      }
      where += ' AND c.project_id = ?';
      params.push(project_id);
    } else {
      // Search all conversations user belongs to
      where += ' AND m.conversation_id IN (SELECT conversation_id FROM conversation_members WHERE user_id = ?)';
      params.push(req.user.id);
    }

    params.push(parseInt(limit, 10));

    const [results] = await pool.query(
      `SELECT m.*, 
        u.username as sender_username, u.name as sender_name, u.avatar_url as sender_avatar,
        c.name as conversation_name, c.type as conversation_type, c.project_id
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       JOIN conversations c ON m.conversation_id = c.id
       WHERE ${where}
       ORDER BY m.id DESC
       LIMIT ?`,
      params
    );

    res.json(results);
  } catch (err) {
    console.error('Search messages error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to search messages' } });
  }
});

// POST /api/v1/messages/:id/reactions - toggle emoji reaction
router.post('/:id/reactions', authenticate, async (req, res) => {
  try {
    const messageId = req.params.id;
    const { emoji } = req.body;
    if (!emoji || !emoji.trim()) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Emoji is required' } });
    }

    // Check message exists and get conversation
    const [msg] = await pool.query('SELECT conversation_id FROM messages WHERE id = ? AND deleted_at IS NULL', [messageId]);
    if (msg.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Message not found' } });
    }
    const convId = msg[0].conversation_id;

    // Check membership
    const [members] = await pool.query(
      'SELECT user_id FROM conversation_members WHERE conversation_id = ? AND user_id = ?',
      [convId, req.user.id]
    );
    if (members.length === 0) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Not a member of this conversation' } });
    }

    // Toggle reaction
    const cleanEmoji = emoji.trim();
    const [existing] = await pool.query(
      'SELECT id FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
      [messageId, req.user.id, cleanEmoji]
    );

    if (existing.length > 0) {
      await pool.query('DELETE FROM message_reactions WHERE id = ?', [existing[0].id]);
    } else {
      await pool.query('INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)', [messageId, req.user.id, cleanEmoji]);
    }

    // Fetch updated reactions
    const reactionsMap = await getReactionsForMessages([messageId], req.user.id);
    const reactions = reactionsMap[messageId] || [];

    // Broadcast via socket
    const io = req.app.get('io');
    if (io) {
      io.to(`conversation:${convId}`).emit('message_reaction_updated', {
        message_id: parseInt(messageId, 10),
        conversation_id: convId,
        reactions,
      });
    }

    res.json({ message_id: parseInt(messageId, 10), reactions });
  } catch (err) {
    console.error('Reaction error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to update reaction' } });
  }
});

// GET /api/v1/messages/:conversationId
router.get('/:conversationId', authenticate, async (req, res) => {
  try {
    const { limit = 50, before } = req.query;
    let where = 'm.conversation_id = ? AND m.deleted_at IS NULL';
    const params = [req.params.conversationId];

    if (before) {
      where += ' AND m.id < ?';
      params.push(before);
    }

    params.push(parseInt(limit));

    const [messages] = await pool.query(
      `SELECT m.*, u.username as sender_username, u.name as sender_name, u.avatar_url as sender_avatar
       FROM messages m
       JOIN users u ON m.sender_id = u.id
       WHERE ${where}
       ORDER BY m.id DESC
       LIMIT ?`,
      params
    );

    const reversed = messages.reverse();
    if (reversed.length > 0) {
      const reactionsMap = await getReactionsForMessages(reversed.map(m => m.id), req.user.id);
      reversed.forEach(m => {
        m.reactions = reactionsMap[m.id] || [];
      });
    }

    res.json(reversed);
  } catch (err) {
    console.error('Messages error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch messages' } });
  }
});

// PUT /api/v1/messages/:id - edit message content
router.put('/:id', authenticate, async (req, res) => {
  try {
    const messageId = req.params.id;
    const { body } = req.body;
    if (!body || !body.trim()) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Message content cannot be empty' } });
    }

    const [msg] = await pool.query('SELECT * FROM messages WHERE id = ? AND deleted_at IS NULL', [messageId]);
    if (msg.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Message not found' } });
    }

    if (msg[0].sender_id !== req.user.id) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You can only edit your own messages' } });
    }

    const trimmedBody = body.trim();
    await pool.query('UPDATE messages SET body = ?, updated_at = NOW() WHERE id = ?', [trimmedBody, messageId]);

    const io = req.app.get('io');
    if (io) {
      io.to(`conversation:${msg[0].conversation_id}`).emit('message_updated', {
        id: parseInt(messageId, 10),
        conversation_id: msg[0].conversation_id,
        body: trimmedBody,
        updated_at: new Date().toISOString(),
        is_edited: true,
      });
    }

    res.json({
      ...msg[0],
      body: trimmedBody,
      is_edited: true,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Edit message error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to edit message' } });
  }
});

// DELETE /api/v1/messages/:id - delete message (soft delete)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const messageId = req.params.id;
    const [msg] = await pool.query('SELECT * FROM messages WHERE id = ? AND deleted_at IS NULL', [messageId]);
    if (msg.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Message not found' } });
    }

    if (msg[0].sender_id !== req.user.id) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You can only delete your own messages' } });
    }

    await pool.query('UPDATE messages SET deleted_at = NOW() WHERE id = ?', [messageId]);

    const io = req.app.get('io');
    if (io) {
      io.to(`conversation:${msg[0].conversation_id}`).emit('message_deleted', {
        id: parseInt(messageId, 10),
        conversation_id: msg[0].conversation_id,
      });
    }

    res.json({ message: 'Message deleted successfully', id: parseInt(messageId, 10) });
  } catch (err) {
    console.error('Delete message error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to delete message' } });
  }
});

module.exports = router;
