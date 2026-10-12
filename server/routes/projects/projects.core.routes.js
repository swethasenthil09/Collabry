const express = require('express');
const pool = require('../../config/db');
const { authenticate } = require('../../middleware/auth');
const { logProjectActivity } = require('../../utils/helpers');

const router = express.Router();

// GET /api/v1/projects - list user's projects
router.get('/', authenticate, async (req, res) => {
  try {
    const [projects] = await pool.query(
      `SELECT p.*, pm.role as user_role,
        (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) as member_count,
        (SELECT COUNT(*) FROM tasks WHERE project_id = p.id AND deleted_at IS NULL) as task_count
       FROM projects p
       JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = ?
       WHERE p.deleted_at IS NULL
       ORDER BY p.updated_at DESC`,
      [req.user.id]
    );
    res.json(projects);
  } catch (err) {
    console.error('List projects error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch projects' } });
  }
});

// GET /api/v1/projects/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const [projects] = await pool.query(
      `SELECT p.*, 
        (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) as member_count
       FROM projects p WHERE p.id = ? AND p.deleted_at IS NULL`,
      [req.params.id]
    );
    if (projects.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    }

    const project = projects[0];

    // Get members
    const [members] = await pool.query(
      `SELECT pm.role, pm.joined_at, u.id, u.username, u.name, u.avatar_url
       FROM project_members pm JOIN users u ON pm.user_id = u.id
       WHERE pm.project_id = ?`,
      [project.id]
    );

    // Get channels
    const [channels] = await pool.query(
      `SELECT id, name, type FROM conversations WHERE project_id = ? AND type = 'channel'`,
      [project.id]
    );

    // Get user role
    const [userRole] = await pool.query(
      'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
      [project.id, req.user.id]
    );

    const isMember = userRole.length > 0 || project.creator_id === req.user.id;
    project.members = members;
    project.user_role = userRole.length > 0 ? userRole[0].role : (project.creator_id === req.user.id ? 'owner' : null);
    project.is_member = isMember;

    // Check pending invitation for this user
    const [pendingInv] = await pool.query(
      "SELECT id, status, created_at FROM project_invitations WHERE project_id = ? AND invitee_id = ? AND status = 'pending'",
      [project.id, req.user.id]
    );
    project.pending_invitation = pendingInv.length > 0 ? pendingInv[0] : null;

    // Check pending join request for this user
    const [pendingJoinReq] = await pool.query(
      "SELECT id, status, message, created_at FROM project_join_requests WHERE project_id = ? AND user_id = ? AND status = 'pending'",
      [project.id, req.user.id]
    );
    project.pending_join_request = pendingJoinReq.length > 0 ? pendingJoinReq[0] : null;

    // Privacy access gating:
    // If not a member, hide internal private channels from the payload
    if (!isMember) {
      project.is_preview = true;
      project.channels = [];
    } else {
      project.is_preview = false;
      project.channels = channels;
    }

    res.json(project);
  } catch (err) {
    console.error('Get project error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch project' } });
  }
});

// POST /api/v1/projects - create project
router.post('/', authenticate, async (req, res) => {
  try {
    const { name, description, visibility, join_mode } = req.body;
    if (!name) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Project name is required' } });
    }

    const [result] = await pool.query(
      `INSERT INTO projects (name, description, visibility, join_mode, creator_id) VALUES (?, ?, ?, ?, ?)`,
      [name, description || null, visibility || 'public', join_mode || 'invite', req.user.id]
    );

    const projectId = result.insertId;

    // Creator is owner
    await pool.query(
      'INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)',
      [projectId, req.user.id, 'owner']
    );

    // Create default general channel
    const [channelResult] = await pool.query(
      `INSERT INTO conversations (type, name, project_id) VALUES ('channel', 'general', ?)`,
      [projectId]
    );

    await pool.query(
      'INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)',
      [channelResult.insertId, req.user.id]
    );

    res.status(201).json({ id: projectId, message: 'Project created' });
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to create project' } });
  }
});

// POST /api/v1/projects/:id/channels - create a channel in project
router.post('/:id/channels', authenticate, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Channel name is required' } });
    }

    // Format channel name (lowercase, dashes only)
    const formattedName = name.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-');

    // Verify membership
    const [membership] = await pool.query(
      'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (membership.length === 0) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Must be a workspace member to create channels' } });
    }

    const [result] = await pool.query(
      `INSERT INTO conversations (type, name, project_id) VALUES ('channel', ?, ?)`,
      [formattedName, req.params.id]
    );

    const channelId = result.insertId;

    // Add all project members to new channel
    const [members] = await pool.query('SELECT user_id FROM project_members WHERE project_id = ?', [req.params.id]);
    for (const mem of members) {
      await pool.query(
        'INSERT IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)',
        [channelId, mem.user_id]
      );
    }

    res.status(201).json({ id: channelId, name: formattedName, type: 'channel', message: 'Channel created' });
  } catch (err) {
    console.error('Create channel error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to create channel' } });
  }
});


