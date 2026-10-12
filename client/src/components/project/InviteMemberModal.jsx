import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import { IconUsers, IconCheck, IconPlus } from '../common/Icons';

export default function InviteMemberModal({ projectId, projectName, onClose, onMemberInvited }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [invitedMap, setInvitedMap] = useState({});
  const [loadingMap, setLoadingMap] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        handleSearch();
      } else {
        setSearchResults([]);
      }
    }, 300);

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

  const handleSendInvite = async (user) => {
    setLoadingMap(prev => ({ ...prev, [user.id]: true }));
    setError('');
    try {
      await api.post(`/projects/${projectId}/invitations`, { invitee_id: user.id });
      setInvitedMap(prev => ({ ...prev, [user.id]: true }));
      onMemberInvited?.();
    } catch (err) {
      console.error('Invite error:', err);
      setError(err.response?.data?.error?.message || 'Failed to send invite');
    } finally {
      setLoadingMap(prev => ({ ...prev, [user.id]: false }));
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
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{ maxWidth: 520, width: '100%', margin: 'auto' }}
      >
        <div className="modal-header">
          <div className="modal-title">
            <IconUsers size={20} style={{ color: 'var(--discord-blurple)' }} />
            <span>Invite Teammates to {projectName || 'Workspace'}</span>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="error-msg">{error}</div>}

          <div className="form-group">
            <label>Search Users by Username, Name, or Alias</label>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Type @alias, name, or username..."
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
                {searchResults.map((u) => {
                  const isInvited = invitedMap[u.id];
                  const isLoading = loadingMap[u.id];
                  return (
                    <div
                      key={u.id}
                      className="member-list-item"
                      style={{ padding: '8px 12px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)' }}
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

                      <button
                        className={`btn ${isInvited ? 'btn-secondary' : 'btn-primary'} btn-sm`}
                        disabled={isInvited || isLoading}
                        onClick={() => handleSendInvite(u)}
                      >
                        {isInvited ? (
                          <>
                            <IconCheck size={12} />
                            <span>Invited</span>
                          </>
                        ) : (
                          <>
                            <IconPlus size={12} />
                            <span>{isLoading ? 'Sending...' : 'Invite'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : searchQuery.trim().length >= 2 ? (
              <div className="empty-state" style={{ padding: 16 }}>
                <div className="empty-state-title" style={{ fontSize: '13px' }}>No users found</div>
                <div className="empty-state-desc" style={{ fontSize: '11px' }}>Try searching by alias or username</div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--text-muted)', fontSize: '12px' }}>
                Enter at least 2 characters to search users on Collabry
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
