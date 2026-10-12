/**
 * toPublicAuthor — single serializer that prevents identity leaks.
 * Every post, comment, and interest response must use this function.
 * Returns either { alias } or { username, name } based on identity_mode.
 */
function toPublicAuthor(row, requestingUserId) {
  const isMine = row.author_id === requestingUserId;

  if (row.identity_mode === 'alias') {
    return {
      display_name: row.alias || row.author_alias || 'Anonymous',
      is_alias: true,
      is_mine: isMine,
    };
  }

  return {
    id: row.author_id || row.id || row.user_id,
    display_name: row.name || row.author_name || row.username || row.author_username,
    username: row.username || row.author_username,
    avatar_url: row.avatar_url || row.author_avatar || null,
    is_alias: false,
    is_mine: isMine,
  };
}

/**
 * Generate a random alias like "QuietFalcon42"
 */
function generateAlias() {
  const adjectives = [
    'Quick','Bright','Silent','Bold','Calm','Swift','Keen','Brave','Wise','Witty',
    'Vivid','Noble','Fierce','Gentle','Clever','Sharp','Steady','Lucky','Cool','Warm',
    'Dark','Light','Cosmic','Mystic','Neon','Pixel','Quantum','Cyber','Lunar','Solar',
  ];
  const nouns = [
    'Falcon','Phoenix','Otter','Panda','Tiger','Wolf','Eagle','Hawk','Fox','Bear',
    'Coder','Hacker','Builder','Maker','Ninja','Knight','Sage','Wizard','Pilot','Scout',
    'Nebula','Comet','Orbit','Prism','Spark','Byte','Node','Stack','Flux','Wave',
  ];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj}${noun}${num}`;
}

function timeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

const pool = require('../config/db');

/**
 * Log a workspace activity event and broadcast it in real-time over Socket.IO
 */
async function logProjectActivity(projectId, userId, action, details = {}, ioInstance = null) {
  try {
    const [res] = await pool.query(
      'INSERT INTO activity_logs (project_id, user_id, action, details) VALUES (?, ?, ?, ?)',
      [projectId, userId, action, JSON.stringify(details)]
    );

    const [users] = await pool.query(
      'SELECT id, username, name, avatar_url FROM users WHERE id = ?',
      [userId]
    );
    const actor = users[0] || { id: userId, username: 'user' };

    const activityEvent = {
      id: res.insertId,
      project_id: projectId,
      user_id: userId,
      action,
      details,
      created_at: new Date().toISOString(),
      user: {
        id: actor.id,
        username: actor.username,
        name: actor.name || actor.username,
        avatar_url: actor.avatar_url,
      },
    };

    let io = ioInstance;
    if (!io) {
      try {
        io = require('../sockets/chat').getIO();
      } catch (e) {}
    }

    if (io) {
      io.to(`project:${projectId}`).emit('project:activity', activityEvent);
    }

    return activityEvent;
  } catch (err) {
    console.warn('logProjectActivity note:', err.message);
    return null;
  }
}

module.exports = { toPublicAuthor, generateAlias, timeAgo, logProjectActivity };