// GET /api/v1/projects/:id/invitations
router.get('/:id/invitations', authenticate, async (req, res) => {
  try {
    const [invitations] = await pool.query(
      `SELECT pi.*, u.username, u.name, u.avatar_url
       FROM project_invitations pi
       JOIN users u ON pi.invitee_id = u.id
       WHERE pi.project_id = ? AND pi.status = 'pending'`,
      [req.params.id]
    );
    res.json(invitations);
  } catch (err) {
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch invitations' } });
  }
});

// POST /api/v1/projects/:id/invitations - invite user to project
router.post('/:id/invitations', authenticate, async (req, res) => {
  try {
    const invitee_id = req.body.invitee_id || req.body.user_id;
    const role = req.body.role || 'contributor';
    if (!invitee_id) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Invitee ID is required' } });
    }

    // Verify requestor is owner or admin/maintainer
    const [membership] = await pool.query(
      "SELECT role FROM project_members WHERE project_id = ? AND user_id = ? AND role IN ('owner', 'admin', 'maintainer')",
      [req.params.id, req.user.id]
    );
    const [proj] = await pool.query('SELECT creator_id, name FROM projects WHERE id = ?', [req.params.id]);
    const isOwner = (proj.length > 0 && proj[0].creator_id === req.user.id) || (membership.length > 0 && membership[0].role === 'owner');

    if (membership.length === 0 && !isOwner) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only project owners and maintainers can invite members' } });
    }

    // Check if already a member
    const [existingMember] = await pool.query(
      'SELECT id FROM project_members WHERE project_id = ? AND user_id = ?',
      [req.params.id, invitee_id]
    );
    if (existingMember.length > 0) {
      return res.status(400).json({ error: { code: 'ALREADY_MEMBER', message: 'User is already a project member' } });
    }

    const [result] = await pool.query(
      `INSERT INTO project_invitations (project_id, inviter_id, invitee_id, status) VALUES (?, ?, ?, 'pending')
       ON DUPLICATE KEY UPDATE status = 'pending'`,
      [req.params.id, req.user.id, invitee_id]
    );

    let invId = result.insertId;
    if (!invId) {
      const [existingInv] = await pool.query('SELECT id FROM project_invitations WHERE project_id = ? AND invitee_id = ?', [req.params.id, invitee_id]);
      invId = existingInv[0]?.id;
    }

    await pool.query(
      `INSERT INTO notifications (user_id, type, title, body, reference_type, reference_id)
       VALUES (?, 'invitation', 'You have been invited to a workspace', ?, 'project', ?)`,
      [invitee_id, `You are invited to join "${proj[0]?.name || 'a workspace'}"`, req.params.id]
    );

    res.status(201).json({ id: invId, message: 'Invitation sent' });
  } catch (err) {
    console.error('Send invitation error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to send invitation' } });
  }
});

// POST /api/v1/projects/:id/members - add member directly (owner/maintainer only)
router.post('/:id/members', authenticate, async (req, res) => {
  try {
    const { id: projectId } = req.params;
    const { userId, role = 'contributor' } = req.body;

    if (!userId) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'User ID is required' } });
    }

    // Verify requestor is owner or maintainer/admin
    const [membership] = await pool.query(
      "SELECT role FROM project_members WHERE project_id = ? AND user_id = ? AND role IN ('owner', 'maintainer', 'admin')",
      [projectId, req.user.id]
    );
    const [proj] = await pool.query('SELECT creator_id FROM projects WHERE id = ?', [projectId]);
    const isOwner = (proj.length > 0 && proj[0].creator_id === req.user.id) || (membership.length > 0 && membership[0].role === 'owner');

    if (membership.length === 0 && !isOwner) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only workspace owners and maintainers can add members' } });
    }

    // Check if already a member
    const [existing] = await pool.query(
      'SELECT id FROM project_members WHERE project_id = ? AND user_id = ?',
      [projectId, userId]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: { code: 'ALREADY_MEMBER', message: 'User is already a member of this workspace' } });
    }

    const assignedRole = ['owner', 'maintainer', 'contributor', 'viewer', 'admin', 'member'].includes(role) ? role : 'contributor';
    await pool.query(
      'INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)',
      [projectId, userId, assignedRole]
    );

    // Add to project channels
    const [channels] = await pool.query('SELECT id FROM conversations WHERE project_id = ?', [projectId]);
    for (const ch of channels) {
      await pool.query(
        'INSERT IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)',
        [ch.id, userId]
      );
    }

    // Increment member_count
    await pool.query('UPDATE projects SET member_count = member_count + 1 WHERE id = ?', [projectId]);

    const [u] = await pool.query('SELECT username, name FROM users WHERE id = ?', [userId]);
    await logProjectActivity(projectId, req.user.id, 'member_joined', {
      userId: parseInt(userId, 10),
      username: u[0]?.username,
      role: assignedRole,
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`project:${projectId}`).emit('project:member_joined', {
        projectId: parseInt(projectId, 10),
        user: { id: userId, username: u[0]?.username, role: assignedRole },
      });
    }

    res.status(201).json({ message: 'Member added successfully', role: assignedRole });
  } catch (err) {
    console.error('Add member error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to add member' } });
  }
});

