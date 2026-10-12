import { useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import { IconCalendar, IconClock, IconX, IconSparkles } from '../common/Icons';

export default function ScheduleMeetingModal({ projectId, members = [], onClose, onMeetingScheduled }) {
  const pad = (n) => String(n).padStart(2, '0');
  const toLocalInputString = (d) => {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const toSqlDateString = (d) => {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  // Default start time: nearest upcoming hour in local time
  const defaultDate = new Date();
  defaultDate.setHours(defaultDate.getHours() + 1, 0, 0, 0);
  const defaultDateStr = toLocalInputString(defaultDate);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState(defaultDateStr);
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [meetingUrl, setMeetingUrl] = useState('');
  const [agenda, setAgenda] = useState('');
  const [selectedAttendees, setSelectedAttendees] = useState(members.map(m => m.user_id || m.id));
  const [loading, setLoading] = useState(false);
  const [generatingUrl, setGeneratingUrl] = useState(false);
  const [error, setError] = useState('');

  const handleGenerateGoogleMeet = async () => {
    setGeneratingUrl(true);
    try {
      const res = await api.post(`/projects/${projectId}/meetings/generate-url`, {
        title: title || 'Collabry Team Meeting',
      });
      if (res.data?.meeting_url) {
        setMeetingUrl(res.data.meeting_url);
      }
    } catch (err) {
      console.warn('API generate meet error, opening meet.google.com/new:', err);
      window.open('https://meet.google.com/new', '_blank');
    } finally {
      setGeneratingUrl(false);
    }
  };

  const toggleAttendee = (userId) => {
    setSelectedAttendees(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!title.trim()) {
      setError('Meeting title is required');
      return;
    }

    if (!startTime) {
      setError('Start date and time are required');
      return;
    }

    setLoading(true);
    try {
      const [datePart, timePart] = startTime.split('T');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hour, minute] = timePart.split(':').map(Number);
      const start = new Date(year, month - 1, day, hour, minute, 0);
      const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        start_time: toSqlDateString(start),
        end_time: toSqlDateString(end),
        meeting_url: meetingUrl.trim() || null,
        agenda: agenda.trim() || null,
        attendee_ids: selectedAttendees,
      };

      const res = await api.post(`/projects/${projectId}/meetings`, payload);
      onMeetingScheduled?.(res.data);
      onClose();
    } catch (err) {
      console.error('Schedule meeting error:', err);
      setError(err.response?.data?.error?.message || 'Failed to schedule meeting');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        zIndex: 99999,
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(5px)',
        padding: 16,
      }}
    >
      <div
        className="modal"
        style={{
          maxWidth: '580px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          width: '100%',
          margin: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <div className="modal-title">
            <IconCalendar size={20} style={{ color: 'var(--discord-blurple)' }} />
            <span>Schedule Team Meeting</span>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <IconX size={18} />
          </button>
        </div>

        {/* Form Container with Flex Columns */}
        <form
          onSubmit={handleSubmit}
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* Scrollable Form Body */}
          <div
            className="modal-body"
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              padding: '20px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            {error && <div className="error-msg">{error}</div>}

            {/* Title */}
            <div className="form-group">
              <label htmlFor="meeting-title" style={{ fontWeight: 600, fontSize: '13px' }}>
                Meeting Title *
              </label>
              <input
                id="meeting-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Sprint Sync, Architecture Review, Design Jam..."
                autoFocus
                required
              />
            </div>

            {/* Start Time & Duration in 2 cols */}
            <div className="form-grid-2">
              <div className="form-group">
                <label htmlFor="meeting-start" style={{ fontWeight: 600, fontSize: '13px' }}>
                  Start Date & Time *
                </label>
                <input
                  id="meeting-start"
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="meeting-duration" style={{ fontWeight: 600, fontSize: '13px' }}>
                  Duration
                </label>
                <select
                  id="meeting-duration"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>1 hour</option>
                  <option value={90}>1.5 hours</option>
                  <option value={120}>2 hours</option>
                </select>
              </div>
            </div>

            {/* Video Meeting Link with 1-Click Google Meet Generator */}
            <div className="form-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                <label htmlFor="meeting-url" style={{ margin: 0, fontWeight: 600, fontSize: '13px' }}>
                  Google Meet URL
                </label>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <button
                    type="button"
                    onClick={handleGenerateGoogleMeet}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--discord-blurple)',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <IconSparkles size={12} />
                    <span>⚡ Generate Google Meet Link</span>
                  </button>
                  <a
                    href="https://meet.google.com/new"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: '11px',
                      color: 'var(--accent-green)',
                      textDecoration: 'none',
                      fontWeight: 600,
                    }}
                    title="Open Google Meet in a new tab to start an instant meeting"
                  >
                    meet.google.com/new ↗
                  </a>
                </div>
              </div>
              <input
                id="meeting-url"
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                placeholder="https://meet.google.com/abc-defg-hij or auto-generate with 1-click above"
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Directly opens in Google Meet. Click "Generate Google Meet Link" or leave blank to auto-create.
              </span>
            </div>

            {/* Agenda Notes */}
            <div className="form-group">
              <label htmlFor="meeting-agenda" style={{ fontWeight: 600, fontSize: '13px' }}>
                Agenda & Discussion Topics
              </label>
              <textarea
                id="meeting-agenda"
                rows={3}
                value={agenda}
                onChange={(e) => setAgenda(e.target.value)}
                placeholder="1. Review recent progress&#10;2. Blockers and sprint targets&#10;3. Next milestone"
              />
            </div>

            {/* Attendees Selection */}
            {members.length > 0 && (
              <div className="form-group">
                <label style={{ fontWeight: 600, fontSize: '13px' }}>
                  Invite Team Members ({selectedAttendees.length} selected)
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: '110px', overflowY: 'auto', padding: '4px 0' }}>
                  {members.map((m) => {
                    const uId = m.user_id || m.id;
                    const isSelected = selectedAttendees.includes(uId);
                    return (
                      <div
                        key={uId}
                        onClick={() => toggleAttendee(uId)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 10px',
                          borderRadius: 'var(--radius-full)',
                          fontSize: '12px',
                          cursor: 'pointer',
                          background: isSelected ? 'var(--discord-blurple)' : 'var(--bg-subtle)',
                          color: isSelected ? '#fff' : 'var(--text-muted)',
                          border: isSelected ? '1px solid transparent' : '1px solid var(--border-medium)',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: '50%',
                            background: isSelected ? 'rgba(255,255,255,0.2)' : 'var(--border-medium)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '9px',
                            fontWeight: 700,
                          }}
                        >
                          {(m.name || m.username || '?').charAt(0).toUpperCase()}
                        </div>
                        <span>{m.name || `@${m.alias || m.username}`}</span>
                        {isSelected && <span style={{ fontSize: '10px' }}>✓</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Always Visible Fixed Footer */}
          <div
            className="modal-footer"
            style={{
              flexShrink: 0,
              padding: '16px 24px',
              background: 'var(--bg-modal-header)',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 12,
            }}
          >
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={loading}
              style={{ padding: '8px 16px', fontSize: '13px' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{
                padding: '8px 20px',
                fontSize: '13px',
                fontWeight: 700,
                background: 'linear-gradient(135deg, var(--discord-blurple), #4752c4)',
                boxShadow: '0 2px 8px rgba(88, 101, 242, 0.4)',
              }}
            >
              {loading ? 'Scheduling...' : '✓ Schedule Meeting'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
