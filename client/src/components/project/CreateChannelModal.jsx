import { useState } from 'react';
import api from '../../services/api';
import { IconHash, IconPlus } from '../common/Icons';

export default function CreateChannelModal({ projectId, onClose, onChannelCreated }) {
  const [channelName, setChannelName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!channelName.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await api.post(`/projects/${projectId}/channels`, {
        name: channelName.trim(),
      });
      onChannelCreated?.(res.data);
      onClose();
    } catch (err) {
      console.error('Create channel error:', err);
      setError(err.response?.data?.error?.message || 'Failed to create channel');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '420px' }}>
        <div className="modal-header">
          <div className="modal-title">
            <IconHash size={20} style={{ color: 'var(--discord-blurple)' }} />
            <span>Create Text Channel</span>
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
              <label>Channel Name</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <span style={{ position: 'absolute', left: 12, color: 'var(--text-muted)', fontWeight: 700, fontSize: '15px' }}>#</span>
                <input
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                  placeholder="e.g. dev-updates, resources, announcements"
                  style={{ paddingLeft: 28 }}
                  autoFocus
                  required
                />
              </div>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: 4 }}>
                Channel names are lowercase with hyphens.
              </span>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || !channelName.trim()}>
              <IconPlus size={14} />
              <span>{loading ? 'Creating...' : 'Create Channel'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