// =========================================================================
// WORKSPACE INVITATION DECLINE & REVOKE
// =========================================================================

// DELETE /api/v1/projects/:id/invitations/:invitationId - revoke pending invite (maintainer/owner)
router.delete('/:id/invitations/:invitationId', authenticate, async (req, res) => {
  try {
    const { id: projectId, invitationId } = req.params;
    const [membership] = await pool.query(
      "SELECT role FROM project_members WHERE project_id = ? AND user_id = ? AND role IN ('owner', 'maintainer', 'admin')",
      [projectId, req.user.id]
    );
    const [proj] = await pool.query('SELECT creator_id FROM projects WHERE id = ?', [projectId]);
    const isOwner = (proj.length > 0 && proj[0].creator_id === req.user.id) || (membership.length > 0 && membership[0].role === 'owner');

    if (membership.length === 0 && !isOwner) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only maintainers can revoke invitations' } });
    }

    await pool.query("UPDATE project_invitations SET status = 'cancelled' WHERE id = ? AND project_id = ?", [invitationId, projectId]);
    res.json({ message: 'Invitation revoked successfully' });
  } catch (err) {
    console.error('Revoke invite error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to revoke invitation' } });
  }
});

// POST /api/v1/projects/:id/invitations/decline - decline invite by project id (invitee)
router.post('/:id/invitations/decline', authenticate, async (req, res) => {
  try {
    const projectId = req.params.id;
    const [inv] = await pool.query(
      "SELECT * FROM project_invitations WHERE project_id = ? AND invitee_id = ? AND status = 'pending'",
      [projectId, req.user.id]
    );
    if (inv.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No pending invitation found for this workspace' } });
    }

    await pool.query("UPDATE project_invitations SET status = 'declined' WHERE id = ?", [inv[0].id]);
    await pool.query(
      "UPDATE notifications SET is_read = 1 WHERE user_id = ? AND reference_type = 'project' AND reference_id = ?",
      [req.user.id, projectId]
    );

    const [u] = await pool.query('SELECT username FROM users WHERE id = ?', [req.user.id]);
    await logProjectActivity(projectId, req.user.id, 'invitation_declined', {
      username: u[0]?.username,
    });

    res.json({ message: 'Invitation declined successfully' });
  } catch (err) {
    console.error('Decline project invite error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to decline invitation' } });
  }
});

// =========================================================================
// WORKSPACE JOIN REQUESTS ("INTERESTED / REQUEST TO JOIN")
// =========================================================================

