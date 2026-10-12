import { useNavigate } from 'react-router-dom';

export default function RightPanel({ communities, projects, currentPath }) {
  const navigate = useNavigate();

  const topCommunities = [...communities]
    .sort((a, b) => (b.member_count || 0) - (a.member_count || 0))
    .slice(0, 6);

  return (
    <aside className="right-panel" aria-label="Discovery Panel">
      <div className="right-panel-header">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8, color: 'var(--discord-blurple)' }}>
          <circle cx="12" cy="12" r="10" />
          <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
        </svg>
        Explore & Hubs
      </div>

      <div className="right-panel-content">
        {/* Popular Communities */}
        <div className="panel-card">
          <div className="panel-title">Popular Communities</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {topCommunities.map((c) => (
              <div
                key={c.id}
                className="member-list-item"
                style={{ cursor: 'pointer' }}
                onClick={() => navigate(`/community/${c.slug}`)}
              >
                <div
                  className="user-avatar sm"
                  style={{ backgroundColor: 'var(--discord-blurple)', fontWeight: 800 }}
                >
                  {c.name.charAt(0)}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="member-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    c/{c.slug}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {c.member_count || 0} members
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            className="btn btn-secondary btn-sm"
            style={{ width: '100%', marginTop: 12 }}
            onClick={() => navigate('/explore')}
          >
            Browse All Communities
          </button>
        </div>

        {/* Active Workspaces */}
        {projects.length > 0 && (
          <div className="panel-card">
            <div className="panel-title">Your Workspaces</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {projects.slice(0, 4).map((p) => (
                <div
                  key={p.id}
                  className="member-list-item"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/project/${p.id}`)}
                >
                  <div
                    className="user-avatar sm"
                    style={{ backgroundColor: 'var(--bg-subtle)', border: '1px solid var(--border-medium)', color: 'var(--reddit-orange)', fontWeight: 800 }}
                  >
                    #
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="member-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {p.task_count || 0} tasks · {p.member_count || 1} members
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pro Tip Card */}
        <div className="panel-card" style={{ backgroundColor: 'var(--bg-subtle)', borderColor: 'var(--border-medium)' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-heading)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            <span>💡</span>
            <span>How Collabry Works</span>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            Discover discussions on Reddit-style feeds, connect with creators, and launch a dedicated Discord-style project workspace with one click.
          </p>
        </div>
      </div>
    </aside>
  );
}
