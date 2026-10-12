import { useState } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { IconUsers, IconSend } from '../common/Icons';

export default function ExpressInterestModal({ post, onClose, onSuccess }) {
  const { user } = useAuth();
  const [message, setMessage] = useState('');
  const [skillsInput, setSkillsInput] = useState('');
  const [selectedSkills, setSelectedSkills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Required skills parsed from post
  const requiredSkills = post.required_skills
    ? (Array.isArray(post.required_skills) ? post.required_skills : JSON.parse(post.required_skills || '[]'))
    : [];

  const toggleSkill = (skill) => {
    if (selectedSkills.includes(skill)) {
      setSelectedSkills(selectedSkills.filter(s => s !== skill));
    } else {
      setSelectedSkills([...selectedSkills, skill]);
    }
  };

  const handleAddCustomSkill = (e) => {
    if (e.key === 'Enter' && skillsInput.trim()) {
      e.preventDefault();
      const newSkill = skillsInput.trim();
      if (!selectedSkills.includes(newSkill)) {
        setSelectedSkills([...selectedSkills, newSkill]);
      }
      setSkillsInput('');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const skillsToOffer = [...selectedSkills];
      if (skillsInput.trim() && !skillsToOffer.includes(skillsInput.trim())) {
        skillsToOffer.push(skillsInput.trim());
      }

      await api.post(`/posts/${post.id}/interests`, {
        message: message.trim() || 'Excited to collaborate on this project!',
        skills_offered: skillsToOffer,
      });

      onSuccess();
    } catch (err) {
      console.error('Express interest error:', err);
      setError(err.response?.data?.error?.message || 'Failed to submit application');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <IconUsers size={20} style={{ color: 'var(--discord-green)' }} />
            <span>Apply to Collaborate</span>
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
            <div style={{ background: 'var(--bg-card)', padding: '12px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-medium)' }}>
              <div style={{ fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700 }}>
                Applying For
              </div>
              <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', marginTop: 2 }}>
                {post.title}
              </div>
            </div>

            {error && <div className="error-msg">{error}</div>}

            <div className="form-group">
              <label>Skills You Bring to the Team</label>
              {requiredSkills.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                  {requiredSkills.map((skill, idx) => {
                    const isSelected = selectedSkills.includes(skill);
                    return (
                      <button
                        type="button"
                        key={idx}
                        className={`skill-tag ${isSelected ? 'selected' : ''}`}
                        style={{
                          cursor: 'pointer',
                          background: isSelected ? 'var(--discord-blurple)' : 'var(--bg-subtle)',
                          color: isSelected ? '#fff' : 'var(--text-muted)',
                          borderColor: isSelected ? 'var(--discord-blurple)' : 'var(--border-medium)',
                        }}
                        onClick={() => toggleSkill(skill)}
                      >
                        {isSelected ? '✓ ' : '+ '}
                        {skill}
                      </button>
                    );
                  })}
                </div>
              )}

              <input
                value={skillsInput}
                onChange={(e) => setSkillsInput(e.target.value)}
                onKeyDown={handleAddCustomSkill}
                placeholder="Type additional skill and press Enter..."
              />
              {selectedSkills.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {selectedSkills.map((skill, i) => (
                    <span
                      key={i}
                      className="skill-tag"
                      style={{ background: 'rgba(88, 101, 242, 0.2)', borderColor: 'var(--discord-blurple)', color: 'var(--text-heading)' }}
                    >
                      {skill}
                      <span
                        style={{ marginLeft: 6, cursor: 'pointer', color: 'var(--text-muted)' }}
                        onClick={() => toggleSkill(skill)}
                      >
                        ×
                      </span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="form-group">
              <label>Pitch / Note to Creator</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Share your background, relevant past projects, and why you'd be a great fit for this team..."
                rows={4}
                required
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <IconSend size={15} />
              <span>{loading ? 'Submitting...' : 'Send Application'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
