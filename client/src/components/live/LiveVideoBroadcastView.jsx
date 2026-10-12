import { useState } from 'react';
import {
  IconX,
  IconEye,
  IconMic,
  IconMicOff,
  IconVolume,
  IconVolumeOff,
  IconScreenShare,
  IconChat,
  IconRadio,
  IconTrash,
} from '../common/Icons';

export default function LiveVideoBroadcastView({
  session,
  user,
  isHost,
  isMuted,
  isSharingScreen,
  streamQuality = '1080p 60fps',
  setStreamQuality,
  audioQuality = 'HQ (320 kbps)',
  setAudioQuality,
  duration,
  actualParticipantCount,
  videoRef,
  messages,
  chatInput,
  setChatInput,
  chatScrollRef,
  reactions,
  streamEnded,
  isRemovedByHost,
  onClose,
  handleEndBroadcast,
  handleToggleMute,
  handleToggleScreenShare,
  handleRemoveUser,
  handleSendChat,
  handleSendReaction,
}) {
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0, 0, 0, 0.92)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1200px',
          height: '88vh',
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-medium)',
          display: 'flex',
          overflow: 'hidden',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left Video Stage */}
        <div
          style={{
            flex: 1,
            position: 'relative',
            background: '#040508',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Top Stage Bar */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              zIndex: 10,
              padding: '16px 20px',
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  background: 'var(--discord-red)',
                  color: '#fff',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '11px',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  letterSpacing: '0.5px',
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: '#fff',
                    animation: 'pulse 1.5s infinite',
                  }}
                />
                LIVE
              </div>

              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.6)',
                  backdropFilter: 'blur(4px)',
                  color: '#fff',
                  padding: '4px 10px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <IconEye size={14} />
                <span>{actualParticipantCount}</span>
              </div>

              <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', fontWeight: 600 }}>
                {duration}
              </div>
            </div>

            <button
              type="button"
              className="btn-icon"
              onClick={onClose}
              style={{
                color: '#fff',
                background: 'rgba(0,0,0,0.5)',
                borderRadius: '50%',
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <IconX size={18} />
            </button>
          </div>

          {/* Main Video Element */}
          <div
            style={{
              flex: 1,
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#040508',
            }}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted={isHost}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />

            {/* Stream Ended Notice */}
            {streamEnded && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(0, 0, 0, 0.85)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  textAlign: 'center',
                  padding: 24,
                  zIndex: 20,
                }}
              >
                <IconRadio size={48} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>
                  This Live Stream Has Ended
                </h3>
                <p style={{ color: 'var(--text-muted)', marginTop: 8, fontSize: '14px' }}>
                  Thanks for tuning in to {session?.host_name}'s live session!
                </p>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={onClose}
                  style={{ marginTop: 16, borderRadius: 'var(--radius-full)', padding: '8px 20px' }}
                >
                  Close Player
                </button>
              </div>
            )}

            {/* Removed by Host Notice */}
            {isRemovedByHost && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(0, 0, 0, 0.92)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  textAlign: 'center',
                  padding: 24,
                  zIndex: 30,
                }}
              >
                <IconTrash size={48} style={{ color: '#f02d44', marginBottom: 12 }} />
                <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>
                  You Were Removed from This Stream
                </h3>
                <p style={{ color: 'var(--text-muted)', marginTop: 8, fontSize: '14px', maxWidth: 320 }}>
                  The host has removed you from this live broadcast session.
                </p>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={onClose}
                  style={{ marginTop: 18, borderRadius: 'var(--radius-full)', padding: '8px 24px' }}
                >
                  Close
                </button>
              </div>
            )}

            {/* Floating Reactions */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                overflow: 'hidden',
                zIndex: 15,
              }}
            >
              {reactions.map((r) => (
                <div
                  key={r.id}
                  style={{
                    position: 'absolute',
                    bottom: 20,
                    left: `${r.left}%`,
                    fontSize: '32px',
                    animation: 'floatUp 2s forwards cubic-bezier(0.1, 0.8, 0.3, 1)',
                  }}
                >
                  {r.emoji}
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Stream Details & Host/Viewer Toolbar */}
          <div
            style={{
              padding: '16px 20px',
              background: 'var(--bg-secondary)',
              borderTop: '1px solid var(--border-medium)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-normal)' }}>
                {session?.title}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: 2 }}>
                Hosted by <span style={{ color: 'var(--discord-blurple)' }}>{session?.host_name}</span>{' '}
                {session?.description && `• ${session.description}`}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Audio Wave Visualizer */}
              {!isMuted && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '20px', padding: '0 4px' }} title="Microphone Active">
                  {[12, 20, 8, 22, 16, 10].map((h, i) => (
                    <span
                      key={i}
                      style={{
                        width: '3px',
                        height: `${h}px`,
                        backgroundColor: 'var(--discord-green)',
                        borderRadius: '2px',
                      }}
                    />
                  ))}
                </div>
              )}

              <button
                type="button"
                className={`btn btn-sm ${isMuted ? 'btn-danger' : 'btn-secondary'}`}
                onClick={handleToggleMute}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  borderRadius: 'var(--radius-full)',
                  padding: '7px 16px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {isHost ? (
                  isMuted ? <IconMicOff size={15} /> : <IconMic size={15} />
                ) : (
                  isMuted ? <IconVolumeOff size={15} /> : <IconVolume size={15} />
                )}
                <span>
                  {isHost
                    ? (isMuted ? 'Unmute Mic' : 'Mute Mic')
                    : (isMuted ? 'Unmute Audio' : 'Mute Audio')}
                </span>
              </button>

              {isHost && (
                <button
                  type="button"
                  className={`btn btn-sm ${isSharingScreen ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={handleToggleScreenShare}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    borderRadius: 'var(--radius-full)',
                    padding: '7px 16px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    background: isSharingScreen ? 'var(--discord-blurple)' : undefined,
                    color: isSharingScreen ? '#fff' : undefined,
                  }}
                  title={isSharingScreen ? 'Stop screen sharing and switch back to camera' : 'Share your screen with viewers'}
                >
                  <IconScreenShare size={15} />
                  <span>{isSharingScreen ? 'Stop Sharing' : 'Share Screen'}</span>
                </button>
              )}

              {/* Stream Quality Selector Popover */}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={() => setShowQualityMenu(!showQualityMenu)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    borderRadius: 'var(--radius-full)',
                    padding: '7px 14px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  title="Stream & Audio Quality Settings"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  <span>{streamQuality}</span>
                </button>

                {showQualityMenu && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 'calc(100% + 8px)',
                      right: 0,
                      width: '230px',
                      background: 'var(--bg-card)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-medium)',
                      boxShadow: '0 12px 32px rgba(0,0,0,0.6)',
                      padding: '12px',
                      zIndex: 100,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                      Video Stream Quality
                    </div>
                    {['1080p 60fps', '720p 30fps', '480p Saver', 'Auto Adaptive'].map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => {
                          setStreamQuality?.(q);
                          setShowQualityMenu(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 10px',
                          borderRadius: 'var(--radius-sm)',
                          border: 'none',
                          background: streamQuality === q ? 'rgba(88, 101, 242, 0.15)' : 'transparent',
                          color: streamQuality === q ? 'var(--discord-blurple)' : 'var(--text-normal)',
                          fontWeight: streamQuality === q ? 700 : 500,
                          fontSize: '12px',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <span>{q}</span>
                        {streamQuality === q && <span>✓</span>}
                      </button>
                    ))}

                    <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '4px 0' }} />

                    <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                      Audio Bitrate
                    </div>
                    {['HQ (320 kbps)', 'Balanced (128 kbps)'].map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => {
                          setAudioQuality?.(a);
                          setShowQualityMenu(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '6px 10px',
                          borderRadius: 'var(--radius-sm)',
                          border: 'none',
                          background: audioQuality === a ? 'rgba(88, 101, 242, 0.15)' : 'transparent',
                          color: audioQuality === a ? 'var(--discord-blurple)' : 'var(--text-normal)',
                          fontWeight: audioQuality === a ? 700 : 500,
                          fontSize: '12px',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <span>{a}</span>
                        {audioQuality === a && <span>✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {isHost && (
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={handleEndBroadcast}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    borderRadius: 'var(--radius-full)',
                    padding: '7px 16px',
                    fontWeight: 800,
                    fontSize: '12px',
                    background: 'linear-gradient(135deg, #e02424, #9b1c1c)',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    boxShadow: '0 0 14px rgba(224, 36, 36, 0.65)',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ width: 7, height: 7, background: '#fff', borderRadius: '1px' }} />
                  <span>End Broadcast</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Live Chat Sidebar */}
        <div
          style={{
            width: '340px',
            background: 'var(--bg-card)',
            borderLeft: '1px solid var(--border-medium)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Chat Header */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-medium)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <IconChat size={16} style={{ color: 'var(--text-muted)' }} />
              <span style={{ fontSize: '14px', fontWeight: 700 }}>Live Chat</span>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {actualParticipantCount} online
            </span>
          </div>

          {/* Messages List */}
          <div
            ref={chatScrollRef}
            style={{
              flex: 1,
              padding: '16px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            {messages.length === 0 && (
              <div
                style={{
                  margin: 'auto',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '13px',
                }}
              >
                Welcome to the live chat! Say hello to {session?.host_name} 👋
              </div>
            )}

            {messages.map((m, i) => {
              const msgUserId = m.user_id || m.userId;
              const isMsgHost =
                String(msgUserId) === String(session?.host_id) ||
                m.user_name === session?.host_name ||
                m.name === session?.host_name ||
                m.username === session?.host_username;
              const authorName = m.name || m.user_name || m.username || 'Viewer';
              const canHostRemoveFromChat = isHost && !isMsgHost && msgUserId;

              return (
                <div key={m.id || i} style={{ fontSize: '13px', lineHeight: 1.4, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 }}>
                  <div>
                    <span
                      style={{
                        fontWeight: 700,
                        color: isMsgHost ? 'var(--discord-blurple)' : 'var(--text-normal)',
                        marginRight: 6,
                      }}
                    >
                      {authorName}
                    </span>
                    {isMsgHost && (
                      <span
                        style={{
                          background: 'var(--discord-blurple)',
                          color: '#fff',
                          fontSize: '9px',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          fontWeight: 800,
                          marginRight: 6,
                          verticalAlign: 'middle',
                        }}
                      >
                        HOST
                      </span>
                    )}
                    <span style={{ color: 'var(--text-normal)', wordBreak: 'break-word' }}>
                      {m.text}
                    </span>
                  </div>

                  {canHostRemoveFromChat && (
                    <button
                      type="button"
                      onClick={() => handleRemoveUser(msgUserId, authorName)}
                      title={`Remove ${authorName} from broadcast`}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: 2,
                        opacity: 0.6,
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#f02d44')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                    >
                      <IconTrash size={12} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Reaction Buttons Bar */}
          <div
            style={{
              padding: '10px 16px',
              borderTop: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--bg-subtle)',
            }}
          >
            {['🔥', '❤️', '🚀', '👏', '💡', '🎉'].map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="btn-icon"
                onClick={() => handleSendReaction(emoji)}
                style={{
                  fontSize: '20px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'transform 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.25)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                title={`React ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Chat Input */}
          <form
            onSubmit={handleSendChat}
            style={{
              padding: '16px',
              borderTop: '1px solid var(--border-medium)',
              display: 'flex',
              gap: 8,
            }}
          >
            <input
              type="text"
              placeholder="Send a chat message..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              className="form-control"
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-medium)',
                color: 'var(--text-normal)',
                fontSize: '13px',
              }}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!chatInput.trim()}
              style={{
                padding: '9px 16px',
                fontSize: '13px',
                fontWeight: 700,
              }}
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
