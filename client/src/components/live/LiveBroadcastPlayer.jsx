import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSocket, connectSocket } from '../../services/socket';
import api from '../../services/api';
import LiveVoiceSpaceView from './LiveVoiceSpaceView';
import LiveVideoBroadcastView from './LiveVideoBroadcastView';

export default function LiveBroadcastPlayer({ session, localStream, onClose, onEnded }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState(() => getSocket());

  useEffect(() => {
    let s = getSocket();
    if (!s) {
      const token = localStorage.getItem('token');
      if (token) s = connectSocket(token);
    }
    setSocket(s);
  }, []);

  const isHost = Boolean(
    user && (
      String(session?.host_id) === String(user.id) ||
      session?.host_username === user.username ||
      Boolean(localStream)
    )
  );

  const isVoice = session?.session_type === 'voice';

  const [viewerCount, setViewerCount] = useState(session?.viewer_count || 1);
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [reactions, setReactions] = useState([]); // [{ id, emoji, left }]
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState('00:00');
  const [streamEnded, setStreamEnded] = useState(false);

  // Real attendees synced via Socket (Zero synthetic users)
  const [attendees, setAttendees] = useState([]);
  const [removedUserIds, setRemovedUserIds] = useState(new Set());
  const [isRemovedByHost, setIsRemovedByHost] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState(null);

  // Voice Space specific states
  const [isHandRaised, setIsHandRaised] = useState(false);
  const [handRaiseRequests, setHandRaiseRequests] = useState([]);
  const [speakerUserIds, setSpeakerUserIds] = useState(new Set());
  const [userReactionBadges, setUserReactionBadges] = useState({});
  const [showReactionsPicker, setShowReactionsPicker] = useState(false);
  const [showChatDrawer, setShowChatDrawer] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Video Screen Sharing
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [streamQuality, setStreamQuality] = useState('1080p 60fps');
  const [audioQuality, setAudioQuality] = useState('HQ (320 kbps)');

  const videoRef = useRef(null);
  const chatScrollRef = useRef(null);
  const peerConnectionsRef = useRef(new Map()); // socketId -> RTCPeerConnection
  const screenStreamRef = useRef(null);
  const cameraStreamRef = useRef(null);
  const speakerStreamRef = useRef(null);

  // Duration timer
  useEffect(() => {
    const startTime = new Date(session?.created_at || Date.now()).getTime();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
      const secs = String(elapsed % 60).padStart(2, '0');
      setDuration(`${mins}:${secs}`);
    }, 1000);
    return () => clearInterval(interval);
  }, [session]);

  // Video track assignment for broadcaster
  useEffect(() => {
    if (localStream) {
      cameraStreamRef.current = localStream;
      if (videoRef.current && !isSharingScreen) {
        videoRef.current.srcObject = localStream;
      }
    }
  }, [localStream, isSharingScreen]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Socket communication & WebRTC signaling
  useEffect(() => {
    if (!socket || !session?.id) return;

    socket.emit('live:join', {
      sessionId: session.id,
      user: {
        id: user?.id,
        name: user?.name || user?.username,
        avatar_url: user?.avatar_url,
      },
    });

    const handleViewerCount = ({ sessionId, count }) => {
      if (sessionId == session.id && count !== undefined) {
        setViewerCount(count);
      }
    };

    const handleParticipantsSync = ({ sessionId, participants, count }) => {
      if (sessionId == session.id && Array.isArray(participants)) {
        const others = participants.filter(
          (p) => String(p.id) !== String(user?.id) && String(p.id) !== String(session?.host_id)
        );
        setAttendees(others);
        if (count !== undefined) setViewerCount(count);
      }
    };

    const handleViewerJoined = ({ sessionId, user: joinedUser, count }) => {
      if (sessionId == session.id && joinedUser) {
        if (String(joinedUser.id) === String(user?.id) || String(joinedUser.id) === String(session?.host_id)) {
          return;
        }
        setAttendees((prev) => {
          if (prev.some((u) => String(u.id) === String(joinedUser.id))) return prev;
          return [...prev, joinedUser];
        });
        if (count !== undefined) setViewerCount(count);
      }
    };

    const handleViewerLeft = ({ sessionId, userId, count }) => {
      if (sessionId == session.id && userId) {
        setAttendees((prev) => prev.filter((u) => String(u.id) !== String(userId)));
        setHandRaiseRequests((prev) => prev.filter((r) => String(r.userId) !== String(userId)));
        if (count !== undefined) setViewerCount(count);
      }
    };

    const handleUserRemoved = ({ sessionId, userId, count }) => {
      if (sessionId == session.id && userId) {
        if (String(userId) === String(user?.id)) {
          setIsRemovedByHost(true);
          if (localStream) {
            localStream.getTracks().forEach((t) => t.stop());
          }
          setTimeout(() => {
            onClose();
          }, 2500);
        } else {
          setRemovedUserIds((prev) => new Set([...prev, String(userId)]));
          setAttendees((prev) => prev.filter((u) => String(u.id) !== String(userId)));
          setHandRaiseRequests((prev) => prev.filter((r) => String(r.userId) !== String(userId)));
          if (count !== undefined) setViewerCount(count);
          showToast('A participant was removed from the broadcast');
        }
      }
    };

    const handleYouWereRemoved = ({ sessionId }) => {
      if (sessionId == session.id) {
        setIsRemovedByHost(true);
        if (localStream) {
          localStream.getTracks().forEach((t) => t.stop());
        }
        setTimeout(() => {
          onClose();
        }, 2500);
      }
    };

    const handleNewChat = (chatData) => {
      if (!chatData || !chatData.text) return;
      setMessages((prev) => {
        if (chatData.id && prev.some((m) => m.id === chatData.id)) {
          return prev;
        }
        return [...prev, chatData];
      });
      setTimeout(() => {
        if (chatScrollRef.current) {
          chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
        }
      }, 50);
    };

    const handleFloatingReaction = (data) => {
      const emoji = data?.emoji || data;
      const senderId = data?.userId || data?.user_id || 'host';
      triggerFloatingReaction(emoji);

      setUserReactionBadges((prev) => ({
        ...prev,
        [senderId]: { emoji, expiresAt: Date.now() + 3000 },
      }));
    };

    const handleUserHandRaised = ({ sessionId, userId, name, username, avatar, raised }) => {
      if (sessionId == session.id) {
        if (raised) {
          setUserReactionBadges((prev) => ({
            ...prev,
            [userId]: { emoji: '✋', isHand: true },
          }));
          if (isHost && String(userId) !== String(user?.id)) {
            setHandRaiseRequests((prev) => {
              if (prev.some((r) => String(r.userId) === String(userId))) return prev;
              return [
                ...prev,
                { userId, name: name || username || 'Listener', username, avatar },
              ];
            });
          }
        } else {
          setUserReactionBadges((prev) => {
            const next = { ...prev };
            delete next[userId];
            return next;
          });
          setHandRaiseRequests((prev) => prev.filter((r) => String(r.userId) !== String(userId)));
        }
      }
    };

    const handleSpeakerPromoted = ({ sessionId, userId }) => {
      if (sessionId == session.id) {
        setSpeakerUserIds((prev) => new Set([...prev, String(userId)]));
        setHandRaiseRequests((prev) => prev.filter((r) => String(r.userId) !== String(userId)));
        setUserReactionBadges((prev) => {
          const next = { ...prev };
          delete next[userId];
          return next;
        });

        if (String(userId) === String(user?.id)) {
          showToast('The host allowed you to speak! Your mic is ready 🎙️');
          setIsMuted(false);
          try {
            navigator.mediaDevices.getUserMedia({ audio: true }).then((micStream) => {
              speakerStreamRef.current = micStream;
              const audioTrack = micStream.getAudioTracks()[0];
              const hostPc = peerConnectionsRef.current.get('host');
              if (hostPc && audioTrack) {
                hostPc.addTrack(audioTrack, micStream);
              }
            }).catch((err) => {
              console.warn('Speaker microphone error:', err);
            });
          } catch (e) {
            console.warn('Failed to acquire speaker mic:', e);
          }
        }
      }
    };

    const handleSpeakerDemoted = ({ sessionId, userId }) => {
      if (sessionId == session.id) {
        setSpeakerUserIds((prev) => {
          const next = new Set(prev);
          next.delete(String(userId));
          return next;
        });
        if (String(userId) === String(user?.id)) {
          showToast('You are now in listening mode.');
          setIsMuted(true);
          if (speakerStreamRef.current) {
            speakerStreamRef.current.getTracks().forEach((t) => t.stop());
            speakerStreamRef.current = null;
          }
        }
      }
    };

    const handleStreamEnded = ({ sessionId }) => {
      if (sessionId == session.id) {
        setStreamEnded(true);
      }
    };

    // WebRTC Signaling
    const handleLiveSignal = async ({ senderSocketId, signal }) => {
      if (isHost) {
        let pc = peerConnectionsRef.current.get(senderSocketId);
        if (signal.type === 'offer') {
          if (!pc) {
            pc = new RTCPeerConnection({
              iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
            });
            peerConnectionsRef.current.set(senderSocketId, pc);

            const activeCurrentStream = isSharingScreen && screenStreamRef.current ? screenStreamRef.current : localStream;
            if (activeCurrentStream) {
              activeCurrentStream.getTracks().forEach((track) => pc.addTrack(track, activeCurrentStream));
            }

            pc.onicecandidate = (event) => {
              if (event.candidate) {
                socket.emit('live:signal', {
                  sessionId: session.id,
                  targetSocketId: senderSocketId,
                  signal: { candidate: event.candidate },
                });
              }
            };
          }

          try {
            await pc.setRemoteDescription(new RTCSessionDescription(signal));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('live:signal', {
              sessionId: session.id,
              targetSocketId: senderSocketId,
              signal: pc.localDescription,
            });
          } catch (e) {
            console.warn('WebRTC signal error:', e);
          }
        } else if (signal.candidate && pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (e) {
            console.warn('ICE error', e);
          }
        }
      } else {
        let pc = peerConnectionsRef.current.get(senderSocketId) || peerConnectionsRef.current.get('host');
        if (signal.type === 'answer' && pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(signal));
          } catch (e) {
            console.warn('WebRTC answer error:', e);
          }
        } else if (signal.candidate && pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (e) {
            console.warn('ICE error', e);
          }
        }
      }
    };

    socket.on('live:viewer_count', handleViewerCount);
    socket.on('live:participants_sync', handleParticipantsSync);
    socket.on('live:viewer_joined', handleViewerJoined);
    socket.on('live:viewer_left', handleViewerLeft);
    socket.on('live:user_removed', handleUserRemoved);
    socket.on('live:you_were_removed', handleYouWereRemoved);
    socket.on('live:new_chat', handleNewChat);
    socket.on('live:new_chat_message', handleNewChat);
    socket.on('live:floating_reaction', handleFloatingReaction);
    socket.on('live:new_reaction', handleFloatingReaction);
    socket.on('live:user_hand_raised', handleUserHandRaised);
    socket.on('live:speaker_promoted', handleSpeakerPromoted);
    socket.on('live:speaker_demoted', handleSpeakerDemoted);
    socket.on('live:stream_ended', handleStreamEnded);
    socket.on('live:signal', handleLiveSignal);

    // If viewer, create offer to broadcaster
    if (!isHost) {
      const viewerPc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      peerConnectionsRef.current.set('host', viewerPc);

      viewerPc.ontrack = (event) => {
        if (videoRef.current) {
          videoRef.current.srcObject = event.streams[0];
        }
      };

      viewerPc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('live:signal', {
            sessionId: session.id,
            signal: { candidate: event.candidate },
          });
        }
      };

      viewerPc.createOffer().then((offer) => {
        viewerPc.setLocalDescription(offer);
        socket.emit('live:signal', {
          sessionId: session.id,
          signal: viewerPc.localDescription,
        });
      }).catch((e) => console.warn('Offer error:', e));
    }

    return () => {
      socket.emit('live:leave', { sessionId: session.id });
      socket.off('live:viewer_count', handleViewerCount);
      socket.off('live:participants_sync', handleParticipantsSync);
      socket.off('live:viewer_joined', handleViewerJoined);
      socket.off('live:viewer_left', handleViewerLeft);
      socket.off('live:user_removed', handleUserRemoved);
      socket.off('live:you_were_removed', handleYouWereRemoved);
      socket.off('live:new_chat', handleNewChat);
      socket.off('live:new_chat_message', handleNewChat);
      socket.off('live:floating_reaction', handleFloatingReaction);
      socket.off('live:new_reaction', handleFloatingReaction);
      socket.off('live:user_hand_raised', handleUserHandRaised);
      socket.off('live:speaker_promoted', handleSpeakerPromoted);
      socket.off('live:speaker_demoted', handleSpeakerDemoted);
      socket.off('live:stream_ended', handleStreamEnded);
      socket.off('live:signal', handleLiveSignal);

      peerConnectionsRef.current.forEach((pc) => pc.close());
      peerConnectionsRef.current.clear();

      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (speakerStreamRef.current) {
        speakerStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [socket, session?.id, isHost]);

  // Clean reaction badges after expiry
  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      setUserReactionBadges((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const k in next) {
          if (next[k].expiresAt && next[k].expiresAt < now) {
            delete next[k];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const triggerFloatingReaction = (emoji) => {
    const id = Date.now() + Math.random();
    const left = Math.floor(Math.random() * 60) + 20;
    setReactions((prev) => [...prev, { id, emoji, left }]);

    setTimeout(() => {
      setReactions((prev) => prev.filter((r) => r.id !== id));
    }, 2000);
  };

  const handleSendReaction = (emoji) => {
    triggerFloatingReaction(emoji);
    const myId = user?.id || 'me';
    setUserReactionBadges((prev) => ({
      ...prev,
      [myId]: { emoji, expiresAt: Date.now() + 3000 },
    }));
    const activeSocket = socket || getSocket();
    activeSocket?.emit('live:reaction', { sessionId: session.id, emoji });
    setShowReactionsPicker(false);
  };

  const handleToggleHandRaise = () => {
    const next = !isHandRaised;
    setIsHandRaised(next);
    const myId = user?.id || 'me';
    setUserReactionBadges((prev) => {
      const copy = { ...prev };
      if (next) {
        copy[myId] = { emoji: '✋', isHand: true };
      } else {
        delete copy[myId];
      }
      return copy;
    });
    const activeSocket = socket || getSocket();
    activeSocket?.emit('live:hand_raise', {
      sessionId: session.id,
      raised: next,
      user: {
        id: user?.id,
        name: user?.name || user?.username,
        username: user?.username,
        avatar_url: user?.avatar_url,
      },
    });
    showToast(next ? 'Hand raised to speak ✋' : 'Hand lowered');
  };

  const handleAllowUserSpeak = (targetUserId, targetName) => {
    if (!isHost) return;
    setSpeakerUserIds((prev) => new Set([...prev, String(targetUserId)]));
    setHandRaiseRequests((prev) => prev.filter((r) => String(r.userId) !== String(targetUserId)));
    setUserReactionBadges((prev) => {
      const next = { ...prev };
      delete next[targetUserId];
      return next;
    });
    const activeSocket = socket || getSocket();
    activeSocket?.emit('live:promote_speaker', {
      sessionId: session.id,
      userId: targetUserId,
    });
    setSelectedParticipant(null);
    showToast(`${targetName || 'User'} is now allowed to speak 🎙️`);
  };

  const handleDemoteSpeaker = (targetUserId, targetName) => {
    if (!isHost) return;
    setSpeakerUserIds((prev) => {
      const next = new Set(prev);
      next.delete(String(targetUserId));
      return next;
    });
    const activeSocket = socket || getSocket();
    activeSocket?.emit('live:demote_speaker', {
      sessionId: session.id,
      userId: targetUserId,
    });
    setSelectedParticipant(null);
    showToast(`${targetName || 'User'} moved to listeners`);
  };

  const handleDismissHandRequest = (targetUserId) => {
    setHandRaiseRequests((prev) => prev.filter((r) => String(r.userId) !== String(targetUserId)));
  };

  const handleCopySpaceLink = () => {
    const url = `${window.location.origin}/broadcasts?session=${session?.id}`;
    navigator.clipboard?.writeText(url);
    showToast('Space link copied to clipboard!');
    setShowMoreMenu(false);
  };

  const handleRemoveUser = async (targetUserId, targetName) => {
    if (!isHost) return;
    try {
      const activeSocket = socket || getSocket();
      activeSocket?.emit('live:remove_user', {
        sessionId: session.id,
        userId: targetUserId,
      });

      await api.post(`/live/${session.id}/remove-user`, { userId: targetUserId }).catch(() => {});

      setRemovedUserIds((prev) => new Set([...prev, String(targetUserId)]));
      setAttendees((prev) => prev.filter((u) => String(u.id) !== String(targetUserId)));
      setHandRaiseRequests((prev) => prev.filter((r) => String(r.userId) !== String(targetUserId)));
      setSelectedParticipant(null);
      showToast(`${targetName || 'User'} removed from broadcast`);
    } catch (err) {
      console.error('Failed to remove user:', err);
    }
  };

  const handleSendChat = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    const text = chatInput.trim();
    const payload = {
      sessionId: session.id,
      text,
      user: {
        id: user?.id,
        name: user?.name || user?.username || 'You',
        avatar_url: user?.avatar_url,
      },
    };

    const activeSocket = socket || getSocket();
    if (activeSocket && activeSocket.connected) {
      activeSocket.emit('live:chat_message', payload);
    } else {
      const fallbackMsg = {
        id: `local_${Date.now()}`,
        sessionId: session.id,
        user_id: user?.id,
        userId: user?.id,
        name: user?.name || user?.username || 'You',
        user_name: user?.name || user?.username || 'You',
        avatar: user?.avatar_url,
        text,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
      activeSocket?.emit('live:chat_message', payload);
    }
    setChatInput('');
  };

  const handleToggleScreenShare = async () => {
    if (!isHost) return;
    if (!isSharingScreen) {
      try {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        screenStreamRef.current = screenStream;
        const screenVideoTrack = screenStream.getVideoTracks()[0];

        peerConnectionsRef.current.forEach((pc) => {
          const sender = pc.getSenders?.().find((s) => s.track && s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenVideoTrack);
          }
        });

        if (videoRef.current) {
          videoRef.current.srcObject = screenStream;
        }

        screenVideoTrack.onended = () => {
          handleStopScreenShare();
        };

        setIsSharingScreen(true);
        showToast('Screen sharing started 🖥️');
      } catch (err) {
        console.warn('Screen share error:', err);
        showToast('Screen sharing was cancelled or unavailable.');
      }
    } else {
      handleStopScreenShare();
    }
  };

  const handleStopScreenShare = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }

    const camStream = cameraStreamRef.current || localStream;
    if (camStream) {
      const camVideoTrack = camStream.getVideoTracks()[0];
      if (camVideoTrack) {
        peerConnectionsRef.current.forEach((pc) => {
          const sender = pc.getSenders?.().find((s) => s.track && s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(camVideoTrack);
          }
        });
      }
      if (videoRef.current) {
        videoRef.current.srcObject = camStream;
      }
    }

    setIsSharingScreen(false);
    showToast('Switched back to camera 📹');
  };

  const handleToggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);

    if (isHost && localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !nextMute;
      });
    } else {
      if (videoRef.current) {
        videoRef.current.muted = nextMute;
        if (!nextMute) {
          videoRef.current.play().catch(() => {});
        }
      }
    }
  };

  const handleEndBroadcast = async () => {
    try {
      await api.post(`/live/${session.id}/end`);
      if (localStream) {
        localStream.getTracks().forEach((t) => t.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach((t) => t.stop());
        screenStreamRef.current = null;
      }
      if (speakerStreamRef.current) {
        speakerStreamRef.current.getTracks().forEach((t) => t.stop());
        speakerStreamRef.current = null;
      }
      onEnded?.();
      onClose();
    } catch (err) {
      console.error('Failed to end stream:', err);
    }
  };

  // Compile real participants (Zero synthetic/mock participants)
  const hostParticipant = {
    id: session?.host_id || 'host',
    name: session?.host_name || 'Host',
    username: session?.host_username || 'host',
    avatar: session?.host_avatar,
    role: 'Host',
    isSpeaking: isHost ? !isMuted : true,
    isHost: true,
  };

  const participantsList = [hostParticipant];

  if (!isHost && user && !removedUserIds.has(String(user.id))) {
    const isPromotedSpeaker = speakerUserIds.has(String(user.id));
    const userRole = isPromotedSpeaker ? 'Speaker' : 'Listener';
    participantsList.push({
      id: user.id || 'me',
      name: `${user.name || user.username} (You)`,
      username: user.username,
      avatar: user.avatar_url,
      role: userRole,
      isSpeaking: userRole === 'Speaker' && !isMuted,
      isYou: true,
      badge: userReactionBadges[user.id]?.emoji || (isHandRaised && !isPromotedSpeaker ? '✋' : null),
    });
  }

  attendees.forEach((att) => {
    const attId = String(att.id || att.userId);
    if (
      !removedUserIds.has(attId) &&
      !participantsList.some(
        (p) => String(p.id) === attId || (att.username && p.username === att.username)
      )
    ) {
      const isAttSpeaker = speakerUserIds.has(attId);
      const attRole = isAttSpeaker ? 'Speaker' : 'Listener';
      participantsList.push({
        id: att.id || att.userId,
        name: att.name || att.username || 'Viewer',
        username: att.username,
        avatar: att.avatar || att.avatar_url,
        role: attRole,
        isSpeaking: isAttSpeaker,
        badge: userReactionBadges[att.id]?.emoji,
      });
    }
  });

  const actualParticipantCount = Math.max(participantsList.length, viewerCount);

  if (isVoice) {
    return (
      <LiveVoiceSpaceView
        session={session}
        user={user}
        isHost={isHost}
        isMuted={isMuted}
        isHandRaised={isHandRaised}
        duration={duration}
        participantsList={participantsList}
        actualParticipantCount={actualParticipantCount}
        handRaiseRequests={handRaiseRequests}
        selectedParticipant={selectedParticipant}
        setSelectedParticipant={setSelectedParticipant}
        showChatDrawer={showChatDrawer}
        setShowChatDrawer={setShowChatDrawer}
        showReactionsPicker={showReactionsPicker}
        setShowReactionsPicker={setShowReactionsPicker}
        showMoreMenu={showMoreMenu}
        setShowMoreMenu={setShowMoreMenu}
        reactions={reactions}
        messages={messages}
        chatInput={chatInput}
        setChatInput={setChatInput}
        chatScrollRef={chatScrollRef}
        videoRef={videoRef}
        isSharingScreen={isSharingScreen}
        handleToggleScreenShare={handleToggleScreenShare}
        streamQuality={streamQuality}
        setStreamQuality={setStreamQuality}
        audioQuality={audioQuality}
        setAudioQuality={setAudioQuality}
        streamEnded={streamEnded}
        isRemovedByHost={isRemovedByHost}
        toastMessage={toastMessage}
        onClose={onClose}
        handleEndBroadcast={handleEndBroadcast}
        handleToggleMute={handleToggleMute}
        handleToggleHandRaise={handleToggleHandRaise}
        handleAllowUserSpeak={handleAllowUserSpeak}
        handleDemoteSpeaker={handleDemoteSpeaker}
        handleRemoveUser={handleRemoveUser}
        handleDismissHandRequest={handleDismissHandRequest}
        handleSendReaction={handleSendReaction}
        handleSendChat={handleSendChat}
        handleCopySpaceLink={handleCopySpaceLink}
      />
    );
  }

  return (
    <LiveVideoBroadcastView
      session={session}
      user={user}
      isHost={isHost}
      isMuted={isMuted}
      isSharingScreen={isSharingScreen}
      streamQuality={streamQuality}
      setStreamQuality={setStreamQuality}
      audioQuality={audioQuality}
      setAudioQuality={setAudioQuality}
      duration={duration}
      actualParticipantCount={actualParticipantCount}
      videoRef={videoRef}
      messages={messages}
      chatInput={chatInput}
      setChatInput={setChatInput}
      chatScrollRef={chatScrollRef}
      reactions={reactions}
      streamEnded={streamEnded}
      isRemovedByHost={isRemovedByHost}
      onClose={onClose}
      handleEndBroadcast={handleEndBroadcast}
      handleToggleMute={handleToggleMute}
      handleToggleScreenShare={handleToggleScreenShare}
      handleRemoveUser={handleRemoveUser}
      handleSendChat={handleSendChat}
      handleSendReaction={handleSendReaction}
    />
  );
}
