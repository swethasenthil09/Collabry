import { useState, useEffect } from 'react';
import api from '../services/api';
import PostCard from '../components/community/PostCard';
import { IconTrending } from '../components/common/Icons';

export default function TrendingFeed() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadPosts = () => {
    api.get('/posts?sort=trending&limit=30')
      .then(res => setPosts(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPosts();
  }, []);

  return (
    <>
      <header className="main-header">
        <span className="header-icon">
          <IconTrending size={20} style={{ color: 'var(--reddit-orange)' }} />
        </span>
        <h2>Trending Now</h2>
        <span className="header-description">Highest engagement discussions & active collaboration requests</span>
      </header>

      <main className="main-body">
        {loading ? (
          <div className="empty-state"><div className="spinner"></div></div>
        ) : posts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <IconTrending size={40} style={{ color: 'var(--reddit-orange)' }} />
            </div>
            <div className="empty-state-title">Nothing trending yet</div>
            <div className="empty-state-desc">Posts with upvotes and active discussions will bubble up here!</div>
          </div>
        ) : (
          posts.map(post => <PostCard key={post.id} post={post} onVote={loadPosts} />)
        )}
      </main>
    </>
  );
}
