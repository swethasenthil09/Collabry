import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { getSocket, connectSocket } from '../../services/socket';
import InviteMemberModal from './InviteMemberModal';
import ConfirmModal from '../common/ConfirmModal';
import { IconUsers, IconPlus, IconSend, IconTrash, IconDownload, IconChat, IconFileText, IconArchive } from '../common/Icons';

export default function ProjectMembers({ project, onMemberUpdated }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [showInvite, setShowInvite] = useState(false);
  const [invitations, setInvitations] = useState([]);
  const [joinRequests, setJoinRequests] = useState([]);
  const [memberToRemove, setMemberToRemove] = useState(null);
  const [memberToTransfer, setMemberToTransfer] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());
  const [showExportMenu, setShowExportMenu] = useState(false);

  const isOwner = project.user_role === 'owner' || project.created_by === user?.id;
  const isMaintainer = isOwner || project.user_role === 'maintainer' || project.user_role === 'admin';

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    const socket = getSocket() || connectSocket(token);

    socket.emit('users:get_online');
    socket.on('users:online_list', (ids) => {
      setOnlineUserIds(new Set(ids));
    });
    socket.on('user:presence', ({ userId, status }) => {
      setOnlineUserIds(prev => {
        const next = new Set(prev);
        if (status === 'online') next.add(userId);
        else next.delete(userId);
        return next;
      });
    });

    return () => {
      socket.off('users:online_list');
      socket.off('user:presence');
    };
  }, []);

  useEffect(() => {
    if (isMaintainer) {
      loadInvitations();
      loadJoinRequests();
    }
  }, [project.id]);

  const handleExport = async (type, format) => {
    try {
      const res = await api.get(`/projects/${project.id}/export/${type}?format=${format}`, {
        responseType: 'blob',
      });
      const downloadUrl = window.URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = type === 'tasks' ? `tasks-${project.name}.csv` : type === 'chat' ? `chat-${project.name}.txt` : `backup-${project.name}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setShowExportMenu(false);
    } catch (err) {
      console.error('Export error:', err);
      setErrorMsg('Failed to export data');
    }
  };

  const loadInvitations = async () => {
    try {
      const res = await api.get(`/projects/${project.id}/invitations`);
      setInvitations(res.data || []);
    } catch (err) {
      console.error('Failed to load project invitations:', err);
    }
  };

  const loadJoinRequests = async () => {
    try {
      const res = await api.get(`/projects/${project.id}/join-requests`);
      setJoinRequests(res.data || []);
    } catch (err) {
      console.error('Failed to load join requests:', err);
    }
  };

  const handleRevokeInvite = async (invitationId) => {
    try {
      await api.delete(`/projects/${project.id}/invitations/${invitationId}`);
      loadInvitations();
    } catch (err) {
      setErrorMsg(err.response?.data?.error?.message || 'Failed to revoke invitation');
    }
  };

  const handleReviewJoinRequest = async (requestId, status, role = 'contributor') => {
    try {
      await api.patch(`/projects/${project.id}/join-requests/${requestId}`, { status, role });
      loadJoinRequests();
      onMemberUpdated?.();
    } catch (err) {
      setErrorMsg(err.response?.data?.error?.message || 'Failed to review join request');
    }
  };

  const handleStartDm = async (recipientId) => {
    if (!recipientId) return;
    try {
      const res = await api.post('/messages/dms', { recipient_id: recipientId });
      navigate(`/dm/${res.data.conversation_id}`);
    } catch (err) {
      console.error('Failed to open DM:', err);
    }
  };

  const handleRoleChange = async (memberId, newRole) => {
    setErrorMsg('');
    setUpdatingId(memberId);
    try {
      await api.patch(`/projects/${project.id}/members/${memberId}`, { role: newRole });
      onMemberUpdated?.();
    } catch (err) {
      setErrorMsg(err.response?.data?.error?.message || 'Failed to update member role');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRemoveMember = async () => {
    if (!memberToRemove) return;
    try {
      await api.delete(`/projects/${project.id}/members/${memberToRemove.id}`);
      setMemberToRemove(null);
      onMemberUpdated?.();
      if (memberToRemove.id === user?.id) {
        navigate('/');
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error?.message || 'Failed to remove member');
    }
  };

  const handleTransferOwnership = async () => {
    if (!memberToTransfer) return;
    try {
      await api.post(`/projects/${project.id}/transfer-ownership`, {
        new_owner_id: memberToTransfer.id,
      });
      setMemberToTransfer(null);
      onMemberUpdated?.();
    } catch (err) {
      setErrorMsg(err.response?.data?.error?.message || 'Failed to transfer ownership');
    }
  };

  if (!project?.members) {
    return <div className="empty-state"><div className="empty-state-title">No members found</div></div>;
  }

  const roleOrder = { owner: 0, maintainer: 1, admin: 1, contributor: 2, member: 2, viewer: 3 };
  const sorted = [...project.members].sort((a, b) => (roleOrder[a.role] ?? 99) - (roleOrder[b.role] ?? 99));

  const roleMeta = {
    owner: { color: '#FEE75C', bg: 'rgba(254, 231, 92, 0.15)', label: 'Owner' },
    maintainer: { color: '#5865F2', bg: 'rgba(88, 101, 242, 0.15)', label: 'Maintainer' },
    admin: { color: '#5865F2', bg: 'rgba(88, 101, 242, 0.15)', label: 'Maintainer' },
    contributor: { color: '#57F287', bg: 'rgba(87, 242, 135, 0.15)', label: 'Contributor' },
    member: { color: '#57F287', bg: 'rgba(87, 242, 135, 0.15)', label: 'Contributor' },
    viewer: { color: '#9da3b4', bg: 'rgba(157, 163, 180, 0.15)', label: 'Viewer (Read-Only)' },
  };

  return (
    <div>
      {errorMsg && (
        <div className="error-msg" style={{ marginBottom: 16 }}>
          {errorMsg}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-heading)', margin: 0 }}>
            Workspace Members &amp; Permissions ({project.members.length})
          </h3>
          <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Manage access roles: <strong>Owner</strong>, <strong>Maintainer</strong>, <strong>Contributor</strong>, and <strong>Viewer</strong>.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
          <div style={{ position: 'relative' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowExportMenu(!showExportMenu)}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              title="Export workspace data and backups"
            >
              <IconDownload size={14} />
              <span>Export</span>
            </button>
            {showExportMenu && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  right: 0,
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '6px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  zIndex: 100,
                  width: '180px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => handleExport('tasks', 'csv')}
                  style={{ justifyContent: 'flex-start', width: '100%', fontSize: '12px', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <IconFileText size={14} /> Tasks (CSV)
                </button>
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => handleExport('chat', 'txt')}
                  style={{ justifyContent: 'flex-start', width: '100%', fontSize: '12px', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <IconChat size={14} /> Chat Archive (TXT)
                </button>
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => handleExport('backup', 'json')}
                  style={{ justifyContent: 'flex-start', width: '100%', fontSize: '12px', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <IconArchive size={14} /> Full Backup (JSON)
                </button>
              </div>
            )}
          </div>

          {isMaintainer && (
            <button className="btn btn-primary btn-sm" onClick={() => setShowInvite(true)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <IconPlus size={14} />
              <span>Invite Member</span>
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.map((member) => {
          const isMemberSelf = member.id === user?.id;
          const isMemberOwner = member.role === 'owner';
          const meta = roleMeta[member.role] || roleMeta.contributor;
          const isOnline = onlineUserIds.has(member.id);

          return (
            <div
              key={member.id}
              className="member-list-item"
              style={{
                padding: '12px 16px',
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-medium)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div className="user-avatar" style={{ background: 'var(--discord-blurple)', width: 38, height: 38, flexShrink: 0, position: 'relative' }}>
                {member.avatar_url ? (
                  <img src={member.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                ) : (
                  (member.name || member.username || '?').charAt(0).toUpperCase()
                )}
                <span
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: isOnline ? '#57F287' : '#747f8d',
                    border: '2px solid var(--bg-card)',
                  }}
                  title={isOnline ? 'Active Now' : 'Offline'}
                />
              </div>

              <div style={{ flex: 1, minWidth: 160 }}>
                <div className="member-name" style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--text-heading)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{member.name || member.username}</span>
                  {isMemberSelf && (
                    <span style={{ fontSize: '10px', background: 'var(--border-medium)', color: 'var(--text-muted)', padding: '1px 6px', borderRadius: 4 }}>
                      You
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  <span>@{member.username}</span>
                </div>
              </div>

              {/* Role Selector or Badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {isOwner && !isMemberOwner ? (
                  <select
                    value={member.role === 'admin' ? 'maintainer' : (member.role === 'member' ? 'contributor' : member.role)}
                    onChange={(e) => handleRoleChange(member.id, e.target.value)}
                    disabled={updatingId === member.id}
                    style={{
                      background: 'var(--bg-input)',
                      color: meta.color,
                      border: `1px solid ${meta.color}55`,
                      padding: '4px 8px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                  >
                    <option value="maintainer">Maintainer</option>
                    <option value="contributor">Contributor</option>
                    <option value="viewer">Viewer (Read-Only)</option>
                  </select>
                ) : isMaintainer && !isOwner && !isMemberOwner && member.role !== 'maintainer' && member.role !== 'admin' ? (
                  <select
                    value={member.role === 'member' ? 'contributor' : member.role}
                    onChange={(e) => handleRoleChange(member.id, e.target.value)}
                    disabled={updatingId === member.id}
                    style={{
                      background: 'var(--bg-input)',
                      color: meta.color,
                      border: `1px solid ${meta.color}55`,
                      padding: '4px 8px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                  >
                    <option value="contributor">Contributor</option>
                    <option value="viewer">Viewer (Read-Only)</option>
                  </select>
                ) : (
                  <span
                    className="member-role"
                    style={{
                      color: meta.color,
                      background: meta.bg,
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px',
                    }}
                  >
                    {meta.label}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {!isMemberSelf && (
                  <button
                    className="btn-icon"
                    onClick={() => handleStartDm(member.id)}
                    title={`Send direct message to ${member.name || member.username}`}
                    style={{ color: 'var(--text-muted)', padding: '6px' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--discord-blurple)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                  >
                    <IconSend size={15} />
                  </button>
                )}

                {/* Transfer ownership option (only owner can transfer to another member) */}
                {isOwner && !isMemberOwner && (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: '11px', padding: '3px 8px', color: '#FEE75C' }}
                    onClick={() => setMemberToTransfer(member)}
                    title="Transfer Workspace Ownership to this member"
                  >
                    Transfer Lead
                  </button>
                )}

                {/* Remove member option */}
                {((isOwner && !isMemberOwner) ||
                  (isMaintainer && !isMemberOwner && member.role !== 'maintainer' && member.role !== 'admin') ||
                  (!isOwner && isMemberSelf)) && (
                  <button
                    className="btn-icon"
                    onClick={() => setMemberToRemove(member)}
                    title={isMemberSelf ? 'Leave workspace' : `Remove ${member.username} from workspace`}
                    style={{ color: 'var(--text-muted)', padding: '6px' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--discord-red)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                  >
                    <IconTrash size={15} />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pending Invitations Section */}
      {isMaintainer && invitations.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
            Pending Invitations ({invitations.length})
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {invitations.map((inv) => (
              <div key={inv.id} className="member-list-item" style={{ padding: '8px 14px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-sm)', opacity: 0.9, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="user-avatar sm">
                  {(inv.name || inv.username || '?').charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-heading)' }}>
                    {inv.name || inv.username}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    @{inv.username} • Role: {inv.role || 'contributor'}
                  </div>
                </div>
                <span className="applicant-status-badge pending">
                  Invited
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--discord-red)', fontSize: '11px', padding: '3px 8px' }}
                  onClick={() => handleRevokeInvite(inv.id)}
                  title="Revoke / Cancel invitation"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending Join Requests ("Interested to Join") Section */}
      {isMaintainer && joinRequests.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
            Pending Join Requests ({joinRequests.length})
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {joinRequests.map((req) => (
              <div
                key={req.id}
                className="member-list-item"
                style={{
                  padding: '12px 14px',
                  background: 'var(--bg-card)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-medium)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="user-avatar sm" style={{ background: 'var(--discord-green)' }}>
                    {(req.name || req.username || '?').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--text-heading)' }}>
                      {req.name || req.username}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      @{req.username}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ fontSize: '12px', padding: '4px 10px', background: 'var(--discord-green)' }}
                      onClick={() => handleReviewJoinRequest(req.id, 'accepted', 'contributor')}
                    >
                      ✓ Approve
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: '12px', padding: '4px 10px', color: 'var(--discord-red)' }}
                      onClick={() => handleReviewJoinRequest(req.id, 'declined')}
                    >
                      Decline
                    </button>
                  </div>
                </div>

                {req.message && (
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-normal)', background: 'var(--bg-subtle)', padding: '6px 10px', borderRadius: 4 }}>
                    "{req.message}"
                  </div>
                )}

                {req.skills_offered && (
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    Skills offered: <strong>{req.skills_offered}</strong>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {showInvite && (
        <InviteMemberModal
          projectId={project.id}
          projectName={project.name}
          onClose={() => setShowInvite(false)}
          onMemberInvited={() => {
            loadInvitations();
            onMemberUpdated?.();
          }}
        />
      )}

      {memberToRemove && (
        <ConfirmModal
          isOpen={true}
          title={memberToRemove.id === user?.id ? 'Leave Workspace' : 'Remove Member'}
          message={
            memberToRemove.id === user?.id
              ? `Are you sure you want to leave "${project.name}"? You will lose access to workspace channels and resources.`
              : `Are you sure you want to remove @${memberToRemove.username} from this workspace?`
          }
          confirmText={memberToRemove.id === user?.id ? 'Leave Workspace' : 'Remove Member'}
          confirmVariant="danger"
          onCancel={() => setMemberToRemove(null)}
          onConfirm={handleRemoveMember}
        />
      )}

      {memberToTransfer && (
        <ConfirmModal
          isOpen={true}
          title="Transfer Workspace Ownership"
          message={`Are you sure you want to make @${memberToTransfer.username} the primary Owner of "${project.name}"? You will become a Maintainer.`}
          confirmText="Transfer Ownership"
          confirmVariant="primary"
          onCancel={() => setMemberToTransfer(null)}
          onConfirm={handleTransferOwnership}
        />
      )}
    </div>
  );
}
