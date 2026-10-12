import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import {
  IconChat,
  IconFolder,
  IconUsers,
  IconRadio,
  IconSparkles,
  IconGithub,
  IconHash,
} from './Icons';

const CATEGORIES = [
  { id: 'all', label: 'All Results' },
  { id: 'posts', label: 'Posts & Discussions' },
  { id: 'projects', label: 'Workspaces' },
  { id: 'communities', label: 'Communities' },
  { id: 'users', label: 'Builders & People' },
  { id: 'broadcasts', label: 'Live Broadcasts' },
];

export default function OmnisearchModal({ isOpen, onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [results, setResults] = useState({ posts: [], projects: [], communities: [], users: [], broadcasts: [] });
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      fetchResults('');
    } else {
      setQuery('');
      setSelectedCategory('all');
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      fetchResults(query);
    }, 200);

    return () => clearTimeout(timer);
  }, [query, selectedCategory]);

  const fetchResults = async (q) => {
    setLoading(true);
    try {
      const res = await api.get(`/search/omni?q=${encodeURIComponent(q.trim())}&category=${selectedCategory}`);
      setResults(res.data.results || { posts: [], projects: [], communities: [], users: [], broadcasts: [] });
      setTotalCount(res.data.total || 0);
    } catch (err) {
      console.error('Omnisearch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectResult = (type, item) => {
    onClose();
    if (type === 'post') {
      navigate('/');
    } else if (type === 'project') {
      navigate(`/project/${item.id}`);
    } else if (type === 'community') {
      navigate(`/c/${item.slug}`);
    } else if (type === 'user') {
      navigate(`/dm/${item.id}`);
    } else if (type === 'broadcast') {
      navigate('/broadcasts');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000, alignItems: 'flex-start', paddingTop: '10vh' }}>
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 640,
          padding: 0,
          background: 'rgba(23, 24, 27, 0.98)',
          backdropFilter: 'blur(20px)',
          border: '1px solid var(--border-medium)',
          boxShadow: '0 20px 50px rgba(0,0,0,0.7)',
          overflow: 'hidden',
          borderRadius: 14,
        }}
      >
        {/* Search Header Bar */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 18px',
          borderBottom: '1px solid var(--border-medium)',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--discord-blurple)" strokeWidth="2.5">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search workspaces, posts, communities, users, broadcasts... (or Esc to exit)"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 16,
              color: 'var(--text-heading)',
              fontFamily: 'inherit',
            }}
          />
          {loading && <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />}
          <kbd style={{
            fontSize: 11,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid var(--border-medium)',
            padding: '2px 6px',
            borderRadius: 4,
            color: 'var(--text-muted)',
          }}>
            ESC
          </kbd>
        </div>

        {/* Category Filters Pills */}
        <div style={{
          display: 'flex',
          gap: 6,
          padding: '10px 18px',
          borderBottom: '1px solid var(--border-subtle)',
          overflowX: 'auto',
          background: 'var(--bg-subtle)',
        }}>
          {CATEGORIES.map(c => (
            <button
              key={c.id}
              onClick={() => setSelectedCategory(c.id)}
              style={{
                background: selectedCategory === c.id ? 'var(--discord-blurple)' : 'transparent',
                color: selectedCategory === c.id ? '#ffffff' : 'var(--text-muted)',
                border: '1px solid',
                borderColor: selectedCategory === c.id ? 'var(--discord-blurple)' : 'transparent',
                borderRadius: 14,
                padding: '3px 10px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Results Body */}
        <div style={{ maxHeight: '55vh', overflowY: 'auto', padding: '12px 18px' }}>
          {totalCount === 0 && !loading && (
            <div className="empty-state" style={{ padding: '28px 0' }}>
              <div className="empty-state-icon">
                <IconSparkles size={32} style={{ color: 'var(--text-muted)' }} />
              </div>
              <div className="empty-state-title" style={{ fontSize: 14 }}>
                {query ? 'No matching results found' : 'Type to search anything on Collabry'}
              </div>
              <div className="empty-state-desc" style={{ fontSize: 12 }}>
                Search across open-source code repos, discussions, audio spaces, and builders
              </div>
            </div>
          )}

          {/* 1. Projects / Workspaces Results */}
          {results.projects?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                Workspaces ({results.projects.length})
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {results.projects.map(proj => (
                  <div
                    key={proj.id}
                    onClick={() => handleSelectResult('project', proj)}
                    className="member-list-item"
                    style={{
                      padding: '8px 12px',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 8,
                      cursor: 'pointer',
                    }}
                  >
                    <IconFolder size={18} style={{ color: 'var(--discord-blurple)' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-heading)' }}>{proj.name}</div>
                      {proj.description && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {proj.description}
                        </div>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <IconUsers size={12} /> {proj.member_count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. Posts Results */}
          {results.posts?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                Posts & Discussions ({results.posts.length})
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {results.posts.map(post => (
                  <div
                    key={post.id}
                    onClick={() => handleSelectResult('post', post)}
                    className="member-list-item"
                    style={{
                      padding: '8px 12px',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 8,
                      cursor: 'pointer',
                    }}
                  >
                    <IconChat size={16} style={{ color: 'var(--reddit-orange)' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-heading)' }}>{post.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        by @{post.alias || post.username} {post.community_name ? `in c/${post.community_name}` : ''}
                      </div>
                    </div>
                    {post.custom_category && (
                      <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4, color: 'var(--text-muted)' }}>
                        #{post.custom_category}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. Communities Results */}
          {results.communities?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                Communities ({results.communities.length})
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {results.communities.map(comm => (
                  <div
                    key={comm.id}
                    onClick={() => handleSelectResult('community', comm)}
                    className="member-list-item"
                    style={{
                      padding: '8px 12px',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 8,
                      cursor: 'pointer',
                    }}
                  >
                    <IconHash size={16} style={{ color: 'var(--discord-green)' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-heading)' }}>c/{comm.slug}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{comm.name} · {comm.member_count} members</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. Users & People Results */}
          {results.users?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                Builders & Users ({results.users.length})
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {results.users.map(u => (
                  <div
                    key={u.id}
                    onClick={() => handleSelectResult('user', u)}
                    className="member-list-item"
                    style={{
                      padding: '8px 12px',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 8,
                      cursor: 'pointer',
                    }}
                  >
                    <div className="user-avatar sm" style={{ width: 24, height: 24, fontSize: 11, background: 'var(--discord-blurple)' }}>
                      {(u.name || u.username || '?').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-heading)' }}>{u.name || u.username}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>@{u.alias}</div>
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--discord-blurple)' }}>Chat ➔</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 5. Live Broadcasts Results */}
          {results.broadcasts?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                Broadcasts ({results.broadcasts.length})
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {results.broadcasts.map(bc => (
                  <div
                    key={bc.id}
                    onClick={() => handleSelectResult('broadcast', bc)}
                    className="member-list-item"
                    style={{
                      padding: '8px 12px',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 8,
                      cursor: 'pointer',
                    }}
                  >
                    <IconRadio size={16} style={{ color: 'var(--discord-red)' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-heading)' }}>{bc.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Hosted by {bc.host_name || bc.host_username}</div>
                    </div>
                    <span style={{
                      fontSize: 10,
                      fontWeight: 800,
                      background: bc.status === 'live' ? 'var(--discord-red)' : 'rgba(255,255,255,0.1)',
                      color: '#fff',
                      padding: '2px 6px',
                      borderRadius: 4,
                    }}>
                      {bc.status === 'live' ? 'LIVE' : 'ENDED'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '10px 18px',
          background: 'var(--bg-subtle)',
          borderTop: '1px solid var(--border-subtle)',
          fontSize: 11,
          color: 'var(--text-muted)',
        }}>
          <span>Navigate with mouse or click result to open</span>
          <div style={{ display: 'flex', gap: 10 }}>
            <span><kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: 3 }}>Ctrl</kbd> + <kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: 3 }}>K</kbd> to toggle</span>
          </div>
        </div>
      </div>
    </div>
  );
}
