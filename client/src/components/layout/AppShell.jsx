import { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import ServerBar from './ServerBar';
import Sidebar from './Sidebar';
import RightPanel from './RightPanel';
import HomeFeed from '../../pages/HomeFeed';
import ExploreCommunities from '../../pages/ExploreCommunities';
import CommunityFeed from '../../pages/CommunityFeed';
import ProjectView from '../../pages/ProjectView';
import TrendingFeed from '../../pages/TrendingFeed';
import DirectMessageView from '../../pages/DirectMessageView';
import BroadcastsHub from '../../pages/BroadcastsHub';
import AdminDashboard from '../../pages/AdminDashboard';
import { IconMenu, IconX, IconHome, IconExplore, IconTrending, IconRadio, IconSearch } from '../common/Icons';
import CollabryLogo from '../common/CollabryLogo';
import OmnisearchModal from '../common/OmnisearchModal';
import UnfreezeAppealModal from '../common/UnfreezeAppealModal';
import { getSocket } from '../../services/socket';
import { playNotificationSound, showDesktopNotification } from '../../utils/sound';

export default function AppShell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [communities, setCommunities] = useState([]);
  const [joinedCommunities, setJoinedCommunities] = useState([]);
  const [projects, setProjects] = useState([]);
  const [dms, setDms] = useState([]);
  const [groups, setGroups] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showOmnisearch, setShowOmnisearch] = useState(false);
  const [showAppealModal, setShowAppealModal] = useState(false);

  // Global real-time notification chime & alerts
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onNotification = (data) => {
      playNotificationSound();
      showDesktopNotification(data.title || 'New Notification', {
        body: data.body || 'You received an update on Collabry',
      });
      setUnreadCount((prev) => prev + 1);
    };

    const onNewMessage = (msg) => {
      if (msg.sender_id !== user?.id) {
        playNotificationSound();
        showDesktopNotification(msg.name ? `${msg.name} sent a message` : 'New message', {
          body: msg.body || 'New direct message received',
        });
      }
    };

    socket.on('notification', onNotification);
    socket.on('new_message', onNewMessage);

    return () => {
      socket.off('notification', onNotification);
      socket.off('new_message', onNewMessage);
    };
  }, [user?.id]);

  // Global Ctrl+K / Cmd+K listener for Omnisearch Command Palette
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowOmnisearch(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // navVisible: true by default on desktop, collapses on narrow windows
  const [navVisible, setNavVisible] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth > 800;
    }
    return true;
  });

  useEffect(() => {
    loadData();
  }, []);

  // Auto collapse when window is resized below 800px
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 800) {
        setNavVisible(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close drawer on route change when on mobile / small window
  useEffect(() => {
    if (window.innerWidth <= 800) {
      setNavVisible(false);
    }
  }, [location.pathname]);

  const loadData = async () => {
    try {
      const [commRes, projRes, notifRes, dmsRes, groupsRes] = await Promise.all([
        api.get('/communities'),
        api.get('/projects'),
        api.get('/notifications'),
        api.get('/messages/dms'),
        api.get('/messages/groups').catch(() => ({ data: [] })),
      ]);
      setCommunities(commRes.data);
      setJoinedCommunities(commRes.data.filter(c => c.is_joined));
      setProjects(projRes.data);
      setNotifications(notifRes.data.notifications);
      setUnreadCount(notifRes.data.unread_count);
      setDms(dmsRes.data || []);
      setGroups(groupsRes.data || []);
    } catch (err) {
      console.error('Load data error:', err);
    }
  };

  const toggleNav = () => setNavVisible(prev => !prev);
  const currentView = location.pathname;

  return (
    <div className={`app-layout ${navVisible ? 'nav-open' : 'nav-collapsed'}`}>
      {/* Mobile Backdrop blur overlay */}
      {navVisible && (
        <div
          className="mobile-backdrop"
          onClick={() => setNavVisible(false)}
        />
      )}

      {/* Nav Rail & Sidebar Container (handles desktop and mobile drawer) */}
      <div className="nav-side-container">
        <ServerBar
          joinedCommunities={joinedCommunities}
          projects={projects}
          currentPath={currentView}
          onNavigate={(path) => {
            navigate(path);
            if (window.innerWidth <= 800) setNavVisible(false);
          }}
          onToggleNav={toggleNav}
        />
        <Sidebar
          communities={joinedCommunities}
          projects={projects}
          dms={dms}
          groups={groups}
          currentPath={currentView}
          notifications={notifications}
          unreadCount={unreadCount}
          onNavigate={(path) => {
            navigate(path);
            if (window.innerWidth <= 800) setNavVisible(false);
          }}
          onToggleNav={toggleNav}
          onDataChange={loadData}
          onOpenSearch={() => setShowOmnisearch(true)}
          user={user}
        />
      </div>

      {/* Main Content Area */}
      <div className="main-content">
        {/* Top Header Bar (active on mobile, and on desktop when nav is collapsed to burger) */}
        <div className={`app-top-bar ${!navVisible ? 'visible-desktop' : ''}`}>
          <button
            className="btn-icon mobile-menu-btn"
            onClick={toggleNav}
            aria-label="Toggle Navigation"
            title="Toggle Navigation"
          >
            {navVisible ? <IconX size={20} /> : <IconMenu size={20} />}
          </button>
          <div
            onClick={toggleNav}
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
            title="Click app icon to toggle navigation"
          >
            <CollabryLogo size={24} showText={true} />
          </div>
          <div style={{ flex: 1 }} />
        </div>

        {/* Warning / Freeze Notice Banner */}
        {user?.status === 'frozen' && (
          <div
            style={{
              background: 'linear-gradient(90deg, rgba(254, 231, 92, 0.95) 0%, rgba(245, 158, 11, 0.95) 100%)',
              color: '#1a1a1a',
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>⚠️</span>
              <span>
                Account Warning: Your account is frozen until{' '}
                {user.frozen_until ? new Date(user.frozen_until).toLocaleDateString() : '7 days'}{' '}
                due to a report ("{user.freeze_reason || 'Community report'}"). Posting and chatting are restricted.
              </span>
            </div>
            <button
              className="btn btn-secondary btn-xs"
              onClick={() => setShowAppealModal(true)}
              style={{
                background: '#fff',
                color: '#1a1a1a',
                fontWeight: 800,
                borderRadius: 4,
                padding: '3px 10px',
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Request Unfreeze
            </button>
          </div>
        )}

        {user?.status === 'blocked' && (
          <div
            style={{
              background: '#ED4245',
              color: '#fff',
              padding: '8px 16px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>🚫</span>
              <span>
                Account Permanently Blocked: Your account was reported 3 or more times for community violations.
              </span>
            </div>
            <button
              className="btn btn-secondary btn-xs"
              onClick={() => setShowAppealModal(true)}
              style={{
                background: '#fff',
                color: '#ED4245',
                fontWeight: 800,
                borderRadius: 4,
                padding: '3px 10px',
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Submit Appeal to Admin
            </button>
          </div>
        )}

        {/* Unverified Email Reminder Banner (does not block user from using the site) */}
        {user && !user.email_verified && user.status !== 'blocked' && (
          <div
            style={{
              background: 'linear-gradient(90deg, #5865F2 0%, #4752C4 100%)',
              color: '#ffffff',
              padding: '7px 16px',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>✉️</span>
              <span>
                Please verify your email ({user.email || 'account'}) to fully secure your profile.
              </span>
            </div>
            <button
              className="btn btn-secondary btn-xs"
              onClick={() => navigate(`/verify-email?email=${encodeURIComponent(user.email || '')}`)}
              style={{
                background: '#ffffff',
                color: '#5865F2',
                fontWeight: 700,
                borderRadius: 4,
                padding: '3px 10px',
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Verify Email
            </button>
          </div>
        )}

        <Routes>
          <Route path="/" element={user?.role === 'admin' ? <AdminDashboard /> : <HomeFeed />} />
          <Route path="/explore" element={<ExploreCommunities onJoin={loadData} />} />
          <Route path="/trending" element={<TrendingFeed />} />
          <Route path="/broadcasts" element={<BroadcastsHub />} />
          <Route path="/community/:slug" element={<CommunityFeed onDataChange={loadData} />} />
          <Route path="/project/:id/*" element={<ProjectView onProjectUpdated={loadData} />} />
          <Route path="/dm/:conversationId" element={<DirectMessageView />} />
          <Route path="/admin" element={<AdminDashboard />} />
        </Routes>
      </div>

      <RightPanel
        communities={communities}
        projects={projects}
        currentPath={currentView}
      />

      <OmnisearchModal
        isOpen={showOmnisearch}
        onClose={() => setShowOmnisearch(false)}
      />

      <UnfreezeAppealModal
        isOpen={showAppealModal}
        onClose={() => setShowAppealModal(false)}
        user={user}
        onAppealSubmitted={loadData}
      />

      {/* Mobile Bottom Navigation Dock */}
      <nav className="mobile-bottom-nav" aria-label="Mobile Navigation">
        <button
          className={`bottom-nav-item ${location.pathname === '/' ? 'active' : ''}`}
          onClick={() => navigate('/')}
        >
          <span className="bottom-nav-icon"><IconHome size={18} /></span>
          <span className="bottom-nav-label">Home</span>
        </button>
        <button
          className={`bottom-nav-item ${location.pathname === '/explore' ? 'active' : ''}`}
          onClick={() => navigate('/explore')}
        >
          <span className="bottom-nav-icon"><IconExplore size={18} /></span>
          <span className="bottom-nav-label">Explore</span>
        </button>
        <button
          className={`bottom-nav-item ${location.pathname === '/trending' ? 'active' : ''}`}
          onClick={() => navigate('/trending')}
        >
          <span className="bottom-nav-icon"><IconTrending size={18} /></span>
          <span className="bottom-nav-label">Trending</span>
        </button>
        <button
          className={`bottom-nav-item ${location.pathname === '/broadcasts' ? 'active' : ''}`}
          onClick={() => navigate('/broadcasts')}
        >
          <span className="bottom-nav-icon"><IconRadio size={18} /></span>
          <span className="bottom-nav-label">Broadcasts</span>
        </button>
        <button
          className="bottom-nav-item"
          onClick={() => setShowOmnisearch(true)}
        >
          <span className="bottom-nav-icon"><IconSearch size={18} /></span>
          <span className="bottom-nav-label">Search</span>
        </button>
      </nav>
    </div>
  );
}

