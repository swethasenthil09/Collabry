import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { IconCheck, IconX, IconFolder, IconChat, IconUsers } from './Icons';
import { FiVolume2 } from 'react-icons/fi';
import { playNotificationSound, requestPushPermission } from '../../utils/sound';

export default function NotificationsPopover({ onClose, onNotificationAction }) {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [pushStatus, setPushStatus] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'denied'
  );

  const hasPushSupport = typeof window !== 'undefined' && 'Notification' in window;

  const handleEnablePush = async () => {
    const status = await requestPushPermission();
    setPushStatus(status);
    if (status === 'granted') {
      playNotificationSound();
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const res = await api.get('/notifications');
      setNotifications(res.data.notifications || []);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: 1 } : n));
      onNotificationAction?.();
    } catch (err) {
      console.error('Mark read error:', err);
    }
  };

  const markAllRead = async () => {
    try {
      await api.post('/notifications/read-all');
      setNotifications(notifications.map(n => ({ ...n, is_read: 1 })));
      onNotificationAction?.();
    } catch (err) {
      console.error('Mark all read error:', err);
    }
  };

  const handleAcceptInvite = async (e, notif) => {
    e.stopPropagation();
    setActionLoading({ ...actionLoading, [notif.id]: 'accepting' });
    try {
      // Find invitations
      const invRes = await api.get('/users/invitations');
      const targetInv = invRes.data.find(inv => inv.project_id === notif.reference_id && inv.status === 'pending');
      
      if (targetInv) {
        await api.post(`/users/invitations/${targetInv.id}/accept`);
      }
      await markAsRead(notif.id);
      onNotificationAction?.();
      onClose?.();
      navigate(`/project/${notif.reference_id}`);
    } catch (err) {
      console.error('Accept invite error:', err);
    } finally {
      setActionLoading({ ...actionLoading, [notif.id]: null });
    }
  };

  const handleDeclineInvite = async (e, notif) => {
    e.stopPropagation();
    setActionLoading({ ...actionLoading, [notif.id]: 'declining' });
    try {
      const invRes = await api.get('/users/invitations');
      const targetInv = invRes.data.find(inv => inv.project_id === notif.reference_id && inv.status === 'pending');
      
      if (targetInv) {
        await api.post(`/users/invitations/${targetInv.id}/decline`);
      }
      await markAsRead(notif.id);
      onNotificationAction?.();
    } catch (err) {
      console.error('Decline invite error:', err);
    } finally {
      setActionLoading({ ...actionLoading, [notif.id]: null });
    }
  };

  const handleNotificationClick = (notif) => {
    markAsRead(notif.id);
    onClose?.();
    if (notif.reference_type === 'project' && notif.reference_id) {
      navigate(`/project/${notif.reference_id}`);
    }
  };

  const timeAgo = (date) => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <>
      <div className="popover-backdrop" onClick={onClose} />
      <div className="notifications-popover" onClick={(e) => e.stopPropagation()}>
        <div className="notifications-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, color: 'var(--text-heading)', fontSize: '14px' }}>
              Notifications
            </span>
            {notifications.filter(n => !n.is_read).length > 0 && (
              <span style={{ background: 'var(--reddit-orange)', color: '#fff', fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '10px' }}>
                {notifications.filter(n => !n.is_read).length} new
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              className="btn-icon"
              onClick={playNotificationSound}
              style={{ padding: 4, color: 'var(--discord-blurple)' }}
              title="Test notification chime sound"
            >
              <FiVolume2 size={14} />
            </button>
            {hasPushSupport && pushStatus === 'default' && (
              <button
                className="btn-ghost"
                onClick={handleEnablePush}
                style={{ fontSize: '10px', color: 'var(--discord-green)', padding: '2px 5px' }}
                title="Enable desktop notifications"
              >
                Enable Alerts
              </button>
            )}
            {notifications.some(n => !n.is_read) && (
              <button className="btn-ghost" style={{ fontSize: '11px', color: 'var(--discord-blurple)' }} onClick={markAllRead}>
                Mark all read
              </button>
            )}
            <button className="btn-icon" onClick={onClose} style={{ padding: 4, color: 'var(--text-muted)' }} title="Close">
              <IconX size={15} />
            </button>
          </div>
        </div>

      <div className="notifications-body">
        {loading ? (
          <div className="empty-state" style={{ padding: '24px 0' }}>
            <div className="spinner"></div>
          </div>
        ) : notifications.length === 0 ? (
          <div className="empty-state" style={{ padding: '24px 0' }}>
            <div className="empty-state-title" style={{ fontSize: '14px' }}>No notifications</div>
            <div className="empty-state-desc" style={{ fontSize: '12px' }}>You're all caught up!</div>
          </div>
        ) : (
          notifications.map((notif) => {
            const isInvite = notif.type === 'invitation';
            return (
              <div
                key={notif.id}
                className={`notification-item ${!notif.is_read ? 'unread' : ''}`}
                onClick={() => handleNotificationClick(notif)}
              >
                <div className="notification-icon">
                  {isInvite ? (
                    <IconFolder size={16} style={{ color: 'var(--reddit-orange)' }} />
                  ) : notif.type === 'interest' ? (
                    <IconUsers size={16} style={{ color: 'var(--discord-green)' }} />
                  ) : (
                    <IconChat size={16} style={{ color: 'var(--discord-blurple)' }} />
                  )}
                </div>

                <div className="notification-content">
                  <div className="notification-title">{notif.title}</div>
                  {notif.body && <div className="notification-body-text">{notif.body}</div>}
                  <div className="notification-time">{timeAgo(notif.created_at)}</div>

                  {isInvite && (
                    <div className="notification-actions">
                      <button
                        className="btn btn-primary btn-sm"
                        style={{ background: 'var(--discord-green)', borderColor: 'var(--discord-green)', padding: '2px 8px', fontSize: '11px' }}
                        disabled={actionLoading[notif.id]}
                        onClick={(e) => handleAcceptInvite(e, notif)}
                      >
                        <IconCheck size={12} />
                        <span>{actionLoading[notif.id] === 'accepting' ? 'Joining...' : 'Accept'}</span>
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '2px 8px', fontSize: '11px', color: 'var(--discord-red)' }}
                        disabled={actionLoading[notif.id]}
                        onClick={(e) => handleDeclineInvite(e, notif)}
                      >
                        <IconX size={12} />
                        <span>Decline</span>
                      </button>
                    </div>
                  )}
                </div>

                {!notif.is_read && <div className="unread-dot" />}
              </div>
            );
          })
        )}
      </div>
    </div>
  </>
);
}
