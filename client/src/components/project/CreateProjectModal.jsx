import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import { IconFolder, IconPlus } from '../common/Icons';

export default function CreateProjectModal({ onClose, onCreated }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    description: '',
    visibility: 'public',
    join_mode: 'invite',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;

    setLoading(true);
    setError('');

    try {
      const res = await api.post('/projects', {
        name: form.name.trim(),
        description: form.description.trim() || null,
        visibility: form.visibility,
        join_mode: form.join_mode,
      });

      onCreated?.();
      onClose();
      navigate(`/project/${res.data.id}`);
    } catch (err) {
      console.error('Create workspace error:', err);
      setError(err.response?.data?.error?.message || 'Failed to create workspace');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <IconFolder size={20} style={{ color: 'var(--reddit-orange)' }} />
            <span>Create Workspace</span>
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
              <label>Workspace Name</label>
              <input
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="e.g. AI Workflow Engine, Distributed Cache..."
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label>Project Overview / Objective</label>
              <textarea
                name="description"
                value={form.description}
                onChange={handleChange}
                placeholder="What is this workspace building? What are the key goals?"
                rows={3}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Visibility</label>
                <select name="visibility" value={form.visibility} onChange={handleChange}>
                  <option value="public">🌐 Public (Discoverable)</option>
                  <option value="private">🔒 Private (Team Only)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Join Policy</label>
                <select name="join_mode" value={form.join_mode} onChange={handleChange}>
                  <option value="invite">Invite Only</option>
                  <option value="request">Request to Join</option>
                  <option value="open">Open to Anyone</option>
                </select>
              </div>
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || !form.name.trim()}>
              <IconPlus size={15} />
              <span>{loading ? 'Creating...' : 'Create Workspace'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
