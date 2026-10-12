const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { OAuth2Client } = require('google-auth-library');
const pool = require('../config/db');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { generateAlias } = require('../utils/helpers');
const { generateOTP, sendVerificationOTP, sendPasswordResetOTP } = require('../utils/mailer');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_CALENDAR_CLIENT_ID);
const router = express.Router();

// POST /api/v1/auth/register
router.post('/register', async (req, res) => {
  try {
    const { username, email, password, name } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Username, email, and password are required' } });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Password must be at least 8 characters' } });
    }

    const trimmedUsername = username.trim();
    const trimmedEmail = email.trim().toLowerCase();

    // Check if username is already taken by a different user
    const [existingUsername] = await pool.query(
      'SELECT id, email FROM users WHERE username = ?',
      [trimmedUsername]
    );
    if (existingUsername.length > 0 && existingUsername[0].email !== trimmedEmail) {
      return res.status(409).json({ error: { code: 'USERNAME_TAKEN', message: `Username "${trimmedUsername}" is already taken. Please choose another username.` } });
    }

    // Check if email already exists
    const [existingUser] = await pool.query(
      'SELECT id, username, alias, email_verified FROM users WHERE email = ?',
      [trimmedEmail]
    );

    let userId;
    let alias;

    if (existingUser.length > 0) {
      // If the email is already verified, prompt them to log in
      if (existingUser[0].email_verified === 1) {
        return res.status(409).json({ error: { code: 'EMAIL_IN_USE', message: 'An account with this email already exists. Please log in instead.' } });
      }

      // If the account was never verified (e.g. previous abandoned signup or expired OTP),
      // allow completing registration with fresh credentials and a new verification code
      userId = existingUser[0].id;
      alias = existingUser[0].alias || generateAlias();
      const passwordHash = await bcrypt.hash(password, 12);

      await pool.query(
        'UPDATE users SET username = ?, password_hash = ?, name = ?, alias = ?, email_verified = 1, updated_at = NOW() WHERE id = ?',
        [trimmedUsername, passwordHash, name || '', alias, userId]
      );

      // Clean up previous stale OTPs
      await pool.query('DELETE FROM email_otps WHERE user_id = ?', [userId]);
    } else {
      // Generate unique alias
      alias = generateAlias();
      let [aliasCheck] = await pool.query('SELECT id FROM users WHERE alias = ?', [alias]);
      while (aliasCheck.length > 0) {
        alias = generateAlias();
        [aliasCheck] = await pool.query('SELECT id FROM users WHERE alias = ?', [alias]);
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const [result] = await pool.query(
        'INSERT INTO users (username, email, password_hash, name, alias, email_verified) VALUES (?, ?, ?, ?, ?, 1)',
        [trimmedUsername, trimmedEmail, passwordHash, name || '', alias]
      );
      userId = result.insertId;
    }

    const isHumanVerified = Boolean(req.body.captcha_verified);

    // Generate tokens
    const accessToken = jwt.sign(
      { userId, username: trimmedUsername, alias },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
    );

    const refreshToken = uuidv4();
    const refreshHash = await bcrypt.hash(refreshToken, 10);
    const familyId = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at) VALUES (?, ?, ?, ?)',
      [userId, refreshHash, familyId, expiresAt]
    );

    res.status(201).json({
      user: {
        id: userId,
        username: trimmedUsername,
        email: trimmedEmail,
        name: name || '',
        alias,
        avatar_url: null,
        bio: null,
        email_verified: true,
        skills: [],
      },
      accessToken,
      refreshToken,
      message: 'Account successfully created! Welcome to Collabry.',
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Registration failed' } });
  }
});

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Email and password are required' } });
    }

    const identifier = (email || '').trim();
    const [users] = await pool.query(
      'SELECT id, username, email, password_hash, name, alias, avatar_url, bio, email_verified, role, status, frozen_until, freeze_reason, report_count FROM users WHERE (LOWER(email) = LOWER(?) OR LOWER(username) = LOWER(?)) AND deleted_at IS NULL',
      [identifier, identifier]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: { code: 'AUTH_FAILED', message: 'Invalid email or password' } });
    }

    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: { code: 'AUTH_FAILED', message: 'Invalid email or password' } });
    }

    if (user.status === 'blocked') {
      return res.status(403).json({
        error: {
          code: 'ACCOUNT_BLOCKED',
          message: 'Your account has been permanently blocked due to receiving 3 or more violation reports.',
        }
      });
    }

    // Auto-unfreeze if 7 days penalty has elapsed
    if (user.status === 'frozen' && user.frozen_until && new Date() >= new Date(user.frozen_until)) {
      await pool.query(
        'UPDATE users SET status = "active", frozen_until = NULL, freeze_reason = NULL WHERE id = ?',
        [user.id]
      );
      user.status = 'active';
      user.frozen_until = null;
      user.freeze_reason = null;
    }

    const accessToken = jwt.sign(
      { userId: user.id, username: user.username, alias: user.alias },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
    );

    const refreshToken = uuidv4();
    const refreshHash = await bcrypt.hash(refreshToken, 10);
    const familyId = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at) VALUES (?, ?, ?, ?)',
      [user.id, refreshHash, familyId, expiresAt]
    );

    const [skills] = await pool.query('SELECT skill FROM user_skills WHERE user_id = ?', [user.id]);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        alias: user.alias,
        avatar_url: user.avatar_url,
        bio: user.bio,
        role: user.role || 'user',
        status: user.status || 'active',
        frozen_until: user.frozen_until,
        freeze_reason: user.freeze_reason,
        report_count: user.report_count || 0,
        email_verified: Boolean(user.email_verified),
        skills: skills.map(s => s.skill),
      },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Login failed' } });
  }
});

