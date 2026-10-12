import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import api, { resolveMediaUrl } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import ExpressInterestModal from './ExpressInterestModal';
import ConfirmModal from '../common/ConfirmModal';
import { IconSend, IconUsers, IconSparkles, IconCheck, IconX, IconTrash } from '../common/Icons';
import MarkdownView from '../common/MarkdownView';

export default function PostDetailModal({ postId, onClose, onPostUpdated }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmConfig, setConfirmConfig] = useState(null);
  
  // Comment state
  const [commentBody, setCommentBody] = useState('');
  const [identityMode, setIdentityMode] = useState('alias'); // 'alias' or 'public'
  const [replyingTo, setReplyingTo] = useState(null); // comment id
  const [replyBody, setReplyBody] = useState('');
  const [replyIdentity, setReplyIdentity] = useState('alias');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [showEmojiTray, setShowEmojiTray] = useState(false);
  const [showReplyEmojiTray, setShowReplyEmojiTray] = useState(false);

  const QUICK_COMMENT_EMOJIS = ['👍', '❤️', '🚀', '🔥', '🎉', '💡', '👏', '👀'];
  const INSERT_EMOJIS = ['😀', '😂', '🔥', '🚀', '❤️', '👍', '🎉', '💡', '👏', '💯', '🙌', '✨'];

  // Collaboration applicants state
  const [activeTab, setActiveTab] = useState('discussion'); // 'discussion' or 'applicants'
  const [applicants, setApplicants] = useState([]);
  const [loadingApplicants, setLoadingApplicants] = useState(false);
  const [showInterestModal, setShowInterestModal] = useState(false);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    loadPost();
  }, [postId]);

  const loadPost = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/posts/${postId}`);
      setPost(res.data);
      if (res.data.is_author && res.data.post_type === 'collaboration_request') {
        loadApplicants();
      }
    } catch (err) {
      console.error('Failed to load post details:', err);
      setError('Could not load post details');
    } finally {
      setLoading(false);
    }
  };

  const loadApplicants = async () => {
    setLoadingApplicants(true);
    try {
      const res = await api.get(`/posts/${postId}/interests`);
      setApplicants(res.data);
    } catch (err) {
      console.error('Failed to load applicants:', err);
    } finally {
      setLoadingApplicants(false);
    }
  };

  const handlePostVote = async (voteType) => {
    if (!post) return;
    try {
      const newVote = post.user_vote === voteType ? 'none' : voteType;
      const res = await api.post(`/posts/${post.id}/vote`, { vote_type: newVote });
      setPost({
        ...post,
        score: res.data.score,
        user_vote: newVote === 'none' ? null : newVote,
      });
      onPostUpdated?.();
    } catch (err) {
      console.error('Vote error:', err);
    }
  };

  const handleCommentVote = async (commentId, voteType) => {
    try {
      const comment = findComment(post.comments, commentId);
      const currentVote = comment?.user_vote;
      const newVote = currentVote === voteType ? 'none' : voteType;
      
      const res = await api.post(`/posts/comments/${commentId}/vote`, { vote_type: newVote });
      
      const updateTree = (list) =>
        (list || []).map((c) => {
          if (c.id === commentId) {
            return {
              ...c,
              score: res.data.score,
              user_vote: newVote === 'none' ? null : newVote,
            };
          }
          return c;
        });

      setPost((prev) => ({
        ...prev,
        comments: updateTree(prev?.comments),
      }));
    } catch (err) {
      console.error('Comment vote error:', err);
    }
  };

  const findComment = (list, id) => {
    return Array.isArray(list) ? list.find((c) => c.id === id) : null;
  };

  const handleCommentReaction = async (commentId, emoji) => {
    try {
      const res = await api.post(`/posts/comments/${commentId}/reactions`, { emoji });
      const updatedReactions = res.data.reactions;
      setPost(prev => ({
        ...prev,
        comments: prev.comments.map(c => c.id === commentId ? { ...c, reactions: updatedReactions } : c),
      }));
    } catch (err) {
      console.error('Comment reaction error:', err);
    }
  };

  const handleAddComment = async (e, parentId = null) => {
    e.preventDefault();
    const body = parentId ? replyBody : commentBody;
    const mode = parentId ? replyIdentity : identityMode;
    if (!body.trim()) return;

    setSubmittingComment(true);
    try {
      await api.post(`/posts/${post.id}/comments`, {
        body: body.trim(),
        parent_comment_id: parentId,
        identity_mode: mode,
      });
      if (parentId) {
        setReplyBody('');
        setReplyingTo(null);
      } else {
        setCommentBody('');
      }
      loadPost();
      onPostUpdated?.();
    } catch (err) {
      console.error('Comment submission error:', err);
    } finally {
      setSubmittingComment(false);
    }
  };

  const handleUpdateApplicantStatus = async (applicantUserId, status) => {
    try {
      await api.patch(`/posts/${post.id}/interests/${applicantUserId}`, { status });
      setApplicants(applicants.map(a => a.user_id === applicantUserId ? { ...a, status } : a));
    } catch (err) {
      console.error('Update applicant status error:', err);
    }
  };

  const handleConvertToProject = () => {
    setConfirmConfig({
      isOpen: true,
      title: 'Convert to Project Workspace',
      message: 'Convert this collaboration request into a project workspace? All accepted applicants will automatically receive workspace access.',
      confirmText: 'Create Workspace',
      confirmVariant: 'primary',
      onConfirm: async () => {
        setConfirmConfig(null);
        setConverting(true);
        try {
          const res = await api.post(`/posts/${post.id}/convert-to-project`);
          onClose();
          navigate(`/project/${res.data.project_id}`);
        } catch (err) {
          console.error('Convert to project error:', err);
          setError(err.response?.data?.error?.message || 'Failed to create workspace');
        } finally {
          setConverting(false);
        }
      }
    });
  };

  const handleDeletePost = () => {
    setConfirmConfig({
      isOpen: true,
      title: 'Delete Post',
      message: 'Are you sure you want to delete this post? This action cannot be undone.',
      confirmText: 'Delete Post',
      confirmVariant: 'danger',
      onConfirm: async () => {
        setConfirmConfig(null);
        try {
          await api.delete(`/posts/${post.id}`);
          onPostUpdated?.();
          onClose();
        } catch (err) {
          console.error('Delete post error:', err);
        }
      }
    });
  };

  const handleDeleteComment = (commentId) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Delete Comment',
      message: 'Are you sure you want to delete this comment? This cannot be undone.',
      confirmText: 'Delete Comment',
      confirmVariant: 'danger',
      onConfirm: async () => {
        setConfirmConfig(null);
        try {
          await api.delete(`/posts/${post.id}/comments/${commentId}`);
          loadPost();
        } catch (err) {
          console.error('Delete comment error:', err);
        }
      }
    });
  };

  const startDm = async (recipientId) => {
    if (!recipientId) return;
    try {
      const res = await api.post('/messages/dms', { recipient_id: recipientId });
      onClose();
      navigate(`/dm/${res.data.conversation_id}`);
    } catch (err) {
      console.error('Failed to open DM:', err);
    }
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

  // Build recursive comment tree
  const buildCommentTree = (comments) => {
    const commentMap = {};
    const roots = [];

    comments.forEach((c) => {
      commentMap[c.id] = { ...c, children: [] };
    });

    comments.forEach((c) => {
      if (c.parent_comment_id && commentMap[c.parent_comment_id]) {
        commentMap[c.parent_comment_id].children.push(commentMap[c.id]);
      } else {
        roots.push(commentMap[c.id]);
      }
    });

    return roots;
  };

  const renderCommentNode = (comment) => {
    const isReplying = replyingTo === comment.id;
    return (
      <div key={comment.id} className="comment-node">
        <div className="comment-item">
          {/* Vote rail */}
          <div className="comment-vote-rail">
            <button
              className={`comment-vote-btn ${comment.user_vote === 'up' ? 'upvoted' : ''}`}
              onClick={() => handleCommentVote(comment.id, 'up')}
              title="Upvote"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill={comment.user_vote === 'up' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5">
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </button>
            <span className={`comment-score ${comment.user_vote === 'up' ? 'upvoted' : comment.user_vote === 'down' ? 'downvoted' : ''}`}>
              {comment.score || 0}
            </span>
            <button
              className={`comment-vote-btn ${comment.user_vote === 'down' ? 'downvoted' : ''}`}
              onClick={() => handleCommentVote(comment.id, 'down')}
              title="Downvote"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill={comment.user_vote === 'down' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="comment-content">
            <div className="comment-header">
              <span className="comment-author">
                {comment.author?.is_alias ? `@${comment.author.display_name}` : comment.author?.display_name}
              </span>
              {comment.author?.is_alias && (
                <span style={{ fontSize: '10px', background: 'var(--bg-subtle)', padding: '1px 5px', borderRadius: '4px', color: 'var(--text-muted)' }}>
                  🎭 Alias
                </span>
              )}
              <span className="comment-time">{timeAgo(comment.created_at)}</span>
            </div>

            <div className="comment-body">{comment.body}</div>

            {/* Comment Emoji Reaction Badges */}
            {comment.reactions && comment.reactions.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6, marginBottom: 4 }}>
                {comment.reactions.map((r) => (
                  <button
                    key={r.emoji}
                    type="button"
                    onClick={() => handleCommentReaction(comment.id, r.emoji)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '2px 8px',
                      borderRadius: '12px',
                      background: r.has_reacted ? 'rgba(88, 101, 242, 0.25)' : 'var(--bg-subtle)',
                      border: r.has_reacted ? '1px solid var(--discord-blurple)' : '1px solid var(--border-subtle)',
                      color: r.has_reacted ? '#fff' : 'var(--text-normal)',
                      fontSize: '11px',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    title={`React ${r.emoji}`}
                  >
                    <span>{r.emoji}</span>
                    <span style={{ fontWeight: 600 }}>{r.count}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="comment-actions" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                className="comment-action-btn"
                onClick={() => setReplyingTo(isReplying ? null : comment.id)}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                <span>Reply</span>
              </button>

              {/* Quick Comment Reaction Bar */}
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, background: 'var(--bg-subtle)', borderRadius: '16px', padding: '2px 6px', border: '1px solid var(--border-subtle)' }}>
                {QUICK_COMMENT_EMOJIS.slice(0, 5).map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => handleCommentReaction(comment.id, em)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '13px',
                      padding: '1px 3px',
                      lineHeight: 1,
                      borderRadius: '4px',
                    }}
                    title={`React ${em}`}
                  >
                    {em}
                  </button>
                ))}
              </div>

              {!comment.author?.is_alias && comment.author?.id && comment.author?.id !== user?.id && (
                <button
                  className="comment-action-btn"
                  onClick={() => startDm(comment.author.id)}
                  title={`Direct Message ${comment.author.display_name}`}
                >
                  <IconSend size={12} />
                  <span>Message</span>
                </button>
              )}

              {Boolean(comment.author?.is_mine || (user && comment.author?.id === user.id)) && (
                <button
                  className="comment-action-btn"
                  style={{ color: 'var(--discord-red)' }}
                  onClick={() => handleDeleteComment(comment.id)}
                  title="Delete Comment"
                >
                  <IconTrash size={12} />
                  <span>Delete</span>
                </button>
              )}
            </div>

            {/* Inline reply box */}
            {isReplying && (
              <div style={{ marginTop: 8, background: 'var(--bg-card)', padding: 10, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-medium)' }}>
                <form onSubmit={(e) => handleAddComment(e, comment.id)}>
                  <textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder={`Reply to ${comment.author?.display_name}...`}
                    rows={2}
                    style={{ width: '100%', background: 'var(--bg-subtle)', border: '1px solid var(--border-medium)', borderRadius: 'var(--radius-xs)', padding: 8, color: 'var(--text-normal)', fontSize: '13px' }}
                    autoFocus
                  />

                  {/* Reply quick emoji bar */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, margin: '6px 0', overflowX: 'auto' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Quick Emoji:</span>
                    {INSERT_EMOJIS.slice(0, 8).map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => setReplyBody(prev => prev + em)}
                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '14px', padding: '1px 3px' }}
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                    <div style={{ display: 'flex', gap: 6, fontSize: '11px' }}>
                      <button
                        type="button"
                        className={`btn-ghost ${replyIdentity === 'alias' ? 'active' : ''}`}
                        style={{ padding: '2px 6px', fontSize: '11px', color: replyIdentity === 'alias' ? 'var(--discord-blurple)' : 'var(--text-muted)' }}
                        onClick={() => setReplyIdentity('alias')}
                      >
                        🎭 Alias (@{user?.alias})
                      </button>
                      <button
                        type="button"
                        className={`btn-ghost ${replyIdentity === 'public' ? 'active' : ''}`}
                        style={{ padding: '2px 6px', fontSize: '11px', color: replyIdentity === 'public' ? 'var(--discord-blurple)' : 'var(--text-muted)' }}
                        onClick={() => setReplyIdentity('public')}
                      >
                        👤 Public ({user?.name || user?.username})
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setReplyingTo(null)}>
                        Cancel
                      </button>
                      <button type="submit" className="btn btn-primary btn-sm" disabled={submittingComment || !replyBody.trim()}>
                        Reply
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>

        {/* Child comments */}
        {comment.children && comment.children.length > 0 && (
          <div className="comment-children">
            {comment.children.map((child) => renderCommentNode(child))}
          </div>
        )}
      </div>
    );
  };

  const parsedSkills = post?.required_skills
    ? (Array.isArray(post.required_skills) ? post.required_skills : JSON.parse(post.required_skills || '[]'))
    : [];

  return createPortal(
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        zIndex: 99999,
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(5px)',
        padding: 16,
      }}
    >
      <div
        className="modal modal-lg"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{ margin: 'auto' }}
      >
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title">
            {post?.community ? (
              <>
                <span style={{ color: 'var(--discord-blurple)', fontWeight: 800 }}>c/</span>
                <span>{post.community?.slug || post.community?.name}</span>
              </>
            ) : (
              <>
                <span style={{ color: 'var(--discord-blurple)', fontWeight: 800 }}># </span>
                <span>{post?.custom_category || 'General'}</span>
              </>
            )}
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body">
          {loading ? (
            <div className="empty-state">
              <div className="spinner"></div>
            </div>
          ) : error || !post ? (
            <div className="empty-state">
              <div className="empty-state-title">{error || 'Post not found'}</div>
            </div>
          ) : (
            <>
              {/* Post Container */}
              <div className="post-card" style={{ cursor: 'default', background: 'transparent', border: 'none', padding: 0 }}>
                {/* Vote rail */}
                <div className="post-vote-col">
                  <button
                    className={`vote-btn ${post.user_vote === 'up' ? 'upvoted' : ''}`}
                    onClick={() => handlePostVote('up')}
                    title="Upvote"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill={post.user_vote === 'up' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5">
                      <polyline points="18 15 12 9 6 15" />
                    </svg>
                  </button>
                  <span className={`vote-score ${post.user_vote === 'up' ? 'upvoted' : post.user_vote === 'down' ? 'downvoted' : ''}`}>
                    {post.score || 0}
                  </span>
                  <button
                    className={`vote-btn ${post.user_vote === 'down' ? 'downvoted' : ''}`}
                    onClick={() => handlePostVote('down')}
                    title="Downvote"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill={post.user_vote === 'down' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                </div>

                {/* Content */}
                <div className="post-content-col">
                  <div className="post-meta">
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

                    {post.collab_status && (
                      <span className={`collab-status ${post.collab_status}`}>
                        {post.collab_status}
                      </span>
                    )}

                    {Boolean(post.is_author || (user && (post.author_id === user.id || post.author?.id === user.id || post.author?.is_mine))) && (
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{
                          marginLeft: 'auto',
                          color: 'var(--discord-red)',
                          padding: '3px 8px',
                          fontSize: '11px',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid rgba(242, 63, 67, 0.35)',
                          background: 'rgba(242, 63, 67, 0.08)',
                        }}
                        onClick={handleDeletePost}
                        title="Delete Post"
                      >
                        <IconTrash size={13} />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>

                  <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-heading)', margin: '6px 0 10px' }}>
                    {post.title}
                  </h2>

                  {post.body && (
                    <div style={{ fontSize: '14px', color: 'var(--text-normal)', lineHeight: 1.6, marginBottom: 12 }}>
                      <MarkdownView content={post.body} />
                    </div>
                  )}

                  {/* Uploaded Image or Video */}
                  {post.media_url && (
                    <div
                      style={{
                        margin: '12px 0 16px',
                        borderRadius: 'var(--radius-md)',
                        overflow: 'hidden',
                        background: '#090a0f',
                        border: '1px solid var(--border-subtle)',
                        maxHeight: 520,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                      }}
                      onClick={() => window.open(resolveMediaUrl(post.media_url), '_blank')}
                      title="Click to open full resolution image"
                    >
                      {post.media_type === 'video' || post.media_url.match(/\.(mp4|webm|mov|ogg)$/i) ? (
                        <video
                          src={resolveMediaUrl(post.media_url)}
                          controls
                          playsInline
                          style={{ width: '100%', maxHeight: 520, objectFit: 'contain' }}
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <img
                          src={resolveMediaUrl(post.media_url)}
                          alt={post.title}
                          style={{ width: '100%', maxHeight: 520, objectFit: 'contain' }}
                          onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.style.display = 'none';
                            if (e.currentTarget.parentElement) {
                              const fb = document.createElement('div');
                              fb.style.padding = '30px';
                              fb.style.textAlign = 'center';
                              fb.style.color = 'var(--text-muted)';
                              fb.style.fontSize = '13px';
                              fb.innerHTML = '🖼️ <span>Image preview unavailable</span>';
                              e.currentTarget.parentElement.appendChild(fb);
                            }
                          }}
                        />
                      )}
                    </div>
                  )}

                  {/* Skills tags */}
                  {parsedSkills.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600 }}>Required Skills:</span>
                      {parsedSkills.map((skill, i) => (
                        <span key={i} className="skill-tag">
                          {skill}
                        </span>
                      ))}
                      {post.team_size && (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 8 }}>
                          (Team Target: {post.team_size} members)
                        </span>
                      )}
                    </div>
                  )}

                  {/* Collaboration Interaction Row */}
                  {post.post_type === 'collaboration_request' && (
                    <div style={{ background: 'var(--bg-subtle)', padding: '12px 16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-medium)', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      {post.is_author ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--text-heading)', fontSize: '14px' }}>
                              You are the project lead
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                              Review applications and launch a Discord-style project workspace when ready.
                            </div>
                          </div>
                          {post.collab_status !== 'converted' ? (
                            <button
                              className="btn btn-primary btn-sm"
                              style={{ background: 'var(--discord-green)', borderColor: 'var(--discord-green)' }}
                              onClick={handleConvertToProject}
                              disabled={converting}
                            >
                              <IconSparkles size={14} />
                              <span>{converting ? 'Launching...' : 'Convert to Workspace'}</span>
                            </button>
                          ) : (
                            <span className="applicant-status-badge accepted">Workspace Active</span>
                          )}
                        </div>
                      ) : post.user_interest ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--text-heading)', fontSize: '14px' }}>
                              Application Status: <span style={{ textTransform: 'capitalize' }}>{post.user_interest.status}</span>
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                              {post.user_interest.status === 'accepted'
                                ? '🎉 You have been accepted! The creator will invite you to the workspace.'
                                : post.user_interest.status === 'declined'
                                ? 'The creator has declined this application.'
                                : 'Your application is pending review by the creator.'}
                            </div>
                          </div>
                          <span className={`applicant-status-badge ${post.user_interest.status}`}>
                            {post.user_interest.status}
                          </span>
                        </div>
                      ) : post.collab_status === 'open' ? (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <div>
                            <div style={{ fontWeight: 700, color: 'var(--text-heading)', fontSize: '14px' }}>
                              Interested in building this?
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                              Submit your profile and skills to join this project team.
                            </div>
                          </div>
                          <button className="btn btn-primary btn-sm" onClick={() => setShowInterestModal(true)}>
                            <IconUsers size={14} />
                            <span>Join Team</span>
                          </button>
                        </div>
                      ) : (
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                          This collaboration request is no longer accepting new applicants.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Tabs for Author (Discussion vs Applicants) */}
              {post.is_author && post.post_type === 'collaboration_request' && (
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border-medium)', marginBottom: 16 }}>
                  <button
                    className={`btn-ghost ${activeTab === 'discussion' ? 'active' : ''}`}
                    style={{ padding: '8px 16px', fontWeight: 700, borderBottom: activeTab === 'discussion' ? '2px solid var(--discord-blurple)' : 'none', color: activeTab === 'discussion' ? 'var(--text-heading)' : 'var(--text-muted)' }}
                    onClick={() => setActiveTab('discussion')}
                  >
                    💬 Comments ({post.comments?.length || 0})
                  </button>
                  <button
                    className={`btn-ghost ${activeTab === 'applicants' ? 'active' : ''}`}
                    style={{ padding: '8px 16px', fontWeight: 700, borderBottom: activeTab === 'applicants' ? '2px solid var(--discord-blurple)' : 'none', color: activeTab === 'applicants' ? 'var(--text-heading)' : 'var(--text-muted)' }}
                    onClick={() => setActiveTab('applicants')}
                  >
                    👥 Applicants ({applicants.length})
                  </button>
                </div>
              )}

              {/* Applicants View for Author */}
              {post.is_author && post.post_type === 'collaboration_request' && activeTab === 'applicants' ? (
                <div className="applicants-panel">
                  <div className="applicants-header">
                    <span style={{ fontWeight: 700, color: 'var(--text-heading)', fontSize: '14px' }}>
                      Team Applicants ({applicants.length})
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Accepted: {applicants.filter(a => a.status === 'accepted').length} / {post.team_size || '∞'}
                    </span>
                  </div>

                  {loadingApplicants ? (
                    <div className="empty-state"><div className="spinner"></div></div>
                  ) : applicants.length === 0 ? (
                    <div className="empty-state" style={{ padding: '24px 0' }}>
                      <div className="empty-state-title">No applicants yet</div>
                      <div className="empty-state-desc">When users apply to collaborate, they will appear here.</div>
                    </div>
                  ) : (
                    applicants.map((app) => (
                      <div key={app.id} className="applicant-card">
                        <div className="applicant-top">
                          <div className="applicant-user">
                            <div className="user-avatar sm">
                              {(app.name || app.username || '?').charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, color: 'var(--text-heading)', fontSize: '13px' }}>
                                {app.name || app.username}
                                <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: 6 }}>
                                  @{app.alias}
                                </span>
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                Applied {timeAgo(app.created_at)}
                              </div>
                            </div>
                          </div>

                          <span className={`applicant-status-badge ${app.status}`}>
                            {app.status}
                          </span>
                        </div>

                        {app.message && (
                          <div className="applicant-pitch">
                            "{app.message}"
                          </div>
                        )}

                        {app.skills_offered && app.skills_offered.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Skills offered:</span>
                            {app.skills_offered.map((sk, idx) => (
                              <span key={idx} className="skill-tag" style={{ fontSize: '11px', padding: '1px 6px' }}>
                                {sk}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="applicant-actions-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => startDm(app.user_id)}
                            title={`Direct Message ${app.name || app.username}`}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                          >
                            <IconSend size={13} />
                            <span>Message</span>
                          </button>

                          {app.status === 'pending' && (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                style={{ color: 'var(--discord-red)' }}
                                onClick={() => handleUpdateApplicantStatus(app.user_id, 'declined')}
                              >
                                <IconX size={13} />
                                <span>Decline</span>
                              </button>
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                style={{ background: 'var(--discord-green)', borderColor: 'var(--discord-green)' }}
                                onClick={() => handleUpdateApplicantStatus(app.user_id, 'accepted')}
                              >
                                <IconCheck size={13} />
                                <span>Accept</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ) : (
                /* Threaded Comments Section */
                <div className="comments-container">
                  <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-heading)' }}>
                    Comments ({post.comments?.length || 0})
                  </div>

                  {/* Comment Composer */}
                  <form className="comment-composer" onSubmit={(e) => handleAddComment(e)}>
                    <textarea
                      value={commentBody}
                      onChange={(e) => setCommentBody(e.target.value)}
                      placeholder="Share your thoughts, feedback, or ask a question..."
                    />

                    {/* Quick emoji insertion tray */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', background: 'var(--bg-subtle)', borderRadius: 'var(--radius-xs)', margin: '4px 0 8px', overflowX: 'auto' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Quick Emoji:</span>
                      {INSERT_EMOJIS.map((em) => (
                        <button
                          key={em}
                          type="button"
                          onClick={() => setCommentBody(prev => prev + em)}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '15px', padding: '2px 4px', lineHeight: 1 }}
                          title={`Insert ${em}`}
                        >
                          {em}
                        </button>
                      ))}
                    </div>

                    <div className="comment-composer-footer">
                      <div className="identity-toggle-group" style={{ display: 'inline-flex', width: 'auto' }}>
                        <button
                          type="button"
                          className={`identity-toggle-btn ${identityMode === 'alias' ? 'active' : ''}`}
                          onClick={() => setIdentityMode('alias')}
                          title="Post under pseudonym"
                        >
                          🎭 Alias (@{user?.alias})
                        </button>
                        <button
                          type="button"
                          className={`identity-toggle-btn ${identityMode === 'public' ? 'active' : ''}`}
                          onClick={() => setIdentityMode('public')}
                          title="Post with real name"
                        >
                          👤 Public ({user?.name || user?.username})
                        </button>
                      </div>

                      <button type="submit" className="btn btn-primary btn-sm" disabled={submittingComment || !commentBody.trim()}>
                        <IconSend size={14} />
                        <span>{submittingComment ? 'Posting...' : 'Comment'}</span>
                      </button>
                    </div>
                  </form>

                  {/* Comments list */}
                  {post.comments?.length === 0 ? (
                    <div className="empty-state" style={{ padding: '24px 0' }}>
                      <div className="empty-state-title">No comments yet</div>
                      <div className="empty-state-desc">Start the conversation by posting the first comment!</div>
                    </div>
                  ) : (
                    <div className="comment-tree">
                      {buildCommentTree(post.comments).map((comment) => renderCommentNode(comment))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showInterestModal && post && (
        <ExpressInterestModal
          post={post}
          onClose={() => setShowInterestModal(false)}
          onSuccess={() => {
            setShowInterestModal(false);
            loadPost();
            onPostUpdated?.();
          }}
        />
      )}

      {confirmConfig && (
        <ConfirmModal
          {...confirmConfig}
          onCancel={() => setConfirmConfig(null)}
        />
      )}
    </div>,
    document.body
  );
}
