import { useState, useEffect } from 'react';
import api from '../../services/api';
import { getSocket } from '../../services/socket';
import {
  IconKanban,
  IconFile,
  IconUsers,
  IconBrush,
  IconHash,
  IconVideo,
  IconFolder,
} from '../common/Icons';

const timeAgo = (date) => {
  if (!date) return '';
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export default function ProjectActivity({ project }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!project?.id) return;
    loadActivities();

    const socket = getSocket();
    if (socket) {
      const handleActivity = (newActivity) => {
        if (newActivity && Number(newActivity.project_id) === Number(project.id)) {
          setActivities((prev) => [newActivity, ...prev]);
        }
      };

      socket.on('project:activity', handleActivity);
      return () => {
        socket.off('project:activity', handleActivity);
      };
    }
  }, [project?.id, filter]);

  const loadActivities = async () => {
    setLoading(true);
    try {
      const categoryParam = filter !== 'all' ? `?category=${filter}` : '';
      const res = await api.get(`/projects/${project.id}/activity${categoryParam}`);
      setActivities(res.data || []);
    } catch (err) {
      console.error('Failed to load project activity:', err);
    } finally {
      setLoading(false);
    }
  };

  const getActionMeta = (action) => {
    switch (action) {
      case 'task_created':
        return { label: 'Created Task', icon: <IconKanban size={15} />, color: '#57F287' };
      case 'task_status_changed':
        return { label: 'Moved Task', icon: <IconKanban size={15} />, color: '#5865F2' };
      case 'task_deleted':
        return { label: 'Deleted Task', icon: <IconKanban size={15} />, color: '#ED4245' };
      case 'file_uploaded':
      case 'batch_files_uploaded':
        return { label: 'Uploaded File', icon: <IconFile size={15} />, color: '#00d2ff' };
      case 'resource_added':
        return { label: 'Added Web Resource', icon: <IconFile size={15} />, color: '#FEE75C' };
      case 'file_pinned':
        return { label: 'Pinned Resource', icon: <IconFile size={15} />, color: '#FEE75C' };
      case 'file_deleted':
      case 'all_files_cleared':
        return { label: 'Removed File', icon: <IconFile size={15} />, color: '#ED4245' };
      case 'member_invited':
        return { label: 'Invited Member', icon: <IconUsers size={15} />, color: '#EB459E' };
      case 'member_role_changed':
        return { label: 'Updated Member Role', icon: <IconUsers size={15} />, color: '#5865F2' };
      case 'member_removed':
      case 'member_left':
        return { label: 'Member Left / Removed', icon: <IconUsers size={15} />, color: '#ED4245' };
      case 'ownership_transferred':
        return { label: 'Transferred Ownership', icon: <IconUsers size={15} />, color: '#FEE75C' };
      case 'channel_created':
        return { label: 'Created Channel', icon: <IconHash size={15} />, color: '#57F287' };
      case 'channel_deleted':
        return { label: 'Deleted Channel', icon: <IconHash size={15} />, color: '#ED4245' };
      case 'canvas_updated':
        return { label: 'Updated Whiteboard Canvas', icon: <IconBrush size={15} />, color: '#5865F2' };
      case 'notes_updated':
        return { label: 'Updated Architecture Docs', icon: <IconFile size={15} />, color: '#00d2ff' };
      default:
        return { label: 'Workspace Update', icon: <IconFolder size={15} />, color: '#9da3b4' };
    }
  };

  const formatActivityText = (item) => {
    const actor = item.user?.name || item.user?.username || 'Team Member';
    const d = item.details || {};

    switch (item.action) {
      case 'task_created':
        return <span><strong>{actor}</strong> created task <span style={{ color: '#57F287' }}>"{d.title}"</span> in <em>{d.status || 'todo'}</em></span>;
      case 'task_status_changed':
        return <span><strong>{actor}</strong> moved task <strong>"{d.title}"</strong> to <span style={{ textTransform: 'uppercase', color: '#5865F2', fontWeight: 700 }}>{d.status}</span></span>;
      case 'task_deleted':
        return <span><strong>{actor}</strong> removed task <em>"{d.title}"</em></span>;
      case 'file_uploaded':
        return <span><strong>{actor}</strong> uploaded resource <span style={{ color: '#00d2ff', fontWeight: 600 }}>{d.fileName}</span></span>;
      case 'batch_files_uploaded':
        return <span><strong>{actor}</strong> uploaded a bundle of <strong>{d.count}</strong> files</span>;
      case 'resource_added':
        return <span><strong>{actor}</strong> added web resource <strong>"{d.resourceName}"</strong></span>;
      case 'file_pinned':
        return <span><strong>{actor}</strong> pinned resource #{d.fileId} to the top of the workspace</span>;
      case 'file_deleted':
        return <span><strong>{actor}</strong> deleted resource <em>"{d.fileName}"</em></span>;
      case 'all_files_cleared':
        return <span><strong>{actor}</strong> cleared all project files</span>;
      case 'member_role_changed':
        return <span><strong>{actor}</strong> changed <strong>@{d.targetUsername}</strong>'s role to <span style={{ textTransform: 'uppercase', color: '#FEE75C', fontWeight: 700 }}>{d.newRole}</span></span>;
      case 'member_removed':
        return <span><strong>{actor}</strong> removed <strong>@{d.username}</strong> from the workspace</span>;
      case 'member_left':
        return <span><strong>{actor}</strong> left the workspace</span>;
      case 'ownership_transferred':
        return <span><strong>{actor}</strong> transferred Workspace Ownership to <strong>@{d.newOwnerUsername}</strong></span>;
      case 'channel_created':
        return <span><strong>{actor}</strong> created channel <span style={{ color: '#5865F2', fontWeight: 600 }}>#{d.channelName}</span></span>;
      case 'channel_deleted':
        return <span><strong>{actor}</strong> deleted channel #{d.channelName}</span>;
      case 'canvas_updated':
        return <span><strong>{actor}</strong> edited collaborative whiteboard diagrams</span>;
      case 'notes_updated':
        return <span><strong>{actor}</strong> edited architecture documentation specs</span>;
      default:
        return <span><strong>{actor}</strong> performed {item.action.replace(/_/g, ' ')}</span>;
    }
  };

  const FILTERS = [
    { key: 'all', label: 'All Activity' },
    { key: 'task', label: 'Tasks' },
    { key: 'file', label: 'Files' },
    { key: 'member', label: 'Members & Roles' },
    { key: 'channel', label: 'Channels' },
    { key: 'canvas', label: 'Canvas & Docs' },
  ];

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', width: '100%', padding: '24px 20px' }}>
      {/* Header & Filter Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-heading)', margin: 0 }}>
            Workspace Activity Log &amp; Audit Trail
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Real-time audit log of team task updates, file uploads, member roles, and specs.
          </p>
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '5px 12px',
                borderRadius: 'var(--radius-full)',
                fontSize: '12px',
                fontWeight: 600,
                border: '1px solid',
                borderColor: filter === f.key ? 'var(--discord-blurple)' : 'var(--border-medium)',
                background: filter === f.key ? 'var(--discord-blurple)' : 'var(--bg-card)',
                color: filter === f.key ? '#ffffff' : 'var(--text-normal)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Activity Timeline List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></div>
      ) : activities.length === 0 ? (
        <div className="empty-state" style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: 36, border: '1px solid var(--border-medium)' }}>
          <div className="empty-state-title" style={{ fontSize: '1rem', color: 'var(--text-heading)' }}>No activity records found</div>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Actions taken in tasks, whiteboard, files, channels, and team membership will appear here in real time.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {activities.map((item) => {
            const meta = getActionMeta(item.action);
            return (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  padding: '12px 16px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border-medium)',
                  borderRadius: 'var(--radius-sm)',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
                  transition: 'background 0.15s ease',
                }}
              >
                {/* User Avatar */}
                <div
                  className="user-avatar"
                  style={{
                    width: 36,
                    height: 36,
                    fontSize: '14px',
                    flexShrink: 0,
                    background: 'var(--discord-blurple)',
                    overflow: 'hidden',
                  }}
                >
                  {item.user?.avatar_url ? (
                    <img src={item.user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    (item.user?.name || item.user?.username || '?').charAt(0).toUpperCase()
                  )}
                </div>

                {/* Event Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-normal)', lineHeight: 1.4 }}>
                    {formatActivityText(item)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: '11px',
                        fontWeight: 700,
                        color: meta.color,
                        background: `${meta.color}18`,
                        padding: '1px 8px',
                        borderRadius: 'var(--radius-full)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.4px',
                      }}
                    >
                      {meta.icon}
                      <span>{meta.label}</span>
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {timeAgo ? timeAgo(item.created_at) : new Date(item.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