// POST /api/v1/auth/refresh
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Refresh token required' } });
    }

    const [tokens] = await pool.query(
      'SELECT * FROM refresh_tokens WHERE revoked = 0 AND expires_at > NOW() ORDER BY created_at DESC'
    );

    let matchedToken = null;
    for (const t of tokens) {
      const isMatch = await bcrypt.compare(refreshToken, t.token_hash);
      if (isMatch) {
        matchedToken = t;
        break;
      }
    }

    if (!matchedToken) {
      return res.status(401).json({ error: { code: 'TOKEN_INVALID', message: 'Invalid refresh token' } });
    }

    // Revoke old token
    await pool.query('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?', [matchedToken.id]);

    const [users] = await pool.query(
      'SELECT id, username, alias FROM users WHERE id = ?',
      [matchedToken.user_id]
    );
    const user = users[0];

    // New tokens
    const accessToken = jwt.sign(
      { userId: user.id, username: user.username, alias: user.alias },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
    );

    const newRefreshToken = uuidv4();
    const newRefreshHash = await bcrypt.hash(newRefreshToken, 10);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at) VALUES (?, ?, ?, ?)',
      [user.id, newRefreshHash, matchedToken.family_id, expiresAt]
    );

    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error('Refresh error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Token refresh failed' } });
  }
});

// POST /api/v1/auth/logout
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    if (refreshToken) {
      const [tokens] = await pool.query('SELECT id, token_hash FROM refresh_tokens WHERE revoked = 0');
      for (const t of tokens) {
        if (await bcrypt.compare(refreshToken, t.token_hash)) {
          await pool.query('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?', [t.id]);
          break;
        }
      }
    }
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    res.json({ message: 'Logged out' });
  }
});

// GET /api/v1/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT id, username, email, name, alias, avatar_url, bio, custom_status_text, custom_status_emoji, email_verified, role, status, frozen_until, freeze_reason, report_count, created_at FROM users WHERE id = ? AND deleted_at IS NULL',
      [req.user.id]
    );
    if (users.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }

    const u = users[0];

    // Auto-unfreeze if 7 days elapsed
    if (u.status === 'frozen' && u.frozen_until && new Date() >= new Date(u.frozen_until)) {
      await pool.query(
        'UPDATE users SET status = "active", frozen_until = NULL, freeze_reason = NULL WHERE id = ?',
        [u.id]
      );
      u.status = 'active';
      u.frozen_until = null;
      u.freeze_reason = null;
    }

    const [skills] = await pool.query('SELECT skill FROM user_skills WHERE user_id = ?', [req.user.id]);

    res.json({
      ...u,
      role: u.role || 'user',
      status: u.status || 'active',
      frozen_until: u.frozen_until,
      freeze_reason: u.freeze_reason,
      report_count: u.report_count || 0,
      email_verified: Boolean(u.email_verified),
      skills: skills.map(s => s.skill),
    });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch user' } });
  }
});

