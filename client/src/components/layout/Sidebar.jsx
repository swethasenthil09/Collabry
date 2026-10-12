import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import CollabryLogo from '../common/CollabryLogo';
import NotificationsPopover from '../common/NotificationsPopover';
import ProfileModal from '../common/ProfileModal';
import VerifyEmailModal from '../common/VerifyEmailModal';
import CreateProjectModal from '../project/CreateProjectModal';
import NewDmModal from '../chat/NewDmModal';
import { IconPlus, IconChat, IconRadio, IconUsers, IconAlertTriangle, IconShield } from '../common/Icons';

export default function Sidebar({ communities, projects, dms = [], groups = [], currentPath, unreadCount, onNavigate, onToggleNav, onDataChange, onOpenSearch, user }) {
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showVerifyEmail, setShowVerifyEmail] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [showNewDm, setShowNewDm] = useState(false);

  return (
    <>
      <aside className="sidebar">
        {/* Brand Header */}
        <div className="sidebar-header">
          <div
            onClick={onToggleNav}
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
            title="Click app icon to collapse navigation"
          >
            <CollabryLogo size={24} showText={true} />
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'var(--bg-subtle)', padding: '2px 5px', borderRadius: '4px', fontWeight: 700 }}>
              v1.0
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {/* Collapse / Shrink to Burger button */}
            <button
              className="btn-icon"
              onClick={onToggleNav}
              title="Collapse navigation to burger"
              aria-label="Collapse Navigation"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            {/* Notifications Bell */}
            <div style={{ position: 'relative' }}>
            <button
              className="btn-icon"
              style={{ position: 'relative' }}
              onClick={() => setShowNotifications(!showNotifications)}
              title="Notifications & Invitations"
              aria-label="Notifications"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {unreadCount > 0 && (
                <span
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: 2,
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: 'var(--reddit-orange)',
                    boxShadow: '0 0 6px var(--reddit-orange)',
                  }}
                />
              )}
            </button>

            {showNotifications && (
              <NotificationsPopover
                onClose={() => setShowNotifications(false)}
                onNotificationAction={() => {
                  onDataChange?.();
                }}
              />
            )}
          </div>
        </div>
      </div>

        <div className="sidebar-content">
          {/* Quick Omnisearch Trigger */}
          <div
            onClick={onOpenSearch}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '7px 12px',
              background: 'var(--bg-subtle)',
              border: '1px solid var(--border-medium)',
              borderRadius: 'var(--radius-sm)',
              margin: '10px 14px 6px',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: '12px',
              transition: 'border-color 0.15s ease',
            }}
            title="Global search across posts, communities, code repositories, users, broadcasts"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span>Search...</span>
            </div>
            <kbd style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid var(--border-medium)',
              borderRadius: 4,
              padding: '1px 5px',
              fontSize: 10,
              fontWeight: 700,
            }}>
              Ctrl+K
            </kbd>
          </div>

          {/* Navigation Feeds */}
          <div className="sidebar-section">
            <div
              className={`sidebar-item ${currentPath === '/' || (user?.role === 'admin' && currentPath === '/admin') ? 'active' : ''}`}
              onClick={() => onNavigate(user?.role === 'admin' ? '/admin' : '/')}
            >
              <span className="sidebar-item-icon">
                {user?.role === 'admin' ? (
                  <IconShield size={18} style={{ color: 'var(--discord-blurple)' }} />
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                )}
              </span>
              {user?.role === 'admin' ? 'System Portal (Home)' : 'Home Feed'}
            </div>

            <div
              className={`sidebar-item ${currentPath === '/trending' ? 'active' : ''}`}
              onClick={() => onNavigate('/trending')}
            >
              <span className="sidebar-item-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
                </svg>
              </span>
              Trending
            </div>

            <div
              className={`sidebar-item ${currentPath === '/explore' ? 'active' : ''}`}
              onClick={() => onNavigate('/explore')}
            >
              <span className="sidebar-item-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </span>
              Explore Hubs
            </div>

            <div
              className={`sidebar-item ${currentPath === '/broadcasts' ? 'active' : ''}`}
              onClick={() => onNavigate('/broadcasts')}
            >
              <span className="sidebar-item-icon">
                <IconRadio size={18} style={{ color: 'var(--discord-red)' }} />
              </span>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <span>Broadcasts</span>
                <span
                  style={{
                    fontSize: '9px',
                    fontWeight: 800,
                    background: 'var(--discord-red)',
                    color: '#fff',
                    padding: '1px 5px',
                    borderRadius: '4px',
                    letterSpacing: '0.4px',
                  }}
                >
                  LIVE
                </span>
              </span>
            </div>

            {user?.role === 'admin' && (
              <div
                className={`sidebar-item ${currentPath === '/admin' ? 'active' : ''}`}
                onClick={() => onNavigate('/admin')}
                style={{
                  marginTop: 4,
                  background: currentPath === '/admin' ? 'rgba(88, 101, 242, 0.25)' : 'rgba(88, 101, 242, 0.08)',
                  color: 'var(--discord-blurple)',
                  fontWeight: 700,
                }}
              >
                <span className="sidebar-item-icon">
                  <IconAlertTriangle size={17} style={{ color: 'var(--discord-blurple)' }} />
                </span>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                  <span>System Admin</span>
                  <span
                    style={{
                      fontSize: '9px',
                      fontWeight: 800,
                      background: 'var(--discord-blurple)',
                      color: '#fff',
                      padding: '1px 5px',
                      borderRadius: 4,
                    }}
                  >
                    PORTAL
                  </span>
                </span>
              </div>
            )}
          </div>

          {/* Communities Section */}
          {communities.length > 0 && (
            <div className="sidebar-section">
              <div className="sidebar-section-title">
                <span>Communities</span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{communities.length}</span>
              </div>
              {communities.map((c) => {
                const isActive = currentPath === `/community/${c.slug}`;
                return (
                  <div
                    key={c.id}
                    className={`sidebar-item ${isActive ? 'active' : ''}`}
                    onClick={() => onNavigate(`/community/${c.slug}`)}
                  >
                    <span className="sidebar-item-icon" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--discord-blurple)' }}>
                      c/
                    </span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.name}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Projects / Your Workspaces */}
          <div className="sidebar-section">
            <div className="sidebar-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Your Workspaces</span>
                {projects.length > 0 && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{projects.length}</span>}
              </div>
              <button
                className="btn-icon"
                style={{ padding: 2, color: 'var(--text-muted)' }}
                onClick={() => setShowCreateProject(true)}
                title="Create New Workspace"
              >
                <IconPlus size={14} />
              </button>
            </div>

            {projects.map((p) => {
              const isActive = currentPath.startsWith(`/project/${p.id}`);
              return (
                <div
                  key={p.id}
                  className={`sidebar-item sidebar-channel ${isActive ? 'active' : ''}`}
                  onClick={() => onNavigate(`/project/${p.id}`)}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.name.toLowerCase().replace(/\s+/g, '-')}
                  </span>
                </div>
              );
            })}

            {projects.length === 0 && (
              <div
                className="sidebar-item"
                style={{ opacity: 0.6, fontSize: '12px', cursor: 'pointer' }}
                onClick={() => setShowCreateProject(true)}
              >
                <span className="sidebar-item-icon">+</span>
                <span>Create Workspace</span>
              </div>
            )}
          </div>

          {/* Direct Messages Section */}
          <div className="sidebar-section">
            <div className="sidebar-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>Direct Messages</span>
                {dms.length > 0 && <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{dms.length}</span>}
              </div>
              <button
                className="btn-icon"
                style={{ padding: 2, color: 'var(--text-muted)' }}
                onClick={() => setShowNewDm(true)}
                title="New Direct Message"
              >
                <IconPlus size={14} />
              </button>
            </div>

            {dms.map((dm) => {
              const isActive = currentPath === `/dm/${dm.id}`;
              const recipientName = dm.recipient_name || dm.recipient_username || 'User';
              return (
                <div
                  key={dm.id}
                  className={`sidebar-item ${isActive ? 'active' : ''}`}
                  onClick={() => onNavigate(`/dm/${dm.id}`)}
                >
                  <div className="user-avatar sm" style={{ width: 20, height: 20, fontSize: 10, background: 'var(--discord-blurple)' }}>
                    {recipientName.charAt(0).toUpperCase()}
                  </div>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {recipientName}
                  </span>
                  {dm.unread_count > 0 && (
                    <span style={{
                      marginLeft: 'auto',
                      background: 'var(--discord-red)',
                      color: '#fff',
                      borderRadius: 10,
                      padding: '1px 6px',
                      fontSize: 10,
                      fontWeight: 700,
                    }}>
                      {dm.unread_count}
                    </span>
                  )}
                </div>
              );
            })}

            {dms.length === 0 && (
              <div
                className="sidebar-item"
                style={{ opacity: 0.6, fontSize: '12px', cursor: 'pointer' }}
                onClick={() => setShowNewDm(true)}
              >
                <span className="sidebar-item-icon">
                  <IconChat size={14} />
                </span>
                <span>Start a DM</span>
              </div>
            )}
          </div>

          {/* Group Chats Section */}
          {groups.length > 0 && (
            <div className="sidebar-section">
              <div className="sidebar-section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>Group Chats</span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{groups.length}</span>
                </div>
              </div>

              {groups.map((grp) => {
                const isActive = currentPath === `/dm/${grp.id}`;
                return (
                  <div
                    key={grp.id}
                    className={`sidebar-item ${isActive ? 'active' : ''}`}
                    onClick={() => onNavigate(`/dm/${grp.id}`)}
                  >
                    <div className="user-avatar sm" style={{ width: 20, height: 20, fontSize: 10, background: 'var(--discord-green)' }}>
                      <IconUsers size={12} />
                    </div>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {grp.name}
                    </span>
                    {grp.unread_count > 0 && (
                      <span style={{
                        marginLeft: 'auto',
                        background: 'var(--discord-red)',
                        color: '#fff',
                        borderRadius: 10,
                        padding: '1px 6px',
                        fontSize: 10,
                        fontWeight: 700,
                      }}>
                        {grp.unread_count}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* User Bottom Status Bar */}
        {user && (
          <div className="sidebar-user-panel">
            <div
              className="user-profile-summary"
              onClick={() => setShowProfile(true)}
              style={{ cursor: 'pointer' }}
              title="Click to edit profile & skills"
            >
              <div className="user-avatar" style={{ position: 'relative', overflow: 'hidden' }}>
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url.startsWith('http') ? user.avatar_url : `http://localhost:5000${user.avatar_url}`}
                    alt={user.name || user.username}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                  />
                ) : (
                  (user.name || user.username || '?').charAt(0).toUpperCase()
                )}
                <div className="status-indicator" />
              </div>
              <div className="user-info">
                <div className="username" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>{user.name || user.username}</span>
                  {user.email_verified && (
                    <span title="Verified Account" style={{ color: 'var(--discord-green)', display: 'inline-flex', alignItems: 'center' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                  )}
                </div>
                <div className="alias" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>@{user.alias}</span>
                </div>
              </div>
            </div>

            <div className="sidebar-user-controls">
              <button
                className="btn-icon"
                onClick={toggleTheme}
                title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                aria-label="Toggle Theme"
                style={{ fontSize: '15px' }}
              >
                {theme === 'dark' ? '☀️' : '🌙'}
              </button>

              <button
                className="btn-icon"
                onClick={() => setShowProfile(true)}
                title="User Profile & Settings"
                aria-label="Settings"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>

              <button
                className="btn-icon"
                onClick={logout}
                title="Sign Out"
                aria-label="Logout"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </aside>

      {showProfile && (
        <ProfileModal
          onClose={() => setShowProfile(false)}
          onProfileUpdated={() => {
            onDataChange?.();
          }}
        />
      )}

      {showVerifyEmail && (
        <VerifyEmailModal
          onClose={() => setShowVerifyEmail(false)}
          onVerified={() => {
            setShowVerifyEmail(false);
            onDataChange?.();
          }}
        />
      )}

      {showCreateProject && (
        <CreateProjectModal
          onClose={() => setShowCreateProject(false)}
          onCreated={() => {
            onDataChange?.();
          }}
        />
      )}

      {showNewDm && (
        <NewDmModal
          onClose={() => setShowNewDm(false)}
          onConversationStarted={() => {
            onDataChange?.();
          }}
        />
      )}
    </>
  );
}


