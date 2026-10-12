import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { getSocket, connectSocket } from '../services/socket';
import {
  IconSend,
  IconChat,
  IconSparkles,
  IconMic,
  IconMicOff,
  IconTrash,
  IconCheck,
  IconCheckCheck,
  IconUsers,
  IconPlus,
  IconSearch,
  IconCopy,
  IconPencil,
  IconAlertTriangle,
} from '../components/common/Icons';
import FormattedMessage from '../components/chat/FormattedMessage';
import VoiceNotePlayer from '../components/chat/VoiceNotePlayer';
import ReportModal from '../components/common/ReportModal';

const QUICK_EMOJIS = ['👍', '❤️', '🚀', '🔥', '😂', '🎉', '👀'];
const DM_INSERT_EMOJIS = ['😀', '😂', '🔥', '🚀', '❤️', '👍', '🎉', '💡', '👏', '💯', '🙌', '✨', '👀', '😎', '🥳', '💪', '🤝', '⭐'];

export default function DirectMessageView() {
  const { conversationId } = useParams();
  const { user } = useAuth();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [isRecipientTyping, setIsRecipientTyping] = useState(false);
  const [showInputEmojiPicker, setShowInputEmojiPicker] = useState(false);
  const [hoveredMessageId, setHoveredMessageId] = useState(null);
  const [activeDropdownMsgId, setActiveDropdownMsgId] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [reportingMsg, setReportingMsg] = useState(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // In-Chat Search State
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // Voice Note Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [isUploadingVoice, setIsUploadingVoice] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioStreamRef = useRef(null);
  const recordingTimerRef = useRef(null);

  // Group Chat Member Management State
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [addMemberQuery, setAddMemberQuery] = useState('');
  const [addMemberResults, setAddMemberResults] = useState([]);
  const [addingMember, setAddingMember] = useState(false);

  useEffect(() => {
    if (!conversationId) return;

    loadConversationAndMessages();
    setIsRecipientTyping(false);
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);

    const token = localStorage.getItem('accessToken');
    const socket = getSocket() || connectSocket(token);

    socket.emit('join_channel', conversationId);

    // Auto mark existing messages as read
    api.post(`/messages/${conversationId}/read`).catch(() => {});
    socket.emit('mark_read', { conversationId });

    socket.on('new_message', (message) => {
      if (String(message.conversation_id) === String(conversationId)) {
        setMessages(prev => {
          if (prev.some(m => m.id === message.id)) return prev;
          return [...prev, message];
        });

        // Mark incoming messages as read instantly when conversation is active
        if (message.sender_id !== user?.id) {
          api.post(`/messages/${conversationId}/read`).catch(() => {});
          socket.emit('mark_read', { conversationId });
        }
      }
    });

    socket.on('messages_read', (data) => {
      if (String(data.conversationId) === String(conversationId) && data.readerId !== user?.id) {
        setMessages(prev =>
          prev.map(m =>
            m.sender_id === user?.id ? { ...m, status: 'read', read_at: data.readAt } : m
          )
        );
      }
    });

    socket.on('user_typing', (data) => {
      if (String(data.conversationId) === String(conversationId) && data.userId !== user?.id) {
        setIsRecipientTyping(true);
      }
    });

    socket.on('user_stopped_typing', (data) => {
      if (String(data.conversationId) === String(conversationId) && data.userId !== user?.id) {
        setIsRecipientTyping(false);
      }
    });

    socket.on('message_reaction_updated', (data) => {
      if (String(data.conversation_id) === String(conversationId)) {
        setMessages(prev =>
          prev.map(m => (m.id === data.message_id ? { ...m, reactions: data.reactions } : m))
        );
      }
    });

    const handleMessageUpdated = (updated) => {
      if (String(updated.conversation_id) === String(conversationId)) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === updated.id ? { ...m, body: updated.body, is_edited: true, updated_at: updated.updated_at } : m
          )
        );
      }
    };

    const handleMessageDeleted = (deleted) => {
      if (String(deleted.conversation_id) === String(conversationId)) {
        setMessages((prev) => prev.filter((m) => m.id !== deleted.id));
      }
    };

    socket.on('message_updated', handleMessageUpdated);
    socket.on('message_deleted', handleMessageDeleted);

    return () => {
      socket.emit('leave_channel', conversationId);
      socket.off('new_message');
      socket.off('messages_read');
      socket.off('user_typing');
      socket.off('user_stopped_typing');
      socket.off('message_reaction_updated');
      socket.off('message_updated', handleMessageUpdated);
      socket.off('message_deleted', handleMessageDeleted);

      // Cleanup any active voice recording on navigate
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [conversationId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadConversationAndMessages = async () => {
    setLoading(true);
    try {
      const [convRes, msgRes] = await Promise.all([
        api.get(`/messages/conversations/${conversationId}`),
        api.get(`/messages/${conversationId}?limit=50`),
      ]);
      setConversation(convRes.data);
      setMessages(msgRes.data);
    } catch (err) {
      console.error('Load DM error:', err);
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleReaction = async (messageId, emoji) => {
    try {
      const res = await api.post(`/messages/${messageId}/reactions`, { emoji });
      setMessages(prev =>
        prev.map(m => (m.id === messageId ? { ...m, reactions: res.data.reactions } : m))
      );
    } catch (err) {
      console.error('DM reaction error:', err);
    }
  };

  useEffect(() => {
    const handleOutsideClick = () => setActiveDropdownMsgId(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  const handleStartEdit = (msg) => {
    setEditingMessageId(msg.id);
    setEditingText(msg.body);
    setActiveDropdownMsgId(null);
  };

  const handleSaveEdit = async (messageId) => {
    if (!editingText.trim()) return;
    try {
      await api.put(`/messages/${messageId}`, { body: editingText.trim() });
      const socket = getSocket();
      if (socket) {
        socket.emit('edit_message', { messageId, body: editingText.trim() });
      }
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId ? { ...m, body: editingText.trim(), is_edited: true } : m
        )
      );
      setEditingMessageId(null);
    } catch (err) {
      console.error('Failed to edit DM:', err);
    }
  };

  const handleDeleteMessage = async (messageId) => {
    setActiveDropdownMsgId(null);
    if (!window.confirm('Delete this message? This cannot be undone.')) return;
    try {
      await api.delete(`/messages/${messageId}`);
      const socket = getSocket();
      if (socket) {
        socket.emit('delete_message', { messageId });
      }
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch (err) {
      console.error('Failed to delete DM:', err);
    }
  };

  const handleCopyText = (text) => {
    setActiveDropdownMsgId(null);
    navigator.clipboard.writeText(text);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim() || !conversationId) return;
    setIsSearching(true);
    try {
      const res = await api.get(
        `/messages/search?conversation_id=${conversationId}&q=${encodeURIComponent(searchQuery.trim())}`
      );
      setSearchResults(res.data || []);
    } catch (err) {
      console.error('Search DM error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    const socket = getSocket();
    if (!socket || !conversationId) return;

    socket.emit('typing_start', conversationId);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing_stop', conversationId);
    }, 1800);
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!input.trim() || !conversationId) return;

    const socket = getSocket();
    if (socket) {
      socket.emit('send_message', { conversationId, body: input.trim() });
      socket.emit('typing_stop', conversationId);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      setInput('');
    }
  };

  // ==========================================
  // VOICE NOTE RECORDING HANDLERS
  // ==========================================
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start(250);
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('Microphone error:', err);
      alert('Unable to access microphone. Please verify browser microphone permissions.');
    }
  };

  const cancelRecording = () => {
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(t => t.stop());
    }
    setIsRecording(false);
    setRecordingSeconds(0);
    audioChunksRef.current = [];
  };

  const sendRecording = () => {
    if (!mediaRecorderRef.current) return;
    const duration = recordingSeconds;
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);

    mediaRecorderRef.current.onstop = async () => {
      try {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        if (audioStreamRef.current) {
          audioStreamRef.current.getTracks().forEach(t => t.stop());
        }
        setIsRecording(false);
        setIsUploadingVoice(true);

        const formData = new FormData();
        formData.append('audio', audioBlob, `voice-${Date.now()}.webm`);

        const res = await api.post('/messages/upload-voice', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });

        const mediaUrl = res.data.media_url;
        const socket = getSocket();
        if (socket) {
          socket.emit('send_message', {
            conversationId,
            body: 'Voice note',
            message_type: 'audio',
            media_url: mediaUrl,
            duration: duration || 1,
          });
        }
      } catch (err) {
        console.error('Failed to upload voice note:', err);
      } finally {
        setIsUploadingVoice(false);
        setRecordingSeconds(0);
        audioChunksRef.current = [];
      }
    };

    mediaRecorderRef.current.stop();
  };

  const handleSearchNewMember = async (q) => {
    setAddMemberQuery(q);
    if (q.trim().length < 2) {
      setAddMemberResults([]);
      return;
    }
    try {
      const res = await api.get(`/users/search?q=${encodeURIComponent(q.trim())}`);
      const currentIds = (conversation?.members || []).map(m => m.id);
      setAddMemberResults((res.data || []).filter(u => !currentIds.includes(u.id)));
    } catch (err) {
      console.error('Member search error:', err);
    }
  };

  const handleAddMemberToGroup = async (targetUser) => {
    setAddingMember(true);
    try {
      await api.post(`/messages/groups/${conversationId}/members`, {
        member_ids: [targetUser.id],
      });
      setAddMemberQuery('');
      setAddMemberResults([]);
      loadConversationAndMessages();
    } catch (err) {
      console.error('Add member error:', err);
      alert('Failed to add member to group.');
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMemberFromGroup = async (targetUserId) => {
    if (!window.confirm('Remove this user from the group?')) return;
    try {
      await api.delete(`/messages/groups/${conversationId}/members/${targetUserId}`);
      loadConversationAndMessages();
    } catch (err) {
      console.error('Remove member error:', err);
      alert('Failed to remove member.');
    }
  };

  const handleLeaveGroup = async () => {
    if (!window.confirm('Are you sure you want to leave this group chat?')) return;
    try {
      await api.delete(`/messages/groups/${conversationId}/members/${user?.id}`);
      window.location.href = '/';
    } catch (err) {
      console.error('Leave group error:', err);
      alert('Failed to leave group.');
    }
  };

  const timeFormat = (date) => {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatRecordingTime = (sec) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  if (loading) {
    return (
      <div className="empty-state">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="empty-state">
        <div className="empty-state-title">Conversation not found</div>
      </div>
    );
  }

  const isGroup = conversation.type === 'group';
  const recipient = conversation.recipient;

  return (
    <>
      {/* Header */}
      <header className="main-header" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="user-avatar sm" style={{ background: isGroup ? 'var(--discord-green)' : 'var(--discord-blurple)' }}>
            {isGroup ? <IconUsers size={16} /> : (recipient?.name || recipient?.username || '?').charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 style={{ fontSize: '15px' }}>{isGroup ? (conversation.name || 'Group Chat') : (recipient?.name || recipient?.username)}</h2>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {isGroup ? `${conversation.members?.length || 0} members` : `@${recipient?.alias}`}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {showSearch ? (
            <form onSubmit={handleSearch} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="text"
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '4px 10px',
                  color: '#fff',
                  fontSize: '12px',
                  width: 180,
                  outline: 'none',
                }}
              />
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                style={{ padding: '3px 8px', fontSize: '11px' }}
                disabled={isSearching || !searchQuery.trim()}
              >
                {isSearching ? '...' : 'Search'}
              </button>
              <button
                type="button"
                className="btn-icon"
                onClick={() => {
                  setShowSearch(false);
                  setSearchResults([]);
                  setSearchQuery('');
                }}
                style={{ padding: '4px', color: 'var(--text-muted)' }}
              >
                ✕
              </button>
            </form>
          ) : (
            <button
              className="btn btn-ghost btn-sm"
              style={{
                fontSize: '12px',
                padding: '4px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                color: 'var(--text-muted)',
              }}
              onClick={() => setShowSearch(true)}
              title="Search messages in this conversation"
            >
              <IconSearch size={14} />
              <span>Search</span>
            </button>
          )}

          {isGroup && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowMembersModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', fontSize: 12, border: '1px solid var(--border-medium)', borderRadius: 6 }}
            >
              <IconUsers size={14} />
              <span>Members ({conversation.members?.length || 0})</span>
            </button>
          )}
        </div>
      </header>

      {/* Search Results Overlay */}
      {showSearch && searchResults.length > 0 && (
        <div
          style={{
            background: 'var(--bg-sidebar)',
            borderBottom: '1px solid var(--border-medium)',
            padding: '12px 18px',
            maxHeight: 200,
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              fontSize: '11px',
              fontWeight: 800,
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginBottom: 8,
              letterSpacing: '0.5px',
            }}
          >
            {searchResults.length} Result{searchResults.length !== 1 ? 's' : ''} for "{searchQuery}"
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {searchResults.map((res) => (
              <div
                key={res.id}
                style={{
                  padding: '6px 10px',
                  background: 'var(--bg-card)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-subtle)',
                  fontSize: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontWeight: 700, color: 'var(--discord-blurple)' }}>
                    {res.sender_name || res.sender_username}
                  </span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                    {timeFormat(res.created_at)}
                  </span>
                </div>
                <div style={{ color: 'var(--text-normal)' }}>{res.body}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Chat Container */}
      <div className="chat-container">
        <div className="chat-messages">
          {/* Welcome Card */}
          <div style={{ background: 'var(--bg-subtle)', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-md)', padding: 18, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="user-avatar lg" style={{ background: isGroup ? 'var(--discord-green)' : 'var(--discord-blurple)', width: 48, height: 48, fontSize: 20 }}>
                {isGroup ? <IconUsers size={24} /> : (recipient?.name || recipient?.username || '?').charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-heading)' }}>
                  {isGroup ? (conversation.name || 'Group Chat') : (recipient?.name || recipient?.username)}
                </h3>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {isGroup
                    ? `This is the beginning of the #${conversation.name} group chat with ${conversation.members?.length || 0} participants.`
                    : `@${recipient?.alias} · This is the start of your direct message history with ${recipient?.name || recipient?.username}.`}
                </div>
              </div>
            </div>
            {!isGroup && recipient?.bio && (
              <p style={{ marginTop: 10, fontSize: '13px', color: 'var(--text-normal)', lineHeight: 1.4 }}>
                {recipient.bio}
              </p>
            )}
          </div>

          {messages.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <div className="empty-state-icon">
                <IconSparkles size={36} style={{ color: 'var(--discord-blurple)' }} />
              </div>
              <div className="empty-state-title">Say hello to {recipient?.name || recipient?.username}!</div>
              <div className="empty-state-desc">Send a message or voice note to start collaborating privately.</div>
            </div>
          ) : (
            messages.map((msg) => {
              const isMe = msg.sender_id === user?.id;
              const isEditing = editingMessageId === msg.id;
              const isHovered = hoveredMessageId === msg.id;
              const isDropdownOpen = activeDropdownMsgId === msg.id;

              return (
                <div
                  key={msg.id}
                  onMouseEnter={() => setHoveredMessageId(msg.id)}
                  onMouseLeave={() => setHoveredMessageId(null)}
                  style={{
                    display: 'flex',
                    flexDirection: isMe ? 'row-reverse' : 'row',
                    alignItems: 'flex-end',
                    gap: 10,
                    width: '100%',
                    position: 'relative',
                    margin: '4px 0',
                  }}
                >
                  {/* Recipient Avatar */}
                  {!isMe && (
                    <div className="user-avatar sm" style={{ background: 'var(--border-strong)', flexShrink: 0, marginBottom: 2 }}>
                      {(msg.sender_name || msg.sender_username || '?').charAt(0).toUpperCase()}
                    </div>
                  )}

                  {/* Message Bubble Column */}
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: isMe ? 'flex-end' : 'flex-start',
                      maxWidth: '72%',
                      position: 'relative',
                    }}
                  >
                    {!isMe && isGroup && (
                      <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2, paddingLeft: 4 }}>
                        {msg.sender_name || msg.sender_username}
                      </div>
                    )}

                    {/* Bubble or Inline Editor */}
                    {isEditing ? (
                      <div
                        style={{
                          background: 'var(--bg-card)',
                          border: '1px solid var(--discord-blurple)',
                          borderRadius: 'var(--radius-sm)',
                          padding: 10,
                          width: '100%',
                          minWidth: 260,
                          boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
                        }}
                      >
                        <textarea
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSaveEdit(msg.id);
                            } else if (e.key === 'Escape') {
                              setEditingMessageId(null);
                            }
                          }}
                          rows={2}
                          autoFocus
                          style={{
                            width: '100%',
                            background: 'var(--bg-subtle)',
                            border: '1px solid var(--border-medium)',
                            borderRadius: 'var(--radius-xs)',
                            padding: '6px 8px',
                            color: 'var(--text-heading)',
                            fontSize: '13px',
                            resize: 'none',
                            outline: 'none',
                          }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 6 }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-xs"
                            onClick={() => setEditingMessageId(null)}
                            style={{ fontSize: '11px', padding: '3px 8px' }}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-xs"
                            onClick={() => handleSaveEdit(msg.id)}
                            disabled={!editingText.trim()}
                            style={{ fontSize: '11px', padding: '3px 8px' }}
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          padding: msg.message_type === 'audio' ? '4px 6px' : '9px 14px',
                          fontSize: '13.5px',
                          lineHeight: 1.45,
                          wordBreak: 'break-word',
                          borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                          background: isMe ? 'var(--discord-blurple)' : 'var(--bg-card)',
                          color: isMe ? '#ffffff' : 'var(--text-heading)',
                          border: isMe ? 'none' : '1px solid var(--border-medium)',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                          position: 'relative',
                        }}
                      >
                        {msg.message_type === 'audio' && msg.media_url ? (
                          <VoiceNotePlayer
                            mediaUrl={msg.media_url}
                            duration={msg.duration}
                            isSender={isMe}
                          />
                        ) : (
                          <FormattedMessage text={msg.body} />
                        )}

                        {msg.is_edited && (
                          <span style={{ fontSize: '10px', opacity: 0.7, marginLeft: 6 }}>
                            (edited)
                          </span>
                        )}
                      </div>
                    )}

                    {/* Reaction Badges */}
                    {msg.reactions && msg.reactions.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                        {msg.reactions.map((r, rIdx) => (
                          <button
                            key={rIdx}
                            onClick={() => handleReaction(msg.id, r.emoji)}
                            style={{
                              background: r.has_reacted ? 'rgba(88, 101, 242, 0.25)' : 'var(--bg-subtle)',
                              borderColor: r.has_reacted ? 'var(--discord-blurple)' : 'var(--border-subtle)',
                              color: r.has_reacted ? '#fff' : 'var(--text-muted)',
                              border: '1px solid',
                              borderRadius: 'var(--radius-full)',
                              padding: '1px 7px',
                              fontSize: '11px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                              cursor: 'pointer',
                            }}
                            title={`${r.count} reaction${r.count !== 1 ? 's' : ''}`}
                          >
                            <span>{r.emoji}</span>
                            <span style={{ fontWeight: 700 }}>{r.count}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Time & Read Status */}
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 2, padding: '0 4px', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span>{timeFormat(msg.created_at)}</span>
                      {isMe && (
                        <span
                          title={
                            msg.status === 'read'
                              ? `Read ${msg.read_at ? new Date(msg.read_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}`
                              : msg.status === 'delivered'
                              ? 'Delivered'
                              : 'Sent'
                          }
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            color: msg.status === 'read' ? '#3b82f6' : 'var(--text-muted)',
                          }}
                        >
                          {msg.status === 'read' || msg.status === 'delivered' ? (
                            <IconCheckCheck size={13} />
                          ) : (
                            <IconCheck size={13} />
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Hover Reaction Toolbar & Three-Dot Dropdown */}
                  {(isHovered || isDropdownOpen) && !isEditing && (
                    <div
                      style={{
                        position: 'absolute',
                        top: -14,
                        [isMe ? 'right' : 'left']: isMe ? '75%' : '75%',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-medium)',
                        borderRadius: 'var(--radius-full)',
                        padding: '2px 6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
                        zIndex: 30,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {QUICK_EMOJIS.slice(0, 4).map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => handleReaction(msg.id, emoji)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '2px 4px',
                            fontSize: '13px',
                            lineHeight: 1,
                            borderRadius: '4px',
                          }}
                          title={`React ${emoji}`}
                        >
                          {emoji}
                        </button>
                      ))}

                      <div style={{ width: 1, height: 14, background: 'var(--border-subtle)', margin: '0 2px' }} />

                      {/* Dropdown toggle */}
                      <div style={{ position: 'relative' }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveDropdownMsgId(isDropdownOpen ? null : msg.id);
                          }}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '2px 5px',
                            fontSize: '13px',
                            lineHeight: 1,
                            color: 'var(--text-muted)',
                          }}
                          title="Message options"
                        >
                          ⋮
                        </button>

                        {isDropdownOpen && (
                          <div
                            style={{
                              position: 'absolute',
                              top: 'calc(100% + 4px)',
                              right: isMe ? 0 : 'auto',
                              left: isMe ? 'auto' : 0,
                              background: 'var(--bg-card)',
                              border: '1px solid var(--border-medium)',
                              borderRadius: 'var(--radius-sm)',
                              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                              padding: '4px',
                              minWidth: '130px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 2,
                              zIndex: 100,
                            }}
                          >
                            <button
                              type="button"
                              className="btn btn-ghost btn-xs"
                              onClick={() => handleCopyText(msg.body)}
                              style={{ justifyContent: 'flex-start', padding: '6px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: 6 }}
                            >
                              <IconCopy size={13} /> Copy Text
                            </button>

                            {isMe ? (
                              <>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-xs"
                                  onClick={() => handleStartEdit(msg)}
                                  style={{ justifyContent: 'flex-start', padding: '6px 10px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: 6 }}
                                >
                                  <IconPencil size={13} /> Edit Message
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-xs"
                                  onClick={() => handleDeleteMessage(msg.id)}
                                  style={{
                                    justifyContent: 'flex-start',
                                    padding: '6px 10px',
                                    fontSize: '12px',
                                    color: 'var(--discord-red)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6
                                  }}
                                >
                                  <IconTrash size={13} /> Delete Message
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-ghost btn-xs"
                                onClick={() => {
                                  setReportingMsg(msg);
                                  setActiveDropdownMsgId(null);
                                }}
                                style={{
                                  justifyContent: 'flex-start',
                                  padding: '6px 10px',
                                  fontSize: '12px',
                                  color: 'var(--discord-yellow)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6
                                }}
                              >
                                <IconAlertTriangle size={13} /> Report Message
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Typing indicator */}
        {isRecipientTyping && (
          <div className="typing-indicator-bar">
            <div className="typing-dots">
              <div className="typing-dot" />
              <div className="typing-dot" />
              <div className="typing-dot" />
            </div>
            <span>@{recipient?.alias || recipient?.username} is typing...</span>
          </div>
        )}

        {/* Input bar / Voice Recording Bar */}
        <div className="chat-input-bar">
          {isRecording ? (
            /* Active Voice Recording Bar */
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              background: 'rgba(237, 66, 69, 0.1)',
              border: '1px solid rgba(237, 66, 69, 0.35)',
              borderRadius: 8,
              padding: '8px 14px',
              gap: 12,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Pulsing Red Dot */}
                <span style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: 'var(--discord-red)',
                  display: 'inline-block',
                  boxShadow: '0 0 10px var(--discord-red)',
                  animation: 'pulse 1.2s infinite',
                }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--discord-red)' }}>
                  Recording: {formatRecordingTime(recordingSeconds)}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Speak clearly into your microphone...
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={cancelRecording}
                  style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <IconTrash size={14} />
                  <span>Discard</span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={sendRecording}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 14px' }}
                >
                  <IconSend size={13} />
                  <span>Send Voice Note</span>
                </button>
              </div>
            </div>
          ) : isUploadingVoice ? (
            /* Uploading state */
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              width: '100%',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-medium)',
              borderRadius: 8,
              padding: '10px 16px',
            }}>
              <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
              <span style={{ fontSize: 13, color: 'var(--text-normal)' }}>
                Processing and sending voice note...
              </span>
            </div>
          ) : (
            /* Standard Text + Voice Trigger Input */
            <form className="chat-input-wrapper" onSubmit={sendMessage} style={{ position: 'relative' }}>
              <input
                value={input}
                onChange={handleInputChange}
                placeholder={isGroup ? `Message #${conversation.name || 'group'}` : `Message @${recipient?.alias || recipient?.username || 'user'}`}
                autoFocus
              />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setShowInputEmojiPicker(!showInputEmojiPicker)}
                title="Add Emoji"
                style={{
                  padding: '6px 8px',
                  fontSize: '16px',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                😊
              </button>
              {showInputEmojiPicker && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 8px)',
                    right: '80px',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-medium)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '8px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(6, 1fr)',
                    gap: '4px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                    zIndex: 100,
                    width: '210px',
                  }}
                >
                  {DM_INSERT_EMOJIS.map(em => (
                    <button
                      key={em}
                      type="button"
                      onClick={() => {
                        setInput(prev => prev + em);
                        setShowInputEmojiPicker(false);
                      }}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '18px', padding: '4px', textAlign: 'center' }}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={startRecording}
                className="btn btn-ghost"
                title="Record Voice Note"
                style={{
                  padding: '6px 8px',
                  color: 'var(--text-muted)',
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <IconMic size={17} />
              </button>
              <button
                type="submit"
                className="send-btn"
                disabled={!input.trim()}
                aria-label="Send"
              >
                <IconSend size={15} />
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Group Members Modal */}
      {showMembersModal && isGroup && (
        <div className="modal-overlay" onClick={() => setShowMembersModal(false)}>
          <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <IconUsers size={18} style={{ color: 'var(--discord-green)' }} />
                <span>{conversation.name} · Members</span>
              </div>
              <button className="modal-close-btn" onClick={() => setShowMembersModal(false)}>
                ✕
              </button>
            </div>

            <div className="modal-body">
              {/* Add Member Search Input */}
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 700 }}>Add Member to Group</label>
                <input
                  value={addMemberQuery}
                  onChange={(e) => handleSearchNewMember(e.target.value)}
                  placeholder="Search user by name or alias..."
                />
              </div>

              {addMemberResults.length > 0 && (
                <div style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 150, overflowY: 'auto' }}>
                  {addMemberResults.map(u => (
                    <div
                      key={u.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 10px',
                        background: 'var(--bg-subtle)',
                        borderRadius: 6,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="user-avatar sm" style={{ width: 24, height: 24, fontSize: 11, background: 'var(--discord-blurple)' }}>
                          {(u.name || u.username || '?').charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-heading)' }}>{u.name || u.username}</span>
                      </div>
                      <button
                        className="btn btn-primary btn-xs"
                        disabled={addingMember}
                        onClick={() => handleAddMemberToGroup(u)}
                      >
                        + Add
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Current Members List */}
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
                Group Participants ({conversation.members?.length || 0})
              </label>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 240, overflowY: 'auto' }}>
                {(conversation.members || []).map(m => {
                  const isCurrent = m.id === user?.id;
                  const canRemove = conversation.is_admin && !isCurrent;
                  return (
                    <div
                      key={m.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        background: 'var(--bg-subtle)',
                        borderRadius: 6,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="user-avatar sm" style={{ width: 28, height: 28, fontSize: 12, background: m.role === 'admin' ? 'var(--discord-blurple)' : 'var(--border-strong)' }}>
                          {(m.name || m.username || '?').charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-heading)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span>{m.name || m.username}</span>
                            {isCurrent && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>(You)</span>}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            @{m.alias}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: m.role === 'admin' ? 'rgba(88, 101, 242, 0.15)' : 'rgba(255,255,255,0.06)',
                          color: m.role === 'admin' ? 'var(--discord-blurple)' : 'var(--text-muted)',
                        }}>
                          {m.role === 'admin' ? 'Admin' : 'Member'}
                        </span>
                        {canRemove && (
                          <button
                            onClick={() => handleRemoveMemberFromGroup(m.id)}
                            style={{ background: 'none', border: 'none', color: 'var(--discord-red)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleLeaveGroup}
                style={{ color: 'var(--discord-red)' }}
              >
                Leave Group
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowMembersModal(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {reportingMsg && (
        <ReportModal
          isOpen={true}
          onClose={() => setReportingMsg(null)}
          targetType="message"
          targetId={reportingMsg.id}
          targetName={`Message from @${reportingMsg.sender_username || reportingMsg.username || 'user'}: "${reportingMsg.body?.slice(0, 30)}..."`}
        />
      )}
    </>
  );
}