// POST /api/v1/projects/:id/join-requests - submit interest / request to join workspace
router.post('/:id/join-requests', authenticate, async (req, res) => {
  try {
    const projectId = req.params.id;
    const { message, skills_offered } = req.body;

    const [proj] = await pool.query('SELECT id, name, join_mode, creator_id FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
    if (proj.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    }

    // Check if already a member
    const [existingMem] = await pool.query('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, req.user.id]);
    if (existingMem.length > 0 || proj[0].creator_id === req.user.id) {
      return res.status(400).json({ error: { code: 'ALREADY_MEMBER', message: 'You are already a member of this workspace' } });
    }

    // If join_mode is 'open', join immediately!
    if (proj[0].join_mode === 'open') {
      await pool.query('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)', [projectId, req.user.id, 'contributor']);
      const [channels] = await pool.query('SELECT id FROM conversations WHERE project_id = ?', [projectId]);
      for (const ch of channels) {
        await pool.query('INSERT IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)', [ch.id, req.user.id]);
      }
      await pool.query('UPDATE projects SET member_count = member_count + 1 WHERE id = ?', [projectId]);
      await logProjectActivity(projectId, req.user.id, 'member_joined', { role: 'contributor', via: 'open_join' });

      return res.status(201).json({ message: 'Successfully joined workspace!', joined: true, role: 'contributor' });
    }

    // If join_mode is 'invite' or 'request', submit join request
    let skillsJson = null;
    if (Array.isArray(skills_offered)) {
      skillsJson = JSON.stringify(skills_offered);
    } else if (typeof skills_offered === 'string' && skills_offered.trim()) {
      try {
        JSON.parse(skills_offered);
        skillsJson = skills_offered;
      } catch (_) {
        const arr = skills_offered.split(',').map(s => s.trim()).filter(Boolean);
        skillsJson = JSON.stringify(arr);
      }
    }
    const [result] = await pool.query(
      `INSERT INTO project_join_requests (project_id, user_id, message, skills_offered, status)
       VALUES (?, ?, ?, ?, 'pending')
       ON DUPLICATE KEY UPDATE message = VALUES(message), skills_offered = VALUES(skills_offered), status = 'pending'`,
      [projectId, req.user.id, message || null, skillsJson]
    );

    let requestId = result.insertId;
    if (!requestId) {
      const [existingReq] = await pool.query('SELECT id FROM project_join_requests WHERE project_id = ? AND user_id = ?', [projectId, req.user.id]);
      requestId = existingReq[0]?.id;
    }

    // Notify workspace creator & maintainers
    const [maintainers] = await pool.query(
      "SELECT user_id FROM project_members WHERE project_id = ? AND role IN ('owner', 'maintainer', 'admin')",
      [projectId]
    );
    const recipientIds = maintainers.map(m => m.user_id);
    if (!recipientIds.includes(proj[0].creator_id)) recipientIds.push(proj[0].creator_id);

    const [applicant] = await pool.query('SELECT username, name FROM users WHERE id = ?', [req.user.id]);
    const applicantName = applicant[0]?.name || applicant[0]?.username || 'A builder';

    for (const recId of recipientIds) {
      if (recId !== req.user.id) {
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, body, reference_type, reference_id)
           VALUES (?, 'join_request', 'New workspace join request', ?, 'project', ?)`,
          [recId, `${applicantName} requested to join "${proj[0].name}"`, projectId]
        );
      }
    }

    await logProjectActivity(projectId, req.user.id, 'join_request_submitted', {
      username: applicant[0]?.username,
      message: message ? message.substring(0, 100) : null,
    });

    res.status(201).json({ message: 'Join request submitted! Team maintainers have been notified.', pending: true, request_id: requestId });
  } catch (err) {
    console.error('Submit join request error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to submit join request' } });
  }
});

// GET /api/v1/projects/:id/join-requests - list pending join requests (owner/maintainer only)
router.get('/:id/join-requests', authenticate, async (req, res) => {
  try {
    const projectId = req.params.id;
    const [membership] = await pool.query(
      "SELECT role FROM project_members WHERE project_id = ? AND user_id = ? AND role IN ('owner', 'maintainer', 'admin')",
      [projectId, req.user.id]
    );
    const [proj] = await pool.query('SELECT creator_id FROM projects WHERE id = ?', [projectId]);
    const isOwner = (proj.length > 0 && proj[0].creator_id === req.user.id) || (membership.length > 0 && membership[0].role === 'owner');

    if (membership.length === 0 && !isOwner) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only workspace maintainers can view join requests' } });
    }

    const [requests] = await pool.query(
      `SELECT pjr.*, u.username, u.name, u.avatar_url, u.bio
       FROM project_join_requests pjr
       JOIN users u ON pjr.user_id = u.id
       WHERE pjr.project_id = ? AND pjr.status = 'pending'
       ORDER BY pjr.created_at DESC`,
      [projectId]
    );

    res.json(requests.map(r => {
      let parsedSkills = r.skills_offered;
      if (typeof r.skills_offered === 'string') {
        try {
          parsedSkills = JSON.parse(r.skills_offered);
        } catch (_) {
          parsedSkills = r.skills_offered.split(',').map(s => s.trim()).filter(Boolean);
        }
      }
      return {
        ...r,
        skills_offered: parsedSkills || [],
      };
    }));
  } catch (err) {
    console.error('Fetch join requests error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch join requests' } });
  }
});

// PATCH /api/v1/projects/:id/join-requests/:requestId - review join request (accept/decline)
router.patch('/:id/join-requests/:requestId', authenticate, async (req, res) => {
  try {
    const { id: projectId, requestId } = req.params;
    const { status, role = 'contributor' } = req.body;

    if (!status || !['accepted', 'declined'].includes(status)) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Valid status is required (accepted, declined)' } });
    }

    const [membership] = await pool.query(
      "SELECT role FROM project_members WHERE project_id = ? AND user_id = ? AND role IN ('owner', 'maintainer', 'admin')",
      [projectId, req.user.id]
    );
    const [proj] = await pool.query('SELECT creator_id, name FROM projects WHERE id = ?', [projectId]);
    const isOwner = (proj.length > 0 && proj[0].creator_id === req.user.id) || (membership.length > 0 && membership[0].role === 'owner');

    if (membership.length === 0 && !isOwner) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only workspace maintainers can review requests' } });
    }

    const [joinReq] = await pool.query('SELECT * FROM project_join_requests WHERE id = ? AND project_id = ?', [requestId, projectId]);
    if (joinReq.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Join request not found' } });
    }

    const applicantUserId = joinReq[0].user_id;

    if (status === 'accepted') {
      const assignedRole = ['maintainer', 'contributor', 'viewer'].includes(role) ? role : 'contributor';
      await pool.query(
        'INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE role = VALUES(role)',
        [projectId, applicantUserId, assignedRole]
      );

      const [channels] = await pool.query('SELECT id FROM conversations WHERE project_id = ?', [projectId]);
      for (const ch of channels) {
        await pool.query('INSERT IGNORE INTO conversation_members (conversation_id, user_id) VALUES (?, ?)', [ch.id, applicantUserId]);
      }

      await pool.query('UPDATE projects SET member_count = member_count + 1 WHERE id = ?', [projectId]);
      await pool.query("UPDATE project_join_requests SET status = 'accepted' WHERE id = ?", [requestId]);

      await pool.query(
        `INSERT INTO notifications (user_id, type, title, body, reference_type, reference_id)
         VALUES (?, 'join_request_accepted', 'Welcome to the team!', ?, 'project', ?)`,
        [applicantUserId, `Your request to join "${proj[0]?.name}" has been accepted!`, projectId]
      );

      const [applicant] = await pool.query('SELECT username, name FROM users WHERE id = ?', [applicantUserId]);
      await logProjectActivity(projectId, req.user.id, 'join_request_accepted', {
        userId: applicantUserId,
        username: applicant[0]?.username,
        role: assignedRole,
      });

      return res.json({ message: 'Join request accepted and member added', status: 'accepted' });
    } else {
      await pool.query("UPDATE project_join_requests SET status = 'declined' WHERE id = ?", [requestId]);
      return res.json({ message: 'Join request declined', status: 'declined' });
    }
  } catch (err) {
    console.error('Review join request error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to review join request' } });
  }
});

// DELETE /api/v1/projects/:id - delete workspace
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const projectId = req.params.id;

    const [project] = await pool.query(
      'SELECT created_by FROM projects WHERE id = ? AND deleted_at IS NULL',
      [projectId]
    );
    if (project.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    }

    const [adminCheck] = await pool.query(
      "SELECT role FROM project_members WHERE project_id = ? AND user_id = ? AND role = 'owner'",
      [projectId, req.user.id]
    );

    if (project[0].created_by !== req.user.id && adminCheck.length === 0) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only workspace owners can delete this project' } });
    }

    await pool.query('UPDATE projects SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [projectId]);
    res.json({ message: 'Project workspace deleted' });
  } catch (err) {
    console.error('Delete project error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to delete workspace' } });
  }
});

// DELETE /api/v1/projects/:id/channels/:channelId - delete channel
router.delete('/:id/channels/:channelId', authenticate, async (req, res) => {
  try {
    const { id: projectId, channelId } = req.params;

    const [membership] = await pool.query(
      "SELECT role FROM project_members WHERE project_id = ? AND user_id = ? AND role IN ('owner', 'admin')",
      [projectId, req.user.id]
    );

    const [projCheck] = await pool.query('SELECT created_by FROM projects WHERE id = ?', [projectId]);
    const isCreator = projCheck.length > 0 && projCheck[0].created_by === req.user.id;

    if (membership.length === 0 && !isCreator) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only workspace admins can delete channels' } });
    }

    const [channel] = await pool.query(
      'SELECT name FROM conversations WHERE id = ? AND project_id = ?',
      [channelId, projectId]
    );
    if (channel.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Channel not found' } });
    }
    if (channel[0].name === 'general') {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Cannot delete the default #general channel' } });
    }

    await pool.query('DELETE FROM conversation_members WHERE conversation_id = ?', [channelId]);
    await pool.query('DELETE FROM messages WHERE conversation_id = ?', [channelId]);
    await pool.query('DELETE FROM conversations WHERE id = ?', [channelId]);

    await logProjectActivity(projectId, req.user.id, 'channel_deleted', { channelName: channel[0].name });

    res.json({ message: 'Channel deleted successfully' });
  } catch (err) {
    console.error('Delete channel error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to delete channel' } });
  }
});

// =========================================================================
// WORKSPACE GRANULAR ROLES & ACCESS PERMISSIONS
// =========================================================================

// PATCH /api/v1/projects/:id/members/:userId - change member role (owner, maintainer, contributor, viewer)
router.patch('/:id/members/:userId', authenticate, async (req, res) => {
  try {
    const { id: projectId, userId: targetUserId } = req.params;
    const { role } = req.body;

    const allowedRoles = ['owner', 'maintainer', 'contributor', 'viewer', 'admin', 'member'];
    if (!role || !allowedRoles.includes(role)) {
      return res.status(400).json({
        error: { code: 'VALIDATION', message: 'Valid role is required (maintainer, contributor, viewer)' }
      });
    }

    // Check project and requester's role
    const [project] = await pool.query('SELECT creator_id, name FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
    if (project.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    }

    const [reqMembership] = await pool.query(
      'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
      [projectId, req.user.id]
    );

    const isCreator = project[0].creator_id === req.user.id;
    const reqRole = isCreator ? 'owner' : (reqMembership[0]?.role || null);

    if (reqRole !== 'owner' && reqRole !== 'maintainer' && reqRole !== 'admin') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only workspace owners and maintainers can change roles' } });
    }

    // Check target member
    const [targetMembership] = await pool.query(
      'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
      [projectId, targetUserId]
    );
    if (targetMembership.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Target user is not a member of this project' } });
    }

    const targetRole = targetMembership[0].role;
    if (targetRole === 'owner') {
      return res.status(400).json({ error: { code: 'FORBIDDEN', message: 'Cannot change the role of the workspace Owner. Use transfer ownership instead.' } });
    }

    // Maintainers cannot promote to owner or demote other maintainers
    if (reqRole !== 'owner' && (role === 'owner' || targetRole === 'maintainer' || targetRole === 'admin')) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only the Workspace Owner can manage maintainers' } });
    }

    // Update role
    await pool.query(
      'UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?',
      [role, projectId, targetUserId]
    );

    const [targetUser] = await pool.query('SELECT username, name FROM users WHERE id = ?', [targetUserId]);
    const targetName = targetUser[0]?.name || targetUser[0]?.username || 'User';

    await logProjectActivity(projectId, req.user.id, 'member_role_changed', {
      targetUserId: parseInt(targetUserId, 10),
      targetUsername: targetUser[0]?.username,
      oldRole: targetRole,
      newRole: role,
    });

    // Notify over socket
    const io = req.app.get('io');
    if (io) {
      io.to(`project:${projectId}`).emit('project:member_role_changed', {
        projectId: parseInt(projectId, 10),
        userId: parseInt(targetUserId, 10),
        newRole: role,
      });
    }

    res.json({ message: `Updated ${targetName}'s role to ${role}`, role });
  } catch (err) {
    console.error('Update member role error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to update member role' } });
  }
});

// DELETE /api/v1/projects/:id/members/:userId - remove member or leave workspace
router.delete('/:id/members/:userId', authenticate, async (req, res) => {
  try {
    const { id: projectId, userId: targetUserId } = req.params;
    const isSelf = parseInt(req.user.id, 10) === parseInt(targetUserId, 10);

    const [project] = await pool.query('SELECT creator_id, name FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
    if (project.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    }

    const [reqMembership] = await pool.query(
      'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
      [projectId, req.user.id]
    );

    const isCreator = project[0].creator_id === req.user.id;
    const reqRole = isCreator ? 'owner' : (reqMembership[0]?.role || null);

    if (isSelf) {
      if (reqRole === 'owner') {
        return res.status(400).json({
          error: { code: 'CANNOT_LEAVE', message: 'Workspace Owner cannot leave without transferring ownership first' }
        });
      }
    } else {
      if (reqRole !== 'owner' && reqRole !== 'maintainer' && reqRole !== 'admin') {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only workspace owners and maintainers can remove members' } });
      }

      const [targetMembership] = await pool.query(
        'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
        [projectId, targetUserId]
      );
      if (targetMembership.length === 0) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User is not a member of this workspace' } });
      }

      if (targetMembership[0].role === 'owner') {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Cannot remove the workspace Owner' } });
      }

      if (reqRole !== 'owner' && (targetMembership[0].role === 'maintainer' || targetMembership[0].role === 'admin')) {
        return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only the Workspace Owner can remove maintainers' } });
      }
    }

    // Clean up memberships
    await pool.query('DELETE FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, targetUserId]);

    // Remove from project channel conversations
    const [channels] = await pool.query('SELECT id FROM conversations WHERE project_id = ?', [projectId]);
    for (const ch of channels) {
      await pool.query('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [ch.id, targetUserId]);
    }

    // Decrement member count
    await pool.query('UPDATE projects SET member_count = GREATEST(1, member_count - 1) WHERE id = ?', [projectId]);

    const [targetUser] = await pool.query('SELECT username, name FROM users WHERE id = ?', [targetUserId]);
    const targetUsername = targetUser[0]?.username || 'member';

    await logProjectActivity(projectId, req.user.id, isSelf ? 'member_left' : 'member_removed', {
      userId: parseInt(targetUserId, 10),
      username: targetUsername,
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`project:${projectId}`).emit('project:member_removed', {
        projectId: parseInt(projectId, 10),
        userId: parseInt(targetUserId, 10),
      });
    }

    res.json({ message: isSelf ? 'Successfully left workspace' : `Removed ${targetUsername} from workspace` });
  } catch (err) {
    console.error('Remove member error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to remove member' } });
  }
});

// POST /api/v1/projects/:id/transfer-ownership - transfer workspace ownership
router.post('/:id/transfer-ownership', authenticate, async (req, res) => {
  try {
    const projectId = req.params.id;
    const { new_owner_id } = req.body;

    if (!new_owner_id) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'New owner user ID is required' } });
    }

    const [project] = await pool.query('SELECT creator_id, name FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
    if (project.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
    }

    if (project[0].creator_id !== req.user.id) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only the current Workspace Owner can transfer ownership' } });
    }

    const [targetMember] = await pool.query('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, new_owner_id]);
    if (targetMember.length === 0) {
      return res.status(400).json({ error: { code: 'NOT_MEMBER', message: 'New owner must already be an active workspace member' } });
    }

    // 1. Update project creator_id
    await pool.query('UPDATE projects SET creator_id = ? WHERE id = ?', [new_owner_id, projectId]);

    // 2. Set new owner's role to 'owner'
    await pool.query("UPDATE project_members SET role = 'owner' WHERE project_id = ? AND user_id = ?", [projectId, new_owner_id]);

    // 3. Demote previous owner to 'maintainer'
    await pool.query("UPDATE project_members SET role = 'maintainer' WHERE project_id = ? AND user_id = ?", [projectId, req.user.id]);

    const [newOwner] = await pool.query('SELECT username, name FROM users WHERE id = ?', [new_owner_id]);

    await logProjectActivity(projectId, req.user.id, 'ownership_transferred', {
      previousOwnerId: req.user.id,
      newOwnerId: parseInt(new_owner_id, 10),
      newOwnerUsername: newOwner[0]?.username,
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`project:${projectId}`).emit('project:ownership_transferred', {
        projectId: parseInt(projectId, 10),
        newOwnerId: parseInt(new_owner_id, 10),
      });
    }

    res.json({ message: `Workspace ownership successfully transferred to @${newOwner[0]?.username}` });
  } catch (err) {
    console.error('Transfer ownership error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to transfer ownership' } });
  }
});

