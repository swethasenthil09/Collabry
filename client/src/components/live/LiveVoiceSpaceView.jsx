import { useState } from 'react';
import {
  IconChevronDown,
  IconMic,
  IconMicOff,
  IconVolumeOff,
  IconHand,
  IconChat,
  IconHeart,
  IconShare,
  IconMoreHorizontal,
  IconUsers,
  IconRadio,
  IconTrash,
  IconX,
  IconScreenShare,
} from '../common/Icons';

export default function LiveVoiceSpaceView({
  session,
  user,
  isHost,
  isMuted,
  isHandRaised,
  duration,
  participantsList,
  actualParticipantCount,
  handRaiseRequests,
  selectedParticipant,
  setSelectedParticipant,
  showChatDrawer,
  setShowChatDrawer,
  showReactionsPicker,
  setShowReactionsPicker,
  showMoreMenu,
  setShowMoreMenu,
  reactions,
  messages,
  chatInput,
  setChatInput,
  chatScrollRef,
  videoRef, // used for WebRTC audio/screen stream
  isSharingScreen,
  handleToggleScreenShare,
  streamQuality = '1080p 60fps',
  setStreamQuality,
  audioQuality = 'HQ (320 kbps)',
  setAudioQuality,
  streamEnded,
  isRemovedByHost,
  toastMessage,
  onClose,
  handleEndBroadcast,
  handleToggleMute,
  handleToggleHandRaise,
  handleAllowUserSpeak,
  handleDemoteSpeaker,
  handleRemoveUser,
  handleDismissHandRequest,
  handleSendReaction,
  handleSendChat,
  handleCopySpaceLink,
}) {
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const spaceTitle = session?.title || `${session?.host_name || 'Host'}'s space`;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0, 0, 0, 0.88)',
        backdropFilter: 'blur(20px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={onClose}
    >
      {/* Hidden Audio Element for WebRTC Stream Playback when screen sharing is inactive */}
      {!isSharingScreen && <audio ref={videoRef} autoPlay playsInline muted={isHost} />}

      {/* Space Modal Container */}
      <div
        style={{
          width: '100%',
          maxWidth: showChatDrawer ? '920px' : '520px',
          height: 'min(92vh, 820px)',
          background: 'var(--bg-card)',
          borderRadius: '28px',
          border: '1px solid var(--border-medium)',
          display: 'flex',
          overflow: 'hidden',
          boxShadow: '0 30px 80px rgba(0, 0, 0, 0.85)',
          position: 'relative',
          transition: 'max-width 0.25s ease',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Main Voice Space Column */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            background: 'var(--bg-card)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Mobile Top Drag Indicator */}
          <div
            style={{
              width: 38,
              height: 4,
              borderRadius: 2,
              background: 'rgba(255, 255, 255, 0.22)',
              margin: '12px auto 6px auto',
            }}
          />

          {/* Header */}
          <div
            style={{
              padding: '8px 20px 14px 20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <button
              type="button"
              onClick={onClose}
              className="btn-icon"
              title="Minimize space"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-normal)',
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <IconChevronDown size={24} />
            </button>

            <h2
              style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: 800,
                color: 'var(--text-normal)',
                letterSpacing: '-0.3px',
                textAlign: 'center',
                maxWidth: '300px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {spaceTitle}
            </h2>

            {isHost ? (
              <button
                type="button"
                onClick={handleEndBroadcast}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#f02d44',
                  fontWeight: 700,
                  fontSize: '15px',
                  cursor: 'pointer',
                  padding: '4px 6px',
                }}
              >
                End
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#f02d44',
                  fontWeight: 700,
                  fontSize: '15px',
                  cursor: 'pointer',
                  padding: '4px 6px',
                }}
              >
                Leave
              </button>
            )}
          </div>

          {/* Top Hand-Raise Notification Banner for Host */}
          {isHost && handRaiseRequests.length > 0 && (
            <div
              style={{
                position: 'absolute',
                top: 62,
                left: 16,
                right: 16,
                zIndex: 42,
                background: 'rgba(24, 28, 40, 0.96)',
                backdropFilter: 'blur(16px)',
                border: '1.5px solid #8b5cf6',
                borderRadius: '18px',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 8px 30px rgba(139, 92, 246, 0.45)',
                animation: 'slideDown 0.25s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: 'rgba(139, 92, 246, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    flexShrink: 0,
                  }}
                >
                  ✋
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {handRaiseRequests[0].name || handRaiseRequests[0].username || 'A listener'} requested to speak
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.65)' }}>
                    Allow them to join the stage as speaker?
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => handleAllowUserSpeak(handRaiseRequests[0].userId, handRaiseRequests[0].name)}
                  style={{
                    borderRadius: 'var(--radius-full)',
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                    border: 'none',
                    boxShadow: '0 2px 10px rgba(139, 92, 246, 0.5)',
                    cursor: 'pointer',
                  }}
                >
                  Allow to Speak
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleDismissHandRequest(handRaiseRequests[0].userId)}
                  style={{
                    borderRadius: 'var(--radius-full)',
                    padding: '6px 10px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Scrollable Center: Screen Share + Pinned Topic Card + Participant Circles Grid */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '0 20px 16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            {/* Live Screen Share Display when active */}
            {isSharingScreen && (
              <div
                style={{
                  position: 'relative',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  background: '#040508',
                  border: '1.5px solid var(--discord-blurple)',
                  boxShadow: '0 8px 24px rgba(88, 101, 242, 0.25)',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 10,
                    left: 12,
                    zIndex: 10,
                    background: 'rgba(0,0,0,0.7)',
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <IconScreenShare size={13} />
                  <span>Host Screen Share</span>
                </div>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted={isHost}
                  style={{ width: '100%', maxHeight: '240px', objectFit: 'contain', display: 'block' }}
                />
              </div>
            )}

            {/* Pinned Shared Topic Card (Twitter/X Style) */}
            <div
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-medium)',
                borderRadius: '16px',
                padding: '14px 16px',
                boxShadow: '0 2px 10px rgba(0, 0, 0, 0.1)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img
                  src={session?.host_avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&auto=format&fit=crop&q=80'}
                  alt={session?.host_name || 'Host'}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    objectFit: 'cover',
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-normal)' }}>
                      {session?.host_name || 'Host'}
                    </span>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                      @{session?.host_username || 'host'}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      · {duration}
                    </span>
                  </div>
                </div>
              </div>

              <div
                style={{
                  fontSize: '14px',
                  lineHeight: 1.45,
                  color: 'var(--text-normal)',
                  marginTop: 10,
                  marginBottom: 12,
                  wordBreak: 'break-word',
                }}
              >
                {session?.description || session?.title || 'Welcome to this voice space! Join the conversation, listen in, or request the mic to speak.'}
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: 8,
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <img
                    src={session?.host_avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=40&auto=format&fit=crop&q=80'}
                    alt=""
                    style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    Shared by {session?.host_name || 'Host'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopySpaceLink}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: 2,
                  }}
                  title="Copy space link"
                >
                  <IconMoreHorizontal size={18} />
                </button>
              </div>
            </div>

            {/* Real Participant Circles Grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '20px 12px',
                justifyItems: 'center',
                alignItems: 'start',
                marginTop: 6,
              }}
            >
              {participantsList.map((p) => {
                const isParticipantSpeaking = p.isSpeaking;
                const isHostUser = p.role === 'Host';
                const isSpeakerUser = p.role === 'Speaker';
                const canHostManage = isHost && !isHostUser && !p.isHost;

                return (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      textAlign: 'center',
                      width: '100%',
                      position: 'relative',
                      cursor: canHostManage ? 'pointer' : 'default',
                    }}
                    onClick={() => {
                      if (canHostManage) {
                        setSelectedParticipant(p);
                      }
                    }}
                    title={canHostManage ? `Click to manage or remove ${p.name}` : p.name}
                  >
                    {/* Avatar Circle with Soundwave Glow */}
                    <div
                      style={{
                        position: 'relative',
                        width: 58,
                        height: 58,
                        borderRadius: '50%',
                      }}
                    >
                      <div
                        style={{
                          width: '100%',
                          height: '100%',
                          borderRadius: '50%',
                          overflow: 'hidden',
                          background: 'var(--bg-secondary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: isParticipantSpeaking
                            ? '0 0 0 3px #8b5cf6, 0 0 16px rgba(139, 92, 246, 0.45)'
                            : '0 0 0 1px var(--border-medium)',
                          transition: 'box-shadow 0.2s ease, transform 0.15s ease',
                        }}
                      >
                        {p.avatar ? (
                          <img
                            src={p.avatar}
                            alt={p.name}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '100%',
                              height: '100%',
                              background: isHostUser
                                ? 'linear-gradient(135deg, #a855f7, #6366f1)'
                                : 'var(--bg-secondary)',
                              color: '#fff',
                              fontWeight: 700,
                              fontSize: '20px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {p.name?.charAt(0)?.toUpperCase() || 'U'}
                          </div>
                        )}
                      </div>

                      {/* Floating Emoji Badge */}
                      {p.badge && (
                        <div
                          style={{
                            position: 'absolute',
                            top: -4,
                            right: -4,
                            background: 'var(--bg-card)',
                            border: '1px solid rgba(255, 255, 255, 0.25)',
                            borderRadius: '50%',
                            width: 24,
                            height: 24,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '13px',
                            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
                          }}
                        >
                          {p.badge}
                        </div>
                      )}
                    </div>

                    {/* Participant Name */}
                    <span
                      style={{
                        fontSize: '13px',
                        fontWeight: 700,
                        color: 'var(--text-normal)',
                        marginTop: 6,
                        maxWidth: '74px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {p.name}
                    </span>

                    {/* Role Tag (ılı Host, ılı Speaker, Listener) */}
                    {isHostUser ? (
                      <div
                        style={{
                          color: '#a855f7',
                          fontSize: '11px',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 3,
                          marginTop: 2,
                        }}
                      >
                        {isParticipantSpeaking ? (
                          <span className="spaces-wave-bars">
                            <span />
                            <span />
                            <span />
                          </span>
                        ) : (
                          <IconMicOff size={11} />
                        )}
                        <span>Host</span>
                      </div>
                    ) : isSpeakerUser ? (
                      <div
                        style={{
                          color: '#a855f7',
                          fontSize: '11px',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 3,
                          marginTop: 2,
                        }}
                      >
                        <span className="spaces-wave-bars">
                          <span />
                          <span />
                          <span />
                        </span>
                        <span>Speaker</span>
                      </div>
                    ) : (
                      <span
                        style={{
                          color: 'var(--text-muted)',
                          fontSize: '11px',
                          fontWeight: 500,
                          marginTop: 2,
                        }}
                      >
                        Listener
                      </span>
                    )}
                  </div>
                );
              })}

              {/* Empty State when only Host is present */}
              {participantsList.length === 1 && (
                <div
                  style={{
                    gridColumn: '1 / -1',
                    padding: '28px 20px',
                    textAlign: 'center',
                    background: 'var(--bg-secondary)',
                    borderRadius: '16px',
                    border: '1px dashed var(--border-medium)',
                    marginTop: 8,
                    width: '100%',
                  }}
                >
                  <div
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      background: 'rgba(255, 255, 255, 0.06)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 10px auto',
                      color: 'var(--text-muted)',
                    }}
                  >
                    <IconUsers size={22} />
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-normal)' }}>
                    Waiting for listeners to join
                  </div>
                  <div
                    style={{
                      fontSize: '12px',
                      color: 'var(--text-muted)',
                      marginTop: 4,
                      maxWidth: 280,
                      margin: '4px auto 14px auto',
                    }}
                  >
                    Share this space link so community members can tune in and speak!
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleCopySpaceLink}
                    style={{
                      borderRadius: 'var(--radius-full)',
                      padding: '6px 18px',
                      fontWeight: 600,
                      fontSize: '12px',
                    }}
                  >
                    <IconShare size={14} />
                    <span>Share Space Link</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Host Manage Participant Modal */}
          {selectedParticipant && isHost && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.72)',
                backdropFilter: 'blur(6px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 60,
                padding: 20,
              }}
              onClick={() => setSelectedParticipant(null)}
            >
              <div
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: '24px',
                  padding: '24px 20px',
                  width: '100%',
                  maxWidth: 340,
                  textAlign: 'center',
                  boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8)',
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <img
                  src={selectedParticipant.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=80&auto=format&fit=crop&q=80'}
                  alt={selectedParticipant.name}
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    margin: '0 auto 12px',
                    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.3)',
                  }}
                />
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                  {selectedParticipant.name}
                </h3>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: 4 }}>
                  Role:{' '}
                  <span style={{ fontWeight: 600, color: selectedParticipant.role === 'Speaker' ? '#a855f7' : 'inherit' }}>
                    {selectedParticipant.role}
                  </span>
                  {selectedParticipant.badge === '✋' && ' • Hand Raised ✋'}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
                  {selectedParticipant.role !== 'Speaker' ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => handleAllowUserSpeak(selectedParticipant.id, selectedParticipant.name)}
                      style={{
                        borderRadius: 'var(--radius-full)',
                        fontWeight: 700,
                        padding: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                        cursor: 'pointer',
                      }}
                    >
                      <IconMic size={16} />
                      <span>Allow User to Speak</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => handleDemoteSpeaker(selectedParticipant.id, selectedParticipant.name)}
                      style={{
                        borderRadius: 'var(--radius-full)',
                        fontWeight: 600,
                        padding: '10px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        cursor: 'pointer',
                      }}
                    >
                      <IconMicOff size={16} />
                      <span>Mute / Demote to Listener</span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => handleRemoveUser(selectedParticipant.id, selectedParticipant.name)}
                    style={{
                      borderRadius: 'var(--radius-full)',
                      fontWeight: 700,
                      padding: '10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      background: 'linear-gradient(135deg, #e02424, #9b1c1c)',
                      cursor: 'pointer',
                    }}
                  >
                    <IconTrash size={16} />
                    <span>Remove User from Space</span>
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setSelectedParticipant(null)}
                    style={{
                      borderRadius: 'var(--radius-full)',
                      padding: '10px',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
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
                zIndex: 70,
              }}
            >
              <div
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: '50%',
                  background: 'rgba(240, 45, 68, 0.2)',
                  color: '#f02d44',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 12,
                }}
              >
                <IconTrash size={28} />
              </div>
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>
                You Were Removed from This Space
              </h3>
              <p style={{ color: 'var(--text-muted)', marginTop: 8, fontSize: '14px', maxWidth: 300 }}>
                The host has removed you from this broadcast session.
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

          {/* Stream Ended Notice */}
          {streamEnded && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.88)',
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
              <IconRadio size={48} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 800 }}>
                This Space Has Ended
              </h3>
              <p style={{ color: 'var(--text-muted)', marginTop: 8, fontSize: '14px' }}>
                Thanks for listening in to {session?.host_name || 'the host'}'s voice space!
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={onClose}
                style={{ marginTop: 16, borderRadius: 'var(--radius-full)', padding: '8px 20px' }}
              >
                Close Space
              </button>
            </div>
          )}

          {/* Floating Reactions Overlay */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              overflow: 'hidden',
              zIndex: 25,
            }}
          >
            {reactions.map((r) => (
              <div
                key={r.id}
                style={{
                  position: 'absolute',
                  bottom: 80,
                  left: `${r.left}%`,
                  fontSize: '34px',
                  animation: 'floatUp 2s forwards cubic-bezier(0.1, 0.8, 0.3, 1)',
                }}
              >
                {r.emoji}
              </div>
            ))}
          </div>

          {/* Quick Reactions Popover Toolbar */}
          {showReactionsPicker && (
            <div
              style={{
                position: 'absolute',
                bottom: 74,
                right: 20,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-medium)',
                borderRadius: '30px',
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                boxShadow: '0 10px 25px rgba(0, 0, 0, 0.4)',
                zIndex: 40,
              }}
            >
              {['❤️', '💯', '🔥', '👏', '🚀', '💡', '😂'].map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleSendReaction(emoji)}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '22px',
                    cursor: 'pointer',
                    padding: 2,
                    transition: 'transform 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.3)')}
                  onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {/* Toast Notification */}
          {toastMessage && (
            <div
              style={{
                position: 'absolute',
                bottom: 84,
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(30, 32, 40, 0.95)',
                color: '#fff',
                padding: '8px 18px',
                borderRadius: 'var(--radius-full)',
                fontSize: '13px',
                fontWeight: 600,
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
                border: '1px solid var(--border-medium)',
                zIndex: 50,
              }}
            >
              {toastMessage}
            </div>
          )}

          {/* Bottom Dock Toolbar (Twitter/X Spaces Style) */}
          <div
            style={{
              padding: '14px 20px',
              borderTop: '1px solid var(--border-medium)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--bg-card)',
            }}
          >
            {/* Left: Mic Mute / Unmute Button & Visualizer */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {isHost || participantsList.some((p) => p.isYou && p.role === 'Speaker') ? (
                <>
                  <button
                    type="button"
                    onClick={handleToggleMute}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      background: isMuted ? 'rgba(240, 45, 68, 0.15)' : 'rgba(139, 92, 246, 0.18)',
                      color: isMuted ? '#f02d44' : '#a855f7',
                      border: isMuted ? '1px solid rgba(240, 45, 68, 0.35)' : '1px solid rgba(139, 92, 246, 0.35)',
                      borderRadius: 'var(--radius-full)',
                      padding: '8px 16px',
                      fontWeight: 700,
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    {isMuted ? <IconMicOff size={16} /> : <IconMic size={16} />}
                    <span>{isMuted ? 'Mic Off' : 'Mic On'}</span>
                  </button>

                  {/* Audio Wave Visualizer */}
                  {!isMuted && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px', height: '18px', padding: '0 4px' }} title="Microphone Active">
                      {[10, 18, 8, 20, 14].map((h, i) => (
                        <span
                          key={i}
                          style={{
                            width: '3px',
                            height: `${h}px`,
                            backgroundColor: '#a855f7',
                            borderRadius: '2px',
                          }}
                        />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleToggleMute}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: 'var(--bg-secondary)',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-full)',
                    padding: '8px 14px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {isMuted ? <IconVolumeOff size={15} /> : <IconMicOff size={15} />}
                  <span>Listening</span>
                </button>
              )}
            </div>

            {/* Right: Screen Share, Quality, Hand-Raise, Chat Drawer Toggle, Emoji Reactions, Share */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Screen Share Button for Host / Speaker */}
              {(isHost || participantsList.some((p) => p.isYou && p.role === 'Speaker')) && (
                <button
                  type="button"
                  onClick={handleToggleScreenShare}
                  className="btn-icon"
                  title={isSharingScreen ? 'Stop screen sharing' : 'Share screen in voice space'}
                  style={{
                    background: isSharingScreen ? 'var(--discord-blurple)' : 'var(--bg-secondary)',
                    color: isSharingScreen ? '#fff' : 'var(--text-normal)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '50%',
                    width: 38,
                    height: 38,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <IconScreenShare size={17} />
                </button>
              )}

              {/* Quality Settings Button & Popover */}
              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setShowQualityMenu((prev) => !prev)}
                  className="btn-icon"
                  title="Audio Quality Settings"
                  style={{
                    background: showQualityMenu ? 'rgba(139, 92, 246, 0.2)' : 'var(--bg-secondary)',
                    color: showQualityMenu ? '#a855f7' : 'var(--text-normal)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '50%',
                    width: 38,
                    height: 38,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </button>

                {showQualityMenu && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 'calc(100% + 10px)',
                      right: 0,
                      width: '230px',
                      background: 'var(--bg-card)',
                      borderRadius: '16px',
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
                      Voice Audio Bitrate
                    </div>
                    {['HQ (320 kbps)', 'Studio (192 kbps)', 'Balanced (128 kbps)', 'Data Saver (64 kbps)'].map((a) => (
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
                          padding: '7px 10px',
                          borderRadius: 'var(--radius-sm)',
                          border: 'none',
                          background: audioQuality === a ? 'rgba(139, 92, 246, 0.18)' : 'transparent',
                          color: audioQuality === a ? '#a855f7' : 'var(--text-normal)',
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
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: '6px', marginTop: '2px' }}>
                      ✓ AI Noise Suppression enabled
                    </div>
                  </div>
                )}
              </div>

              {!isHost && (
                <button
                  type="button"
                  onClick={handleToggleHandRaise}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: isHandRaised ? 'rgba(139, 92, 246, 0.22)' : 'var(--bg-secondary)',
                    color: isHandRaised ? '#a855f7' : 'var(--text-normal)',
                    border: isHandRaised ? '1.5px solid #8b5cf6' : '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-full)',
                    padding: '7px 14px',
                    fontWeight: 700,
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                  title={isHandRaised ? 'Lower hand' : 'Raise hand to request to speak'}
                >
                  <IconHand size={15} />
                  <span>{isHandRaised ? 'Hand Raised ✋' : 'Request'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowChatDrawer((prev) => !prev)}
                className="btn-icon"
                title="Toggle live space chat"
                style={{
                  background: showChatDrawer ? 'var(--discord-blurple)' : 'var(--bg-secondary)',
                  color: showChatDrawer ? '#fff' : 'var(--text-normal)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '50%',
                  width: 38,
                  height: 38,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  position: 'relative',
                }}
              >
                <IconChat size={17} />
                {messages.length > 0 && !showChatDrawer && (
                  <span
                    style={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: 'var(--discord-blurple)',
                    }}
                  />
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowReactionsPicker((prev) => !prev)}
                className="btn-icon"
                title="Send reaction"
                style={{
                  background: showReactionsPicker ? 'rgba(139, 92, 246, 0.2)' : 'var(--bg-secondary)',
                  color: showReactionsPicker ? '#a855f7' : 'var(--text-normal)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '50%',
                  width: 38,
                  height: 38,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <IconHeart size={17} />
              </button>

              <button
                type="button"
                onClick={handleCopySpaceLink}
                className="btn-icon"
                title="Share space"
                style={{
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-normal)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: '50%',
                  width: 38,
                  height: 38,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <IconShare size={17} />
              </button>
            </div>
          </div>
        </div>

        {/* Slide-Out Live Chat Drawer on the Right */}
        {showChatDrawer && (
          <div
            style={{
              width: '380px',
              borderLeft: '1px solid var(--border-medium)',
              background: 'var(--bg-card)',
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              animation: 'slideLeft 0.2s ease',
            }}
          >
            {/* Chat Drawer Header */}
            <div
              style={{
                padding: '16px 18px',
                borderBottom: '1px solid var(--border-medium)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <IconChat size={16} style={{ color: 'var(--discord-blurple)' }} />
                <span style={{ fontWeight: 800, fontSize: '15px' }}>Space Chat</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  ({actualParticipantCount} online)
                </span>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setShowChatDrawer(false)}
                style={{ color: 'var(--text-muted)' }}
              >
                <IconX size={18} />
              </button>
            </div>

            {/* Chat Messages List */}
            <div
              ref={chatScrollRef}
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {messages.length === 0 ? (
                <div
                  style={{
                    margin: 'auto',
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    fontSize: '13px',
                    padding: '20px',
                  }}
                >
                  Welcome to the space chat! Send a message or react to the speakers 🎙️
                </div>
              ) : (
                messages.map((m, idx) => {
                  const isMsgHost =
                    String(m.user_id || m.userId) === String(session?.host_id) ||
                    m.user_name === session?.host_name ||
                    m.name === session?.host_name;

                  return (
                    <div
                      key={m.id || idx}
                      style={{
                        fontSize: '13px',
                        lineHeight: 1.45,
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                      }}
                    >
                      <div
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: '50%',
                          background: isMsgHost ? '#8b5cf6' : 'var(--bg-secondary)',
                          color: '#fff',
                          fontSize: '10px',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          marginTop: 2,
                        }}
                      >
                        {m.name?.charAt(0)?.toUpperCase() || 'U'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                          <span style={{ fontWeight: 700, color: 'var(--text-normal)' }}>
                            {m.name || m.user_name || 'Listener'}
                          </span>
                          {isMsgHost && (
                            <span
                              style={{
                                background: '#8b5cf6',
                                color: '#fff',
                                fontSize: '9px',
                                padding: '1px 5px',
                                borderRadius: '4px',
                                fontWeight: 800,
                              }}
                            >
                              HOST
                            </span>
                          )}
                        </div>
                        <div style={{ color: 'var(--text-normal)', wordBreak: 'break-word' }}>
                          {m.text}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Chat Input Box */}
            <form
              onSubmit={handleSendChat}
              style={{
                padding: '12px 16px',
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
                  padding: '9px 14px',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-normal)',
                  fontSize: '13px',
                }}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!chatInput.trim()}
                style={{
                  borderRadius: 'var(--radius-full)',
                  padding: '9px 18px',
                  fontSize: '13px',
                  fontWeight: 700,
                  background: 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                  border: 'none',
                }}
              >
                Send
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