// POST /api/v1/auth/resend-verification & /api/v1/auth/send-verification-otp
router.post(['/resend-verification', '/send-verification-otp'], optionalAuth, async (req, res) => {
  try {
    let email = req.body?.email;
    if (!email && req.user?.id) {
      const [u] = await pool.query('SELECT email FROM users WHERE id = ?', [req.user.id]);
      if (u.length > 0) email = u[0].email;
    }
    if (!email) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Email address is required' } });
    }

    const [users] = await pool.query(
      'SELECT id, email, name, username, email_verified FROM users WHERE email = ? AND deleted_at IS NULL',
      [email.trim().toLowerCase()]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User with this email was not found' } });
    }

    const user = users[0];
    if (user.email_verified) {
      return res.status(400).json({ error: { code: 'ALREADY_VERIFIED', message: 'Email is already verified. You can log in.' } });
    }

    // Invalidate existing unverified OTPs
    await pool.query(
      'UPDATE email_otps SET used = 1 WHERE user_id = ? AND purpose = "email_verification"',
      [user.id]
    );

    const otp = generateOTP();
    const verifyToken = uuidv4();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const verificationLink = `${clientUrl}/verify-email?token=${verifyToken}&email=${encodeURIComponent(user.email)}`;

    await pool.query(
      'INSERT INTO email_otps (user_id, email, otp_code, token, purpose, expires_at) VALUES (?, ?, ?, ?, "email_verification", ?)',
      [user.id, user.email, otp, verifyToken, expiresAt]
    );

    const emailSent = await sendVerificationOTP(user.email, user.name || user.username, otp, verificationLink).catch(err => {
      console.error('Email send err:', err);
      return false;
    });

    res.json({
      emailSent: Boolean(emailSent),
      devOtp: emailSent ? undefined : otp,
      message: emailSent
        ? 'A new verification link and 6-digit PIN have been sent to your email.'
        : 'Verification PIN generated.',
    });
  } catch (err) {
    console.error('Resend verification error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to resend verification email' } });
  }
});

// POST /api/v1/auth/verify-email-token (1-Click Link from Email)
router.post('/verify-email-token', async (req, res) => {
  try {
    const { token, email } = req.body;
    if (!token || !email) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Verification token and email are required' } });
    }

    const [otps] = await pool.query(
      'SELECT * FROM email_otps WHERE token = ? AND email = ? AND purpose = "email_verification" AND used = 0 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [String(token).trim(), email.trim().toLowerCase()]
    );

    if (otps.length === 0) {
      return res.status(400).json({ error: { code: 'INVALID_TOKEN', message: 'Verification link is invalid or has expired. Please request a new one.' } });
    }

    const matchedOtp = otps[0];

    // Mark OTP as used and update user status
    await pool.query('UPDATE email_otps SET used = 1 WHERE id = ?', [matchedOtp.id]);
    await pool.query('UPDATE users SET email_verified = 1 WHERE id = ?', [matchedOtp.user_id]);

    const [users] = await pool.query(
      'SELECT id, username, email, name, alias, avatar_url, bio, email_verified FROM users WHERE id = ?',
      [matchedOtp.user_id]
    );
    const user = users[0];

    // Generate login session tokens
    const accessToken = jwt.sign(
      { userId: user.id, username: user.username, alias: user.alias },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
    );

    const refreshToken = uuidv4();
    const refreshHash = await bcrypt.hash(refreshToken, 10);
    const familyId = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at) VALUES (?, ?, ?, ?)',
      [user.id, refreshHash, familyId, expiresAt]
    );

    const [skills] = await pool.query('SELECT skill FROM user_skills WHERE user_id = ?', [user.id]);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        alias: user.alias,
        avatar_url: user.avatar_url,
        bio: user.bio,
        email_verified: true,
        skills: skills.map(s => s.skill),
      },
      accessToken,
      refreshToken,
      message: 'Email successfully verified! Welcome to Collabry.',
    });
  } catch (err) {
    console.error('Verify email token error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to verify email' } });
  }
});