// =========================================================================
// WORKSPACE AUDIT TRAIL & ACTIVITY FEED
// =========================================================================

// GET /api/v1/projects/:id/activity - fetch workspace activity feed
router.get('/:id/activity', authenticate, async (req, res) => {
  try {
    const projectId = req.params.id;
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 100);
    const category = req.query.category;

    let query = `
      SELECT al.*, u.username, u.name, u.avatar_url
      FROM activity_logs al
      JOIN users u ON al.user_id = u.id
      WHERE al.project_id = ?
    `;
    const params = [projectId];

    if (category && category !== 'all') {
      query += ` AND al.action LIKE ?`;
      params.push(`%${category}%`);
    }

    query += ` ORDER BY al.created_at DESC LIMIT ?`;
    params.push(limit);

    const [logs] = await pool.query(query, params);

    res.json(logs.map(log => ({
      id: log.id,
      project_id: log.project_id,
      user_id: log.user_id,
      action: log.action,
      details: typeof log.details === 'string' ? JSON.parse(log.details) : (log.details || {}),
      created_at: log.created_at,
      user: {
        id: log.user_id,
        username: log.username,
        name: log.name || log.username,
        avatar_url: log.avatar_url,
      }
    })));
  } catch (err) {
    console.error('Fetch project activity error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch activity logs' } });
  }
});

