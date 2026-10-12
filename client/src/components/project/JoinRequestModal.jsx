import { useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import { IconX, IconSparkles } from '../common/Icons';

export default function JoinRequestModal({ projectId, projectName, onClose, onSuccess }) {
  const [message, setMessage] = useState('');
  const [skillsOffered, setSkillsOffered] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await api.post(`/projects/${projectId}/join-requests`, {
        message: message.trim() || undefined,
        skills_offered: skillsOffered.trim() || undefined,
      });
      onSuccess?.();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to submit join request');
    } finally {
      setLoading(false);
    }
  };

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
        className="modal"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{ maxWidth: 480, width: '100%', margin: 'auto' }}
      >
        <div className="modal-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconSparkles size={20} style={{ color: 'var(--discord-blurple)' }} />
            <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Request to Join</h3>
          </div>
          <button className="btn-icon" onClick={onClose}>
            <IconX size={18} />
          </button>
        </div>

        {error && (
          <div className="error-msg" style={{ margin: '12px 20px 0' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Send a pitch to the maintainers of <strong>{projectName}</strong> explaining why you'd like to collaborate.
          </p>

          <div className="form-group">
            <label>Why are you interested in joining?</label>
            <textarea
              rows={3}
              placeholder="e.g. I saw your post and I'd love to help build the frontend components and real-time syncing..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Skills / Tools you can contribute</label>
            <input
              type="text"
              placeholder="e.g. React, Node.js, UI/UX, Docker, Python"
              value={skillsOffered}
              onChange={(e) => setSkillsOffered(e.target.value)}
            />
          </div>

          <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || !message.trim()}>
              {loading ? 'Submitting...' : 'Send Request'}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