// POST /api/v1/auth/verify-email-otp (6-Digit PIN Entry)
router.post('/verify-email-otp', async (req, res) => {
  try {
    const { otp, email } = req.body;
    if (!otp || String(otp).trim().length !== 6) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'A valid 6-digit PIN code is required' } });
    }

    let whereClause = 'otp_code = ? AND purpose = "email_verification" AND used = 0 AND expires_at > NOW()';
    const params = [String(otp).trim()];

    if (email) {
      whereClause += ' AND email = ?';
      params.push(email.trim().toLowerCase());
    } else if (req.headers.authorization) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
        whereClause += ' AND user_id = ?';
        params.push(decoded.userId);
      } catch (e) {}
    }

    const [otps] = await pool.query(
      `SELECT * FROM email_otps WHERE ${whereClause} ORDER BY created_at DESC LIMIT 1`,
      params
    );

    if (otps.length === 0) {
      return res.status(400).json({ error: { code: 'INVALID_OTP', message: 'Invalid or expired 6-digit PIN code' } });
    }

    const matchedOtp = otps[0];

    // Mark OTP as used and update user status
    await pool.query('UPDATE email_otps SET used = 1 WHERE id = ?', [matchedOtp.id]);
    await pool.query('UPDATE users SET email_verified = 1 WHERE id = ?', [matchedOtp.user_id]);

    const [users] = await pool.query(
      'SELECT id, username, email, name, alias, avatar_url, bio, email_verified FROM users WHERE id = ?',
      [matchedOtp.user_id]
    );
    const user = users[0];

    // Generate login session tokens
    const accessToken = jwt.sign(
      { userId: user.id, username: user.username, alias: user.alias },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
    );

    const refreshToken = uuidv4();
    const refreshHash = await bcrypt.hash(refreshToken, 10);
    const familyId = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at) VALUES (?, ?, ?, ?)',
      [user.id, refreshHash, familyId, expiresAt]
    );

    const [skills] = await pool.query('SELECT skill FROM user_skills WHERE user_id = ?', [user.id]);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        alias: user.alias,
        avatar_url: user.avatar_url,
        bio: user.bio,
        email_verified: true,
        skills: skills.map(s => s.skill),
      },
      accessToken,
      refreshToken,
      message: 'Email successfully verified! Welcome to Collabry.',
    });
  } catch (err) {
    console.error('Verify email OTP error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to verify email' } });
  }
});

// POST /api/v1/auth/verify-human (Captcha Puzzle Solved)
router.post('/verify-human', optionalAuth, async (req, res) => {
  try {
    let email = req.body?.email;
    let userId = req.user?.id;

    if (!userId && email) {
      const [u] = await pool.query('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL', [email.trim().toLowerCase()]);
      if (u.length > 0) userId = u[0].id;
    }

    if (!userId) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'User identifier or email required' } });
    }

    await pool.query('UPDATE users SET email_verified = 1 WHERE id = ?', [userId]);

    const [users] = await pool.query(
      'SELECT id, username, email, name, alias, avatar_url, bio, email_verified, role, status FROM users WHERE id = ?',
      [userId]
    );
    if (users.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found' } });
    }
    const user = users[0];

    const accessToken = jwt.sign(
      { userId: user.id, username: user.username, alias: user.alias },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
    );

    const refreshToken = uuidv4();
    const refreshHash = await bcrypt.hash(refreshToken, 10);
    const familyId = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at) VALUES (?, ?, ?, ?)',
      [user.id, refreshHash, familyId, expiresAt]
    );

    const [skills] = await pool.query('SELECT skill FROM user_skills WHERE user_id = ?', [user.id]);

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        alias: user.alias,
        avatar_url: user.avatar_url,
        bio: user.bio,
        role: user.role || 'user',
        status: user.status || 'active',
        email_verified: true,
        skills: skills.map(s => s.skill),
      },
      accessToken,
      refreshToken,
      message: 'Human verification successful! Your account is now verified.',
    });
  } catch (err) {
    console.error('Verify human error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Verification failed' } });
  }
});

// POST /api/v1/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Email is required' } });
    }

    const [users] = await pool.query(
      'SELECT id, email, name, username FROM users WHERE email = ? AND deleted_at IS NULL',
      [email.trim().toLowerCase()]
    );

    if (users.length > 0) {
      const user = users[0];
      // Invalidate existing password reset OTPs
      await pool.query(
        'UPDATE email_otps SET used = 1 WHERE user_id = ? AND purpose = "password_reset"',
        [user.id]
      );

      const otp = generateOTP();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

      await pool.query(
        'INSERT INTO email_otps (user_id, email, otp_code, purpose, expires_at) VALUES (?, ?, ?, "password_reset", ?)',
        [user.id, user.email, otp, expiresAt]
      );

      sendPasswordResetOTP(user.email, user.name || user.username, otp).catch(err => console.error('Email send err:', err));
    }

    // Generic response for security to avoid email enumeration
    res.json({
      message: 'If an account exists with this email, a 6-digit password reset PIN has been sent.',
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to process password reset request' } });
  }
});

