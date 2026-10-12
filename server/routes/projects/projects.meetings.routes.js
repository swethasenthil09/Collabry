const express = require('express');
const pool = require('../../config/db');
const { authenticate } = require('../../middleware/auth');
const { createGoogleMeetEvent } = require('../../utils/googleCalendar');

const router = express.Router();

// ============================================================
// MODULE 13: PROJECT MEETINGS & CALENDAR SCHEDULER
// ============================================================

// GET /api/v1/projects/:id/meetings - list project meetings with attendees
router.get('/:id/meetings', authenticate, async (req, res) => {
  try {
    const projectId = req.params.id;

    // Verify membership
    const [membership] = await pool.query(
      'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
      [projectId, req.user.id]
    );
    if (membership.length === 0) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Must be a workspace member to view meetings' } });
    }

    const [meetings] = await pool.query(
      `SELECT m.*,
         u.name as organizer_name, u.username as organizer_username, u.alias as organizer_alias, u.avatar_url as organizer_avatar
       FROM meetings m
       JOIN users u ON m.organizer_id = u.id
       WHERE m.project_id = ? AND m.deleted_at IS NULL
       ORDER BY m.start_time ASC`,
      [projectId]
    );

    if (meetings.length === 0) {
      return res.json([]);
    }

    const meetingIds = meetings.map(m => m.id);
    const [attendees] = await pool.query(
      `SELECT ma.meeting_id, ma.user_id, ma.status,
         u.name, u.username, u.alias, u.avatar_url
       FROM meeting_attendees ma
       JOIN users u ON ma.user_id = u.id
       WHERE ma.meeting_id IN (?)`,
      [meetingIds]
    );

    // Group attendees by meeting_id
    const attendeesMap = {};
    attendees.forEach(a => {
      if (!attendeesMap[a.meeting_id]) attendeesMap[a.meeting_id] = [];
      attendeesMap[a.meeting_id].push(a);
    });

    const enriched = meetings.map(m => {
      const attList = attendeesMap[m.id] || [];
      const userAtt = attList.find(a => a.user_id === req.user.id);
      return {
        ...m,
        attendees: attList,
        user_rsvp: userAtt ? userAtt.status : (m.organizer_id === req.user.id ? 'accepted' : 'invited'),
        is_organizer: m.organizer_id === req.user.id,
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error('Fetch meetings error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to fetch meetings' } });
  }
});

// POST /api/v1/projects/:id/meetings/generate-url - generate a real Google Meet room
router.post('/:id/meetings/generate-url', authenticate, async (req, res) => {
  try {
    const { title, start_time, end_time } = req.body || {};
    const now = new Date();
    const start = start_time ? new Date(start_time) : new Date(now.getTime() + 3600000);
    const end = end_time ? new Date(end_time) : new Date(start.getTime() + 45 * 60000);

    let meetUrl = await createGoogleMeetEvent({
      title: title || 'Collabry Team Meeting',
      description: 'Scheduled via Collabry workspace',
      startTime: start,
      endTime: end,
    });

    if (!meetUrl) {
      meetUrl = 'https://meet.google.com/new';
    }

    res.json({ meeting_url: meetUrl });
  } catch (err) {
    console.error('Generate meet URL error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to generate Google Meet URL' } });
  }
});

