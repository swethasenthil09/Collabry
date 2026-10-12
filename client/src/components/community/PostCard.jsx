import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import PostDetailModal from './PostDetailModal';
import ExpressInterestModal from './ExpressInterestModal';
import ConfirmModal from '../common/ConfirmModal';
import ReportModal from '../common/ReportModal';
import { IconTrash, IconAlertTriangle } from '../common/Icons';
import MarkdownView from '../common/MarkdownView';

export default function PostCard({ post, onVote, onPostUpdated }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [vote, setVote] = useState(post.user_vote);
  const [score, setScore] = useState(post.score || (post.upvotes - post.downvotes) || 0);
  const [isSaved, setIsSaved] = useState(Boolean(post.is_saved));
  const [showDetail, setShowDetail] = useState(false);
  const [showInterestModal, setShowInterestModal] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [copied, setCopied] = useState(false);

  // Compute skill matches
  const postSkills = Array.isArray(post.required_skills)
    ? post.required_skills
    : JSON.parse(post.required_skills || '[]');
  const userSkills = user?.skills || [];
  const matchingSkills = postSkills.filter(s =>
    userSkills.some(us => us.toLowerCase() === s.toLowerCase())
  );
  const hasSkillMatch = post.post_type === 'collaboration_request' && matchingSkills.length > 0;

  const handleVote = async (voteType) => {
    try {
      const newVote = vote === voteType ? 'none' : voteType;
      const res = await api.post(`/posts/${post.id}/vote`, { vote_type: newVote });
      setScore(res.data.score);
      setVote(newVote === 'none' ? null : newVote);
      onVote?.();
    } catch (err) {
      console.error('Vote error:', err);
    }
  };

  const isAuthor = Boolean(
    post.is_author ||
    (user && (post.author_id === user.id || post.author?.id === user.id || post.author?.is_mine))
  );

  const handleDeletePost = async () => {
    try {
      await api.delete(`/posts/${post.id}`);
      setShowConfirmDelete(false);
      onPostUpdated?.();
    } catch (err) {
      console.error('Delete post error:', err);
    }
  };

  const handleToggleSave = async (e) => {
    e.stopPropagation();
    try {
      const res = await api.post(`/posts/${post.id}/save`);
      setIsSaved(res.data.saved);
    } catch (err) {
      console.error('Save post error:', err);
    }
  };

  const handleShare = (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`${window.location.origin}/community/${post.community?.slug || 'feed'}#post-${post.id}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const timeAgo = (date) => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <>
      <article className="post-card" onClick={() => setShowDetail(true)}>
        {/* Reddit Native Upvote / Downvote Rail */}
        <div className="post-vote-col" onClick={(e) => e.stopPropagation()}>
          <button
            className={`vote-btn ${vote === 'up' ? 'upvoted' : ''}`}
            onClick={() => handleVote('up')}
            aria-label="Upvote"
            title="Upvote"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill={vote === 'up' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </button>
          
          <span className={`vote-score ${vote === 'up' ? 'upvoted' : vote === 'down' ? 'downvoted' : ''}`}>
            {score}
          </span>

          <button
            className={`vote-btn ${vote === 'down' ? 'downvoted' : ''}`}
            onClick={() => handleVote('down')}
            aria-label="Downvote"
            title="Downvote"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill={vote === 'down' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>

        {/* Post Content */}
        <div className="post-content-col">
          {/* Meta Bar */}
          <div className="post-meta">
            {post.community ? (
              <span className="community-tag">
                <span style={{ color: 'var(--discord-blurple)', fontWeight: 800 }}>c/</span>
                {post.community?.slug || post.community?.name}
              </span>
            ) : (
              <span className="community-tag" style={{ background: 'rgba(88, 101, 242, 0.12)', color: 'var(--discord-blurple)', borderColor: 'rgba(88, 101, 242, 0.3)' }}>
                <span style={{ fontWeight: 800 }}># </span>
                {post.custom_category || 'General'}
              </span>
            )}
            <span>•</span>
            <span className="author-tag">
              Posted by {post.author?.is_alias ? `@${post.author.display_name}` : post.author?.display_name}
            </span>
            <span>•</span>
            <span>{timeAgo(post.created_at)}</span>

            {post.post_type !== 'discussion' && (
              <>
                <span>•</span>
                <span className={`post-type-badge ${post.post_type}`}>
                  {post.post_type === 'collaboration_request' ? '🤝 Looking for Collaborators' : '❓ Question'}
                </span>
              </>
            )}

            {hasSkillMatch && (
              <>
                <span>•</span>
                <span className="post-type-badge" style={{ backgroundColor: 'rgba(59, 165, 93, 0.15)', color: 'var(--discord-green)', borderColor: 'rgba(59, 165, 93, 0.4)', fontWeight: 700 }}>
                  🎯 {matchingSkills.length} Matching Skill{matchingSkills.length > 1 ? 's' : ''}
                </span>
              </>
            )}

            {post.collab_status && (
              <span className={`collab-status ${post.collab_status}`}>
                {post.collab_status}
              </span>
            )}

            {post.project && (
              <>
                <span>•</span>
                <span
                  className="community-tag"
                  style={{
                    background: 'rgba(235, 100, 30, 0.12)',
                    color: 'var(--reddit-orange)',
                    borderColor: 'rgba(235, 100, 30, 0.4)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontWeight: 700,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/projects/${post.project.id}`);
                  }}
                  title={`Visit ${post.project.name} Workspace`}
                >
                  <span>🚀 Workspace:</span>
                  <span>{post.project.name}</span>
                </span>
              </>
            )}
          </div>

          {/* Title */}
          <h3 className="post-title">{post.title}</h3>

          {/* Body Text */}
          {post.body && (
            <div className="post-body-preview" style={{ maxHeight: 280, overflow: 'hidden', position: 'relative' }}>
              <MarkdownView content={post.body} />
            </div>
          )}

          {/* Uploaded Image or Video */}
          {post.media_url && (
            <div
              style={{
                marginTop: 10,
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                background: '#090a0f',
                border: '1px solid var(--border-subtle)',
                maxHeight: 420,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {post.media_type === 'video' || post.media_url.match(/\.(mp4|webm|mov|ogg)$/i) ? (
                <video
                  src={post.media_url.startsWith('http') ? post.media_url : `http://localhost:5000${post.media_url}`}
                  controls
                  playsInline
                  style={{ width: '100%', maxHeight: 420, objectFit: 'contain' }}
                />
              ) : (
                <img
                  src={post.media_url.startsWith('http') ? post.media_url : `http://localhost:5000${post.media_url}`}
                  alt={post.title}
                  style={{ width: '100%', maxHeight: 420, objectFit: 'contain' }}
                  loading="lazy"
                />
              )}
            </div>
          )}

          {/* Skills Requirements for Collaborations */}
          {post.required_skills && (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {postSkills.map((skill, i) => {
                const isMatched = userSkills.some(us => us.toLowerCase() === skill.toLowerCase());
                return (
                  <span
                    key={i}
                    className="skill-tag"
                    style={isMatched ? {
                      borderColor: 'var(--discord-green)',
                      color: 'var(--discord-green)',
                      backgroundColor: 'rgba(59, 165, 93, 0.12)',
                      fontWeight: 600,
                    } : {}}
                  >
                    {isMatched ? '✓ ' : ''}{skill}
                  </span>
                );
              })}
            </div>
          )}

          {/* Reddit Action Footer */}
          <div className="post-footer">
            <div className="post-footer-action" onClick={(e) => { e.stopPropagation(); setShowDetail(true); }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>{post.comment_count === 1 ? '1 Comment' : `${post.comment_count || 0} Comments`}</span>
            </div>

            {post.post_type === 'collaboration_request' && post.collab_status === 'open' && (
              <div
                className="post-footer-action"
                style={{ color: 'var(--discord-green)' }}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowInterestModal(true);
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7.5" r="4" />
                  <line x1="20" y1="8" x2="20" y2="14" />
                  <line x1="23" y1="11" x2="17" y2="11" />
                </svg>
                <span>Join Team</span>
              </div>
            )}

            <div className="post-footer-action" onClick={handleShare}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              <span>{copied ? 'Copied Link!' : 'Share'}</span>
            </div>

            <div
              className={`post-footer-action ${isSaved ? 'active' : ''}`}
              style={isSaved ? { color: '#FEE75C' } : {}}
              onClick={handleToggleSave}
              title={isSaved ? 'Remove bookmark' : 'Bookmark / Save post'}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill={isSaved ? '#FEE75C' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
              <span>{isSaved ? 'Saved' : 'Save'}</span>
            </div>

            {isAuthor ? (
              <div
                className="post-footer-action"
                style={{ color: 'var(--discord-red)', marginLeft: 'auto' }}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowConfirmDelete(true);
                }}
                title="Delete Post"
              >
                <IconTrash size={14} />
                <span>Delete</span>
              </div>
            ) : (
              <div
                className="post-footer-action"
                style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowReportModal(true);
                }}
                title="Report Post or Author"
              >
                <IconAlertTriangle size={14} />
                <span>Report</span>
              </div>
            )}
          </div>
        </div>
      </article>

      {showDetail && (
        <PostDetailModal
          postId={post.id}
          onClose={() => setShowDetail(false)}
          onPostUpdated={() => {
            onVote?.();
            onPostUpdated?.();
          }}
        />
      )}

      {showInterestModal && (
        <ExpressInterestModal
          post={post}
          onClose={() => setShowInterestModal(false)}
          onSuccess={() => {
            setShowInterestModal(false);
            onVote?.();
            onPostUpdated?.();
          }}
        />
      )}

      {showConfirmDelete && (
        <ConfirmModal
          isOpen={true}
          title="Delete Post"
          message={`Are you sure you want to delete "${post.title}"? This cannot be undone.`}
          confirmText="Delete Post"
          confirmVariant="danger"
          onCancel={() => setShowConfirmDelete(false)}
          onConfirm={handleDeletePost}
        />
      )}

      {showReportModal && (
        <ReportModal
          isOpen={true}
          onClose={() => setShowReportModal(false)}
          targetType="post"
          targetId={post.id}
          targetName={`Post: "${post.title}"`}
        />
      )}
    </>
  );
}

