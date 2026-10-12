import { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { getSocket, connectSocket } from '../../services/socket';
import { IconSend, IconChat, IconSparkles, IconX, IconSearch, IconCopy, IconPencil, IconTrash, IconAlertTriangle } from '../common/Icons';
import FormattedMessage from '../chat/FormattedMessage';
import ReportModal from '../common/ReportModal';

const QUICK_EMOJIS = ['👍', '❤️', '🚀', '🔥', '😂', '🎉', '👀'];
const CHAT_INSERT_EMOJIS = ['😀', '😂', '🔥', '🚀', '❤️', '👍', '🎉', '💡', '👏', '💯', '🙌', '✨', '👀', '😎', '🥳', '💪', '🤝', '⭐'];

export default function ProjectChat({ project, activeChannel }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [typingUsers, setTypingUsers] = useState({});
  const [showInputEmojiPicker, setShowInputEmojiPicker] = useState(false);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // In-Chat Search State
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hoveredMessageId, setHoveredMessageId] = useState(null);

  // Message Actions (Edit & Dropdown)
  const [activeDropdownMsgId, setActiveDropdownMsgId] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [reportingMsg, setReportingMsg] = useState(null);

  const currentChannel = activeChannel || project.channels?.[0];
  const channelId = currentChannel?.id;

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = () => setActiveDropdownMsgId(null);
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  useEffect(() => {
    if (!channelId) return;

    loadMessages();
    setTypingUsers({});
    setSearchResults([]);
    setSearchQuery('');
    setShowSearch(false);
    setActiveDropdownMsgId(null);
    setEditingMessageId(null);

    const token = localStorage.getItem('accessToken');
    const socket = getSocket() || connectSocket(token);

    socket.emit('join_channel', channelId);

    const handleNewMessage = (message) => {
      if (String(message.conversation_id) === String(channelId)) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === message.id)) return prev;
          return [...prev, message];
        });
      }
    };

    const handleUserTyping = (data) => {
      if (String(data.conversationId) === String(channelId)) {
        setTypingUsers((prev) => ({ ...prev, [data.userId]: data.username }));
      }
    };

    const handleUserStoppedTyping = (data) => {
      if (String(data.conversationId) === String(channelId)) {
        setTypingUsers((prev) => {
          const updated = { ...prev };
          delete updated[data.userId];
          return updated;
        });
      }
    };

    const handleReactionUpdated = (data) => {
      if (String(data.conversation_id) === String(channelId)) {
        setMessages((prev) =>
          prev.map((m) => (m.id === data.message_id ? { ...m, reactions: data.reactions } : m))
        );
      }
    };

    const handleMessageUpdated = (updated) => {
      if (String(updated.conversation_id) === String(channelId)) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === updated.id ? { ...m, body: updated.body, is_edited: true, updated_at: updated.updated_at } : m
          )
        );
      }
    };

    const handleMessageDeleted = (deleted) => {
      if (String(deleted.conversation_id) === String(channelId)) {
        setMessages((prev) => prev.filter((m) => m.id !== deleted.id));
      }
    };

    socket.on('new_message', handleNewMessage);
    socket.on('user_typing', handleUserTyping);
    socket.on('user_stopped_typing', handleUserStoppedTyping);
    socket.on('message_reaction_updated', handleReactionUpdated);
    socket.on('message_updated', handleMessageUpdated);
    socket.on('message_deleted', handleMessageDeleted);

    return () => {
      socket.emit('leave_channel', channelId);
      socket.off('new_message', handleNewMessage);
      socket.off('user_typing', handleUserTyping);
      socket.off('user_stopped_typing', handleUserStoppedTyping);
      socket.off('message_reaction_updated', handleReactionUpdated);
      socket.off('message_updated', handleMessageUpdated);
      socket.off('message_deleted', handleMessageDeleted);
    };
  }, [channelId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadMessages = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/messages/${channelId}?limit=50`);
      setMessages(res.data);
    } catch (err) {
      console.error('Load messages error:', err);
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    const socket = getSocket();
    if (!socket || !channelId) return;

    socket.emit('typing_start', channelId);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing_stop', channelId);
    }, 1800);
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!input.trim() || !channelId) return;

    const socket = getSocket();
    if (socket) {
      socket.emit('send_message', { conversationId: channelId, body: input.trim() });
      socket.emit('typing_stop', channelId);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      setInput('');
    }
  };

  const handleReaction = async (messageId, emoji) => {
    try {
      const res = await api.post(`/messages/${messageId}/reactions`, { emoji });
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions: res.data.reactions } : m))
      );
    } catch (err) {
      console.error('Reaction error:', err);
    }
  };

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
      console.error('Failed to edit message:', err);
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
      console.error('Failed to delete message:', err);
    }
  };

  const handleCopyText = (text) => {
    setActiveDropdownMsgId(null);
    navigator.clipboard.writeText(text);
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim() || !channelId) return;
    setIsSearching(true);
    try {
      const res = await api.get(`/messages/search?q=${encodeURIComponent(searchQuery)}&conversation_id=${channelId}`);
      setSearchResults(res.data.messages || []);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  const timeFormat = (d) => {
    const date = new Date(d);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const typingNames = Object.values(typingUsers).filter(Boolean);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-main)' }}>
      {/* Channel Header Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 20px',
          borderBottom: '1px solid var(--border-medium)',
          background: 'var(--bg-main)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-muted)' }}>#</span>
          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-heading)' }}>
            {currentChannel?.name || 'general'}
          </span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>•</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Channel discussion & updates
          </span>
        </div>

        {/* Search Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            className={`btn btn-ghost btn-sm ${showSearch ? 'active' : ''}`}
            onClick={() => {
              setShowSearch(!showSearch);
              if (showSearch) {
                setSearchResults([]);
                setSearchQuery('');
              }
            }}
            title="Search in Channel"
            style={{ padding: '4px 8px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <IconSearch size={14} /> Search
          </button>
        </div>
      </div>

      {/* In-Chat Search Bar Drawer */}
      {showSearch && (
        <div
          style={{
            padding: '10px 20px',
            background: 'var(--bg-subtle)',
            borderBottom: '1px solid var(--border-medium)',
          }}
        >
          <form onSubmit={handleSearch} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search messages in this channel..."
              autoFocus
              style={{
                flex: 1,
                background: 'var(--bg-card)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                padding: '6px 12px',
                color: 'var(--text-heading)',
                fontSize: '13px',
              }}
            />
            <button type="submit" className="btn btn-primary btn-sm" disabled={isSearching || !searchQuery.trim()}>
              {isSearching ? 'Searching...' : 'Search'}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setShowSearch(false);
                setSearchResults([]);
                setSearchQuery('');
              }}
            >
              <IconX size={14} />
            </button>
          </form>
        </div>
      )}

      {/* Messages Feed Container */}
      <div
        className="chat-messages-container"
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          padding: '16px 20px',
          overflowY: 'auto',
          flex: 1,
        }}
      >
        {loading ? (
          <div className="empty-state"><div className="spinner"></div></div>
        ) : messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <IconSparkles size={36} style={{ color: 'var(--discord-blurple)' }} />
            </div>
            <div className="empty-state-title">Welcome to #{currentChannel?.name || 'general'}!</div>
            <div className="empty-state-desc">This is the start of the #{currentChannel?.name || 'general'} channel.</div>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = Boolean(user && (msg.sender_id === user.id || msg.sender_username === user.username));
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
                }}
              >
                {/* Avatar for other users */}
                {!isMe && (
                  <div className="user-avatar sm" style={{ background: 'var(--border-strong)', flexShrink: 0, marginBottom: 2 }}>
                    {(msg.sender_name || msg.sender_username || '?').charAt(0).toUpperCase()}
                  </div>
                )}

                {/* Message Bubble + Meta Column */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: isMe ? 'flex-end' : 'flex-start',
                    maxWidth: '72%',
                    position: 'relative',
                  }}
                >
                  {/* Sender Name above incoming messages */}
                  {!isMe && (
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', marginBottom: 2, paddingLeft: 4 }}>
                      {msg.sender_name || msg.sender_username}
                    </div>
                  )}

                  {/* Message Bubble or Inline Editor */}
                  {isEditing ? (
                    <div
                      style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--discord-blurple)',
                        borderRadius: 'var(--radius-sm)',
                        padding: 10,
                        width: '100%',
                        minWidth: 280,
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
                        padding: '9px 14px',
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
                      <FormattedMessage text={msg.body} />

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

                  {/* Timestamp Meta */}
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: 2, padding: '0 4px' }}>
                    {timeFormat(msg.created_at)}
                  </div>
                </div>

                {/* Floating Quick Reactions & Three-Dot Dropdown Trigger on Hover */}
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
                    {/* Quick Emojis */}
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

                    {/* Three-dot dropdown menu trigger */}
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
                        title="More actions"
                      >
                        ⋮
                      </button>

                      {/* Dropdown Menu Options */}
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
                                  gap: 6,
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
                                gap: 6,
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
      {typingNames.length > 0 && (
        <div style={{ padding: '4px 20px', fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>●</span>
          <span>
            {typingNames.length === 1
              ? `${typingNames[0]} is typing...`
              : `${typingNames.slice(0, 2).join(', ')} and others are typing...`}
          </span>
        </div>
      )}

      {/* Input Composer Bar */}
      <div style={{ padding: '12px 20px', background: 'var(--bg-main)', borderTop: '1px solid var(--border-medium)' }}>
        <form
          onSubmit={sendMessage}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--bg-card)',
            border: '1px solid var(--border-medium)',
            borderRadius: 'var(--radius-md)',
            padding: '6px 12px',
            position: 'relative',
          }}
        >
          <input
            value={input}
            onChange={handleInputChange}
            placeholder={`Message #${currentChannel?.name || 'general'}...`}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-heading)',
              fontSize: '13.5px',
            }}
          />

          <button
            type="button"
            className="btn-ghost"
            onClick={(e) => {
              e.stopPropagation();
              setShowInputEmojiPicker(!showInputEmojiPicker);
            }}
            style={{ padding: '4px 6px', fontSize: '16px', lineHeight: 1 }}
            title="Add Emoji"
          >
            😊
          </button>

          {showInputEmojiPicker && (
            <div
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 8px)',
                right: '40px',
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
              onClick={(e) => e.stopPropagation()}
            >
              {CHAT_INSERT_EMOJIS.map((em) => (
                <button
                  key={em}
                  type="button"
                  onClick={() => {
                    setInput((prev) => prev + em);
                    setShowInputEmojiPicker(false);
                  }}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '17px',
                    padding: '3px',
                    textAlign: 'center',
                  }}
                >
                  {em}
                </button>
              ))}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={!input.trim()}
            style={{
              borderRadius: 'var(--radius-sm)',
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Send"
          >
            <IconSend size={14} />
          </button>
        </form>
      </div>

      {reportingMsg && (
        <ReportModal
          isOpen={true}
          onClose={() => setReportingMsg(null)}
          targetType="message"
          targetId={reportingMsg.id}
          targetName={`Message from @${reportingMsg.username || 'user'}: "${reportingMsg.body?.slice(0, 30)}..."`}
        />
      )}
    </div>
  );
}