// POST /api/v1/projects/:id/meetings - schedule new meeting
router.post('/:id/meetings', authenticate, async (req, res) => {
  try {
    const projectId = req.params.id;
    const { title, description, start_time, end_time, meeting_url, agenda, attendee_ids = [] } = req.body;

    if (!title || !start_time || !end_time) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Title, start time, and end time are required' } });
    }

    // Verify membership
    const [membership] = await pool.query(
      'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
      [projectId, req.user.id]
    );
    if (membership.length === 0) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Must be a workspace member to schedule a meeting' } });
    }

    // Create genuine Google Meet URL via Calendar API if configured, otherwise format meet link
    let finalMeetingUrl = meeting_url && meeting_url.trim() ? meeting_url.trim() : null;

    if (!finalMeetingUrl) {
      try {
        finalMeetingUrl = await createGoogleMeetEvent({
          title: title.trim(),
          description: description || agenda,
          startTime: start_time,
          endTime: end_time,
        });
      } catch (calErr) {
        console.warn('Could not create Google Calendar Meet event:', calErr.message);
      }
    }

    if (!finalMeetingUrl) {
      const chars = 'abcdefghijklmnopqrstuvwxyz';
      const rand = (n) => Array.from({ length: n }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
      finalMeetingUrl = `https://meet.google.com/${rand(3)}-${rand(4)}-${rand(3)}`;
    }

    const [result] = await pool.query(
      `INSERT INTO meetings (project_id, organizer_id, title, description, meeting_url, start_time, end_time, agenda)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [projectId, req.user.id, title.trim(), description || null, finalMeetingUrl, start_time, end_time, agenda || null]
    );

    const meetingId = result.insertId;

    // Organizer is automatically accepted
    await pool.query(
      'INSERT INTO meeting_attendees (meeting_id, user_id, status) VALUES (?, ?, "accepted")',
      [meetingId, req.user.id]
    );

    // If attendee_ids supplied or all project members invited
    let invitees = Array.isArray(attendee_ids) && attendee_ids.length > 0 ? attendee_ids : [];
    if (invitees.length === 0) {
      // Auto-invite all other project members
      const [allMembers] = await pool.query(
        'SELECT user_id FROM project_members WHERE project_id = ? AND user_id != ?',
        [projectId, req.user.id]
      );
      invitees = allMembers.map(m => m.user_id);
    }

    for (const inviteeId of invitees) {
      if (inviteeId !== req.user.id) {
        await pool.query(
          'INSERT IGNORE INTO meeting_attendees (meeting_id, user_id, status) VALUES (?, ?, "invited")',
          [meetingId, inviteeId]
        );

        // Send in-app notification
        await pool.query(
          `INSERT INTO notifications (user_id, type, title, body, reference_type, reference_id)
           VALUES (?, 'meeting', 'New team meeting scheduled', ?, 'project', ?)`,
          [inviteeId, `Meeting "${title}" scheduled for ${new Date(start_time).toLocaleString()}`, projectId]
        );
      }
    }

    // Return created meeting
    const [newMeeting] = await pool.query(
      `SELECT m.*, u.name as organizer_name, u.username as organizer_username, u.alias as organizer_alias, u.avatar_url as organizer_avatar
       FROM meetings m
       JOIN users u ON m.organizer_id = u.id
       WHERE m.id = ?`,
      [meetingId]
    );

    res.status(201).json(newMeeting[0]);
  } catch (err) {
    console.error('Schedule meeting error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to schedule meeting' } });
  }
});

// PATCH /api/v1/projects/:id/meetings/:meetingId - update meeting details
router.patch('/:id/meetings/:meetingId', authenticate, async (req, res) => {
  try {
    const { id: projectId, meetingId } = req.params;
    const { title, description, start_time, end_time, meeting_url, agenda } = req.body;

    // Check organizer or project admin/owner
    const [meeting] = await pool.query(
      'SELECT * FROM meetings WHERE id = ? AND project_id = ? AND deleted_at IS NULL',
      [meetingId, projectId]
    );
    if (meeting.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Meeting not found' } });
    }

    const [adminCheck] = await pool.query(
      "SELECT role FROM project_members WHERE project_id = ? AND user_id = ? AND role IN ('owner', 'admin')",
      [projectId, req.user.id]
    );

    if (meeting[0].organizer_id !== req.user.id && adminCheck.length === 0) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only the organizer or a project admin can modify this meeting' } });
    }

    const updates = [];
    const params = [];
    if (title !== undefined) { updates.push('title = ?'); params.push(title.trim()); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (start_time !== undefined) { updates.push('start_time = ?'); params.push(start_time); }
    if (end_time !== undefined) { updates.push('end_time = ?'); params.push(end_time); }
    if (meeting_url !== undefined) { updates.push('meeting_url = ?'); params.push(meeting_url); }
    if (agenda !== undefined) { updates.push('agenda = ?'); params.push(agenda); }

    if (updates.length > 0) {
      params.push(meetingId);
      await pool.query(`UPDATE meetings SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    res.json({ message: 'Meeting updated successfully' });
  } catch (err) {
    console.error('Update meeting error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to update meeting' } });
  }
});

// DELETE /api/v1/projects/:id/meetings/:meetingId - cancel meeting
router.delete('/:id/meetings/:meetingId', authenticate, async (req, res) => {
  try {
    const { id: projectId, meetingId } = req.params;

    const [meeting] = await pool.query(
      'SELECT * FROM meetings WHERE id = ? AND project_id = ? AND deleted_at IS NULL',
      [meetingId, projectId]
    );
    if (meeting.length === 0) {
      return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Meeting not found' } });
    }

    const [adminCheck] = await pool.query(
      "SELECT role FROM project_members WHERE project_id = ? AND user_id = ? AND role IN ('owner', 'admin')",
      [projectId, req.user.id]
    );

    const [projCheck] = await pool.query(
      'SELECT created_by FROM projects WHERE id = ?',
      [projectId]
    );

    const isCreator = projCheck.length > 0 && projCheck[0].created_by === req.user.id;

    if (meeting[0].organizer_id !== req.user.id && adminCheck.length === 0 && !isCreator) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Only the organizer, project creator, or a project admin can cancel this meeting' } });
    }

    await pool.query('UPDATE meetings SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?', [meetingId]);
    res.json({ message: 'Meeting cancelled' });
  } catch (err) {
    console.error('Cancel meeting error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to cancel meeting' } });
  }
});

// POST /api/v1/projects/:id/meetings/:meetingId/rsvp - respond to meeting invitation
router.post('/:id/meetings/:meetingId/rsvp', authenticate, async (req, res) => {
  try {
    const { id: projectId, meetingId } = req.params;
    const { status } = req.body;

    if (!['accepted', 'declined', 'tentative'].includes(status)) {
      return res.status(400).json({ error: { code: 'VALIDATION', message: 'Status must be accepted, declined, or tentative' } });
    }

    // Verify project member
    const [membership] = await pool.query(
      'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
      [projectId, req.user.id]
    );
    if (membership.length === 0) {
      return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Must be a project member' } });
    }

    await pool.query(
      `INSERT INTO meeting_attendees (meeting_id, user_id, status)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE status = ?`,
      [meetingId, req.user.id, status, status]
    );

    res.json({ message: `RSVP updated to ${status}`, status });
  } catch (err) {
    console.error('RSVP error:', err);
    res.status(500).json({ error: { code: 'SERVER_ERROR', message: 'Failed to update RSVP' } });
  }
});

module.exports = router;
