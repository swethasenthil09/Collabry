import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSocket } from '../../services/socket';
import {
  IconMic,
  IconMicOff,
  IconVolume,
  IconVolumeOff,
  IconHand,
  IconUsers,
  IconRadio,
  IconX,
  IconScreenShare,
} from '../common/Icons';

export default function ProjectVoiceRoom({ project, isFloating = false, onExpand, onLeave }) {
  const { user } = useAuth();
  const socket = getSocket();
  const roomId = `project-${project?.id}`;

  const [connected, setConnected] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [isSharingScreen, setIsSharingScreen] = useState(false);

  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const screenVideoRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animFrameRef = useRef(null);
  const peerConnectionsRef = useRef(new Map()); // socketId -> RTCPeerConnection
  const remoteAudiosRef = useRef(new Map()); // socketId -> HTMLAudioElement

  // Listen for voice socket events
  useEffect(() => {
    if (!socket) return;

    const handleVoiceState = (data) => {
      if (data.roomId === roomId) {
        setParticipants(data.participants || []);
      }
    };

    const handleVoiceSignal = async ({ senderSocketId, signal }) => {
      let pc = peerConnectionsRef.current.get(senderSocketId);

      if (signal.type === 'offer') {
        if (!pc) {
          pc = createPeerConnection(senderSocketId);
        }
        await pc.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('voice:signal', {
          roomId,
          targetSocketId: senderSocketId,
          signal: pc.localDescription,
        });
      } else if (signal.type === 'answer') {
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
        }
      } else if (signal.candidate) {
        if (pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (e) {
            console.warn('ICE candidate error', e);
          }
        }
      }
    };

    socket.on('voice:state', handleVoiceState);
    socket.on('voice:signal', handleVoiceSignal);

    return () => {
      socket.off('voice:state', handleVoiceState);
      socket.off('voice:signal', handleVoiceSignal);
    };
  }, [socket, roomId]);

  // Create WebRTC peer connection
  const createPeerConnection = (targetSocketId) => {
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };
    const pc = new RTCPeerConnection(config);

    // Add local tracks if mic is active
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Ice candidate exchange
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('voice:signal', {
          roomId,
          targetSocketId,
          signal: { candidate: event.candidate },
        });
      }
    };

    // Remote audio track received
    pc.ontrack = (event) => {
      let audioEl = remoteAudiosRef.current.get(targetSocketId);
      if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.autoplay = true;
        remoteAudiosRef.current.set(targetSocketId, audioEl);
      }
      audioEl.srcObject = event.streams[0];
      audioEl.muted = isDeafened;
    };

    peerConnectionsRef.current.set(targetSocketId, pc);
    return pc;
  };

  // Start Mic & join room
  const joinVoiceRoom = async () => {
    if (!socket) return;
    setStatusMessage('Connecting to voice server...');

    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setupSpeakingDetector(stream);
    } catch (err) {
      console.warn('Could not access microphone, entering as listener:', err);
      setStatusMessage('Microphone not accessible. Joined as listener.');
    }

    setConnected(true);
    socket.emit('voice:join', { roomId, projectId: project?.id });

    // Initiate WebRTC offers to all existing participants
    setTimeout(() => {
      participants.forEach(async (p) => {
        if (p.socketId !== socket.id) {
          const pc = createPeerConnection(p.socketId);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('voice:signal', {
            roomId,
            targetSocketId: p.socketId,
            signal: pc.localDescription,
          });
        }
      });
    }, 500);
  };

  // Speech volume detector with Web Audio API
  const setupSpeakingDetector = (stream) => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const analyser = audioCtx.createAnalyser();
      analyserRef.current = analyser;
      analyser.fftSize = 512;

      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      let wasSpeaking = false;
      let silenceTimer = null;

      const checkVolume = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const average = sum / bufferLength;
        const isSpeaking = average > 18;

        if (isSpeaking && !wasSpeaking) {
          wasSpeaking = true;
          clearTimeout(silenceTimer);
          socket?.emit('voice:speaking', { roomId, isSpeaking: true });
        } else if (!isSpeaking && wasSpeaking) {
          clearTimeout(silenceTimer);
          silenceTimer = setTimeout(() => {
            wasSpeaking = false;
            socket?.emit('voice:speaking', { roomId, isSpeaking: false });
          }, 350);
        }

        animFrameRef.current = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (e) {
      console.warn('Speech detector initialization error', e);
    }
  };

  // Cleanup on leave
  const leaveVoiceRoom = () => {
    if (socket) {
      socket.emit('voice:leave', { roomId });
    }

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    setIsSharingScreen(false);

    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();

    remoteAudiosRef.current.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
    });
    remoteAudiosRef.current.clear();

    setConnected(false);
    onLeave?.();
  };

  // Toggle Screen Sharing
  const handleToggleScreenShare = async () => {
    if (!isSharingScreen) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        screenStreamRef.current = stream;
        const videoTrack = stream.getVideoTracks()[0];

        peerConnectionsRef.current.forEach((pc) => {
          const sender = pc.getSenders?.().find((s) => s.track && s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(videoTrack);
          } else {
            pc.addTrack(videoTrack, stream);
          }
        });

        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = stream;
        }

        videoTrack.onended = () => {
          stopScreenShare();
        };

        setIsSharingScreen(true);
      } catch (err) {
        console.warn('Screen share error:', err);
      }
    } else {
      stopScreenShare();
    }
  };

  const stopScreenShare = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }
    if (screenVideoRef.current) {
      screenVideoRef.current.srcObject = null;
    }
    setIsSharingScreen(false);
  };

  // Toggle Mute
  const handleToggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextMute;
      });
    }
    socket?.emit('voice:toggle_mute', { roomId, isMuted: nextMute });
  };

  // Toggle Deafen
  const handleToggleDeafen = () => {
    const nextDeafen = !isDeafened;
    setIsDeafened(nextDeafen);
    remoteAudiosRef.current.forEach((audio) => {
      audio.muted = nextDeafen;
    });
  };

  // Toggle Raise Hand
  const handleToggleHand = () => {
    const nextHand = !handRaised;
    setHandRaised(nextHand);
    socket?.emit('voice:raise_hand', { roomId, handRaised: nextHand });
  };

  const speakers = participants.filter((p) => !p.isMuted);
  const listeners = participants.filter((p) => p.isMuted);

  // Floating Mini-Dock Mode
  if (isFloating) {
    if (!connected) return null;
    return (
      <div
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 9999,
          background: 'var(--bg-card)',
          border: '1px solid var(--discord-blurple)',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.45)',
          borderRadius: 'var(--radius-lg)',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          minWidth: 320,
          backdropFilter: 'blur(12px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={onExpand}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: 'var(--discord-green)',
              boxShadow: '0 0 10px var(--discord-green)',
            }}
          />
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-normal)' }}>
              Voice Space • {project?.name}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {participants.length} connected
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
          <button
            className="btn btn-sm btn-ghost"
            onClick={handleToggleMute}
            style={{
              padding: '6px',
              borderRadius: '50%',
              background: isMuted ? 'rgba(242, 63, 67, 0.15)' : 'var(--bg-subtle)',
              color: isMuted ? 'var(--discord-red)' : 'var(--text-normal)',
            }}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <IconMicOff size={16} /> : <IconMic size={16} />}
          </button>

          <button
            className="btn btn-sm btn-ghost"
            onClick={handleToggleDeafen}
            style={{
              padding: '6px',
              borderRadius: '50%',
              background: isDeafened ? 'rgba(242, 63, 67, 0.15)' : 'var(--bg-subtle)',
              color: isDeafened ? 'var(--discord-red)' : 'var(--text-normal)',
            }}
            title={isDeafened ? 'Undeafen' : 'Deafen'}
          >
            {isDeafened ? <IconVolumeOff size={16} /> : <IconVolume size={16} />}
          </button>

          <button
            className="btn btn-sm btn-danger"
            onClick={leaveVoiceRoom}
            style={{ padding: '6px 10px', borderRadius: 'var(--radius-sm)', fontSize: '12px' }}
            title="Disconnect"
          >
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  // Full Screen / Tab Mode
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {/* Top Header */}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--border-medium)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-secondary)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: '12px',
              background: 'linear-gradient(135deg, var(--discord-blurple), #7289da)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
            }}
          >
            <IconRadio size={22} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>
                {project?.name} Voice Space
              </h3>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background: connected ? 'rgba(35, 165, 90, 0.15)' : 'var(--bg-subtle)',
                  color: connected ? 'var(--discord-green)' : 'var(--text-muted)',
                  border: connected ? '1px solid rgba(35, 165, 90, 0.3)' : '1px solid var(--border-subtle)',
                }}
              >
                {connected ? '● CONNECTED' : 'READY TO JOIN'}
              </span>
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: 2 }}>
              High-definition WebRTC voice room for project syncs, pair programming, & audio spaces.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {!connected ? (
            <button
              className="btn btn-primary"
              onClick={joinVoiceRoom}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 18px',
                fontWeight: 600,
                borderRadius: 'var(--radius-md)',
              }}
            >
              <IconMic size={16} />
              <span>Join Voice Space</span>
            </button>
          ) : (
            <>
              <button
                className={`btn ${isSharingScreen ? 'btn-primary' : 'btn-secondary'}`}
                onClick={handleToggleScreenShare}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  fontWeight: 600,
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <IconScreenShare size={16} />
                <span>{isSharingScreen ? 'Stop Screen' : 'Share Screen'}</span>
              </button>

              <button
                className="btn btn-danger"
                onClick={leaveVoiceRoom}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 16px',
                  fontWeight: 600,
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <IconX size={16} />
                <span>Disconnect</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Stage */}
      <div
        style={{
          flex: 1,
          padding: '24px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 28,
        }}
      >
        {statusMessage && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(235, 69, 158, 0.1)',
              color: 'var(--reddit-orange)',
              fontSize: '13px',
            }}
          >
            {statusMessage}
          </div>
        )}

        {/* Live Screen Share Display when active */}
        {isSharingScreen && (
          <div
            style={{
              position: 'relative',
              borderRadius: 'var(--radius-lg)',
              overflow: 'hidden',
              background: '#040508',
              border: '1.5px solid var(--discord-blurple)',
              boxShadow: '0 8px 24px rgba(88, 101, 242, 0.25)',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 12,
                left: 14,
                zIndex: 10,
                background: 'rgba(0,0,0,0.75)',
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
              <span>Your Screen Share</span>
            </div>
            <video
              ref={screenVideoRef}
              autoPlay
              playsInline
              muted
              style={{ width: '100%', maxHeight: '360px', objectFit: 'contain', display: 'block' }}
            />
          </div>
        )}

        {/* Speakers Section */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: '13px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: 'var(--text-muted)',
              marginBottom: 16,
            }}
          >
            <IconMic size={15} />
            <span>Speakers ({speakers.length})</span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: 16,
            }}
          >
            {speakers.map((p) => {
              const isMe = p.userId === user?.id;
              return (
                <div
                  key={p.socketId}
                  style={{
                    background: 'var(--bg-subtle)',
                    borderRadius: 'var(--radius-lg)',
                    padding: '20px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    border: p.isSpeaking
                      ? '2px solid var(--discord-green)'
                      : '1px solid var(--border-subtle)',
                    boxShadow: p.isSpeaking
                      ? '0 0 16px rgba(35, 165, 90, 0.4)'
                      : 'none',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {/* Avatar with speaking wave */}
                  <div
                    style={{
                      position: 'relative',
                      width: 68,
                      height: 68,
                      borderRadius: '50%',
                      padding: 3,
                      background: p.isSpeaking ? 'var(--discord-green)' : 'transparent',
                      transition: 'background 0.2s ease',
                      marginBottom: 12,
                    }}
                  >
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        borderRadius: '50%',
                        overflow: 'hidden',
                        background: 'var(--discord-blurple)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '24px',
                        fontWeight: 700,
                        color: '#fff',
                      }}
                    >
                      {p.avatar ? (
                        <img
                          src={p.avatar}
                          alt={p.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        p.name?.charAt(0)?.toUpperCase() || 'U'
                      )}
                    </div>

                    {/* Raised hand badge */}
                    {p.handRaised && (
                      <div
                        style={{
                          position: 'absolute',
                          top: -6,
                          right: -6,
                          background: '#faa61a',
                          borderRadius: '50%',
                          width: 24,
                          height: 24,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '13px',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                        }}
                      >
                        ✋
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      fontWeight: 600,
                      fontSize: '14px',
                      color: 'var(--text-normal)',
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '100%',
                    }}
                  >
                    {p.name} {isMe && '(You)'}
                  </div>

                  <div
                    style={{
                      fontSize: '11px',
                      color: p.isSpeaking ? 'var(--discord-green)' : 'var(--text-muted)',
                      fontWeight: p.isSpeaking ? 700 : 500,
                      marginTop: 4,
                    }}
                  >
                    {p.isSpeaking ? 'Speaking...' : 'Listening'}
                  </div>
                </div>
              );
            })}

            {speakers.length === 0 && (
              <div
                style={{
                  gridColumn: '1 / -1',
                  padding: '30px',
                  textAlign: 'center',
                  background: 'var(--bg-subtle)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-muted)',
                  fontSize: '14px',
                }}
              >
                No active speakers on stage. Click "Join Voice Space" above to speak!
              </div>
            )}
          </div>
        </div>

        {/* Listeners Section */}
        {listeners.length > 0 && (
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: '13px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                color: 'var(--text-muted)',
                marginBottom: 16,
              }}
            >
              <IconVolume size={15} />
              <span>Listeners ({listeners.length})</span>
            </div>

            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              {listeners.map((p) => {
                const isMe = p.userId === user?.id;
                return (
                  <div
                    key={p.socketId}
                    style={{
                      background: 'var(--bg-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '8px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        overflow: 'hidden',
                        background: 'var(--bg-card)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: 700,
                      }}
                    >
                      {p.avatar ? (
                        <img
                          src={p.avatar}
                          alt={p.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        p.name?.charAt(0)?.toUpperCase() || 'U'
                      )}
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>
                      {p.name} {isMe && '(You)'}
                    </span>
                    <IconMicOff size={14} style={{ color: 'var(--discord-red)' }} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Sticky Control Bar */}
      {connected && (
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border-medium)',
            background: 'var(--bg-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              className={`btn ${isMuted ? 'btn-danger' : 'btn-secondary'}`}
              onClick={handleToggleMute}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                borderRadius: 'var(--radius-md)',
                padding: '10px 18px',
                fontWeight: 600,
              }}
            >
              {isMuted ? <IconMicOff size={18} /> : <IconMic size={18} />}
              <span>{isMuted ? 'Unmute Mic' : 'Mute Mic'}</span>
            </button>

            <button
              className={`btn ${isDeafened ? 'btn-danger' : 'btn-secondary'}`}
              onClick={handleToggleDeafen}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                borderRadius: 'var(--radius-md)',
                padding: '10px 18px',
                fontWeight: 600,
              }}
            >
              {isDeafened ? <IconVolumeOff size={18} /> : <IconVolume size={18} />}
              <span>{isDeafened ? 'Undeafen' : 'Deafen'}</span>
            </button>

            <button
              className={`btn ${handRaised ? 'btn-primary' : 'btn-secondary'}`}
              onClick={handleToggleHand}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                borderRadius: 'var(--radius-md)',
                padding: '10px 18px',
                fontWeight: 600,
              }}
            >
              <IconHand size={18} />
              <span>{handRaised ? 'Lower Hand' : 'Raise Hand'}</span>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                fontSize: '12px',
                color: 'var(--discord-green)',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginRight: 10,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--discord-green)',
                }}
              />
              RTC Connected • WebRTC P2P
            </span>

            <button
              className="btn btn-danger"
              onClick={leaveVoiceRoom}
              style={{
                borderRadius: 'var(--radius-md)',
                padding: '10px 18px',
                fontWeight: 600,
              }}
            >
              Disconnect
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
