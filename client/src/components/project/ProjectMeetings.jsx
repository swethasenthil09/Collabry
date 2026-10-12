import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import ScheduleMeetingModal from './ScheduleMeetingModal';
import ConfirmModal from '../common/ConfirmModal';
import {
  IconVideo,
  IconCalendar,
  IconClock,
  IconPlus,
  IconExternalLink,
  IconCheck,
  IconX,
  IconTrash,
} from '../common/Icons';

export default function ProjectMeetings({ project }) {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('upcoming'); // 'upcoming' | 'past'
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [meetingToDelete, setMeetingToDelete] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    if (project?.id) {
      loadMeetings();
    }
  }, [project?.id]);

  const loadMeetings = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/projects/${project.id}/meetings`);
      setMeetings(res.data);
    } catch (err) {
      console.error('Load meetings error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRsvp = async (meetingId, status) => {
    try {
      await api.post(`/projects/${project.id}/meetings/${meetingId}/rsvp`, { status });
      // Update local state
      setMeetings(prev =>
        prev.map(m => {
          if (m.id === meetingId) {
            const updatedAttendees = m.attendees.map(a =>
              a.user_id === user.id ? { ...a, status } : a
            );
            if (!m.attendees.some(a => a.user_id === user.id)) {
              updatedAttendees.push({
                user_id: user.id,
                name: user.name,
                username: user.username,
                alias: user.alias,
                avatar_url: user.avatar_url,
                status,
              });
            }
            return {
              ...m,
              user_rsvp: status,
              attendees: updatedAttendees,
            };
          }
          return m;
        })
      );
    } catch (err) {
      console.error('RSVP error:', err);
    }
  };

  const handleDeleteMeeting = async (meetingId) => {
    try {
      await api.delete(`/projects/${project.id}/meetings/${meetingId}`);
      setMeetings(prev => prev.filter(m => m.id !== meetingId));
    } catch (err) {
      console.error('Cancel meeting error:', err);
    }
  };

  const handleCopyLink = (meeting) => {
    if (!meeting.meeting_url) return;
    navigator.clipboard.writeText(meeting.meeting_url);
    setCopiedId(meeting.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const parseMeetingDate = (str) => {
    if (!str) return new Date();
    if (str instanceof Date) return str;
    return new Date(typeof str === 'string' && str.includes(' ') && !str.includes('T') ? str.replace(' ', 'T') : str);
  };

  // Filter meetings
  const now = new Date();
  const upcomingMeetings = meetings.filter(m => parseMeetingDate(m.end_time || m.start_time) >= now);
  const pastMeetings = meetings.filter(m => parseMeetingDate(m.end_time || m.start_time) < now);
  const displayedMeetings = activeTab === 'upcoming' ? upcomingMeetings : pastMeetings;

  const formatDateBlock = (dateStr) => {
    const d = parseMeetingDate(dateStr);
    const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
    const day = d.getDate();
    const weekday = d.toLocaleString('en-US', { weekday: 'short' });
    return { month, day, weekday };
  };

  const formatTimeRange = (startStr, endStr) => {
    const s = parseMeetingDate(startStr);
    const e = parseMeetingDate(endStr);
    const timeFormat = { hour: 'numeric', minute: '2-digit', hour12: true };
    const startTime = s.toLocaleTimeString([], timeFormat);
    const endTime = e.toLocaleTimeString([], timeFormat);
    const durationMin = Math.max(1, Math.round((e - s) / 60000));
    const durationStr = durationMin >= 60
      ? `${Math.floor(durationMin / 60)}h ${durationMin % 60 ? durationMin % 60 + 'm' : ''}`
      : `${durationMin} mins`;
    return `${startTime} – ${endTime} · ${durationStr}`;
  };

  const getRelativeBadge = (startStr, endStr) => {
    const s = parseMeetingDate(startStr);
    const e = parseMeetingDate(endStr);
    const curr = new Date();
    if (curr >= s && curr <= e) {
      return { label: '● LIVE NOW', color: '#f23f43', isLive: true };
    }
    const today = new Date();
    today.setHours(0,0,0,0);
    const mDay = new Date(s);
    mDay.setHours(0,0,0,0);
    const diffDays = Math.round((mDay - today) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return { label: 'Today', color: 'var(--reddit-orange)' };
    if (diffDays === 1) return { label: 'Tomorrow', color: 'var(--discord-blurple)' };
    if (diffDays > 1 && diffDays <= 7) return { label: `In ${diffDays} days`, color: 'var(--accent-green)' };
    if (diffDays < 0) return { label: 'Completed', color: 'var(--text-muted)' };
    return { label: s.toLocaleDateString(), color: 'var(--text-muted)' };
  };

  const isMember = Boolean(
    project?.is_member ||
    project?.user_role ||
    project?.role ||
    project?.created_by === user?.id ||
    project?.members?.some(m => m.id === user?.id || m.user_id === user?.id)
  );

  return (
    <div className="main-body" style={{ maxWidth: '1000px', margin: '0 auto', width: '100%', padding: '24px 20px' }}>
      {/* Top Header Controls */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconVideo size={20} style={{ color: 'var(--discord-blurple)' }} />
            <span>Team Meetings & Calls</span>
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Coordinate live sprints, daily standups, and architecture reviews.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* Tabs */}
          <div style={{ display: 'flex', background: 'var(--bg-subtle)', padding: 3, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-medium)' }}>
            <button
              className={`btn-ghost ${activeTab === 'upcoming' ? 'active' : ''}`}
              style={{
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: 700,
                borderRadius: 'var(--radius-sm)',
                background: activeTab === 'upcoming' ? 'var(--bg-card)' : 'transparent',
                color: activeTab === 'upcoming' ? 'var(--text-heading)' : 'var(--text-muted)',
              }}
              onClick={() => setActiveTab('upcoming')}
            >
              Upcoming ({upcomingMeetings.length})
            </button>
            <button
              className={`btn-ghost ${activeTab === 'past' ? 'active' : ''}`}
              style={{
                padding: '5px 12px',
                fontSize: '12px',
                fontWeight: 700,
                borderRadius: 'var(--radius-sm)',
                background: activeTab === 'past' ? 'var(--bg-card)' : 'transparent',
                color: activeTab === 'past' ? 'var(--text-heading)' : 'var(--text-muted)',
              }}
              onClick={() => setActiveTab('past')}
            >
              Past ({pastMeetings.length})
            </button>
          </div>

          {isMember && (
            <button
              className="btn btn-primary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={() => setShowScheduleModal(true)}
            >
              <IconPlus size={14} />
              <span>Schedule Call</span>
            </button>
          )}
        </div>
      </div>

      {/* Meetings List */}
      {loading ? (
        <div className="empty-state"><div className="spinner"></div></div>
      ) : displayedMeetings.length === 0 ? (
        <div className="empty-state" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-md)', padding: '40px 20px' }}>
          <div className="empty-state-icon">
            <IconCalendar size={42} style={{ color: 'var(--discord-blurple)' }} />
          </div>
          <div className="empty-state-title" style={{ marginTop: 12 }}>
            {activeTab === 'upcoming' ? 'No upcoming meetings scheduled' : 'No past meetings recorded'}
          </div>
          <div className="empty-state-desc" style={{ maxWidth: '400px', margin: '6px auto 16px' }}>
            {activeTab === 'upcoming'
              ? 'Keep your workspace momentum going by scheduling a team sprint, demo, or weekly sync.'
              : 'Completed meetings and past call notes will appear here.'}
          </div>
          {isMember && activeTab === 'upcoming' && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowScheduleModal(true)}>
              Schedule First Meeting
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {displayedMeetings.map((meeting) => {
            const dateBlock = formatDateBlock(meeting.start_time);
            const timeStr = formatTimeRange(meeting.start_time, meeting.end_time);
            const relative = getRelativeBadge(meeting.start_time, meeting.end_time);
            const callUrl = meeting.meeting_url && !meeting.meeting_url.includes('jit.si')
              ? meeting.meeting_url
              : `https://meet.google.com/col-${String(meeting.id).padStart(3, '0')}-sync`;
            const isProjectAdmin = Boolean(
              project?.user_role === 'owner' ||
              project?.user_role === 'admin' ||
              project?.role === 'owner' ||
              project?.role === 'admin' ||
              project?.created_by === user?.id
            );
            const isOrganizer = Boolean(
              meeting.is_organizer ||
              meeting.organizer_id === user?.id
            );
            const canManage = isOrganizer || isProjectAdmin || isMember;

            return (
              <div
                key={meeting.id}
                className={`panel-card meeting-card ${relative.isLive ? 'is-live' : ''}`}
                style={{
                  border: relative.isLive ? '1px solid #f23f43' : '1px solid var(--border-medium)',
                  boxShadow: relative.isLive ? '0 0 14px rgba(242, 63, 67, 0.25)' : 'none',
                }}
              >
                {/* Calendar Date Block */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '64px',
                    height: '68px',
                    borderRadius: 'var(--radius-sm)',
                    background: relative.isLive ? 'rgba(242, 63, 67, 0.15)' : 'var(--bg-subtle)',
                    border: relative.isLive ? '1px solid #f23f43' : '1px solid var(--border-medium)',
                    flexShrink: 0,
                    textAlign: 'center',
                  }}
                >
                  <span style={{ fontSize: '10px', fontWeight: 800, color: relative.isLive ? '#f23f43' : 'var(--discord-blurple)', letterSpacing: '0.5px' }}>
                    {dateBlock.month}
                  </span>
                  <span style={{ fontSize: '22px', fontWeight: 900, color: 'var(--text-heading)', lineHeight: 1.1 }}>
                    {dateBlock.day}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {dateBlock.weekday}
                  </span>
                </div>

                {/* Main Content Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                    <a
                      href={callUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: '16px',
                        fontWeight: 700,
                        margin: 0,
                        color: 'var(--text-heading)',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        cursor: 'pointer',
                      }}
                      title="Direct to video meeting"
                    >
                      <span style={{ textDecoration: 'underline', textUnderlineOffset: '3px' }}>{meeting.title}</span>
                      <IconExternalLink size={13} style={{ color: 'var(--discord-blurple)' }} />
                    </a>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                        background: relative.isLive ? 'rgba(242, 63, 67, 0.2)' : 'var(--bg-subtle)',
                        color: relative.color,
                        border: relative.isLive ? '1px solid #f23f43' : '1px solid var(--border-medium)',
                      }}
                    >
                      {relative.label}
                    </span>
                  </div>

                  {/* Time */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', color: 'var(--text-muted)', marginBottom: 8 }}>
                    <IconClock size={13} />
                    <span>{timeStr}</span>
                  </div>

                  {/* Description */}
                  {meeting.description && (
                    <p style={{ fontSize: '13px', color: 'var(--text-normal)', margin: '0 0 10px', lineHeight: 1.5 }}>
                      {meeting.description}
                    </p>
                  )}

                  {/* Agenda accordion / box */}
                  {meeting.agenda && (
                    <div
                      style={{
                        background: 'var(--bg-subtle)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '10px 14px',
                        marginBottom: 12,
                        fontSize: '12px',
                        borderLeft: '3px solid var(--discord-blurple)',
                      }}
                    >
                      <div style={{ fontWeight: 700, color: 'var(--text-heading)', marginBottom: 4 }}>
                        Agenda & Discussion Topics:
                      </div>
                      <div style={{ whiteSpace: 'pre-line', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        {meeting.agenda}
                      </div>
                    </div>
                  )}

                  {/* Organizer & Attendees */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', marginTop: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', color: 'var(--text-muted)' }}>
                      <span>Host:</span>
                      <span style={{ fontWeight: 600, color: 'var(--text-heading)' }}>
                        {meeting.organizer_name || `@${meeting.organizer_alias || meeting.organizer_username}`}
                      </span>
                    </div>

                    <div style={{ width: 1, height: 12, background: 'var(--border-medium)' }} />

                    {/* Attendees avatars */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '12px', color: 'var(--text-muted)' }}>
                      <span>Attendees ({meeting.attendees?.filter(a => a.status === 'accepted').length || 0}):</span>
                      <div style={{ display: 'flex', alignItems: 'center', marginLeft: 2 }}>
                        {meeting.attendees?.slice(0, 5).map((a, idx) => (
                          <div
                            key={a.user_id}
                            title={`${a.name || a.username} (${a.status})`}
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: '50%',
                              background: a.status === 'accepted' ? 'var(--accent-green)' : 'var(--bg-subtle)',
                              color: a.status === 'accepted' ? '#fff' : 'var(--text-muted)',
                              border: '2px solid var(--bg-card)',
                              marginLeft: idx > 0 ? -6 : 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '10px',
                              fontWeight: 700,
                            }}
                          >
                            {(a.name || a.username || '?').charAt(0).toUpperCase()}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* RSVP Interactive Buttons for current user */}
                  {isMember && activeTab === 'upcoming' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Your RSVP:
                      </span>
                      <button
                        className={`btn-ghost ${meeting.user_rsvp === 'accepted' ? 'active' : ''}`}
                        style={{
                          padding: '4px 10px',
                          fontSize: '12px',
                          fontWeight: 600,
                          borderRadius: 'var(--radius-sm)',
                          background: meeting.user_rsvp === 'accepted' ? 'rgba(35, 165, 89, 0.2)' : 'var(--bg-subtle)',
                          color: meeting.user_rsvp === 'accepted' ? 'var(--accent-green)' : 'var(--text-muted)',
                          border: meeting.user_rsvp === 'accepted' ? '1px solid var(--accent-green)' : '1px solid var(--border-medium)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                        onClick={() => handleRsvp(meeting.id, 'accepted')}
                      >
                        <IconCheck size={13} />
                        <span>Attending</span>
                      </button>

                      <button
                        className={`btn-ghost ${meeting.user_rsvp === 'tentative' ? 'active' : ''}`}
                        style={{
                          padding: '4px 10px',
                          fontSize: '12px',
                          fontWeight: 600,
                          borderRadius: 'var(--radius-sm)',
                          background: meeting.user_rsvp === 'tentative' ? 'rgba(240, 178, 50, 0.2)' : 'var(--bg-subtle)',
                          color: meeting.user_rsvp === 'tentative' ? '#f0b232' : 'var(--text-muted)',
                          border: meeting.user_rsvp === 'tentative' ? '1px solid #f0b232' : '1px solid var(--border-medium)',
                        }}
                        onClick={() => handleRsvp(meeting.id, 'tentative')}
                      >
                        Maybe
                      </button>

                      <button
                        className={`btn-ghost ${meeting.user_rsvp === 'declined' ? 'active' : ''}`}
                        style={{
                          padding: '4px 10px',
                          fontSize: '12px',
                          fontWeight: 600,
                          borderRadius: 'var(--radius-sm)',
                          background: meeting.user_rsvp === 'declined' ? 'rgba(242, 63, 67, 0.2)' : 'var(--bg-subtle)',
                          color: meeting.user_rsvp === 'declined' ? 'var(--accent-red)' : 'var(--text-muted)',
                          border: meeting.user_rsvp === 'declined' ? '1px solid var(--accent-red)' : '1px solid var(--border-medium)',
                        }}
                        onClick={() => handleRsvp(meeting.id, 'declined')}
                      >
                        Declined
                      </button>
                    </div>
                  )}
                </div>

                {/* Right Call To Actions */}
                <div className="meeting-card-actions">
                  <a
                    href={callUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`btn ${activeTab === 'upcoming' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      textDecoration: 'none',
                      background: activeTab === 'upcoming'
                        ? (relative.isLive
                            ? 'linear-gradient(135deg, #f23f43, #da373c)'
                            : 'linear-gradient(135deg, var(--discord-blurple), #4752c4)')
                        : 'var(--bg-subtle)',
                      color: activeTab === 'upcoming' ? '#fff' : 'var(--text-normal)',
                      border: activeTab === 'upcoming' ? 'none' : '1px solid var(--border-medium)',
                      padding: '8px 14px',
                      borderRadius: 'var(--radius-sm)',
                      fontWeight: 700,
                      fontSize: '12px',
                      boxShadow: activeTab === 'upcoming' ? '0 2px 8px rgba(88, 101, 242, 0.3)' : 'none',
                    }}
                  >
                    <IconVideo size={14} />
                    <span>{activeTab === 'upcoming' ? (relative.isLive ? 'Join Google Meet 🔴' : 'Join Google Meet') : 'Reopen Google Meet'}</span>
                    <IconExternalLink size={12} />
                  </a>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button
                      className="btn-icon"
                      onClick={() => handleCopyLink({ id: meeting.id, meeting_url: callUrl })}
                      title={copiedId === meeting.id ? 'Copied link!' : 'Copy call link'}
                      style={{ fontSize: '11px', color: copiedId === meeting.id ? 'var(--accent-green)' : 'var(--text-muted)' }}
                    >
                      {copiedId === meeting.id ? '✓ Copied' : '🔗 Link'}
                    </button>

                    {canManage && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setMeetingToDelete(meeting)}
                        title="Delete meeting"
                        style={{
                          color: 'var(--discord-red)',
                          padding: '4px 8px',
                          fontSize: '11px',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid rgba(242, 63, 67, 0.35)',
                          background: 'rgba(242, 63, 67, 0.08)',
                        }}
                      >
                        <IconTrash size={13} />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cancel Meeting In-App Confirmation Modal */}
      {meetingToDelete && (
        <ConfirmModal
          isOpen={true}
          title="Cancel Meeting"
          message={`Are you sure you want to cancel and delete "${meetingToDelete.title}"? This will cancel the Google Meet room for all participants.`}
          confirmText="Cancel Meeting"
          confirmVariant="danger"
          onCancel={() => setMeetingToDelete(null)}
          onConfirm={async () => {
            const id = meetingToDelete.id;
            setMeetingToDelete(null);
            await handleDeleteMeeting(id);
          }}
        />
      )}

      {/* Schedule Meeting Modal */}
      {showScheduleModal && (
        <ScheduleMeetingModal
          projectId={project.id}
          members={project.members || []}
          onClose={() => setShowScheduleModal(false)}
          onMeetingScheduled={(newMeeting) => {
            setMeetings(prev => [...prev, newMeeting]);
            loadMeetings();
          }}
        />
      )}
    </div>
  );
}
