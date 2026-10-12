import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { IconChat, IconUsers, IconPlus, IconCheck } from '../common/Icons';

export default function NewDmModal({ onClose, onConversationStarted }) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('dm'); // 'dm' | 'group'

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);
  const [error, setError] = useState('');

  // Group chat specific state
  const [groupName, setGroupName] = useState('');
  const [selectedMembers, setSelectedMembers] = useState([]);

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        handleSearch();
      } else {
        setSearchResults([]);
      }
    }, 250);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery]);

  const handleSearch = async () => {
    setSearching(true);
    try {
      const res = await api.get(`/users/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchResults(res.data || []);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setSearching(false);
    }
  };

  // 1-on-1 DM handler
  const handleStartDm = async (user) => {
    setLoadingAction(true);
    setError('');
    try {
      const res = await api.post('/messages/dms', { target_user_id: user.id });
      onConversationStarted?.();
      onClose();
      navigate(`/dm/${res.data.id}`);
    } catch (err) {
      console.error('Start DM error:', err);
      setError(err.response?.data?.error?.message || 'Failed to start conversation');
    } finally {
      setLoadingAction(false);
    }
  };

  // Group Chat toggle member selection
  const toggleSelectMember = (user) => {
    if (selectedMembers.some(m => m.id === user.id)) {
      setSelectedMembers(prev => prev.filter(m => m.id !== user.id));
    } else {
      setSelectedMembers(prev => [...prev, user]);
    }
  };

  // Create Group Chat handler
  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!groupName.trim()) {
      setError('Please enter a group name.');
      return;
    }
    if (selectedMembers.length === 0) {
      setError('Please select at least 1 member to add to the group.');
      return;
    }

    setLoadingAction(true);
    setError('');
    try {
      const res = await api.post('/messages/groups', {
        name: groupName.trim(),
        member_ids: selectedMembers.map(m => m.id),
      });
      onConversationStarted?.();
      onClose();
      navigate(`/dm/${res.data.id}`);
    } catch (err) {
      console.error('Create group error:', err);
      setError(err.response?.data?.error?.message || 'Failed to create group');
    } finally {
      setLoadingAction(false);
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
        style={{ maxWidth: 480, width: '92%' }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {activeTab === 'dm' ? (
              <IconChat size={20} style={{ color: 'var(--discord-blurple)' }} />
            ) : (
              <IconUsers size={20} style={{ color: 'var(--discord-green)' }} />
            )}
            <span>{activeTab === 'dm' ? 'New Direct Message' : 'Create Group Chat'}</span>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Tab switch */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-medium)', background: 'var(--bg-subtle)' }}>
          <button
            onClick={() => { setActiveTab('dm'); setError(''); }}
            style={{
              flex: 1,
              padding: '10px 14px',
              border: 'none',
              background: activeTab === 'dm' ? 'var(--bg-primary)' : 'transparent',
              color: activeTab === 'dm' ? 'var(--text-heading)' : 'var(--text-muted)',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              borderBottom: activeTab === 'dm' ? '2px solid var(--discord-blurple)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <IconChat size={15} />
            <span>1-on-1 Direct Message</span>
          </button>
          <button
            onClick={() => { setActiveTab('group'); setError(''); }}
            style={{
              flex: 1,
              padding: '10px 14px',
              border: 'none',
              background: activeTab === 'group' ? 'var(--bg-primary)' : 'transparent',
              color: activeTab === 'group' ? 'var(--text-heading)' : 'var(--text-muted)',
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              borderBottom: activeTab === 'group' ? '2px solid var(--discord-green)' : 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <IconUsers size={15} />
            <span>Multi-User Group Chat</span>
          </button>
        </div>

        <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {error && <div className="error-msg" style={{ marginBottom: 12 }}>{error}</div>}

          {/* Mode 1: 1-on-1 Direct Message */}
          {activeTab === 'dm' && (
            <div>
              <div className="form-group">
                <label>Find User by Name, Username, or Alias</label>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. alex, @coder99, Sarah..."
                  autoFocus
                />
              </div>

              <div style={{ marginTop: 8 }}>
                {searching ? (
                  <div className="empty-state" style={{ padding: 16 }}>
                    <div className="spinner"></div>
                  </div>
                ) : searchResults.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {searchResults.map((u) => (
                      <div
                        key={u.id}
                        className="member-list-item"
                        style={{ padding: '10px 12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                        onClick={() => handleStartDm(u)}
                      >
                        <div className="user-avatar sm" style={{ background: 'var(--discord-blurple)' }}>
                          {(u.name || u.username || '?').charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="member-name" style={{ fontWeight: 600, color: 'var(--text-heading)' }}>
                            {u.name || u.username}
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            @{u.alias} · {u.username}
                          </div>
                        </div>

                        <button className="btn btn-primary btn-sm" disabled={loadingAction}>
                          <IconChat size={13} />
                          <span>Chat</span>
                        </button>
                      </div>
                    ))}
                  </div>
                ) : searchQuery.trim().length >= 2 ? (
                  <div className="empty-state" style={{ padding: 16 }}>
                    <div className="empty-state-title" style={{ fontSize: '13px' }}>No users found</div>
                    <div className="empty-state-desc" style={{ fontSize: '11px' }}>Try searching by alias or username</div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: '12px' }}>
                    Search for creators, developers, or teammates to message privately
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Mode 2: Multi-User Group Chat */}
          {activeTab === 'group' && (
            <form onSubmit={handleCreateGroup}>
              <div className="form-group">
                <label>Group Chat Name *</label>
                <input
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  placeholder="e.g. Frontend Core Team, Hackathon Squad..."
                  autoFocus
                  required
                />
              </div>

              {/* Selected Members Chips */}
              {selectedMembers.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                    Selected Members ({selectedMembers.length})
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {selectedMembers.map(m => (
                      <span
                        key={m.id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          background: 'rgba(88, 101, 242, 0.15)',
                          border: '1px solid rgba(88, 101, 242, 0.3)',
                          borderRadius: 14,
                          padding: '2px 8px 2px 10px',
                          fontSize: 12,
                          color: 'var(--text-heading)',
                        }}
                      >
                        {m.name || m.username}
                        <button
                          type="button"
                          onClick={() => toggleSelectMember(m)}
                          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontSize: 14 }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="form-group">
                <label>Add Members to Group</label>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Type name, alias or username to select..."
                />
              </div>

              <div style={{ marginTop: 8 }}>
                {searching ? (
                  <div className="empty-state" style={{ padding: 12 }}>
                    <div className="spinner"></div>
                  </div>
                ) : searchResults.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {searchResults.map((u) => {
                      const isSelected = selectedMembers.some(m => m.id === u.id);
                      return (
                        <div
                          key={u.id}
                          className="member-list-item"
                          style={{
                            padding: '8px 12px',
                            background: isSelected ? 'rgba(88, 101, 242, 0.12)' : 'var(--bg-subtle)',
                            border: isSelected ? '1px solid rgba(88, 101, 242, 0.35)' : '1px solid transparent',
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer',
                          }}
                          onClick={() => toggleSelectMember(u)}
                        >
                          <div className="user-avatar sm" style={{ background: isSelected ? 'var(--discord-blurple)' : 'var(--border-strong)' }}>
                            {(u.name || u.username || '?').charAt(0).toUpperCase()}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="member-name" style={{ fontWeight: 600, color: 'var(--text-heading)', fontSize: 13 }}>
                              {u.name || u.username}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                              @{u.alias}
                            </div>
                          </div>

                          <div style={{
                            width: 22,
                            height: 22,
                            borderRadius: '50%',
                            border: '1px solid',
                            borderColor: isSelected ? 'var(--discord-blurple)' : 'var(--border-strong)',
                            background: isSelected ? 'var(--discord-blurple)' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                          }}>
                            {isSelected && <IconCheck size={13} />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              <div className="modal-footer" style={{ marginTop: 16, padding: '12px 0 0', borderTop: '1px solid var(--border-medium)' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loadingAction || !groupName.trim() || selectedMembers.length === 0}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <IconUsers size={15} />
                  <span>{loadingAction ? 'Creating Group...' : `Create Group (${selectedMembers.length + 1} members)`}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
