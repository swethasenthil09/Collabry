import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import CreateCommunityModal from '../components/community/CreateCommunityModal';
import { IconExplore, IconUsers, IconPlus } from '../components/common/Icons';

export default function ExploreCommunities({ onJoin }) {
  const [communities, setCommunities] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadCommunities();
  }, []);

  const loadCommunities = () => {
    setLoading(true);
    api.get('/communities')
      .then(res => setCommunities(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  };

  const handleJoin = async (communityId) => {
    try {
      await api.post(`/communities/${communityId}/join`);
      setCommunities(prev =>
        prev.map(c => c.id === communityId ? { ...c, is_joined: true, member_count: (c.member_count || 0) + 1 } : c)
      );
      onJoin?.();
    } catch (err) {
      console.error('Join error:', err);
    }
  };

  const filteredCommunities = communities.filter(c => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.slug.toLowerCase().includes(q) ||
      (c.description && c.description.toLowerCase().includes(q))
    );
  });

  return (
    <>
      <header className="main-header">
        <span className="header-icon">
          <IconExplore size={20} style={{ color: 'var(--discord-blurple)' }} />
        </span>
        <h2>Explore Communities</h2>
        <span className="header-description">Discover topics, join collaborative hubs, and meet builders</span>
        <div className="header-actions">
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            <IconPlus size={14} />
            <span>Create Community</span>
          </button>
        </div>
      </header>

      <main className="main-body">
        {/* Search & Stats Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1, maxWidth: 360 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ position: 'absolute', left: 12, color: 'var(--text-muted)' }}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search communities by name or topic..."
              style={{
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-full)',
                padding: '8px 14px 8px 34px',
                fontSize: '13px',
                color: 'var(--text-normal)',
                outline: 'none',
                width: '100%',
              }}
            />
            {search && (
              <button
                style={{ position: 'absolute', right: 10, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px' }}
                onClick={() => setSearch('')}
              >
                ×
              </button>
            )}
          </div>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Showing {filteredCommunities.length} of {communities.length} hubs
          </span>
        </div>

        {loading ? (
          <div className="empty-state"><div className="spinner"></div></div>
        ) : filteredCommunities.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <IconExplore size={40} style={{ color: 'var(--discord-blurple)' }} />
            </div>
            <div className="empty-state-title">No communities found</div>
            <div className="empty-state-desc">Try another search keyword or create a new community hub!</div>
            <button className="btn btn-primary btn-sm" style={{ marginTop: 12 }} onClick={() => setShowCreate(true)}>
              Create Community
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {filteredCommunities.map((c) => (
              <div
                key={c.id}
                className="panel-card"
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10, transition: 'transform 180ms ease, border-color 150ms ease' }}
                onClick={() => navigate(`/community/${c.slug}`)}
                onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    className="user-avatar"
                    style={{ backgroundColor: 'var(--discord-blurple)', fontWeight: 800, fontSize: '15px' }}
                  >
                    {c.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      c/{c.slug}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <IconUsers size={12} />
                      <span>{c.member_count || 0} members</span>
                    </div>
                  </div>
                </div>

                <p style={{ fontSize: '12px', color: 'var(--text-normal)', lineHeight: 1.45, minHeight: '36px' }}>
                  {c.description || 'A community for collaboration, discussions, and open projects.'}
                </p>

                <div style={{ marginTop: 'auto', paddingTop: 6 }}>
                  <button
                    className={`btn ${c.is_joined ? 'btn-secondary' : 'btn-primary'} btn-sm`}
                    style={{ width: '100%' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!c.is_joined) handleJoin(c.id);
                    }}
                  >
                    {c.is_joined ? '✓ Joined' : (
                      <>
                        <IconPlus size={14} />
                        <span>Join Community</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showCreate && (
        <CreateCommunityModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            loadCommunities();
            onJoin?.();
          }}
        />
      )}
    </>
  );
}
