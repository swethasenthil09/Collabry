const jwt = require('jsonwebtoken');
const pool = require('../config/db');
require('dotenv').config();

let _io = null;

function getIO() {
  return _io;
}

function initializeSocket(io) {
  _io = io;
  // Authenticate socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
      socket.userId = decoded.userId;
      socket.username = decoded.username;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.username} (${socket.userId})`);

    // Track online presence
    if (!onlineUsers.has(socket.userId)) {
      onlineUsers.set(socket.userId, new Set());
    }
    onlineUsers.get(socket.userId).add(socket.id);
    io.emit('user:presence', { userId: socket.userId, status: 'online' });

    socket.on('users:get_online', () => {
      socket.emit('users:online_list', Array.from(onlineUsers.keys()));
    });

    // Join user's personal room for notifications
    socket.join(`user:${socket.userId}`);

    // Join / leave project rooms
    socket.on('project:join', (projectId) => {
      if (projectId) {
        socket.join(`project:${projectId}`);
      }
    });

    socket.on('project:leave', (projectId) => {
      if (projectId) {
        socket.leave(`project:${projectId}`);
      }
    });

    // Join a conversation room
    socket.on('join_channel', async (conversationId) => {
      try {
        // Verify membership
        const [membership] = await pool.query(
          `SELECT cm.id FROM conversation_members cm WHERE cm.conversation_id = ? AND cm.user_id = ?
           UNION
           SELECT pm.id FROM conversations c
           JOIN project_members pm ON c.project_id = pm.project_id AND pm.user_id = ?
           WHERE c.id = ? AND c.type = 'channel'`,
          [conversationId, socket.userId, socket.userId, conversationId]
        );

        if (membership.length > 0) {
          socket.join(`conversation:${conversationId}`);
          socket.emit('joined_channel', { conversationId });

          // Auto-mark unread messages in this conversation as read
          await pool.query(
            "UPDATE messages SET status = 'read', read_at = NOW() WHERE conversation_id = ? AND sender_id != ? AND status != 'read'",
            [conversationId, socket.userId]
          );

          io.to(`conversation:${conversationId}`).emit('messages_read', {
            conversationId: parseInt(conversationId, 10),
            readerId: socket.userId,
            readAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error('Join channel error:', err);
      }
    });

    // Leave a conversation room
    socket.on('leave_channel', (conversationId) => {
      socket.leave(`conversation:${conversationId}`);
    });

    // Send message (text or audio voice note)
    socket.on('send_message', async (data) => {
      try {
        const { conversationId, body, message_type = 'text', media_url = null, duration = null } = data || {};
        if (!conversationId || (!body && !media_url)) return;

        // Check if user is blocked or frozen
        const [userCheck] = await pool.query('SELECT status, frozen_until, freeze_reason FROM users WHERE id = ?', [socket.userId]);
        if (userCheck.length > 0) {
          const u = userCheck[0];
          if (u.status === 'blocked') {
            socket.emit('error_message', { message: 'Your account has been permanently blocked.' });
            return;
          }
          if (u.status === 'frozen') {
            if (u.frozen_until && new Date() >= new Date(u.frozen_until)) {
              await pool.query('UPDATE users SET status = "active", frozen_until = NULL, freeze_reason = NULL WHERE id = ?', [socket.userId]);
            } else {
              socket.emit('error_message', { message: `Your account is frozen until ${new Date(u.frozen_until).toLocaleDateString()}. Reason: ${u.freeze_reason || 'Reported'}.` });
              return;
            }
          }
        }

        const textBody = body ? body.trim() : (message_type === 'audio' ? 'Voice Message' : '');

        // Save to database
        const [result] = await pool.query(
          'INSERT INTO messages (conversation_id, sender_id, body, message_type, media_url, duration, status) VALUES (?, ?, ?, ?, ?, ?, "sent")',
          [conversationId, socket.userId, textBody, message_type, media_url, duration]
        );

        // Get sender info
        const [sender] = await pool.query(
          'SELECT username, name, alias, avatar_url FROM users WHERE id = ?',
          [socket.userId]
        );

        const message = {
          id: result.insertId,
          conversation_id: conversationId,
          sender_id: socket.userId,
          sender_username: sender[0].username,
          sender_name: sender[0].name,
          sender_alias: sender[0].alias,
          sender_avatar: sender[0].avatar_url,
          body: textBody,
          message_type,
          media_url,
          duration,
          status: 'sent',
          created_at: new Date().toISOString(),
        };

        // Broadcast to room
        io.to(`conversation:${conversationId}`).emit('new_message', message);
      } catch (err) {
        console.error('Send message error:', err);
      }
    });

    // Edit message
    socket.on('edit_message', async ({ messageId, body }) => {
      try {
        if (!messageId || !body || !body.trim()) return;
        const [msg] = await pool.query('SELECT * FROM messages WHERE id = ? AND deleted_at IS NULL', [messageId]);
        if (msg.length === 0 || msg[0].sender_id !== socket.userId) return;

        const trimmed = body.trim();
        await pool.query('UPDATE messages SET body = ?, updated_at = NOW() WHERE id = ?', [trimmed, messageId]);

        io.to(`conversation:${msg[0].conversation_id}`).emit('message_updated', {
          id: parseInt(messageId, 10),
          conversation_id: msg[0].conversation_id,
          body: trimmed,
          updated_at: new Date().toISOString(),
          is_edited: true,
        });
      } catch (err) {
        console.error('Socket edit_message error:', err);
      }
    });

    // Delete message
    socket.on('delete_message', async ({ messageId }) => {
      try {
        if (!messageId) return;
        const [msg] = await pool.query('SELECT * FROM messages WHERE id = ? AND deleted_at IS NULL', [messageId]);
        if (msg.length === 0 || msg[0].sender_id !== socket.userId) return;

        await pool.query('UPDATE messages SET deleted_at = NOW() WHERE id = ?', [messageId]);

        io.to(`conversation:${msg[0].conversation_id}`).emit('message_deleted', {
          id: parseInt(messageId, 10),
          conversation_id: msg[0].conversation_id,
        });
      } catch (err) {
        console.error('Socket delete_message error:', err);
      }
    });

    // Mark messages as read
    socket.on('mark_read', async ({ conversationId }) => {
      if (!conversationId) return;
      try {
        await pool.query(
          "UPDATE messages SET status = 'read', read_at = NOW() WHERE conversation_id = ? AND sender_id != ? AND status != 'read'",
          [conversationId, socket.userId]
        );
        io.to(`conversation:${conversationId}`).emit('messages_read', {
          conversationId: parseInt(conversationId, 10),
          readerId: socket.userId,
          readAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error('Socket mark_read error:', err);
      }
    });

    // Typing indicator
    socket.on('typing_start', (conversationId) => {
      socket.to(`conversation:${conversationId}`).emit('user_typing', {
        userId: socket.userId,
        username: socket.username,
        conversationId,
      });
    });

    socket.on('typing_stop', (conversationId) => {
      socket.to(`conversation:${conversationId}`).emit('user_stopped_typing', {
        userId: socket.userId,
        conversationId,
      });
    });

    // =========================================================================
    // COLLABORATIVE WORKSPACE CANVAS & LIVE NOTES
    // =========================================================================
    socket.on('project:join', (projectId) => {
      socket.join(`project:${projectId}`);
    });

    socket.on('project:leave', (projectId) => {
      socket.leave(`project:${projectId}`);
    });

    socket.on('canvas:draw', ({ projectId, stroke, element, action }) => {
      if (!projectId) return;
      socket.to(`project:${projectId}`).emit('canvas:draw', {
        stroke,
        element,
        action,
        userId: socket.userId,
        username: socket.username,
      });
    });

    socket.on('canvas:clear', ({ projectId }) => {
      if (!projectId) return;
      socket.to(`project:${projectId}`).emit('canvas:clear', {
        userId: socket.userId,
      });
    });

    socket.on('notes:change', ({ projectId, title, content }) => {
      if (!projectId) return;
      socket.to(`project:${projectId}`).emit('notes:change', {
        title,
        content,
        userId: socket.userId,
        username: socket.username,
      });
    });

    // =========================================================================
    // VOICE ROOM / SPACES (Discord Channels & X Spaces)
    // =========================================================================
    socket.on('voice:join', (data) => {
      const { projectId, channelId, roomTitle, user, isMuted } = data || {};
      if (!projectId) return;

      const roomKey = `project:${projectId}:channel:${channelId || 'general'}`;
      socket.join(`voice:${roomKey}`);

      if (!voiceRooms.has(roomKey)) {
        voiceRooms.set(roomKey, {
          roomTitle: roomTitle || '🎙️ Live Voice Space',
          hostId: socket.userId,
          projectId,
          channelId: channelId || 'general',
          participants: new Map(),
        });
      }

      const room = voiceRooms.get(roomKey);
      room.participants.set(socket.userId, {
        userId: socket.userId,
        username: socket.username || user?.username,
        name: user?.name || socket.username,
        alias: user?.alias || `@${socket.username}`,
        avatar: user?.avatar_url || null,
        isMuted: isMuted !== undefined ? isMuted : false,
        isRaised: false,
        isSpeaking: false,
        isHost: room.hostId === socket.userId,
        socketId: socket.id,
      });

      broadcastVoiceState(roomKey, io);
    });

    socket.on('voice:leave', (data) => {
      const { projectId, channelId } = data || {};
      if (!projectId) return;

      const roomKey = `project:${projectId}:channel:${channelId || 'general'}`;
      socket.leave(`voice:${roomKey}`);

      const room = voiceRooms.get(roomKey);
      if (room) {
        room.participants.delete(socket.userId);
        if (room.participants.size === 0) {
          voiceRooms.delete(roomKey);
        } else if (room.hostId === socket.userId) {
          // Transfer host to next participant
          const nextHost = Array.from(room.participants.values())[0];
          if (nextHost) {
            room.hostId = nextHost.userId;
            nextHost.isHost = true;
          }
        }
        broadcastVoiceState(roomKey, io);
      }
    });

    socket.on('voice:toggle_mute', (data) => {
      const { projectId, channelId, isMuted } = data || {};
      const roomKey = `project:${projectId}:channel:${channelId || 'general'}`;
      const room = voiceRooms.get(roomKey);
      if (room && room.participants.has(socket.userId)) {
        const participant = room.participants.get(socket.userId);
        participant.isMuted = isMuted;
        if (isMuted) participant.isSpeaking = false;
        broadcastVoiceState(roomKey, io);
      }
    });

    socket.on('voice:raise_hand', (data) => {
      const { projectId, channelId, isRaised } = data || {};
      const roomKey = `project:${projectId}:channel:${channelId || 'general'}`;
      const room = voiceRooms.get(roomKey);
      if (room && room.participants.has(socket.userId)) {
        const participant = room.participants.get(socket.userId);
        participant.isRaised = isRaised;
        broadcastVoiceState(roomKey, io);
      }
    });

    socket.on('voice:speaking', (data) => {
      const { projectId, channelId, isSpeaking } = data || {};
      const roomKey = `project:${projectId}:channel:${channelId || 'general'}`;
      const room = voiceRooms.get(roomKey);
      if (room && room.participants.has(socket.userId)) {
        const participant = room.participants.get(socket.userId);
        if (!participant.isMuted) {
          participant.isSpeaking = Boolean(isSpeaking);
          broadcastVoiceState(roomKey, io);
        }
      }
    });

    socket.on('voice:signal', (data) => {
      // Forward WebRTC peer signaling for audio mesh
      const { toSocketId, signal } = data || {};
      if (toSocketId) {
        io.to(toSocketId).emit('voice:signal', {
          fromSocketId: socket.id,
          fromUserId: socket.userId,
          signal,
        });
      }
    });

    socket.on('voice:end_room', (data) => {
      const { projectId, channelId } = data || {};
      const roomKey = `project:${projectId}:channel:${channelId || 'general'}`;
      const room = voiceRooms.get(roomKey);
      if (room && room.hostId === socket.userId) {
        voiceRooms.delete(roomKey);
        io.to(`voice:${roomKey}`).emit('voice:room_ended', { roomKey });
      }
    });

    // =========================================================================
    // LIVE SESSIONS (YouTube Live & X Broadcasts)
    // =========================================================================
    socket.on('live:join', (data) => {
      const { sessionId, user } = data || {};
      if (!sessionId) return;

      socket.join(`live:${sessionId}`);

      if (!liveBroadcastViewers.has(String(sessionId))) {
        liveBroadcastViewers.set(String(sessionId), new Map());
      }

      const viewersMap = liveBroadcastViewers.get(String(sessionId));
      const userInfo = {
        id: socket.userId || user?.id || socket.id,
        username: socket.username || user?.username,
        name: user?.name || socket.username || 'User',
        avatar: user?.avatar_url || user?.avatar || null,
        socketId: socket.id,
      };

      viewersMap.set(String(userInfo.id), userInfo);

      // Send the list of existing viewers to the joining user
      socket.emit('live:participants_sync', {
        sessionId,
        participants: Array.from(viewersMap.values()),
        count: viewersMap.size,
      });

      // Broadcast to all other participants
      socket.to(`live:${sessionId}`).emit('live:viewer_joined', {
        sessionId,
        user: userInfo,
        count: viewersMap.size,
      });

      io.to(`live:${sessionId}`).emit('live:viewer_count', {
        sessionId,
        count: viewersMap.size,
      });
    });

    socket.on('live:leave', (data) => {
      const { sessionId } = data || {};
      if (!sessionId) return;

      socket.leave(`live:${sessionId}`);
      const viewersMap = liveBroadcastViewers.get(String(sessionId));
      if (viewersMap) {
        viewersMap.delete(String(socket.userId));
        const count = Math.max(1, viewersMap.size);
        io.to(`live:${sessionId}`).emit('live:viewer_left', {
          sessionId,
          userId: socket.userId,
          count,
        });
        io.to(`live:${sessionId}`).emit('live:viewer_count', {
          sessionId,
          count,
        });
      }
    });

    socket.on('live:remove_user', (data) => {
      const { sessionId, userId } = data || {};
      if (!sessionId || !userId) return;

      const viewersMap = liveBroadcastViewers.get(String(sessionId));
      if (viewersMap) {
        const target = viewersMap.get(String(userId));
        if (target && target.socketId) {
          const targetSocket = io.sockets.sockets.get(target.socketId);
          if (targetSocket) {
            targetSocket.leave(`live:${sessionId}`);
            targetSocket.emit('live:you_were_removed', {
              sessionId,
              message: 'You were removed from this broadcast by the host',
            });
          }
        }
        viewersMap.delete(String(userId));
      }

      io.to(`live:${sessionId}`).emit('live:user_removed', {
        sessionId: parseInt(sessionId, 10) || sessionId,
        userId: parseInt(userId, 10) || userId,
        count: viewersMap ? Math.max(1, viewersMap.size) : 1,
      });
    });

    socket.on('live:chat_message', (data) => {
      const { sessionId, text, user } = data || {};
      if (!sessionId || !text) return;

      const chatItem = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        sessionId,
        userId: socket.userId,
        user_id: socket.userId,
        username: socket.username,
        name: user?.name || socket.username,
        user_name: user?.name || socket.username,
        avatar: user?.avatar_url || null,
        text: text.trim(),
        timestamp: new Date().toISOString(),
      };

      io.to(`live:${sessionId}`).emit('live:new_chat_message', chatItem);
      io.to(`live:${sessionId}`).emit('live:new_chat', chatItem);
    });

    socket.on('live:reaction', (data) => {
      const { sessionId, emoji } = data || {};
      if (!sessionId || !emoji) return;

      const reactItem = {
        id: `react_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        sessionId,
        emoji,
        userId: socket.userId,
        username: socket.username,
      };

      io.to(`live:${sessionId}`).emit('live:new_reaction', reactItem);
      io.to(`live:${sessionId}`).emit('live:floating_reaction', reactItem);
    });

    socket.on('live:hand_raise', (data) => {
      const { sessionId, raised, user } = data || {};
      if (!sessionId) return;

      io.to(`live:${sessionId}`).emit('live:user_hand_raised', {
        sessionId,
        userId: socket.userId || user?.id,
        username: socket.username || user?.username,
        name: user?.name || socket.username || 'User',
        avatar: user?.avatar_url || user?.avatar || null,
        raised: Boolean(raised),
      });
    });

    socket.on('live:promote_speaker', (data) => {
      const { sessionId, userId } = data || {};
      if (!sessionId || !userId) return;

      io.to(`live:${sessionId}`).emit('live:speaker_promoted', {
        sessionId: parseInt(sessionId, 10) || sessionId,
        userId: parseInt(userId, 10) || userId,
      });
    });

    socket.on('live:demote_speaker', (data) => {
      const { sessionId, userId } = data || {};
      if (!sessionId || !userId) return;

      io.to(`live:${sessionId}`).emit('live:speaker_demoted', {
        sessionId: parseInt(sessionId, 10) || sessionId,
        userId: parseInt(userId, 10) || userId,
      });
    });

    socket.on('live:signal', (data) => {
      const { sessionId, toSocketId, signal } = data || {};
      if (toSocketId) {
        io.to(toSocketId).emit('live:signal', {
          sessionId,
          fromSocketId: socket.id,
          fromUserId: socket.userId,
          signal,
        });
      }
    });

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.username}`);

      // Clean up online presence
      if (onlineUsers.has(socket.userId)) {
        onlineUsers.get(socket.userId).delete(socket.id);
        if (onlineUsers.get(socket.userId).size === 0) {
          onlineUsers.delete(socket.userId);
          io.emit('user:presence', { userId: socket.userId, status: 'offline' });
        }
      }

      // Clean up from live broadcast sessions
      for (const [sessionId, viewersMap] of liveBroadcastViewers.entries()) {
        for (const [uid, v] of viewersMap.entries()) {
          if (v.socketId === socket.id || uid === String(socket.userId)) {
            viewersMap.delete(uid);
            const count = Math.max(1, viewersMap.size);
            io.to(`live:${sessionId}`).emit('live:viewer_left', {
              sessionId,
              userId: uid,
              count,
            });
            io.to(`live:${sessionId}`).emit('live:viewer_count', {
              sessionId,
              count,
            });
          }
        }
        if (viewersMap.size === 0) {
          liveBroadcastViewers.delete(sessionId);
        }
      }

      // Clean up from all voice rooms
      for (const [roomKey, room] of voiceRooms.entries()) {
        if (room.participants.has(socket.userId)) {
          room.participants.delete(socket.userId);
          if (room.participants.size === 0) {
            voiceRooms.delete(roomKey);
          } else if (room.hostId === socket.userId) {
            const nextHost = Array.from(room.participants.values())[0];
            if (nextHost) {
              room.hostId = nextHost.userId;
              nextHost.isHost = true;
            }
          }
          broadcastVoiceState(roomKey, io);
        }
      }
    });
  });
}

// In-memory active live broadcast viewers: sessionId -> Map(userId -> userInfo)
const liveBroadcastViewers = new Map();

// In-memory active online users: userId -> Set(socketId)
const onlineUsers = new Map();

// In-memory active voice rooms
const voiceRooms = new Map();

function broadcastVoiceState(roomKey, io) {
  const room = voiceRooms.get(roomKey);
  if (!room) {
    io.to(`voice:${roomKey}`).emit('voice:state_update', {
      roomKey,
      isActive: false,
      participants: [],
    });
    return;
  }

  const participantsList = Array.from(room.participants.values()).map(p => ({
    userId: p.userId,
    username: p.username,
    name: p.name,
    alias: p.alias,
    avatar: p.avatar,
    isMuted: p.isMuted,
    isRaised: p.isRaised,
    isSpeaking: p.isSpeaking,
    isHost: p.isHost,
    socketId: p.socketId,
  }));

  io.to(`voice:${roomKey}`).emit('voice:state_update', {
    roomKey,
    isActive: true,
    roomTitle: room.roomTitle,
    hostId: room.hostId,
    projectId: room.projectId,
    channelId: room.channelId,
    participants: participantsList,
  });
}

module.exports = { initializeSocket, getIO };