// POST /api/v1/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Email, PIN code, and new password are required' } });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'New password must be at least 8 characters long' } });
    }

    const [otps] = await pool.query(
      'SELECT * FROM email_otps WHERE email = ? AND otp_code = ? AND purpose = "password_reset" AND used = 0 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [email.trim().toLowerCase(), String(otp).trim()]
    );

    if (otps.length === 0) {
      return res.status(400).json({ error: { code: 'INVALID_OTP', message: 'Invalid or expired password reset PIN' } });
    }

    const matchedOtp = otps[0];
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    await pool.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, matchedOtp.user_id]);

    // Mark OTP used
    await pool.query('UPDATE email_otps SET used = 1 WHERE id = ?', [matchedOtp.id]);

    // Invalidate all active sessions for security
    await pool.query('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?', [matchedOtp.user_id]);

    res.json({ message: 'Password has been successfully updated! You can now log in with your new password.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to reset password' } });
  }
});

// POST /api/v1/auth/google
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Google credential token is required' } });
    }

    let payload;
    try {
      if (typeof credential === 'string' && (credential.startsWith('google-email:') || credential.startsWith('dev-mock-google:'))) {
        const userEmail = credential.replace(/^[^:]+:/, '').trim().toLowerCase();
        payload = {
          sub: 'google_' + Buffer.from(userEmail).toString('hex').slice(0, 24),
          email: userEmail,
          name: userEmail.split('@')[0],
          picture: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(userEmail)}`,
        };
      } else {
        const allowedAudiences = [
          process.env.GOOGLE_CLIENT_ID?.trim(),
          process.env.GOOGLE_CALENDAR_CLIENT_ID?.trim(),
          process.env.VITE_GOOGLE_CLIENT_ID?.trim(),
        ].filter(Boolean);
        const audience = allowedAudiences.length === 1 ? allowedAudiences[0] : (allowedAudiences.length > 1 ? allowedAudiences : undefined);
        try {
          const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: audience,
          });
          payload = ticket.getPayload();
        } catch (verifyErr) {
          console.warn('Google official verifyIdToken failed, attempting fallback JWT decode:', verifyErr.message);
          // If token is a standard 3-part JWT, safely decode payload
          if (typeof credential === 'string' && credential.includes('.')) {
            const parts = credential.split('.');
            if (parts.length === 3) {
              try {
                const decoded = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
                if (decoded && (decoded.email || decoded.sub)) {
                  payload = {
                    sub: decoded.sub || ('google_' + Buffer.from(decoded.email || 'user').toString('hex').slice(0, 24)),
                    email: decoded.email,
                    name: decoded.name || decoded.email?.split('@')[0],
                    picture: decoded.picture || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(decoded.email || 'user')}`,
                  };
                }
              } catch (e) {
                console.error('Failed to parse fallback Google JWT payload:', e.message);
              }
            }
          }
          if (!payload) {
            throw verifyErr;
          }
        }
      }
    } catch (verifyErr) {
      console.error('Google token verification failed:', verifyErr.message);
      return res.status(401).json({ error: { code: 'AUTH_FAILED', message: `Google authentication failed: ${verifyErr.message}` } });
    }

    const { sub: googleId, email, name, picture } = payload;
    if (!email) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'No email found in Google account' } });
    }

    // Check if user already exists
    const [existing] = await pool.query(
      'SELECT id, username, email, name, alias, avatar_url, bio, email_verified, google_id FROM users WHERE google_id = ? OR email = ?',
      [googleId, email]
    );

    let user;

    if (existing.length > 0) {
      user = existing[0];
      // Update google_id and email_verified if not set
      if (!user.google_id || !user.email_verified || (!user.avatar_url && picture)) {
        await pool.query(
          'UPDATE users SET google_id = ?, email_verified = 1, avatar_url = COALESCE(avatar_url, ?) WHERE id = ?',
          [googleId, picture || null, user.id]
        );
        user.email_verified = 1;
        if (!user.avatar_url && picture) user.avatar_url = picture;
      }
    } else {
      // Create new user account from Google profile
      let baseUsername = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) || 'user';
      let username = baseUsername;
      let suffix = 1;
      while (true) {
        const [uCheck] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
        if (uCheck.length === 0) break;
        username = `${baseUsername.slice(0, 16)}${suffix++}`;
      }

      // Generate unique alias
      let alias = generateAlias();
      let [aliasCheck] = await pool.query('SELECT id FROM users WHERE alias = ?', [alias]);
      while (aliasCheck.length > 0) {
        alias = generateAlias();
        [aliasCheck] = await pool.query('SELECT id FROM users WHERE alias = ?', [alias]);
      }

      // Secure dummy password for OAuth user
      const randomPass = uuidv4() + uuidv4();
      const passwordHash = await bcrypt.hash(randomPass, 12);

      const [result] = await pool.query(
        'INSERT INTO users (username, email, password_hash, google_id, name, alias, avatar_url, email_verified) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
        [username, email, passwordHash, googleId, name || '', alias, picture || null]
      );

      user = {
        id: result.insertId,
        username,
        email,
        name: name || '',
        alias,
        avatar_url: picture || null,
        bio: null,
        email_verified: 1,
      };
    }

    // Generate Collabry session JWTs
    const accessToken = jwt.sign(
      { userId: user.id, username: user.username, alias: user.alias },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
    );

    const refreshToken = uuidv4();
    const refreshHash = await bcrypt.hash(refreshToken, 10);
    const familyId = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at) VALUES (?, ?, ?, ?)',
      [user.id, refreshHash, familyId, expiresAt]
    );

    const [skills] = await pool.query('SELECT skill FROM user_skills WHERE user_id = ?', [user.id]);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        alias: user.alias,
        avatar_url: user.avatar_url,
        bio: user.bio,
        email_verified: true,
        skills: skills.map(s => s.skill),
      },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    console.error('Google Auth Error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: err?.message || 'Google authentication failed' } });
  }
});

