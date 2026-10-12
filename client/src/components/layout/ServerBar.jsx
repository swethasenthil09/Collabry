import CollabryLogo from '../common/CollabryLogo';

export default function ServerBar({ joinedCommunities, projects, currentPath, onNavigate, onToggleNav }) {
  const isHomeActive = currentPath === '/' || currentPath === '/trending';

  return (
    <nav className="server-bar" aria-label="Server Rail">
      {/* Collabry Brand Home Icon */}
      <div className={`server-item-wrapper ${isHomeActive ? 'active' : ''}`}>
        <div className="server-pill" />
        <div
          className="server-icon brand-home-icon"
          onClick={() => {
            onNavigate('/');
            if (window.innerWidth <= 800) {
              onToggleNav?.();
            }
          }}
          title="Collabry Home / Toggle Navigation"
        >
          <CollabryLogo size={28} />
        </div>
      </div>

      <div className="server-divider" />

      {/* Joined communities */}
      {joinedCommunities.map((community) => {
        const isActive = currentPath === `/community/${community.slug}`;
        return (
          <div key={community.id} className={`server-item-wrapper ${isActive ? 'active' : ''}`}>
            <div className="server-pill" />
            <div
              className="server-icon"
              onClick={() => onNavigate(`/community/${community.slug}`)}
              title={community.name}
            >
              {community.name.charAt(0).toUpperCase()}
            </div>
          </div>
        );
      })}

      {joinedCommunities.length > 0 && <div className="server-divider" />}

      {/* Projects */}
      {projects.slice(0, 5).map((project) => {
        const isActive = currentPath.startsWith(`/project/${project.id}`);
        return (
          <div key={project.id} className={`server-item-wrapper ${isActive ? 'active' : ''}`}>
            <div className="server-pill" />
            <div
              className="server-icon"
              onClick={() => onNavigate(`/project/${project.id}`)}
              title={`Project: ${project.name}`}
              style={{ backgroundColor: '#2b2d31', border: '1px solid var(--border-medium)' }}
            >
              <span style={{ color: 'var(--reddit-orange)', fontWeight: 800 }}>
                {project.name.charAt(0).toUpperCase()}
              </span>
              {project.task_count > 0 && (
                <div className="server-badge">{project.task_count}</div>
              )}
            </div>
          </div>
        );
      })}

      {projects.length > 0 && <div className="server-divider" />}

      {/* Explore Communities */}
      <div className={`server-item-wrapper ${currentPath === '/explore' ? 'active' : ''}`}>
        <div className="server-pill" />
        <div
          className="server-icon add-server"
          onClick={() => onNavigate('/explore')}
          title="Explore Communities"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </div>
      </div>
    </nav>
  );
}
