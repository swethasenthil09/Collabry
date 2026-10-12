import { useState, useEffect } from 'react';
import api from '../../services/api';
import PostCard from '../community/PostCard';
import CreatePostModal from '../community/CreatePostModal';
import { IconPlus, IconSparkles, IconMegaphone } from '../common/Icons';

export default function WorkspacePostsFeed({ project, isMember }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (project?.id) {
      loadWorkspacePosts();
    }
  }, [project?.id]);

  const loadWorkspacePosts = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/posts?project_id=${project.id}`);
      setPosts(res.data || []);
    } catch (err) {
      console.error('Failed to load workspace posts:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 840, margin: '0 auto', width: '100%', padding: '20px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-heading)' }}>
            Posts Tagging {project.name} ({posts.length})
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Public updates, recruitment pitches, and community discussions tagged with this workspace.
          </p>
        </div>

        {isMember && (
          <button
            className="btn btn-primary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={() => setShowCreateModal(true)}
          >
            <IconPlus size={14} />
            <span>Create Tagged Post</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="empty-state"><div className="spinner" /></div>
      ) : posts.length === 0 ? (
        <div className="empty-state" style={{ background: 'var(--bg-card)', border: '1px dashed var(--border-medium)', borderRadius: 'var(--radius-md)', padding: 32 }}>
          <div className="empty-state-icon">
            <IconSparkles size={36} style={{ color: 'var(--reddit-orange)' }} />
          </div>
          <div className="empty-state-title">No posts tagged yet</div>
          <div className="empty-state-desc" style={{ maxWidth: 420 }}>
            Tag this workspace in public discussions or collaboration requests to attract developers, designers, and contributors from the community feed!
          </div>
          {isMember && (
            <button
              className="btn btn-primary"
              style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={() => setShowCreateModal(true)}
            >
              <IconMegaphone size={16} /> Post First Announcement
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onVote={loadWorkspacePosts}
              onPostUpdated={loadWorkspacePosts}
            />
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreatePostModal
          defaultProjectId={project.id}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            loadWorkspacePosts();
          }}
        />
      )}
    </div>
  );
}
