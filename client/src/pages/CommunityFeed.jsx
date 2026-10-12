import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import PostCard from '../components/community/PostCard';
import CreatePostModal from '../components/community/CreatePostModal';
import LiveStoriesBar from '../components/live/LiveStoriesBar';
import CommunityModerationModal from '../components/community/CommunityModerationModal';
import { IconChat, IconTrending, IconSparkles, IconPencil, IconPlus, IconHandshake, IconPin } from '../components/common/Icons';
import { FiShield } from 'react-icons/fi';

export default function CommunityFeed({ onDataChange }) {
  const { slug } = useParams();
  const [community, setCommunity] = useState(null);
  const [posts, setPosts] = useState([]);
  const [sort, setSort] = useState('new');
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [showModeration, setShowModeration] = useState(false);

  useEffect(() => {
    loadCommunity();
  }, [slug]);

  useEffect(() => {
    if (community) {
      const timer = setTimeout(() => {
        loadPosts();
      }, search ? 300 : 0);
      return () => clearTimeout(timer);
    }
  }, [community, sort, filter, search]);

  const loadCommunity = async () => {
    try {
      const res = await api.get(`/communities/${slug}`);
      setCommunity(res.data);
    } catch (err) {
      console.error('Load community error:', err);
    }
  };

  const loadPosts = async () => {
    setLoading(true);
    try {
      let url = `/posts?community_id=${community.id}&limit=30`;
      if (sort && sort !== 'new') url += `&sort=${sort}`;
      if (filter) url += `&type=${filter}`;
      if (search.trim()) url += `&search=${encodeURIComponent(search.trim())}`;
      const res = await api.get(url);
      setPosts(res.data);
    } catch (err) {
      console.error('Load posts error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    try {
      if (community.is_joined) {
        await api.post(`/communities/${community.id}/leave`);
      } else {
        await api.post(`/communities/${community.id}/join`);
      }
      loadCommunity();
      onDataChange?.();
    } catch (err) {
      console.error('Join/leave error:', err);
    }
  };

  if (!community) return <div className="empty-state"><div className="spinner"></div></div>;

  return (
    <>
      <header className="main-header">
        <span className="header-icon" style={{ color: 'var(--discord-blurple)', fontWeight: 800, fontSize: '16px' }}>
          c/
        </span>
        <h2>{community.name}</h2>
        <span className="header-description">{community.member_count} member{community.member_count !== 1 ? 's' : ''}</span>
        <div className="header-actions">
          {(community.user_role === 'owner' || community.user_role === 'moderator') && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowModeration(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <FiShield size={13} />
              <span>Moderation</span>
            </button>
          )}
          <button
            className={`btn ${community.is_joined ? 'btn-secondary' : 'btn-primary'} btn-sm`}
            onClick={handleJoin}
          >
            {community.is_joined ? '✓ Joined' : '+ Join Community'}
          </button>
        </div>
      </header>

      <main className="main-body">
        {/* Live Stories / Broadcasts Bar */}
        <LiveStoriesBar communityId={community.id} />

        {/* Pinned announcement if any */}
        {community.pinned_post && (
          <div style={{
            background: 'rgba(88, 101, 242, 0.08)',
            border: '1px solid rgba(88, 101, 242, 0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            marginBottom: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--discord-blurple)', fontWeight: 600, fontSize: '13px' }}>
              <IconPin size={14} />
              <span>Pinned Announcement</span>
            </div>
            <h3 style={{ fontSize: '15px', fontWeight: 600, margin: '2px 0', color: 'var(--text-normal)' }}>
              {community.pinned_post.title}
            </h3>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', maxHeight: '80px', overflow: 'hidden' }}>
              {community.pinned_post.body}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              By {community.pinned_post.author_name || 'Admin'} • {new Date(community.pinned_post.created_at).toLocaleDateString()}
            </div>
          </div>
        )}

        {/* Create post bar */}
        {community.is_joined && (
          <div className="feed-create-bar" onClick={() => setShowCreatePost(true)}>
            <div className="user-avatar sm" style={{ background: 'var(--discord-blurple)' }}>
              <IconPencil size={14} style={{ color: '#fff' }} />
            </div>
            <input
              placeholder={`Post in c/${community.slug}...`}
              readOnly
            />
            <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); setShowCreatePost(true); }}>
              <IconPlus size={14} />
              <span>Post</span>
            </button>
          </div>
        )}

        {/* Sort & filter */}
        <div className="feed-sort-bar">
          <button className={`sort-btn ${sort === 'new' ? 'active' : ''}`} onClick={() => setSort('new')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span>New</span>
          </button>
          
          <button className={`sort-btn ${sort === 'top' ? 'active' : ''}`} onClick={() => setSort('top')}>
            <IconSparkles size={15} />
            <span>Top</span>
          </button>

          <button className={`sort-btn ${sort === 'trending' ? 'active' : ''}`} onClick={() => setSort('trending')}>
            <IconTrending size={15} />
            <span>Hot</span>
          </button>

          <div style={{ flex: 1 }} />

          <button className={`sort-btn ${filter === '' ? 'active' : ''}`} onClick={() => setFilter('')}>
            All
          </button>
          <button className={`sort-btn ${filter === 'discussion' ? 'active' : ''}`} onClick={() => setFilter('discussion')}>
            <IconChat size={14} />
            <span>Discussions</span>
          </button>
          <button className={`sort-btn ${filter === 'collaboration_request' ? 'active' : ''}`} onClick={() => setFilter('collaboration_request')}>
            <IconHandshake size={14} />
            <span>Collabs</span>
          </button>

          {/* Search bar */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginLeft: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: 'absolute', left: 10, color: 'var(--text-muted)' }}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search community..."
              style={{
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-full)',
                padding: '4px 12px 4px 26px',
                fontSize: '12px',
                color: 'var(--text-normal)',
                outline: 'none',
                width: '150px',
              }}
            />
            {search && (
              <button
                style={{ position: 'absolute', right: 8, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '11px' }}
                onClick={() => setSearch('')}
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Posts */}
        {loading ? (
          <div className="empty-state"><div className="spinner"></div></div>
        ) : posts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <IconChat size={40} style={{ color: 'var(--discord-blurple)' }} />
            </div>
            <div className="empty-state-title">No posts in c/{community.slug} yet</div>
            <div className="empty-state-desc">Be the first to share your thoughts or post a project collaboration!</div>
            {community.is_joined && (
              <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => setShowCreatePost(true)}>
                Start Discussion
              </button>
            )}
          </div>
        ) : (
          posts.map(post => <PostCard key={post.id} post={post} onVote={loadPosts} />)
        )}
      </main>

      {showCreatePost && (
        <CreatePostModal
          communityId={community.id}
          communityName={community.name}
          onClose={() => setShowCreatePost(false)}
          onCreated={() => { setShowCreatePost(false); loadPosts(); }}
        />
      )}

      {showModeration && (
        <CommunityModerationModal
          community={community}
          onClose={() => setShowModeration(false)}
          onUpdate={() => { loadCommunity(); loadPosts(); }}
        />
      )}
    </>
  );
}
