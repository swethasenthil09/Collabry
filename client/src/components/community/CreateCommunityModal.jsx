import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { IconPlus } from '../common/Icons';

export default function CreateCommunityModal({ onClose, onCreated }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const slugPreview = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await api.post('/communities', {
        name: name.trim(),
        description: description.trim() || null,
      });

      onCreated?.();
      onClose();
      navigate(`/community/${res.data.slug}`);
    } catch (err) {
      console.error('Create community error:', err);
      setError(err.response?.data?.error?.message || 'Failed to create community');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
        <div className="modal-header">
          <div className="modal-title">
            <span style={{ color: 'var(--discord-blurple)', fontWeight: 800 }}>c/</span>
            <span>Create Community Hub</span>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            {error && <div className="error-msg">{error}</div>}

            <div className="form-group">
              <label>Community Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Distributed Systems, Rustacean, UI Design"
                required
                autoFocus
              />
              {slugPreview && (
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 4 }}>
                  Hub URL: <strong style={{ color: 'var(--discord-blurple)' }}>c/{slugPreview}</strong>
                </span>
              )}
            </div>

            <div className="form-group">
              <label>Description & Purpose</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this community for? What can members discuss and build together?"
                rows={3}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || !name.trim()}>
              <IconPlus size={14} />
              <span>{loading ? 'Creating...' : 'Create Hub'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