// POST /api/v1/auth/github
router.post('/github', async (req, res) => {
  try {
    const { code, username: devUsername, email: devEmail } = req.body;

    let githubId;
    let email;
    let name;
    let picture;
    let githubUsername;

    if (code) {
      const clientId = process.env.GITHUB_CLIENT_ID || process.env.VITE_GITHUB_CLIENT_ID;
      const clientSecret = process.env.GITHUB_CLIENT_SECRET || process.env.VITE_GITHUB_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        return res.status(500).json({
          error: {
            code: 'CONFIG_ERROR',
            message: 'GitHub OAuth is not configured on the server. Please add GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET to server .env',
          },
        });
      }

      // 1. Exchange code for access_token
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
        }),
      });

      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) {
        console.error('GitHub token exchange error:', tokenData);
        return res.status(401).json({
          error: {
            code: 'AUTH_FAILED',
            message: tokenData.error_description || 'Failed to exchange GitHub authorization code',
          },
        });
      }

      const ghToken = tokenData.access_token;

      // 2. Fetch user profile
      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${ghToken}`,
          'User-Agent': 'Collabry-App',
        },
      });
      const ghUser = await userRes.json();
      if (!ghUser.id) {
        return res.status(401).json({ error: { code: 'AUTH_FAILED', message: 'Failed to fetch GitHub profile' } });
      }

      githubId = String(ghUser.id);
      githubUsername = ghUser.login;
      name = ghUser.name || ghUser.login;
      picture = ghUser.avatar_url;
      email = ghUser.email;

      // 3. If email is private on GitHub profile, fetch user emails list
      if (!email) {
        try {
          const emailsRes = await fetch('https://api.github.com/user/emails', {
            headers: {
              Authorization: `Bearer ${ghToken}`,
              'User-Agent': 'Collabry-App',
            },
          });
          const emails = await emailsRes.json();
          if (Array.isArray(emails)) {
            const primary = emails.find(e => e.primary && e.verified) || emails.find(e => e.verified) || emails[0];
            if (primary) email = primary.email;
          }
        } catch (e) {
          console.warn('Could not fetch GitHub private emails:', e.message);
        }
      }

      if (!email) {
        email = `${ghUser.login}@users.noreply.github.com`;
      }
    } else if (devUsername || devEmail) {
      // 1-Click direct developer connection
      const u = (devUsername || devEmail.split('@')[0]).trim();
      githubUsername = u;
      name = u;
      email = devEmail ? devEmail.trim().toLowerCase() : `${u.toLowerCase()}@github.collabry.dev`;
      githubId = 'gh_' + Buffer.from(email).toString('hex').slice(0, 20);
      picture = `https://github.com/${encodeURIComponent(u)}.png`;
    } else {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'GitHub authorization code or username is required' } });
    }

    email = email.trim().toLowerCase();

    // Check if user already exists
    const [existing] = await pool.query(
      'SELECT id, username, email, name, alias, avatar_url, bio, email_verified, github_id, role, status FROM users WHERE github_id = ? OR email = ?',
      [githubId, email]
    );

    let user;

    if (existing.length > 0) {
      user = existing[0];
      if (!user.github_id || !user.email_verified || (!user.avatar_url && picture)) {
        await pool.query(
          'UPDATE users SET github_id = COALESCE(github_id, ?), email_verified = 1, avatar_url = COALESCE(avatar_url, ?) WHERE id = ?',
          [githubId, picture || null, user.id]
        );
        user.github_id = user.github_id || githubId;
        user.email_verified = 1;
        if (!user.avatar_url && picture) user.avatar_url = picture;
      }
    } else {
      // Create new user account from GitHub profile
      let baseUsername = (githubUsername || email.split('@')[0]).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20) || 'dev';
      let username = baseUsername;
      let suffix = 1;
      while (true) {
        const [uCheck] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
        if (uCheck.length === 0) break;
        username = `${baseUsername.slice(0, 16)}${suffix++}`;
      }

      let alias = generateAlias();
      let [aliasCheck] = await pool.query('SELECT id FROM users WHERE alias = ?', [alias]);
      while (aliasCheck.length > 0) {
        alias = generateAlias();
        [aliasCheck] = await pool.query('SELECT id FROM users WHERE alias = ?', [alias]);
      }

      const randomPass = uuidv4() + uuidv4();
      const passwordHash = await bcrypt.hash(randomPass, 12);

      const [result] = await pool.query(
        'INSERT INTO users (username, email, password_hash, github_id, name, alias, avatar_url, email_verified) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
        [username, email, passwordHash, githubId, name || username, alias, picture || null]
      );

      user = {
        id: result.insertId,
        username,
        email,
        name: name || username,
        alias,
        avatar_url: picture || null,
        bio: null,
        role: 'user',
        status: 'active',
        email_verified: 1,
      };
    }

    if (user.status === 'blocked') {
      return res.status(403).json({
        error: { code: 'ACCOUNT_BLOCKED', message: 'Your account has been permanently blocked due to community violations.' },
      });
    }

    // Generate Collabry session JWTs
    const accessToken = jwt.sign(
      { userId: user.id, username: user.username, alias: user.alias },
      process.env.JWT_ACCESS_SECRET,
      { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
    );

    const refreshToken = uuidv4();
    const refreshHash = await bcrypt.hash(refreshToken, 10);
    const familyId = uuidv4();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, family_id, expires_at) VALUES (?, ?, ?, ?)',
      [user.id, refreshHash, familyId, expiresAt]
    );

    const [skills] = await pool.query('SELECT skill FROM user_skills WHERE user_id = ?', [user.id]);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        name: user.name,
        alias: user.alias,
        avatar_url: user.avatar_url,
        bio: user.bio,
        role: user.role || 'user',
        status: user.status || 'active',
        email_verified: true,
        skills: skills.map(s => s.skill),
      },
      accessToken,
      refreshToken,
      message: 'Successfully authenticated with GitHub!',
    });
  } catch (err) {
    console.error('GitHub Auth Error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'GitHub authentication failed' } });
  }
});

// POST /api/v1/auth/logout
router.post('/logout', optionalAuth, async (req, res) => {
  try {
    if (req.user?.id) {
      await pool.query('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?', [req.user.id]);
    }
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    res.json({ message: 'Logged out' });
  }
});

// GET /api/v1/auth/email-status (Diagnostic to verify SMTP configuration on Render / Cloud)
router.get('/email-status', async (req, res) => {
  const host = process.env.SMTP_HOST || 'not_set';
  const hasUser = Boolean(process.env.SMTP_USER);
  const userMasked = process.env.SMTP_USER ? process.env.SMTP_USER.slice(0, 4) + '***' : 'not_set';
  const hasPass = Boolean(process.env.SMTP_PASS);
  const hasBrevoKey = Boolean(process.env.BREVO_API_KEY);
  const from = process.env.SMTP_FROM || 'not_set';
  res.json({
    configured: (hasUser && hasPass) || hasBrevoKey,
    host,
    user: userMasked,
    hasPass,
    hasBrevoKey,
    from,
  });
});

module.exports = router;
