import { useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import { IconClose, IconAlertTriangle, IconCheck } from './Icons';

const REASON_CATEGORIES = [
  { id: 'harassment', label: 'Harassment or Hate Speech', icon: '🚫' },
  { id: 'spam', label: 'Spam, Scam, or Phishing', icon: '⚠️' },
  { id: 'inappropriate', label: 'Inappropriate or Offensive Content', icon: '🔞' },
  { id: 'impersonation', label: 'Impersonation or Fake Identity', icon: '🎭' },
  { id: 'misleading', label: 'Misleading Information or Fraud', icon: '📢' },
  { id: 'custom', label: 'Other / Custom Reason', icon: '✍️' },
];

export default function ReportModal({ isOpen, onClose, targetType = 'user', targetId, targetName = '' }) {
  const [selectedCategory, setSelectedCategory] = useState(REASON_CATEGORIES[0].label);
  const [customReason, setCustomReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [resultAction, setResultAction] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedCategory) {
      setError('Please select a reason category.');
      return;
    }
    if (selectedCategory === 'Other / Custom Reason' && !customReason.trim()) {
      setError('Please provide details for your custom reason.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');

      const res = await api.post('/reports', {
        target_type: targetType,
        target_id: targetId,
        reason_category: selectedCategory,
        custom_reason: customReason.trim(),
      });

      setSuccess(true);
      setResultAction(res.data.action_taken || 'frozen');
      setTimeout(() => {
        onClose();
        setSuccess(false);
        setCustomReason('');
        setSelectedCategory(REASON_CATEGORIES[0].label);
      }, 2400);
    } catch (err) {
      console.error('Report submission failed:', err);
      setError(err.response?.data?.error?.message || 'Failed to submit report. Please try again.');
    } finally {
      setSubmitting(false);
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
        className="modal-card"
        style={{ maxWidth: 480, width: '92%', margin: 'auto' }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ color: 'var(--discord-red)', display: 'flex', alignItems: 'center' }}>
              <IconAlertTriangle size={22} />
            </div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-heading)' }}>
              Report {targetType === 'user' ? 'User' : targetType.charAt(0).toUpperCase() + targetType.slice(1)}
            </h3>
          </div>
          <button className="modal-close-btn" onClick={onClose} aria-label="Close">
            <IconClose size={18} />
          </button>
        </div>

        {success ? (
          <div style={{ padding: '28px 16px', textAlign: 'center' }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'rgba(87, 242, 135, 0.15)',
                color: 'var(--discord-green)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <IconCheck size={28} />
            </div>
            <h4 style={{ margin: '0 0 8px', color: 'var(--text-heading)', fontSize: '1.1rem' }}>
              Report Submitted
            </h4>
            <p style={{ color: 'var(--text-normal)', fontSize: '13px', lineHeight: 1.5, margin: 0 }}>
              {resultAction === 'blocked'
                ? 'The user has reached 3 violation reports and has been automatically blocked.'
                : 'A formal warning has been issued, and the user account has been frozen for 1 week pending administrator review.'}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {targetName && (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-subtle)',
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                  }}
                >
                  Reporting: <strong style={{ color: 'var(--text-normal)' }}>{targetName}</strong>
                </div>
              )}

              {error && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'rgba(242, 63, 67, 0.15)',
                    border: '1px solid rgba(242, 63, 67, 0.3)',
                    color: 'var(--discord-red)',
                    fontSize: '12px',
                    fontWeight: 600,
                  }}
                >
                  {error}
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-heading)', marginBottom: 8 }}>
                  Select Reason Category:
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {REASON_CATEGORIES.map((cat) => (
                    <label
                      key={cat.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 12px',
                        borderRadius: 6,
                        background: selectedCategory === cat.label ? 'rgba(88, 101, 242, 0.12)' : 'var(--bg-secondary)',
                        border: `1px solid ${selectedCategory === cat.label ? 'var(--discord-blurple)' : 'var(--border-subtle)'}`,
                        cursor: 'pointer',
                        fontSize: '13px',
                        color: selectedCategory === cat.label ? 'var(--text-heading)' : 'var(--text-normal)',
                        fontWeight: selectedCategory === cat.label ? 600 : 400,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <input
                        type="radio"
                        name="reportReason"
                        value={cat.label}
                        checked={selectedCategory === cat.label}
                        onChange={() => setSelectedCategory(cat.label)}
                        style={{ accentColor: 'var(--discord-blurple)', cursor: 'pointer' }}
                      />
                      <span>{cat.icon}</span>
                      <span>{cat.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-heading)', marginBottom: 6 }}>
                  Additional Details or Custom Reason (Optional):
                </label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="Provide context or explanation for the admin review team..."
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  style={{ width: '100%', resize: 'vertical', fontSize: '13px', padding: '8px 12px' }}
                />
              </div>

              <div
                style={{
                  padding: '10px 12px',
                  borderRadius: 6,
                  background: 'rgba(254, 231, 92, 0.1)',
                  border: '1px solid rgba(254, 231, 92, 0.25)',
                  fontSize: '11px',
                  color: 'var(--text-muted)',
                  lineHeight: 1.5,
                }}
              >
                ⚠️ <strong>Moderation Policy:</strong> Submitting a valid report triggers a 1-week account freeze for the reported user. Accounts reported 3 or more times are automatically blocked. Users can submit an appeal request to the system admin.
              </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={onClose}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary btn-sm"
                style={{ background: 'var(--discord-red)', borderColor: 'var(--discord-red)', fontWeight: 700 }}
                disabled={submitting}
              >
                {submitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
