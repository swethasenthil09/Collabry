const jwt = require('jsonwebtoken');
require('dotenv').config();
const pool = require('../config/db');

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'No token provided' } });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.user = { id: decoded.userId, username: decoded.username, alias: decoded.alias };

    // Fetch up-to-date moderation status from database
    const [rows] = await pool.query(
      'SELECT role, status, frozen_until, freeze_reason, report_count FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (rows.length > 0) {
      let u = rows[0];
      // Automatically unfreeze if 7 days penalty has passed and user is not permanently blocked
      if (u.status === 'frozen' && u.frozen_until && new Date() >= new Date(u.frozen_until)) {
        await pool.query(
          'UPDATE users SET status = "active", frozen_until = NULL, freeze_reason = NULL WHERE id = ?',
          [decoded.userId]
        );
        u.status = 'active';
        u.frozen_until = null;
        u.freeze_reason = null;
      }

      req.user.role = u.role || 'user';
      req.user.status = u.status || 'active';
      req.user.frozen_until = u.frozen_until;
      req.user.freeze_reason = u.freeze_reason;
      req.user.report_count = u.report_count || 0;
    } else {
      req.user.role = 'user';
      req.user.status = 'active';
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: { code: 'TOKEN_EXPIRED', message: 'Invalid or expired token' } });
  }
};

const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return next();
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    req.user = { id: decoded.userId, username: decoded.username, alias: decoded.alias };
    const [rows] = await pool.query(
      'SELECT role, status, frozen_until, freeze_reason, report_count FROM users WHERE id = ?',
      [decoded.userId]
    );
    if (rows.length > 0) {
      let u = rows[0];
      if (u.status === 'frozen' && u.frozen_until && new Date() >= new Date(u.frozen_until)) {
        await pool.query(
          'UPDATE users SET status = "active", frozen_until = NULL, freeze_reason = NULL WHERE id = ?',
          [decoded.userId]
        );
        u.status = 'active';
        u.frozen_until = null;
        u.freeze_reason = null;
      }
      req.user.role = u.role || 'user';
      req.user.status = u.status || 'active';
      req.user.frozen_until = u.frozen_until;
      req.user.freeze_reason = u.freeze_reason;
      req.user.report_count = u.report_count || 0;
    }
  } catch {
    req.user = null;
  }
  next();
};

/**
 * requireActiveUser: Prevents frozen or blocked users from performing write actions.
 */
const requireActiveUser = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
  }

  if (req.user.status === 'blocked') {
    return res.status(403).json({
      error: {
        code: 'ACCOUNT_BLOCKED',
        message: 'Your account has been permanently blocked due to receiving 3 or more violation reports.',
      }
    });
  }

  if (req.user.status === 'frozen') {
    return res.status(403).json({
      error: {
        code: 'ACCOUNT_FROZEN',
        message: `Your account is temporarily frozen until ${new Date(req.user.frozen_until).toLocaleDateString()}. Reason: ${req.user.freeze_reason || 'Reported by community'}. You can submit an appeal request to the system admin.`,
        frozen_until: req.user.frozen_until,
        freeze_reason: req.user.freeze_reason,
      }
    });
  }

  next();
};

/**
 * requireSystemAdmin: Restricts system admin portal to users with role = 'admin'.
 */
const requireSystemAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'System administrator privileges required to access this resource.',
      }
    });
  }
  next();
};

/**
 * requireProjectRole: verifies member has one of the allowed workspace roles.
 * Allowed roles: 'owner', 'maintainer', 'contributor', 'viewer'
 * Aliases: 'admin' maps to maintainer/owner, 'member' maps to contributor/maintainer/owner.
 */
const requireProjectRole = (allowedRoles = ['owner', 'maintainer', 'contributor', 'admin', 'member']) => {
  return async (req, res, next) => {
    try {
      const projectId = req.params.projectId || req.params.id;
      if (!projectId) return next();

      const [membership] = await pool.query(
        'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
        [projectId, req.user.id]
      );

      const [project] = await pool.query(
        'SELECT creator_id FROM projects WHERE id = ?',
        [projectId]
      );

      const isCreator = project.length > 0 && project[0].creator_id === req.user.id;
      const userRole = isCreator ? 'owner' : (membership[0]?.role || null);

      if (!userRole) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'You are not a member of this workspace' } });
      }

      req.projectRole = userRole;

      const hasAccess = allowedRoles.some(allowed => {
        if (allowed === userRole) return true;
        if ((allowed === 'maintainer' || allowed === 'admin') && (userRole === 'owner' || userRole === 'maintainer' || userRole === 'admin')) return true;
        if ((allowed === 'contributor' || allowed === 'member') && (userRole === 'owner' || userRole === 'maintainer' || userRole === 'admin' || userRole === 'contributor' || userRole === 'member')) return true;
        if (allowed === 'viewer') return true;
        return false;
      });

      if (!hasAccess) {
        return res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: `Permission denied: action requires one of [${allowedRoles.join(', ')}] role (your role: ${userRole})`
          }
        });
      }

      next();
    } catch (err) {
      console.error('requireProjectRole error:', err);
      res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Authorization check failed' } });
    }
  };
};

module.exports = { authenticate, optionalAuth, requireProjectRole, requireActiveUser, requireSystemAdmin };
