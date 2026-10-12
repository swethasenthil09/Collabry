import { useState, useEffect } from 'react';
import api from '../../services/api';
import { FiShield, FiUser, FiTrash2, FiX, FiCheck, FiUsers } from 'react-icons/fi';
import { IconPin } from '../common/Icons';

export default function CommunityModerationModal({ community, onClose, onUpdated }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pinPostId, setPinPostId] = useState(community.pinned_post_id || '');
  const [pinLoading, setPinLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState({});
  const [message, setMessage] = useState({ type: '', text: '' });

  const isOwner = community.user_role === 'owner';

  useEffect(() => {
    loadMembers();
  }, [community.id]);

  const loadMembers = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/communities/${community.id}/members`);
      setMembers(res.data || []);
    } catch (err) {
      console.error('Failed to load community members:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    setActionLoading(prev => ({ ...prev, [userId]: true }));
    setMessage({ type: '', text: '' });
    try {
      await api.patch(`/communities/${community.id}/members/${userId}`, { role: newRole });
      setMembers(prev => prev.map(m => m.user_id === userId ? { ...m, role: newRole } : m));
      setMessage({ type: 'success', text: `Member role updated to ${newRole}` });
      onUpdated?.();
    } catch (err) {
      console.error('Role update error:', err);
      setMessage({ type: 'error', text: err.response?.data?.error?.message || 'Failed to update role' });
    } finally {
      setActionLoading(prev => ({ ...prev, [userId]: false }));
    }
  };

  const handleKickMember = async (userId, username) => {
    if (!window.confirm(`Are you sure you want to remove @${username} from this community?`)) return;
    setActionLoading(prev => ({ ...prev, [userId]: true }));
    setMessage({ type: '', text: '' });
    try {
      await api.delete(`/communities/${community.id}/members/${userId}`);
      setMembers(prev => prev.filter(m => m.user_id !== userId));
      setMessage({ type: 'success', text: `Removed @${username} from community` });
      onUpdated?.();
    } catch (err) {
      console.error('Kick member error:', err);
      setMessage({ type: 'error', text: err.response?.data?.error?.message || 'Failed to remove member' });
    } finally {
      setActionLoading(prev => ({ ...prev, [userId]: false }));
    }
  };

  const handleSavePin = async (e) => {
    e.preventDefault();
    setPinLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const parsedId = pinPostId ? parseInt(pinPostId, 10) : null;
      await api.post(`/communities/${community.id}/pin-post`, { post_id: parsedId });
      setMessage({ type: 'success', text: parsedId ? 'Announcement post pinned!' : 'Announcement unpinned!' });
      onUpdated?.();
    } catch (err) {
      console.error('Pin post error:', err);
      setMessage({ type: 'error', text: 'Failed to update pinned announcement' });
    } finally {
      setPinLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 620,
          width: '92vw',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: 12,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 20px',
            borderBottom: '1px solid var(--border-medium)',
            background: 'var(--bg-subtle)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FiShield size={18} style={{ color: 'var(--discord-blurple)' }} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-heading)' }}>
                Community Moderation Dashboard
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                c/{community.slug} • Your role: <strong style={{ color: 'var(--discord-blurple)' }}>{community.user_role}</strong>
              </div>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose} style={{ padding: 4 }}>
            <FiX size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {message.text && (
            <div
              className={message.type === 'success' ? 'applicant-status-badge accepted' : 'error-msg'}
              style={{ textAlign: 'center', padding: 8, fontSize: 12 }}
            >
              {message.text}
            </div>
          )}

          {/* Section 1: Pin Announcement Post */}
          <div style={{ background: 'var(--bg-subtle)', padding: 14, borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <IconPin size={13} style={{ color: '#FEE75C' }} />
              <span>Pinned Announcement Post ID</span>
            </div>
            <form onSubmit={handleSavePin} style={{ display: 'flex', gap: 8 }}>
              <input
                type="number"
                value={pinPostId}
                onChange={(e) => setPinPostId(e.target.value)}
                placeholder="Post ID to pin at top (leave blank to unpin)"
                style={{ flex: 1, padding: '7px 10px', fontSize: 12 }}
              />
              <button type="submit" className="btn btn-sm btn-primary" disabled={pinLoading}>
                <FiCheck size={13} />
                <span>{pinLoading ? 'Saving...' : 'Update Pin'}</span>
              </button>
            </form>
          </div>

          {/* Section 2: Members List & Roles */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <FiUsers size={13} />
              <span>Community Members ({members.length})</span>
            </div>

            {loading ? (
              <div className="empty-state" style={{ padding: 24 }}>
                <div className="spinner"></div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {members.map((m) => (
                  <div
                    key={m.user_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: 'var(--bg-subtle)',
                      borderRadius: 8,
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        className="user-avatar sm"
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: m.role === 'owner' ? '#FEE75C' : m.role === 'moderator' ? 'var(--discord-blurple)' : 'var(--bg-primary)',
                          color: m.role === 'owner' ? '#000' : '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: 13,
                        }}
                      >
                        {(m.name || m.username || '?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-heading)' }}>
                          {m.name || m.username}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          @{m.alias || m.username}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {/* Role Pill */}
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: 12,
                          textTransform: 'uppercase',
                          background:
                            m.role === 'owner'
                              ? 'rgba(254, 231, 92, 0.15)'
                              : m.role === 'moderator'
                              ? 'rgba(88, 101, 242, 0.15)'
                              : 'rgba(255, 255, 255, 0.05)',
                          color:
                            m.role === 'owner'
                              ? '#FEE75C'
                              : m.role === 'moderator'
                              ? 'var(--discord-blurple)'
                              : 'var(--text-muted)',
                        }}
                      >
                        {m.role}
                      </span>

                      {/* Owner controls to promote/demote */}
                      {isOwner && m.role !== 'owner' && (
                        <button
                          type="button"
                          className="btn btn-xs btn-secondary"
                          onClick={() => handleRoleChange(m.user_id, m.role === 'moderator' ? 'member' : 'moderator')}
                          disabled={actionLoading[m.user_id]}
                          style={{ fontSize: 11, padding: '3px 8px' }}
                          title={m.role === 'moderator' ? 'Demote to Member' : 'Promote to Moderator'}
                        >
                          <FiShield size={11} />
                          <span>{m.role === 'moderator' ? 'Demote' : 'Promote'}</span>
                        </button>
                      )}

                      {/* Kick Button */}
                      {m.role !== 'owner' && (
                        <button
                          type="button"
                          className="btn-icon"
                          onClick={() => handleKickMember(m.user_id, m.username)}
                          disabled={actionLoading[m.user_id]}
                          style={{ color: 'var(--discord-red)', padding: 4 }}
                          title="Remove user from community"
                        >
                          <FiTrash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
