import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import api, { resolveMediaUrl } from '../../services/api';
import { IconImage, IconX } from '../common/Icons';
import MarkdownView from '../common/MarkdownView';

export default function CreatePostModal({ communityId, communityName, defaultProjectId, onClose, onCreated }) {
  const [communities, setCommunities] = useState([]);
  const [userProjects, setUserProjects] = useState([]);
  const [bodyTab, setBodyTab] = useState('write'); // 'write' | 'preview'
  const [form, setForm] = useState({
    community_id: communityId || '',
    project_id: defaultProjectId || '',
    custom_category: '',
    title: '',
    body: '',
    post_type: 'discussion',
    identity_mode: 'alias',
    required_skills: '',
    team_size: '',
    media_url: '',
    media_type: '',
  });

  const insertSnippet = (snippet) => {
    setForm(prev => ({
      ...prev,
      body: prev.body ? prev.body + snippet : snippet,
    }));
  };
  const [loading, setLoading] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    api.get('/communities')
      .then((res) => {
        setCommunities(res.data || []);
      })
      .catch((err) => {
        console.warn('Failed to load communities:', err);
      });

    api.get('/projects')
      .then((res) => {
        setUserProjects(res.data || []);
      })
      .catch((err) => {
        console.warn('Failed to load user projects:', err);
      });
  }, []);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleMediaUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingMedia(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await api.post('/posts/upload-media', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setForm((prev) => ({
        ...prev,
        media_url: res.data.url,
        media_type: res.data.media_type,
      }));
    } catch (err) {
      console.error('Upload failed:', err);
      setError(err.response?.data?.error?.message || 'Failed to upload media.');
    } finally {
      setUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveMedia = () => {
    setForm((prev) => ({ ...prev, media_url: '', media_type: '' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = {
        ...form,
        community_id: form.community_id ? parseInt(form.community_id, 10) : undefined,
        project_id: form.project_id ? parseInt(form.project_id, 10) : undefined,
        custom_category: !form.community_id ? (form.custom_category?.trim() || 'General') : undefined,
        required_skills:
          form.post_type === 'collaboration_request' && form.required_skills
            ? form.required_skills.split(',').map((s) => s.trim()).filter(Boolean)
            : undefined,
        team_size: form.team_size ? parseInt(form.team_size, 10) : undefined,
      };

      await api.post('/posts', payload);
      onCreated();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to create post');
    } finally {
      setLoading(false);
    }
  };

  const mediaFullUrl = resolveMediaUrl(form.media_url);

  const selectedCommunity = communities.find((c) => String(c.id) === String(form.community_id));

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
        overflowY: 'auto',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(5px)',
        padding: '20px 16px',
        display: 'flex',
      }}
    >
      <div
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          maxWidth: 620,
          width: '100%',
          margin: 'auto',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.7)',
        }}
      >
        {/* Header */}
        <div
          className="modal-title"
          style={{
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <span style={{ fontSize: '16px', fontWeight: 700 }}>
            Create Post {selectedCommunity ? `in c/${selectedCommunity.name}` : ''}
          </span>
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            style={{
              color: 'var(--text-muted)',
              cursor: 'pointer',
              background: 'none',
              border: 'none',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconX size={18} />
          </button>
        </div>

        {error && (
          <div
            style={{
              margin: '12px 20px 0',
              flexShrink: 0,
              color: 'var(--discord-red)',
              background: 'rgba(242, 63, 67, 0.1)',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem',
            }}
          >
            {error}
          </div>
        )}

        {/* Scrollable Form Body */}
        <form
          onSubmit={handleSubmit}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {/* Community Field (Explicit & Optional) */}
          <div className="form-group">
            <label>Community (Optional)</label>
            <select
              name="community_id"
              value={form.community_id}
              onChange={handleChange}
            >
              <option value="">None (Post to General Feed)</option>
              {communities.map((c) => (
                <option key={c.id} value={c.id}>
                  c/{c.name} {c.is_joined ? '(Joined)' : ''}
                </option>
              ))}
            </select>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 2 }}>
              Choose a specific community, or select "None" to post directly to the general feed.
            </span>
          </div>

          {/* Custom Topic / Category when no community is selected */}
          {!form.community_id && (
            <div className="form-group">
              <label>Custom Topic / Name (Optional)</label>
              <input
                name="custom_category"
                value={form.custom_category}
                onChange={handleChange}
                placeholder="e.g. General, DevTalk, Tech, Showcase..."
              />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 2 }}>
                Topic tag for your post (defaults to "General" if left blank).
              </span>
            </div>
          )}

          {/* Tag Workspace Option */}
          {userProjects.length > 0 && (
            <div className="form-group">
              <label>Tag Workspace (Optional)</label>
              <select
                name="project_id"
                value={form.project_id}
                onChange={handleChange}
              >
                <option value="">None (No workspace linked)</option>
                {userProjects.map((p) => (
                  <option key={p.id} value={p.id}>
                    🚀 {p.name} ({p.visibility || 'public'})
                  </option>
                ))}
              </select>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 2 }}>
                Tag a workspace you belong to so builders in the feed can discover it and request to join!
              </span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Post Type</label>
              <select name="post_type" value={form.post_type} onChange={handleChange}>
                <option value="discussion">Discussion</option>
                <option value="question">Question</option>
                <option value="collaboration_request">Looking for Collaborators</option>
              </select>
            </div>

            <div className="form-group">
              <label>Identity</label>
              <select name="identity_mode" value={form.identity_mode} onChange={handleChange}>
                <option value="alias">Post as Alias (Anonymous)</option>
                <option value="public">Post as Myself (Public)</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Title *</label>
            <input
              name="title"
              value={form.title}
              onChange={handleChange}
              placeholder="Give your post a clear title..."
              required
            />
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label style={{ margin: 0 }}>Content (Markdown & Code Supported)</label>
              <div style={{ display: 'flex', gap: 4, background: 'var(--bg-subtle)', padding: 2, borderRadius: 6 }}>
                <button
                  type="button"
                  onClick={() => setBodyTab('write')}
                  style={{
                    border: 'none',
                    background: bodyTab === 'write' ? 'var(--discord-blurple)' : 'transparent',
                    color: bodyTab === 'write' ? '#fff' : 'var(--text-muted)',
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '3px 8px',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                >
                  Write
                </button>
                <button
                  type="button"
                  onClick={() => setBodyTab('preview')}
                  style={{
                    border: 'none',
                    background: bodyTab === 'preview' ? 'var(--discord-blurple)' : 'transparent',
                    color: bodyTab === 'preview' ? '#fff' : 'var(--text-muted)',
                    fontSize: 11,
                    fontWeight: 600,
                    padding: '3px 8px',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                >
                  Preview
                </button>
              </div>
            </div>

            {/* Quick Markdown Formatting Toolbar */}
            {bodyTab === 'write' && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                {[
                  { label: 'B', title: 'Bold', action: () => insertSnippet('**bold text**') },
                  { label: 'I', title: 'Italic', action: () => insertSnippet('*italic text*') },
                  { label: '</>', title: 'Code Block', action: () => insertSnippet('\n```javascript\n// write code here\n```\n') },
                  { label: '`c`', title: 'Inline Code', action: () => insertSnippet('`code`') },
                  { label: '""', title: 'Quote', action: () => insertSnippet('\n> quote\n') },
                  { label: '• List', title: 'Bullet List', action: () => insertSnippet('\n- Item 1\n- Item 2\n') },
                ].map((tool, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={tool.action}
                    className="btn btn-xs btn-ghost"
                    style={{ fontSize: 11, padding: '2px 6px', border: '1px solid var(--border-subtle)' }}
                    title={tool.title}
                  >
                    {tool.label}
                  </button>
                ))}
              </div>
            )}

            {bodyTab === 'write' ? (
              <textarea
                name="body"
                value={form.body}
                onChange={handleChange}
                placeholder="What's happening? Share ideas, questions, architecture specs, or code snippets..."
                rows={4}
              />
            ) : (
              <div
                style={{
                  minHeight: 110,
                  maxHeight: 220,
                  overflowY: 'auto',
                  padding: 12,
                  background: 'var(--bg-subtle)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-medium)',
                }}
              >
                {form.body ? (
                  <MarkdownView content={form.body} />
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Nothing to preview yet. Switch to "Write" to author markdown content.
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Media Preview (Like X/Twitter) */}
          {form.media_url && (
            <div
              style={{
                position: 'relative',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                background: '#090a0f',
                border: '1px solid var(--border-subtle)',
                maxHeight: 260,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 4,
              }}
            >
              {form.media_type === 'video' ? (
                <video
                  src={mediaFullUrl}
                  controls
                  playsInline
                  style={{ width: '100%', maxHeight: 260, objectFit: 'contain' }}
                />
              ) : (
                <img
                  src={mediaFullUrl}
                  alt="Upload Preview"
                  style={{ width: '100%', maxHeight: 260, objectFit: 'contain' }}
                />
              )}
              <button
                type="button"
                className="btn-icon"
                onClick={handleRemoveMedia}
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  background: 'rgba(0, 0, 0, 0.75)',
                  color: '#fff',
                  borderRadius: '50%',
                  width: 28,
                  height: 28,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  border: 'none',
                }}
                title="Remove media"
              >
                <IconX size={15} />
              </button>
            </div>
          )}

          {/* Single Action Button for Images and Videos (Like X) */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 0',
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingMedia}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                borderRadius: 'var(--radius-full)',
                padding: '6px 14px',
                fontSize: '12px',
                color: 'var(--discord-blurple)',
                borderColor: 'var(--border-medium)',
              }}
            >
              <IconImage size={16} />
              <span>{uploadingMedia ? 'Uploading...' : form.media_url ? 'Replace Photo/Video' : 'Add Photo or Video'}</span>
            </button>

            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Supports JPG, PNG, GIF, MP4, WebM
            </span>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              style={{ display: 'none' }}
              onChange={handleMediaUpload}
            />
          </div>

          {form.post_type === 'collaboration_request' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Required Skills</label>
                <input
                  name="required_skills"
                  value={form.required_skills}
                  onChange={handleChange}
                  placeholder="React, Node.js, Python..."
                />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Team Size Target</label>
                <input
                  name="team_size"
                  type="number"
                  value={form.team_size}
                  onChange={handleChange}
                  placeholder="e.g. 3"
                  min="1"
                  max="50"
                />
              </div>
            </div>
          )}

          {/* Sticky Docked Bottom Action Bar */}
          <div
            className="modal-actions"
            style={{
              marginTop: 'auto',
              paddingTop: 16,
              borderTop: '1px solid var(--border-subtle)',
              position: 'sticky',
              bottom: 0,
              background: 'var(--bg-modal)',
              zIndex: 10,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 10,
            }}
          >
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || uploadingMedia}
              style={{
                borderRadius: 'var(--radius-full)',
                padding: '8px 24px',
                fontWeight: 600,
              }}
            >
              {loading ? 'Posting...' : 'Post'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