// =========================================================================
// WORKSPACE DATA EXPORT & BACKUPS (FEATURE 10)
// =========================================================================

// GET /api/v1/projects/:id/export/tasks - export Kanban tasks as CSV or JSON
router.get('/:id/export/tasks', authenticate, async (req, res) => {
  try {
    const projectId = req.params.id;
    const format = (req.query.format || 'json').toLowerCase();

    // Verify member or public project
    const [proj] = await pool.query('SELECT name, visibility, creator_id FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
    if (proj.length === 0) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workspace not found' } });

    const [mem] = await pool.query('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, req.user.id]);
    const isMember = mem.length > 0 || proj[0].creator_id === req.user.id;
    if (!isMember && proj[0].visibility === 'private') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied to private workspace' } });
    }

    const [tasks] = await pool.query(
      `SELECT t.id, t.title, t.description, t.status, t.priority, t.due_date, t.created_at, t.updated_at,
         u.username as assignee_username, u.name as assignee_name
       FROM tasks t
       LEFT JOIN users u ON t.assignee_id = u.id
       WHERE t.project_id = ?
       ORDER BY t.created_at ASC`,
      [projectId]
    );

    if (format === 'csv') {
      const headers = ['ID', 'Title', 'Description', 'Status', 'Priority', 'Assignee', 'DueDate', 'CreatedAt'];
      const rows = tasks.map(t => [
        t.id,
        `"${(t.title || '').replace(/"/g, '""')}"`,
        `"${(t.description || '').replace(/"/g, '""')}"`,
        t.status || 'todo',
        t.priority || 'medium',
        `"${t.assignee_name || t.assignee_username || 'Unassigned'}"`,
        t.due_date || '',
        t.created_at ? new Date(t.created_at).toISOString() : '',
      ]);

      const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="tasks-project-${projectId}.csv"`);
      return res.send(csvContent);
    }

    res.json({
      project_id: parseInt(projectId, 10),
      project_name: proj[0].name,
      total_tasks: tasks.length,
      tasks,
    });
  } catch (err) {
    console.error('Export tasks error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to export tasks' } });
  }
});

// GET /api/v1/projects/:id/export/chat - export project chat archive
router.get('/:id/export/chat', authenticate, async (req, res) => {
  try {
    const projectId = req.params.id;
    const format = (req.query.format || 'txt').toLowerCase();

    const [proj] = await pool.query('SELECT name, visibility, creator_id FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
    if (proj.length === 0) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workspace not found' } });

    const [mem] = await pool.query('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, req.user.id]);
    const isMember = mem.length > 0 || proj[0].creator_id === req.user.id;
    if (!isMember && proj[0].visibility === 'private') {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied to private workspace' } });
    }

    const [messages] = await pool.query(
      `SELECT m.id, m.body, m.created_at, c.name as channel_name, u.username, u.name as author_name
       FROM messages m
       JOIN conversations c ON m.conversation_id = c.id
       JOIN users u ON m.sender_id = u.id
       WHERE c.project_id = ?
       ORDER BY c.name ASC, m.created_at ASC`,
      [projectId]
    );

    if (format === 'txt') {
      let output = `====================================================\n`;
      output += `COLLABRY WORKSPACE CHAT ARCHIVE: ${proj[0].name}\n`;
      output += `Export Date: ${new Date().toISOString()}\n`;
      output += `Total Messages: ${messages.length}\n`;
      output += `====================================================\n\n`;

      let currentChannel = null;
      for (const m of messages) {
        if (m.channel_name !== currentChannel) {
          currentChannel = m.channel_name;
          output += `\n--- #${currentChannel} ---\n`;
        }
        const time = new Date(m.created_at).toLocaleString();
        output += `[${time}] ${m.author_name || m.username}: ${m.body}\n`;
      }

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="chat-archive-project-${projectId}.txt"`);
      return res.send(output);
    }

    res.json({
      project_id: parseInt(projectId, 10),
      project_name: proj[0].name,
      total_messages: messages.length,
      messages,
    });
  } catch (err) {
    console.error('Export chat error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to export chat' } });
  }
});

// GET /api/v1/projects/:id/export/backup - complete workspace JSON backup
router.get('/:id/export/backup', authenticate, async (req, res) => {
  try {
    const projectId = req.params.id;

    const [proj] = await pool.query('SELECT * FROM projects WHERE id = ? AND deleted_at IS NULL', [projectId]);
    if (proj.length === 0) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workspace not found' } });

    // Restrict full backups to owner or maintainer
    const [mem] = await pool.query(
      "SELECT role FROM project_members WHERE project_id = ? AND user_id = ? AND role IN ('owner', 'maintainer', 'admin')",
      [projectId, req.user.id]
    );
    const isOwner = proj[0].creator_id === req.user.id || (mem.length > 0 && mem[0].role === 'owner');
    if (mem.length === 0 && !isOwner) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only workspace owners and maintainers can export full backups' } });
    }

    const [members] = await pool.query(
      `SELECT pm.role, pm.joined_at, u.id, u.username, u.name, u.email
       FROM project_members pm
       JOIN users u ON pm.user_id = u.id
       WHERE pm.project_id = ?`,
      [projectId]
    );

    const [channels] = await pool.query('SELECT id, name, type, created_at FROM conversations WHERE project_id = ?', [projectId]);
    const [tasks] = await pool.query('SELECT * FROM tasks WHERE project_id = ?', [projectId]);
    const [canvas] = await pool.query('SELECT canvas_data FROM project_canvas WHERE project_id = ?', [projectId]);
    const [notes] = await pool.query('SELECT title, content FROM project_notes WHERE project_id = ?', [projectId]);
    const [activity] = await pool.query('SELECT action, details, created_at FROM activity_logs WHERE project_id = ? ORDER BY created_at DESC LIMIT 200', [projectId]);

    const backup = {
      export_version: '1.0',
      exported_at: new Date().toISOString(),
      project: proj[0],
      members,
      channels,
      tasks,
      canvas: canvas[0] ? (typeof canvas[0].canvas_data === 'string' ? JSON.parse(canvas[0].canvas_data) : canvas[0].canvas_data) : null,
      notes: notes[0] || null,
      recent_activity: activity,
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="collabry-backup-project-${projectId}.json"`);
    res.json(backup);
  } catch (err) {
    console.error('Export backup error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to export workspace backup' } });
  }
});

module.exports = router;
