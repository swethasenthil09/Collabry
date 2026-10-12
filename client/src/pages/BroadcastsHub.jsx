import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { getSocket } from '../services/socket';
import {
  IconRadio,
  IconVideo,
  IconMic,
  IconEye,
  IconPlus,
  IconVolume,
  IconCalendar,
  IconBell,
  IconHistory,
  IconTrash,
} from '../components/common/Icons';
import GoLiveModal from '../components/live/GoLiveModal';
import LiveBroadcastPlayer from '../components/live/LiveBroadcastPlayer';

export default function BroadcastsHub() {
  const { user } = useAuth();
  const socket = getSocket();
  const [sessions, setSessions] = useState([]);
  const [activeTab, setActiveTab] = useState('live'); // 'live', 'upcoming', 'ended'
  const [filterType, setFilterType] = useState('all'); // 'all', 'video', 'voice'
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Modal & Player states
  const [showGoLiveModal, setShowGoLiveModal] = useState(false);
  const [initialModalType, setInitialModalType] = useState('video');
  const [activeSession, setActiveSession] = useState(null);
  const [activeStream, setActiveStream] = useState(null);

  useEffect(() => {
    loadSessions();
  }, [activeTab, filterType]);

  useEffect(() => {
    if (!socket) return;

    const handleStreamStarted = (newSession) => {
      if (activeTab === 'live') {
        setSessions((prev) => {
          const filtered = prev.filter((s) => s.id !== newSession.id);
          return [newSession, ...filtered];
        });
      } else if (activeTab === 'upcoming') {
        setSessions((prev) => prev.filter((s) => s.id !== newSession.id));
      }
    };

    const handleStreamEnded = ({ sessionId }) => {
      if (activeTab === 'live') {
        setSessions((prev) => prev.filter((s) => s.id != sessionId));
      } else if (activeTab === 'ended') {
        loadSessions();
      }
    };

    const handleViewerCount = ({ sessionId, count }) => {
      if (activeTab === 'live') {
        setSessions((prev) =>
          prev.map((s) => (s.id == sessionId ? { ...s, viewer_count: count } : s))
        );
      }
    };

    const handleSessionScheduled = (newSession) => {
      if (activeTab === 'upcoming') {
        setSessions((prev) => {
          const filtered = prev.filter((s) => s.id !== newSession.id);
          return [...filtered, newSession];
        });
      }
    };

    const handleScheduledStarted = ({ sessionId }) => {
      if (activeTab === 'upcoming') {
        setSessions((prev) => prev.filter((s) => s.id != sessionId));
      }
    };

    const handleSessionDeleted = ({ sessionId }) => {
      setSessions((prev) => prev.filter((s) => s.id != sessionId));
    };

    socket.on('live:stream_started', handleStreamStarted);
    socket.on('live:stream_ended', handleStreamEnded);
    socket.on('live:viewer_count', handleViewerCount);
    socket.on('live:session_scheduled', handleSessionScheduled);
    socket.on('live:scheduled_started', handleScheduledStarted);
    socket.on('live:session_deleted', handleSessionDeleted);

    return () => {
      socket.off('live:stream_started', handleStreamStarted);
      socket.off('live:stream_ended', handleStreamEnded);
      socket.off('live:viewer_count', handleViewerCount);
      socket.off('live:session_scheduled', handleSessionScheduled);
      socket.off('live:scheduled_started', handleScheduledStarted);
      socket.off('live:session_deleted', handleSessionDeleted);
    };
  }, [socket, activeTab]);

  const loadSessions = async () => {
    setLoading(true);
    try {
      let url = `/live?status=${activeTab}`;
      if (filterType !== 'all') {
        url += `&type=${filterType}`;
      }
      const res = await api.get(url);
      setSessions(res.data);
    } catch (err) {
      console.warn('Load broadcast sessions error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartBroadcast = (sessionData, stream) => {
    if (sessionData.status === 'scheduled') {
      setActiveTab('upcoming');
      loadSessions();
    } else {
      setActiveStream(stream);
      setActiveSession(sessionData);
      loadSessions();
    }
  };

  const myActiveBroadcast = user && activeTab === 'live'
    ? sessions.find((s) => String(s.host_id) === String(user.id))
    : null;

  const handleEndBroadcastById = async (sessionId) => {
    try {
      await api.post(`/live/${sessionId}/end`);
      if (activeSession?.id === sessionId) {
        if (activeStream) {
          activeStream.getTracks().forEach((t) => t.stop());
          setActiveStream(null);
        }
        setActiveSession(null);
      }
      loadSessions();
    } catch (err) {
      console.error('Failed to end stream:', err);
    }
  };

  const handleToggleRsvp = async (sessionId) => {
    try {
      const res = await api.post(`/live/${sessionId}/rsvp`);
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? { ...s, is_rsvpd: res.data.is_rsvpd, rsvp_count: res.data.rsvp_count }
            : s
        )
      );
    } catch (err) {
      console.error('RSVP error:', err);
    }
  };

  const handleStartScheduledSession = async (sessionToStart) => {
    try {
      const res = await api.post(`/live/${sessionToStart.id}/start`);
      setActiveSession(res.data);
      setActiveTab('live');
      loadSessions();
    } catch (err) {
      console.error('Failed to start scheduled session:', err);
    }
  };

  const handleDeleteSession = async (sessionId) => {
    if (!window.confirm('Are you sure you want to cancel this scheduled space?')) return;
    try {
      await api.delete(`/live/${sessionId}`);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      console.error('Delete session error:', err);
    }
  };

  const formatScheduledTime = (dateStr) => {
    if (!dateStr) return 'Soon';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));

    if (diffMs < 0) return 'Scheduled (Past)';
    if (diffHours < 1) {
      const diffMins = Math.max(1, Math.round(diffMs / (1000 * 60)));
      return `Starts in ${diffMins} min`;
    }
    if (diffHours < 24) {
      return `Today at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }
    return d.toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (seconds) => {
    if (!seconds || seconds <= 0) return 'Just started';
    const m = Math.floor(seconds / 60);
    const h = Math.floor(m / 60);
    if (h > 0) {
      return `${h}h ${m % 60}m`;
    }
    return `${m} min`;
  };

  const filteredSessions = sessions.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.title?.toLowerCase().includes(q) ||
      s.description?.toLowerCase().includes(q) ||
      s.host_name?.toLowerCase().includes(q) ||
      s.host_alias?.toLowerCase().includes(q)
    );
  });

  return (
    <>
      {/* Top Header */}
      <header
        className="main-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          background: 'var(--bg-sidebar)',
          borderBottom: '1px solid var(--border-medium)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #f02d44, #9b1d56)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 14px rgba(240, 45, 68, 0.4)',
            }}
          >
            <IconRadio size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, letterSpacing: '-0.3px' }}>
                Broadcasts & Spaces
              </h2>
              {activeTab === 'live' && (
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 800,
                    background: '#f02d44',
                    color: '#fff',
                    padding: '2px 7px',
                    borderRadius: '10px',
                    letterSpacing: '0.6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: '50%',
                      background: '#fff',
                      animation: 'pulse 1.4s infinite',
                    }}
                  />
                  LIVE
                </span>
              )}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 2 }}>
              Explore real-time video streams, interactive Twitter-style audio spaces, and upcoming sessions
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {myActiveBroadcast && (
            <button
              type="button"
              className="btn btn-danger"
              style={{
                background: 'linear-gradient(135deg, #e02424, #9b1c1c)',
                border: '1px solid rgba(255, 255, 255, 0.25)',
                color: '#fff',
                fontWeight: 800,
                fontSize: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '8px 16px',
                borderRadius: 'var(--radius-full)',
                boxShadow: '0 0 16px rgba(224, 36, 36, 0.6)',
                cursor: 'pointer',
              }}
              onClick={() => handleEndBroadcastById(myActiveBroadcast.id)}
            >
              <span style={{ width: 7, height: 7, background: '#fff', borderRadius: '1px' }} />
              <span>End My Broadcast</span>
            </button>
          )}

          <button
            className="btn btn-primary"
            style={{
              background: 'linear-gradient(135deg, #e1306c, #fd1d1d, #f56040)',
              border: 'none',
              color: '#fff',
              fontWeight: 700,
              fontSize: '13px',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: 'var(--radius-full)',
              boxShadow: '0 4px 14px rgba(225, 48, 108, 0.35)',
              cursor: 'pointer',
            }}
            onClick={() => {
              setInitialModalType('video');
              setShowGoLiveModal(true);
            }}
          >
            <IconPlus size={15} />
            <span>Go Live / Schedule</span>
          </button>
        </div>
      </header>

      {/* Main Body */}
      <main className="main-body" style={{ padding: '20px 24px' }}>
        {/* Prominent Active Broadcast Banner for Host */}
        {myActiveBroadcast && (
          <div
            style={{
              marginBottom: 24,
              padding: '16px 22px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, rgba(240, 45, 68, 0.16), rgba(155, 29, 86, 0.24))',
              border: '1px solid rgba(240, 45, 68, 0.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              flexWrap: 'wrap',
              boxShadow: '0 8px 24px rgba(240, 45, 68, 0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: '#f02d44',
                  boxShadow: '0 0 12px #f02d44',
                  animation: 'pulse 1.3s infinite',
                }}
              />
              <div>
                <div style={{ fontSize: '15px', fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>YOU ARE CURRENTLY LIVE</span>
                  <span
                    style={{
                      fontSize: '11px',
                      background: '#f02d44',
                      color: '#fff',
                      padding: '1px 7px',
                      borderRadius: '4px',
                      fontWeight: 800,
                    }}
                  >
                    HOSTING
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: 'rgba(255, 255, 255, 0.85)', marginTop: 2 }}>
                  "{myActiveBroadcast.title}" • {myActiveBroadcast.viewer_count || 1} watching now
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setActiveStream(null);
                  setActiveSession(myActiveBroadcast);
                }}
                style={{
                  borderRadius: 'var(--radius-full)',
                  fontWeight: 600,
                  padding: '7px 16px',
                }}
              >
                Open Stage
              </button>

              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => handleEndBroadcastById(myActiveBroadcast.id)}
                style={{
                  background: 'linear-gradient(135deg, #e02424, #9b1c1c)',
                  borderRadius: 'var(--radius-full)',
                  fontWeight: 800,
                  fontSize: '12px',
                  boxShadow: '0 0 16px rgba(224, 36, 36, 0.7)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 7,
                  padding: '8px 18px',
                  border: '1px solid rgba(255, 255, 255, 0.25)',
                }}
              >
                <span style={{ width: 7, height: 7, background: '#fff', borderRadius: '1px' }} />
                <span>END BROADCAST</span>
              </button>
            </div>
          </div>
        )}

        {/* Small Circle Stories Tray for Live Broadcasts */}
        {activeTab === 'live' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 16,
              padding: '4px 0 20px',
              overflowX: 'auto',
              borderBottom: '1px solid var(--border-subtle)',
              marginBottom: 20,
              scrollbarWidth: 'none',
            }}
          >
            {/* Go Live Circle */}
            <div
              onClick={() => {
                setInitialModalType('video');
                setShowGoLiveModal(true);
              }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
                minWidth: 68,
                maxWidth: 74,
                transition: 'transform 0.15s ease',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
            >
              <div
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: '50%',
                  border: '2px dashed #f02d44',
                  background: 'linear-gradient(135deg, rgba(240, 45, 68, 0.12), rgba(235, 69, 158, 0.12))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#f02d44',
                  boxShadow: '0 2px 10px rgba(240, 45, 68, 0.2)',
                }}
              >
                <IconPlus size={22} />
              </div>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-normal)', textAlign: 'center', whiteSpace: 'nowrap' }}>
                Go Live
              </span>
            </div>

            {/* Active Broadcasts as Small Circle Icons */}
            {sessions.map((stream) => {
              const isVoice = stream.session_type === 'voice';
              return (
                <div
                  key={stream.id}
                  onClick={() => {
                    setActiveStream(null);
                    setActiveSession(stream);
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    minWidth: 68,
                    maxWidth: 74,
                    transition: 'transform 0.15s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.05)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  <div
                    style={{
                      position: 'relative',
                      width: 58,
                      height: 58,
                      borderRadius: '50%',
                      padding: 2.5,
                      background: isVoice
                        ? 'linear-gradient(45deg, #23a55a, #5865f2)'
                        : 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)',
                      boxShadow: isVoice
                        ? '0 0 12px rgba(35, 165, 90, 0.45)'
                        : '0 0 12px rgba(240, 45, 68, 0.5)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: '50%',
                        border: '2px solid var(--bg-card)',
                        overflow: 'hidden',
                        background: '#1a1b23',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '18px',
                        fontWeight: 700,
                        color: '#fff',
                      }}
                    >
                      {stream.host_avatar ? (
                        <img
                          src={stream.host_avatar}
                          alt={stream.host_name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        stream.host_name?.charAt(0)?.toUpperCase() || 'L'
                      )}
                    </div>

                    <div
                      style={{
                        position: 'absolute',
                        bottom: -5,
                        background: isVoice ? '#23a55a' : '#f02d44',
                        color: '#fff',
                        fontSize: '8.5px',
                        fontWeight: 800,
                        padding: '1px 5px',
                        borderRadius: '4px',
                        letterSpacing: '0.4px',
                        border: '1.5px solid var(--bg-card)',
                        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.5)',
                      }}
                    >
                      LIVE
                    </div>
                  </div>

                  <div style={{ textAlign: 'center', width: '100%' }}>
                    <div
                      style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: 'var(--text-normal)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {stream.host_name}
                    </div>
                    <div
                      style={{
                        fontSize: '10px',
                        color: 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {stream.title}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Primary View Switcher Tabs: Live Now vs Upcoming Spaces vs Past Replays */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
            gap: 16,
            flexWrap: 'wrap',
            borderBottom: '1px solid var(--border-medium)',
            paddingBottom: 14,
          }}
        >
          {/* Main Category Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              type="button"
              className={`btn ${activeTab === 'live' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('live')}
              style={{
                borderRadius: 'var(--radius-full)',
                padding: '8px 18px',
                fontSize: '13px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                background: activeTab === 'live' ? 'linear-gradient(135deg, #f02d44, #9b1d56)' : undefined,
                color: activeTab === 'live' ? '#fff' : undefined,
              }}
            >
              <IconRadio size={15} />
              <span>Live Now</span>
            </button>

            <button
              type="button"
              className={`btn ${activeTab === 'upcoming' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('upcoming')}
              style={{
                borderRadius: 'var(--radius-full)',
                padding: '8px 18px',
                fontSize: '13px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                background: activeTab === 'upcoming' ? 'var(--discord-blurple)' : undefined,
                color: activeTab === 'upcoming' ? '#fff' : undefined,
              }}
            >
              <IconCalendar size={15} />
              <span>Upcoming Spaces</span>
            </button>

            <button
              type="button"
              className={`btn ${activeTab === 'ended' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('ended')}
              style={{
                borderRadius: 'var(--radius-full)',
                padding: '8px 18px',
                fontSize: '13px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                background: activeTab === 'ended' ? '#4f545c' : undefined,
                color: activeTab === 'ended' ? '#fff' : undefined,
              }}
            >
              <IconHistory size={15} />
              <span>Past Replays</span>
            </button>
          </div>

          {/* Subfilter pills: All, Video Streams, Audio Spaces */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'var(--bg-subtle)',
              padding: '3px',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <button
              type="button"
              className={`btn btn-sm ${filterType === 'all' ? 'btn-primary' : 'btn-ghost'}`}
              style={{
                borderRadius: 'var(--radius-full)',
                padding: '5px 14px',
                fontSize: '12px',
                fontWeight: 600,
                border: 'none',
              }}
              onClick={() => setFilterType('all')}
            >
              All
            </button>
            <button
              type="button"
              className={`btn btn-sm ${filterType === 'video' ? 'btn-primary' : 'btn-ghost'}`}
              style={{
                borderRadius: 'var(--radius-full)',
                padding: '5px 14px',
                fontSize: '12px',
                fontWeight: 600,
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
              onClick={() => setFilterType('video')}
            >
              <IconVideo size={13} />
              <span>Video</span>
            </button>
            <button
              type="button"
              className={`btn btn-sm ${filterType === 'voice' ? 'btn-primary' : 'btn-ghost'}`}
              style={{
                borderRadius: 'var(--radius-full)',
                padding: '5px 14px',
                fontSize: '12px',
                fontWeight: 600,
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
              onClick={() => setFilterType('voice')}
            >
              <IconMic size={13} />
              <span>Audio</span>
            </button>
          </div>

          {/* Search Box */}
          <div style={{ minWidth: 220 }}>
            <input
              type="text"
              placeholder="Search by topic or host..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="form-control"
              style={{
                padding: '7px 14px',
                fontSize: '13px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-medium)',
                color: 'var(--text-normal)',
                width: '100%',
              }}
            />
          </div>
        </div>

        {/* Content list based on active tab */}
        {loading ? (
          <div className="empty-state">
            <div className="spinner"></div>
          </div>
        ) : filteredSessions.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredSessions.map((s) => {
              const isVoice = s.session_type === 'voice';
              const isHost = user && String(s.host_id) === String(user.id);

              return (
                <div
                  key={s.id}
                  style={{
                    background: 'var(--bg-card)',
                    borderRadius: '16px',
                    border: '1px solid var(--border-subtle)',
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    flexWrap: 'wrap',
                    transition: 'all 0.2s ease',
                    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.2)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor =
                      activeTab === 'live'
                        ? isVoice ? 'var(--discord-green)' : '#f02d44'
                        : activeTab === 'upcoming' ? 'var(--discord-blurple)' : 'var(--border-medium)';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-subtle)';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                >
                  {/* Left: Avatar & Session Badges */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div
                      style={{
                        position: 'relative',
                        width: 52,
                        height: 52,
                        borderRadius: '50%',
                        padding: 2.5,
                        background:
                          activeTab === 'live'
                            ? isVoice
                              ? 'linear-gradient(45deg, #23a55a, #5865f2)'
                              : 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)'
                            : activeTab === 'upcoming'
                            ? 'linear-gradient(45deg, #5865f2, #3b82f6)'
                            : '#36393f',
                        boxShadow:
                          activeTab === 'live'
                            ? isVoice
                              ? '0 0 10px rgba(35, 165, 90, 0.4)'
                              : '0 0 10px rgba(240, 45, 68, 0.45)'
                            : 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          borderRadius: '50%',
                          overflow: 'hidden',
                          background: '#1a1b23',
                          border: '2px solid var(--bg-card)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '18px',
                          fontWeight: 700,
                          color: '#fff',
                        }}
                      >
                        {s.host_avatar ? (
                          <img
                            src={s.host_avatar}
                            alt={s.host_name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          s.host_name?.charAt(0)?.toUpperCase() || 'H'
                        )}
                      </div>

                      {/* Status pill overlay */}
                      <div
                        style={{
                          position: 'absolute',
                          bottom: -4,
                          background:
                            activeTab === 'live'
                              ? isVoice ? '#23a55a' : '#f02d44'
                              : activeTab === 'upcoming'
                              ? '#5865f2'
                              : '#72767d',
                          color: '#fff',
                          fontSize: '8px',
                          fontWeight: 800,
                          padding: '1px 5px',
                          borderRadius: '4px',
                          letterSpacing: '0.4px',
                          border: '1.5px solid var(--bg-card)',
                        }}
                      >
                        {activeTab === 'live'
                          ? 'LIVE'
                          : activeTab === 'upcoming'
                          ? 'SOON'
                          : 'ENDED'}
                      </div>
                    </div>

                    {/* Middle Info */}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-heading)' }}>
                          {s.title}
                        </h4>
                        <span
                          style={{
                            background: isVoice ? 'rgba(35, 165, 93, 0.15)' : 'rgba(240, 45, 68, 0.15)',
                            color: isVoice ? 'var(--discord-green)' : '#f02d44',
                            border: isVoice ? '1px solid rgba(35, 165, 93, 0.3)' : '1px solid rgba(240, 45, 68, 0.3)',
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '1px 7px',
                            borderRadius: '10px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          {isVoice ? <IconMic size={10} /> : <IconVideo size={10} />}
                          <span>{isVoice ? 'Audio Space' : 'Live Stream'}</span>
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontSize: '12px', color: 'var(--text-muted)' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-normal)' }}>{s.host_name}</span>
                        <span>@{s.host_alias || s.host_username}</span>
                        <span>•</span>

                        {activeTab === 'live' && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <IconEye size={12} />
                            <span>{s.viewer_count || 1} watching</span>
                          </span>
                        )}

                        {activeTab === 'upcoming' && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--discord-blurple)', fontWeight: 600 }}>
                            <IconCalendar size={12} />
                            <span>{formatScheduledTime(s.scheduled_for)}</span>
                            <span>•</span>
                            <span style={{ color: 'var(--text-muted)' }}>{s.rsvp_count || 0} RSVPs</span>
                          </span>
                        )}

                        {activeTab === 'ended' && (
                          <span>
                            Ended • Duration: {formatDuration(s.duration_seconds)}
                          </span>
                        )}
                      </div>

                      {s.description && (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 2 }}>
                          {s.description}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Actions */}
                  <div style={{ flexShrink: 0 }}>
                    {activeTab === 'live' ? (
                      isHost ? (
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ borderRadius: 'var(--radius-full)', fontWeight: 600, padding: '8px 16px' }}
                            onClick={() => {
                              setActiveStream(null);
                              setActiveSession(s);
                            }}
                          >
                            Resume
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            style={{
                              borderRadius: 'var(--radius-full)',
                              fontWeight: 800,
                              fontSize: '12px',
                              background: 'linear-gradient(135deg, #e02424, #9b1c1c)',
                              boxShadow: '0 0 12px rgba(224, 36, 36, 0.45)',
                              border: '1px solid rgba(255, 255, 255, 0.2)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '8px 16px',
                            }}
                            onClick={() => handleEndBroadcastById(s.id)}
                          >
                            <span style={{ width: 6, height: 6, background: '#fff', borderRadius: '1px' }} />
                            <span>End Stream</span>
                          </button>
                        </div>
                      ) : (
                        <button
                          className="btn btn-primary btn-sm"
                          style={{
                            background: isVoice ? 'var(--discord-blurple)' : 'linear-gradient(135deg, #f02d44, #9b1d56)',
                            border: 'none',
                            fontWeight: 700,
                            fontSize: '12px',
                            borderRadius: 'var(--radius-full)',
                            padding: '8px 20px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                          }}
                          onClick={() => {
                            setActiveStream(null);
                            setActiveSession(s);
                          }}
                        >
                          {isVoice ? <IconVolume size={14} /> : <IconVideo size={14} />}
                          <span>{isVoice ? 'Listen Now' : 'Watch Stream'}</span>
                        </button>
                      )
                    ) : activeTab === 'upcoming' ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {isHost ? (
                          <>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              style={{
                                borderRadius: 'var(--radius-full)',
                                padding: '8px 18px',
                                fontWeight: 700,
                                fontSize: '12px',
                                background: 'linear-gradient(135deg, #23a55a, #5865f2)',
                                border: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                              }}
                              onClick={() => handleStartScheduledSession(s)}
                            >
                              <IconRadio size={14} />
                              <span>Start Space Now</span>
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{ borderRadius: 'var(--radius-full)', padding: '8px 12px', color: 'var(--discord-red)' }}
                              onClick={() => handleDeleteSession(s.id)}
                              title="Cancel scheduled space"
                            >
                              <IconTrash size={14} />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className={`btn btn-sm ${s.is_rsvpd ? 'btn-primary' : 'btn-secondary'}`}
                            style={{
                              borderRadius: 'var(--radius-full)',
                              padding: '8px 18px',
                              fontWeight: 700,
                              fontSize: '12px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 6,
                              background: s.is_rsvpd ? 'var(--discord-blurple)' : undefined,
                              color: s.is_rsvpd ? '#fff' : undefined,
                            }}
                            onClick={() => handleToggleRsvp(s.id)}
                          >
                            <IconBell size={14} filled={Boolean(s.is_rsvpd)} />
                            <span>{s.is_rsvpd ? 'Reminder Set' : 'Set Reminder'}</span>
                          </button>
                        )}
                      </div>
                    ) : (
                      /* Past Replay Item */
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          Concluded
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Empty State */
          <div
            style={{
              padding: '64px 24px',
              textAlign: 'center',
              background: 'var(--bg-card)',
              borderRadius: '20px',
              border: '1px solid var(--border-subtle)',
              maxWidth: 480,
              margin: '40px auto',
            }}
          >
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: '50%',
                background:
                  activeTab === 'live'
                    ? 'rgba(240, 45, 68, 0.1)'
                    : activeTab === 'upcoming'
                    ? 'rgba(88, 101, 242, 0.1)'
                    : 'rgba(114, 118, 125, 0.1)',
                color:
                  activeTab === 'live'
                    ? '#f02d44'
                    : activeTab === 'upcoming'
                    ? 'var(--discord-blurple)'
                    : 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              {activeTab === 'live' ? (
                <IconRadio size={30} />
              ) : activeTab === 'upcoming' ? (
                <IconCalendar size={30} />
              ) : (
                <IconHistory size={30} />
              )}
            </div>
            <h3 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 700 }}>
              {activeTab === 'live'
                ? 'No Active Broadcasts Right Now'
                : activeTab === 'upcoming'
                ? 'No Upcoming Spaces Scheduled'
                : 'No Past Broadcast Replays'}
            </h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 20px 0', lineHeight: 1.5 }}>
              {activeTab === 'live'
                ? 'Be the first to start a video stream or host a Twitter/Clubhouse style audio space.'
                : activeTab === 'upcoming'
                ? 'Schedule an upcoming discussion, AMA, or workshop for your community.'
                : 'Concluded live broadcasts and audio spaces will appear here.'}
            </p>
            <button
              className="btn btn-primary"
              style={{
                background:
                  activeTab === 'upcoming'
                    ? 'var(--discord-blurple)'
                    : 'linear-gradient(135deg, #f02d44, #9b1d56)',
                borderRadius: 'var(--radius-full)',
                padding: '9px 22px',
                fontWeight: 700,
                fontSize: '13px',
              }}
              onClick={() => {
                setInitialModalType(filterType === 'voice' ? 'voice' : 'video');
                setShowGoLiveModal(true);
              }}
            >
              <IconPlus size={15} />
              <span>{activeTab === 'upcoming' ? 'Schedule a Space' : 'Start Broadcast'}</span>
            </button>
          </div>
        )}
      </main>

      {/* Go Live & Schedule Modal */}
      {showGoLiveModal && (
        <GoLiveModal
          isOpen={true}
          initialSessionType={initialModalType}
          onClose={() => setShowGoLiveModal(false)}
          onStreamStarted={handleStartBroadcast}
        />
      )}

      {/* Live Broadcast & Audio Spaces Player */}
      {activeSession && (
        <LiveBroadcastPlayer
          session={activeSession}
          localStream={activeStream}
          onClose={() => {
            setActiveSession(null);
            setActiveStream(null);
          }}
          onEnded={() => {
            loadSessions();
          }}
        />
      )}
    </>
  );
}
