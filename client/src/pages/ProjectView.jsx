import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import ProjectChat from '../components/project/ProjectChat';
import KanbanBoard from '../components/project/KanbanBoard';
import ProjectMembers from '../components/project/ProjectMembers';
import ProjectMeetings from '../components/project/ProjectMeetings';
import ProjectFiles from '../components/project/ProjectFiles';
import ProjectGitHub from '../components/project/ProjectGitHub';
import ProjectVoiceRoom from '../components/project/ProjectVoiceRoom';
import ProjectCanvas from '../components/project/ProjectCanvas';
import ProjectActivity from '../components/project/ProjectActivity';
import JoinRequestModal from '../components/project/JoinRequestModal';
import CreateChannelModal from '../components/project/CreateChannelModal';
import ConfirmModal from '../components/common/ConfirmModal';
import { IconFolder, IconChat, IconKanban, IconUsers, IconVideo, IconPlus, IconHash, IconTrash, IconFile, IconGithub, IconRadio, IconBrush, IconActivity, IconInfo, IconHandshake, IconRocket } from '../components/common/Icons';

export default function ProjectView({ onProjectUpdated }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [project, setProject] = useState(null);
  const [activeTab, setActiveTab] = useState('chat');
  const [activeChannelId, setActiveChannelId] = useState(null);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showDeleteProjectConfirm, setShowDeleteProjectConfirm] = useState(false);
  const [showJoinRequestModal, setShowJoinRequestModal] = useState(false);
  const [channelToDelete, setChannelToDelete] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadProject();
  }, [id]);

  const loadProject = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/projects/${id}`);
      setProject(res.data);
      if (res.data.channels?.length > 0 && !activeChannelId) {
        setActiveChannelId(res.data.channels[0].id);
      }
    } catch (err) {
      console.error('Load project error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptInvite = async () => {
    setActionLoading(true);
    try {
      await api.post(`/projects/${id}/join`);
      loadProject();
      onProjectUpdated?.();
    } catch (err) {
      console.error('Accept invite error:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeclineInvite = async () => {
    setActionLoading(true);
    try {
      await api.post(`/projects/${id}/invitations/decline`);
      loadProject();
      onProjectUpdated?.();
    } catch (err) {
      console.error('Decline invite error:', err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleJoinPublicWorkspace = async () => {
    setActionLoading(true);
    try {
      await api.post(`/projects/${id}/join-requests`);
      loadProject();
      onProjectUpdated?.();
    } catch (err) {
      console.error('Join public workspace error:', err);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <div className="empty-state"><div className="spinner"></div></div>;
  if (!project) return <div className="empty-state"><div className="empty-state-title">Project not found</div></div>;

  const activeChannel = project.channels?.find(c => c.id === activeChannelId) || project.channels?.[0];
  const isMember = Boolean(
    project.is_member ||
    project.user_role ||
    project.role ||
    project.creator_id === user?.id ||
    project.created_by === user?.id
  );
  const isOwner = Boolean(
    project.user_role === 'owner' ||
    project.role === 'owner' ||
    project.creator_id === user?.id ||
    project.created_by === user?.id
  );
  const isAdmin = isOwner || project.user_role === 'admin' || project.role === 'admin';

  const handleDeleteProject = async () => {
    try {
      await api.delete(`/projects/${project.id}`);
      setShowDeleteProjectConfirm(false);
      onProjectUpdated?.();
      navigate('/');
    } catch (err) {
      console.error('Delete project error:', err);
    }
  };

  const handleDeleteChannel = async () => {
    if (!channelToDelete) return;
    try {
      await api.delete(`/projects/${project.id}/channels/${channelToDelete.id}`);
      setChannelToDelete(null);
      loadProject();
      if (activeChannelId === channelToDelete.id && project.channels?.length > 1) {
        const remaining = project.channels.find(c => c.id !== channelToDelete.id);
        if (remaining) setActiveChannelId(remaining.id);
      }
    } catch (err) {
      console.error('Delete channel error:', err);
    }
  };

  return (
    <>
      {/* Pending Invitation Banner */}
      {project.pending_invitation && (
        <div
          style={{
            background: 'linear-gradient(90deg, rgba(88, 101, 242, 0.25), rgba(88, 101, 242, 0.12))',
            borderBottom: '1px solid var(--discord-blurple)',
            padding: '12px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: '24px' }}>📬</span>
            <div>
              <div style={{ fontWeight: 800, color: 'var(--text-heading)', fontSize: '0.95rem' }}>
                You have been invited to join <strong>{project.name}</strong>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Invitation role: <strong style={{ color: 'var(--discord-blurple)' }}>{project.pending_invitation.role || 'Contributor'}</strong>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleAcceptInvite}
              disabled={actionLoading}
              style={{ fontWeight: 700 }}
            >
              ✓ Accept Invitation
            </button>
            <button
              className="btn btn-ghost btn-sm"
              style={{ color: 'var(--discord-red)', border: '1px solid rgba(242, 63, 67, 0.4)', background: 'rgba(242, 63, 67, 0.08)' }}
              onClick={handleDeclineInvite}
              disabled={actionLoading}
            >
              ✕ Decline
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="main-header" style={{ display: 'flex', alignItems: 'center' }}>
        <span className="header-icon">
          <IconFolder size={20} style={{ color: 'var(--reddit-orange)' }} />
        </span>
        <h2>{project.name}</h2>
        <span className="collab-status open">{project.status || 'active'}</span>
        <span className="header-description">
          {project.member_count} member{project.member_count !== 1 ? 's' : ''}
        </span>

        {isOwner && (
          <button
            className="btn btn-ghost btn-sm"
            style={{
              marginLeft: 'auto',
              color: 'var(--discord-red)',
              border: '1px solid rgba(242, 63, 67, 0.35)',
              background: 'rgba(242, 63, 67, 0.08)',
              padding: '4px 10px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              borderRadius: 'var(--radius-sm)',
            }}
            onClick={() => setShowDeleteProjectConfirm(true)}
            title="Delete Project Workspace"
          >
            <IconTrash size={14} />
            <span>Delete Workspace</span>
          </button>
        )}
      </header>

      {!isMember ? (
        /* ================= Non-Member Gateway & Preview ================= */
        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-main)' }}>
          <div style={{ maxWidth: 840, margin: '28px auto 0', padding: '0 16px' }}>
            <div
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-lg)',
                padding: '28px 24px',
                boxShadow: '0 8px 30px rgba(0, 0, 0, 0.3)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 14 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        padding: '3px 10px',
                        borderRadius: 'var(--radius-full)',
                        background: project.visibility === 'private' ? 'rgba(242, 63, 67, 0.15)' : 'rgba(87, 242, 135, 0.15)',
                        color: project.visibility === 'private' ? 'var(--discord-red)' : 'var(--discord-green)',
                        border: `1px solid ${project.visibility === 'private' ? 'rgba(242, 63, 67, 0.3)' : 'rgba(87, 242, 135, 0.3)'}`,
                      }}
                    >
                      {project.visibility === 'private' ? '🔒 Private Workspace' : '🌐 Public Workspace'}
                    </span>
                    <span className="collab-status open">{project.status || 'active'}</span>
                  </div>

                  <h1 style={{ margin: '0 0 6px', fontSize: '1.75rem', fontWeight: 900, color: 'var(--text-heading)' }}>
                    {project.name}
                  </h1>

                  <div style={{ fontSize: '0.86rem', color: 'var(--text-muted)' }}>
                    {project.member_count} member{project.member_count !== 1 ? 's' : ''} collaborating
                  </div>
                </div>

                {/* Join / Request Action Button */}
                <div style={{ display: 'flex', gap: 10 }}>
                  {project.pending_join_request ? (
                    <div
                      style={{
                        padding: '8px 16px',
                        background: 'rgba(254, 231, 92, 0.12)',
                        border: '1px solid rgba(254, 231, 92, 0.4)',
                        color: '#FEE75C',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <span>⏳ Join Request Pending Review</span>
                    </div>
                  ) : project.visibility === 'public' ? (
                    <button
                      className="btn btn-primary"
                      style={{ padding: '8px 20px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      onClick={handleJoinPublicWorkspace}
                      disabled={actionLoading}
                    >
                      <IconRocket size={16} /> Join Workspace
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary"
                      style={{ padding: '8px 20px', fontWeight: 700, background: 'var(--discord-blurple)', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      onClick={() => setShowJoinRequestModal(true)}
                    >
                      <IconHandshake size={16} /> Interested / Request to Join
                    </button>
                  )}
                </div>
              </div>

              {project.description && (
                <div
                  style={{
                    marginTop: 18,
                    fontSize: '0.94rem',
                    lineHeight: 1.6,
                    color: 'var(--text-normal)',
                    paddingTop: 16,
                    borderTop: '1px solid var(--border-subtle)',
                  }}
                >
                  {project.description}
                </div>
              )}

              <div
                style={{
                  marginTop: 20,
                  padding: '12px 16px',
                  background: 'var(--bg-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.82rem',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <IconInfo size={16} style={{ flexShrink: 0 }} />
                <span>
                  {project.visibility === 'private'
                    ? 'This workspace is private. Internal channels, tasks, whiteboard canvas, and files are protected and accessible to accepted team members only.'
                    : 'This workspace is open to collaborators. Click "Join Workspace" above to participate in channel chats, task kanbans, and whiteboards.'}
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ================= Member Workspace Experience ================= */
        <>
          {/* Workspace Tabs & Channels Sub-Bar */}
          <div style={{ background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border-medium)' }}>
            <nav className="tabs" style={{ padding: '0 20px', borderBottom: 'none' }}>
              <div className={`tab ${activeTab === 'chat' ? 'active' : ''}`} onClick={() => setActiveTab('chat')}>
                <IconChat size={16} />
                <span>Channel Chat</span>
              </div>
              <div className={`tab ${activeTab === 'tasks' ? 'active' : ''}`} onClick={() => setActiveTab('tasks')}>
                <IconKanban size={16} />
                <span>Tasks</span>
              </div>
              <div className={`tab ${activeTab === 'meetings' ? 'active' : ''}`} onClick={() => setActiveTab('meetings')}>
                <IconVideo size={16} />
                <span>Meetings & Calls</span>
              </div>
              <div className={`tab ${activeTab === 'voice' ? 'active' : ''}`} onClick={() => setActiveTab('voice')}>
                <IconRadio size={16} style={{ color: 'var(--discord-green)' }} />
                <span>Voice Space</span>
              </div>
              <div className={`tab ${activeTab === 'canvas' ? 'active' : ''}`} onClick={() => setActiveTab('canvas')}>
                <IconBrush size={16} style={{ color: 'var(--discord-blurple)' }} />
                <span>Canvas & Docs</span>
              </div>
              <div className={`tab ${activeTab === 'files' ? 'active' : ''}`} onClick={() => setActiveTab('files')}>
                <IconFile size={16} />
                <span>Files & Resources</span>
              </div>
              <div className={`tab ${activeTab === 'github' ? 'active' : ''}`} onClick={() => setActiveTab('github')}>
                <IconGithub size={16} />
                <span>GitHub & Code</span>
              </div>
              <div className={`tab ${activeTab === 'members' ? 'active' : ''}`} onClick={() => setActiveTab('members')}>
                <IconUsers size={16} />
                <span>Team Members</span>
              </div>
              <div className={`tab ${activeTab === 'activity' ? 'active' : ''}`} onClick={() => setActiveTab('activity')}>
                <IconActivity size={16} style={{ color: '#FEE75C' }} />
                <span>Activity Trail</span>
              </div>
            </nav>

            {/* Discord-style Channels Bar */}
            {activeTab === 'chat' && project.channels?.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 20px 10px', overflowX: 'auto' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginRight: 4, letterSpacing: '0.5px' }}>
                  Channels:
                </span>

                {project.channels.map((ch) => {
                  const isSelected = activeChannel?.id === ch.id;
                  return (
                    <div key={ch.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                      <button
                        className={`btn-ghost ${isSelected ? 'active' : ''}`}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 'var(--radius-sm)',
                          fontSize: '13px',
                          fontWeight: 600,
                          background: isSelected ? 'var(--discord-blurple)' : 'var(--bg-subtle)',
                          color: isSelected ? '#fff' : 'var(--text-normal)',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                        onClick={() => setActiveChannelId(ch.id)}
                      >
                        <span style={{ color: isSelected ? '#fff' : 'var(--text-muted)' }}>#</span>
                        <span>{ch.name}</span>
                      </button>

                      {isAdmin && ch.name !== 'general' && (
                        <button
                          className="btn-icon"
                          style={{
                            padding: '2px 5px',
                            color: 'var(--text-muted)',
                            fontSize: '14px',
                            lineHeight: 1,
                            borderRadius: '3px',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--discord-red)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setChannelToDelete(ch);
                          }}
                          title={`Delete #${ch.name}`}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}

                {isMember && (
                  <button
                    className="btn-ghost"
                    style={{ padding: '4px 8px', fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, background: 'transparent' }}
                    onClick={() => setShowCreateChannel(true)}
                    title="Create New Channel"
                  >
                    <IconPlus size={13} />
                    <span>Add Channel</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Tab content */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {activeTab === 'chat' && (
              <ProjectChat project={project} activeChannel={activeChannel} />
            )}
            {activeTab === 'tasks' && (
              <div className="main-body full-width">
                <KanbanBoard projectId={project.id} />
              </div>
            )}
            {activeTab === 'meetings' && (
              <ProjectMeetings project={project} />
            )}
            {activeTab === 'voice' && (
              <div className="main-body full-width" style={{ padding: 20, height: '100%', boxSizing: 'border-box' }}>
                <ProjectVoiceRoom
                  project={project}
                  onExpand={() => setActiveTab('voice')}
                />
              </div>
            )}
            {activeTab === 'canvas' && (
              <div className="main-body full-width" style={{ height: '100%', padding: 0 }}>
                <ProjectCanvas project={project} />
              </div>
            )}
            {activeTab === 'files' && (
              <ProjectFiles project={project} />
            )}
            {activeTab === 'github' && (
              <ProjectGitHub project={project} />
            )}
            {activeTab === 'members' && (
              <div className="main-body">
                <ProjectMembers project={project} onMemberUpdated={() => { loadProject(); onProjectUpdated?.(); }} />
              </div>
            )}
            {activeTab === 'activity' && (
              <div className="main-body" style={{ overflowY: 'auto' }}>
                <ProjectActivity project={project} />
              </div>
            )}
          </div>
        </>
      )}

      {showJoinRequestModal && (
        <JoinRequestModal
          projectId={project.id}
          projectName={project.name}
          onClose={() => setShowJoinRequestModal(false)}
          onSuccess={() => {
            setShowJoinRequestModal(false);
            loadProject();
          }}
        />
      )}

      {showCreateChannel && (
        <CreateChannelModal
          projectId={project.id}
          onClose={() => setShowCreateChannel(false)}
          onChannelCreated={(newChan) => {
            loadProject();
            setActiveChannelId(newChan.id);
          }}
        />
      )}

      {showDeleteProjectConfirm && (
        <ConfirmModal
          isOpen={true}
          title="Delete Workspace"
          message={`Are you sure you want to permanently delete "${project.name}"? All channels, tasks, and meetings will be removed. This action cannot be undone.`}
          confirmText="Delete Workspace"
          confirmVariant="danger"
          onCancel={() => setShowDeleteProjectConfirm(false)}
          onConfirm={handleDeleteProject}
        />
      )}

      {channelToDelete && (
        <ConfirmModal
          isOpen={true}
          title="Delete Channel"
          message={`Are you sure you want to delete #${channelToDelete.name}? All messages in this channel will be permanently removed.`}
          confirmText="Delete Channel"
          confirmVariant="danger"
          onCancel={() => setChannelToDelete(null)}
          onConfirm={handleDeleteChannel}
        />
      )}
    </>
  );
}
