import { useState, useEffect } from 'react';
import api from '../../services/api';
import { getSocket } from '../../services/socket';
import { IconPlus } from '../common/Icons';
import GoLiveModal from './GoLiveModal';
import LiveBroadcastPlayer from './LiveBroadcastPlayer';

export default function LiveStoriesBar({ communityId }) {
  const socket = getSocket();
  const [sessions, setSessions] = useState([]);
  const [showGoLiveModal, setShowGoLiveModal] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  const [activeStream, setActiveStream] = useState(null);

  useEffect(() => {
    loadLiveSessions();
  }, [communityId]);

  useEffect(() => {
    if (!socket) return;

    const handleStreamStarted = (newSession) => {
      setSessions((prev) => {
        const filtered = prev.filter((s) => s.id !== newSession.id);
        return [newSession, ...filtered];
      });
    };

    const handleStreamEnded = ({ sessionId }) => {
      setSessions((prev) => prev.filter((s) => s.id != sessionId));
    };

    const handleViewerCount = ({ sessionId, count }) => {
      setSessions((prev) =>
        prev.map((s) => (s.id == sessionId ? { ...s, viewer_count: count } : s))
      );
    };

    socket.on('live:stream_started', handleStreamStarted);
    socket.on('live:stream_ended', handleStreamEnded);
    socket.on('live:viewer_count', handleViewerCount);

    return () => {
      socket.off('live:stream_started', handleStreamStarted);
      socket.off('live:stream_ended', handleStreamEnded);
      socket.off('live:viewer_count', handleViewerCount);
    };
  }, [socket]);

  const loadLiveSessions = async () => {
    try {
      const url = communityId ? `/live?community_id=${communityId}` : '/live';
      const res = await api.get(url);
      setSessions(res.data);
    } catch (err) {
      console.warn('Load live sessions error:', err);
    }
  };

  const handleStartStream = (newSession, mediaStream) => {
    setActiveStream(mediaStream);
    setActiveSession(newSession);
    loadLiveSessions();
  };

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 16,
          padding: '8px 4px 16px',
          overflowX: 'auto',
          scrollbarWidth: 'none',
        }}
      >
        {/* "+ Go Live" Small Circle Icon */}
        <div
          onClick={() => setShowGoLiveModal(true)}
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
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--text-normal)',
              textAlign: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            Go Live
          </span>
        </div>

        {/* Active Stream Small Circle Icons (Instagram Stories / Live Style) */}
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
              {/* Glowing Story Avatar Ring */}
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
                {/* Inner Avatar */}
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

                {/* Overlapping Bottom "LIVE" Badge */}
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

              {/* Host and Title Label */}
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
                  title={stream.host_name}
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
                  title={stream.title}
                >
                  {stream.title}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Go Live Setup Modal */}
      {showGoLiveModal && (
        <GoLiveModal
          isOpen={true}
          onClose={() => setShowGoLiveModal(false)}
          onStreamStarted={handleStartStream}
        />
      )}

      {/* Live Stream Player */}
      {activeSession && (
        <LiveBroadcastPlayer
          session={activeSession}
          localStream={activeStream}
          onClose={() => {
            setActiveSession(null);
            setActiveStream(null);
          }}
          onEnded={() => {
            loadLiveSessions();
          }}
        />
      )}
    </>
  );
}
