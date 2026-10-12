import { useState, useRef, useEffect } from 'react';
import api from '../../services/api';
import {
  IconRadio,
  IconX,
  IconVideo,
  IconScreenShare,
  IconMic,
  IconCalendar,
} from '../common/Icons';

export default function GoLiveModal({ isOpen, initialSessionType = 'video', onClose, onStreamStarted }) {
  const [sessionType, setSessionType] = useState(initialSessionType); // 'video' or 'voice'
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sourceType, setSourceType] = useState('camera'); // 'camera' or 'screen'
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledFor, setScheduledFor] = useState(() => {
    const d = new Date(Date.now() + 3600000);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [previewActive, setPreviewActive] = useState(false);

  const videoPreviewRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    setSessionType(initialSessionType);
  }, [initialSessionType]);

  useEffect(() => {
    if (isOpen && !isScheduled) {
      if (sessionType === 'video') {
        startPreview(sourceType);
      } else {
        startVoicePreview();
      }
    } else {
      stopPreview();
    }
    return () => {
      stopPreview();
    };
  }, [isOpen, sessionType, sourceType, isScheduled]);

  const startPreview = async (type) => {
    stopPreview();
    setError('');
    try {
      let stream = null;
      if (type === 'camera') {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      } else {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      }
      streamRef.current = stream;
      if (videoPreviewRef.current) {
        videoPreviewRef.current.srcObject = stream;
      }
      setPreviewActive(true);
    } catch (err) {
      console.warn('Media preview error:', err);
      setError('Camera or screen access was denied or unavailable.');
      setPreviewActive(false);
    }
  };

  const startVoicePreview = async () => {
    stopPreview();
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;
      setPreviewActive(true);
    } catch (err) {
      console.warn('Microphone error:', err);
      setError('Microphone access was denied or unavailable.');
      setPreviewActive(false);
    }
  };

  const stopPreview = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setPreviewActive(false);
  };

  const setPresetTime = (hoursFromNow) => {
    const d = new Date(Date.now() + hoursFromNow * 3600000);
    setScheduledFor(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  };

  const handleStartBroadcast = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please provide a broadcast title.');
      return;
    }

    if (isScheduled && !scheduledFor) {
      setError('Please choose a date and time for the scheduled session.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const payload = {
        title: title.trim(),
        description: description.trim(),
        session_type: sessionType,
        is_scheduled: isScheduled,
        scheduled_for: isScheduled ? new Date(scheduledFor).toISOString() : null,
      };

      const res = await api.post('/live', payload);

      if (isScheduled) {
        onStreamStarted?.(res.data, null);
        onClose();
      } else {
        const activeStream = streamRef.current;
        streamRef.current = null; // Do not stop tracks on modal close
        onStreamStarted?.(res.data, activeStream);
        onClose();
      }
    } catch (err) {
      console.error('Failed to start broadcast:', err);
      setError(err.response?.data?.message || err.response?.data?.error?.message || 'Failed to start live session.');
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-medium)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
          width: '100%',
          maxWidth: 620,
          maxHeight: '92vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border-medium)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-secondary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background:
                  sessionType === 'voice'
                    ? 'rgba(59, 165, 93, 0.15)'
                    : 'rgba(242, 63, 67, 0.15)',
                color: sessionType === 'voice' ? 'var(--discord-green)' : 'var(--discord-red)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isScheduled ? (
                <IconCalendar size={20} />
              ) : sessionType === 'voice' ? (
                <IconMic size={20} />
              ) : (
                <IconRadio size={20} />
              )}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
                {isScheduled
                  ? `Schedule ${sessionType === 'voice' ? 'Audio Space' : 'Live Video'}`
                  : sessionType === 'voice'
                  ? 'Start Voice Space'
                  : 'Go Live (Video / Screen)'}
              </h3>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {isScheduled
                  ? 'Plan an upcoming session and invite your community to RSVP'
                  : sessionType === 'voice'
                  ? 'Host an interactive Clubhouse-style audio space forum'
                  : 'Broadcast camera or screen to community members in real-time'}
              </div>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            <IconX size={20} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleStartBroadcast} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && (
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(242, 63, 67, 0.12)',
                color: 'var(--discord-red)',
                fontSize: '13px',
              }}
            >
              {error}
            </div>
          )}

          {/* Timing Switcher: Now vs Schedule */}
          <div style={{ display: 'flex', gap: 8, background: 'var(--bg-subtle)', padding: 4, borderRadius: 'var(--radius-md)' }}>
            <button
              type="button"
              className={`btn ${!isScheduled ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setIsScheduled(false)}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: '13px', fontWeight: 600 }}
            >
              <IconRadio size={15} />
              <span>Go Live Now</span>
            </button>
            <button
              type="button"
              className={`btn ${isScheduled ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setIsScheduled(true)}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: '13px', fontWeight: 600 }}
            >
              <IconCalendar size={15} />
              <span>Schedule For Later</span>
            </button>
          </div>

          {/* Mode Switcher: Video vs Voice */}
          <div style={{ display: 'flex', gap: 8, background: 'var(--bg-subtle)', padding: 4, borderRadius: 'var(--radius-md)' }}>
            <button
              type="button"
              className={`btn ${sessionType === 'video' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setSessionType('video')}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: '13px', fontWeight: 600 }}
            >
              <IconVideo size={16} />
              <span>Live Video</span>
            </button>
            <button
              type="button"
              className={`btn ${sessionType === 'voice' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setSessionType('voice')}
              style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: '13px', fontWeight: 600 }}
            >
              <IconMic size={16} />
              <span>Audio Space</span>
            </button>
          </div>

          {/* Schedule Date & Time Picker */}
          {isScheduled && (
            <div
              style={{
                padding: '14px 16px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-medium)',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                📅 Scheduled Date & Time
              </label>
              <input
                type="datetime-local"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                className="form-control"
                style={{
                  width: '100%',
                  padding: '10px 14px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-medium)',
                  color: 'var(--text-normal)',
                  fontSize: '14px',
                }}
                required
              />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setPresetTime(1)}
                  style={{ fontSize: '11px', padding: '4px 10px' }}
                >
                  +1 Hour
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setPresetTime(3)}
                  style={{ fontSize: '11px', padding: '4px 10px' }}
                >
                  +3 Hours
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setPresetTime(24)}
                  style={{ fontSize: '11px', padding: '4px 10px' }}
                >
                  Tomorrow
                </button>
              </div>
            </div>
          )}

          {/* Media Preview Box (Only when Going Live Now) */}
          {!isScheduled && (
            sessionType === 'video' ? (
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: 180,
                  borderRadius: 'var(--radius-md)',
                  background: '#090a0f',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <video
                  ref={videoPreviewRef}
                  autoPlay
                  muted
                  playsInline
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: sourceType === 'camera' ? 'cover' : 'contain',
                    display: previewActive ? 'block' : 'none',
                  }}
                />
                {!previewActive && (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 20 }}>
                    <IconVideo size={32} style={{ marginBottom: 8, opacity: 0.5 }} />
                    <div style={{ fontSize: '13px' }}>Camera/Screen preview loading...</div>
                  </div>
                )}
                <div
                  style={{
                    position: 'absolute',
                    top: 10,
                    left: 10,
                    background: 'rgba(0, 0, 0, 0.7)',
                    color: '#fff',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: previewActive ? 'var(--discord-green)' : 'var(--discord-red)',
                    }}
                  />
                  VIDEO PREVIEW
                </div>
              </div>
            ) : (
              <div
                style={{
                  width: '100%',
                  height: 100,
                  borderRadius: 'var(--radius-md)',
                  background: 'linear-gradient(135deg, rgba(59, 165, 93, 0.1), rgba(88, 101, 242, 0.1))',
                  border: '1px solid var(--discord-green)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    background: 'var(--discord-green)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 0 15px rgba(59, 165, 93, 0.5)',
                  }}
                >
                  <IconMic size={20} />
                </div>
                <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-normal)' }}>
                  Microphone Ready • Audio Space
                </span>
              </div>
            )
          )}

          {/* Source Toggle for Live Video */}
          {!isScheduled && sessionType === 'video' && (
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                className={`btn ${sourceType === 'camera' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSourceType('camera')}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: '13px' }}
              >
                <IconVideo size={16} />
                <span>Webcam & Mic</span>
              </button>
              <button
                type="button"
                className={`btn ${sourceType === 'screen' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSourceType('screen')}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: '13px' }}
              >
                <IconScreenShare size={16} />
                <span>Screen Share & Mic</span>
              </button>
            </div>
          )}

          {/* Title */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>
              Broadcast Title *
            </label>
            <input
              type="text"
              placeholder={sessionType === 'voice' ? 'e.g. Open Dev Q&A | AI Agents Discussion Space' : 'e.g. Building a live app | Pair programming walkthrough'}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="form-control"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-medium)',
                color: 'var(--text-normal)',
                fontSize: '14px',
              }}
              required
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase' }}>
              Topic / Agenda
            </label>
            <textarea
              placeholder="What are we discussing or streaming? (Optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="form-control"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-medium)',
                color: 'var(--text-normal)',
                fontSize: '13px',
                resize: 'none',
              }}
            />
          </div>

          {/* Footer Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn"
              disabled={loading}
              style={{
                background: isScheduled
                  ? 'linear-gradient(135deg, #5865f2, #3b82f6)'
                  : sessionType === 'voice'
                  ? 'linear-gradient(135deg, #23a55a, #5865f2)'
                  : 'linear-gradient(135deg, #f02d44, #9b1d56)',
                color: '#fff',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 22px',
                borderRadius: 'var(--radius-md)',
                boxShadow: isScheduled
                  ? '0 4px 15px rgba(88, 101, 242, 0.4)'
                  : sessionType === 'voice'
                  ? '0 4px 15px rgba(35, 165, 90, 0.4)'
                  : '0 4px 15px rgba(240, 45, 68, 0.4)',
              }}
            >
              {isScheduled ? (
                <IconCalendar size={16} />
              ) : sessionType === 'voice' ? (
                <IconMic size={16} />
              ) : (
                <IconRadio size={16} />
              )}
              <span>
                {loading
                  ? 'Processing...'
                  : isScheduled
                  ? 'Schedule Broadcast'
                  : sessionType === 'voice'
                  ? 'Start Audio Space'
                  : 'Go Live'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
