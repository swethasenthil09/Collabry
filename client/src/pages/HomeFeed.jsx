import { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import PostCard from '../components/community/PostCard';
import CreatePostModal from '../components/community/CreatePostModal';
import LiveStoriesBar from '../components/live/LiveStoriesBar';
import { IconHome, IconTrending, IconSparkles, IconPencil, IconPlus, IconChat, IconInfo, IconBookmark } from '../components/common/Icons';

export default function HomeFeed() {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [sort, setSort] = useState('new');
  const [typeFilter, setTypeFilter] = useState('all');
  const [matchOnly, setMatchOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [savedOnly, setSavedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCreatePost, setShowCreatePost] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadPosts();
    }, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [sort, typeFilter, search, savedOnly]);

  const loadPosts = async () => {
    setLoading(true);
    try {
      const sortParam = sort === 'new' ? '' : sort;
      let url = `/posts?sort=${sortParam}&limit=50`;
      if (savedOnly) {
        url += '&saved=true';
      }
      if (typeFilter !== 'all') {
        url += `&type=${typeFilter}`;
      }
      if (search.trim()) {
        url += `&search=${encodeURIComponent(search.trim())}`;
      }
      const res = await api.get(url);
      setPosts(res.data);
    } catch (err) {
      console.error('Load posts error:', err);
    } finally {
      setLoading(false);
    }
  };

  const userSkills = user?.skills || [];
  const displayedPosts = matchOnly
    ? posts.filter(post => {
        if (post.post_type !== 'collaboration_request') return false;
        const postSkills = Array.isArray(post.required_skills)
          ? post.required_skills
          : JSON.parse(post.required_skills || '[]');
        return postSkills.some(s =>
          userSkills.some(us => us.toLowerCase() === s.toLowerCase())
        );
      })
    : posts;

  return (
    <>
      {/* Header */}
      <header className="main-header">
        <span className="header-icon">
          <IconHome size={20} style={{ color: 'var(--discord-blurple)' }} />
        </span>
        <h2>Home Feed</h2>
        <span className="header-description">Explore what's happening across communities</span>
      </header>

      <main className="main-body">
        {/* Live Stories / Broadcasts Bar */}
        <LiveStoriesBar />

        {/* Create post bar */}
        <div className="feed-create-bar" onClick={() => setShowCreatePost(true)}>
          <div className="user-avatar sm" style={{ background: 'var(--discord-blurple)' }}>
            <IconPencil size={14} style={{ color: '#fff' }} />
          </div>
          <input
            placeholder="Create a discussion or find collaborators..."
            readOnly
          />
          <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); setShowCreatePost(true); }}>
            <IconPlus size={14} />
            <span>Create</span>
          </button>
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <button
            className={`btn btn-sm ${typeFilter === 'all' && !matchOnly ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: 'var(--radius-full)', padding: '4px 12px', fontSize: '12px' }}
            onClick={() => { setTypeFilter('all'); setMatchOnly(false); }}
          >
            All Posts
          </button>
          <button
            className={`btn btn-sm ${typeFilter === 'collaboration_request' && !matchOnly ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: 'var(--radius-full)', padding: '4px 12px', fontSize: '12px' }}
            onClick={() => { setTypeFilter('collaboration_request'); setMatchOnly(false); }}
          >
            🤝 Collaborations
          </button>
          <button
            className={`btn btn-sm ${typeFilter === 'discussion' && !matchOnly ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: 'var(--radius-full)', padding: '4px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={() => { setTypeFilter('discussion'); setMatchOnly(false); }}
          >
            <IconChat size={13} /> Discussions
          </button>
          <button
            className={`btn btn-sm ${typeFilter === 'question' && !matchOnly ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: 'var(--radius-full)', padding: '4px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={() => { setTypeFilter('question'); setMatchOnly(false); }}
          >
            <IconInfo size={13} /> Questions
          </button>
          {userSkills.length > 0 && (
            <button
              className={`btn btn-sm ${matchOnly ? 'btn-primary' : 'btn-secondary'}`}
              style={{
                borderRadius: 'var(--radius-full)',
                padding: '4px 12px',
                fontSize: '12px',
                borderColor: matchOnly ? 'var(--discord-green)' : 'rgba(59, 165, 93, 0.4)',
                backgroundColor: matchOnly ? 'var(--discord-green)' : 'rgba(59, 165, 93, 0.08)',
                color: matchOnly ? '#fff' : 'var(--discord-green)',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
              onClick={() => {
                setMatchOnly(!matchOnly);
                setSavedOnly(false);
                if (!matchOnly) setTypeFilter('all');
              }}
            >
              <IconSparkles size={13} /> Matched My Skills ({userSkills.length})
            </button>
          )}

          <button
            className={`btn btn-sm ${savedOnly ? 'btn-primary' : 'btn-secondary'}`}
            style={{
              borderRadius: 'var(--radius-full)',
              padding: '4px 12px',
              fontSize: '12px',
              borderColor: savedOnly ? '#FEE75C' : 'rgba(254, 231, 92, 0.35)',
              backgroundColor: savedOnly ? 'rgba(254, 231, 92, 0.2)' : 'rgba(254, 231, 92, 0.06)',
              color: '#FEE75C',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
            onClick={() => {
              setSavedOnly(!savedOnly);
              setMatchOnly(false);
              setTypeFilter('all');
            }}
          >
            <IconBookmark size={13} filled={savedOnly} /> Saved Posts
          </button>
        </div>

        {/* Sort & Search tabs */}
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

          {/* Search bar */}
          <div className="feed-search-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: 'absolute', left: 10, color: 'var(--text-muted)' }}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search posts or skills..."
              style={{
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-full)',
                padding: '4px 12px 4px 28px',
                fontSize: '12px',
                color: 'var(--text-normal)',
                outline: 'none',
                width: '180px',
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
          <div className="empty-state">
            <div className="spinner"></div>
          </div>
        ) : displayedPosts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <IconSparkles size={40} style={{ color: 'var(--discord-blurple)' }} />
            </div>
            <div className="empty-state-title">
              {matchOnly ? 'No matching collaborations found' : 'No discussions yet'}
            </div>
            <div className="empty-state-desc">
              {matchOnly
                ? 'Try updating your skills profile or check all collaboration requests.'
                : 'Be the first to share an idea or find collaborators!'}
            </div>
            <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => setShowCreatePost(true)}>
              Start a Conversation
            </button>
          </div>
        ) : (
          displayedPosts.map(post => (
            <PostCard key={post.id} post={post} onVote={loadPosts} />
          ))
        )}
      </main>

      {showCreatePost && (
        <CreatePostModal
          onClose={() => setShowCreatePost(false)}
          onCreated={() => { setShowCreatePost(false); loadPosts(); }}
        />
      )}
    </>
  );
}
