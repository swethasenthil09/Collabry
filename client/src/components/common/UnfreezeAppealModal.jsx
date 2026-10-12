import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../../services/api';
import { IconClose, IconCheck, IconAlertTriangle } from './Icons';

export default function UnfreezeAppealModal({ isOpen, onClose, user, onAppealSubmitted }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [pendingAppeal, setPendingAppeal] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadMyStatus();
    }
  }, [isOpen]);

  const loadMyStatus = async () => {
    try {
      setLoadingStatus(true);
      const res = await api.get('/reports/my-status');
      if (res.data.latest_appeal && res.data.latest_appeal.status === 'pending') {
        setPendingAppeal(res.data.latest_appeal);
      } else {
        setPendingAppeal(null);
      }
    } catch (err) {
      console.error('Failed to load appeal status:', err);
    } finally {
      setLoadingStatus(false);
    }
  };

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('Please provide an explanation for why your account should be unfrozen.');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      await api.post('/reports/appeal', { reason: reason.trim() });
      setSuccess(true);
      onAppealSubmitted?.();
      setTimeout(() => {
        onClose();
        setSuccess(false);
        setReason('');
      }, 2500);
    } catch (err) {
      console.error('Submit appeal failed:', err);
      setError(err.response?.data?.error?.message || 'Failed to submit appeal. Please try again later.');
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
        style={{ maxWidth: 500, width: '92%', margin: 'auto' }}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ color: 'var(--discord-yellow)', display: 'flex', alignItems: 'center' }}>
              <IconAlertTriangle size={22} />
            </div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-heading)' }}>
              Request Account Unfreeze
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
              Appeal Submitted to System Admin
            </h4>
            <p style={{ color: 'var(--text-normal)', fontSize: '13px', lineHeight: 1.5, margin: 0 }}>
              Your request has been delivered to the platform administration. You will receive an in-app notification once the review is completed.
            </p>
          </div>
        ) : pendingAppeal ? (
          <div className="modal-body" style={{ padding: '16px 20px' }}>
            <div
              style={{
                padding: '14px 16px',
                borderRadius: 8,
                background: 'rgba(254, 231, 92, 0.12)',
                border: '1px solid rgba(254, 231, 92, 0.3)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ fontWeight: 700, color: '#FEE75C', fontSize: '13px', display: 'flex', alignItems: 'center', gap: 6 }}>
                ⏳ Appeal Already Under Review
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-normal)', lineHeight: 1.5 }}>
                You submitted an appeal on {new Date(pendingAppeal.created_at).toLocaleDateString()} with the explanation:
              </p>
              <blockquote
                style={{
                  margin: '4px 0 0',
                  padding: '8px 12px',
                  background: 'var(--bg-tertiary)',
                  borderRadius: 6,
                  fontSize: '12px',
                  color: 'var(--text-heading)',
                  fontStyle: 'italic',
                }}
              >
                "{pendingAppeal.reason}"
              </blockquote>
              <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>
                The system admin will review your case shortly. Please check back later.
              </p>
            </div>
            <div className="modal-footer" style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary btn-sm" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 6,
                  background: 'rgba(242, 63, 67, 0.08)',
                  border: '1px solid rgba(242, 63, 67, 0.25)',
                  fontSize: '12px',
                  color: 'var(--text-normal)',
                  lineHeight: 1.5,
                }}
              >
                <div style={{ fontWeight: 700, color: 'var(--discord-red)', marginBottom: 4 }}>
                  Account Status: {user?.status === 'blocked' ? 'Permanently Blocked' : 'Temporarily Frozen'}
                </div>
                <div>
                  <strong>Report Reason:</strong> {user?.freeze_reason || 'Community report violation'}
                </div>
                {user?.frozen_until && (
                  <div style={{ marginTop: 2, color: 'var(--text-muted)' }}>
                    Frozen until: {new Date(user.frozen_until).toLocaleDateString()}
                  </div>
                )}
              </div>

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
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--text-heading)', marginBottom: 6 }}>
                  Why should your account be unfrozen?
                </label>
                <textarea
                  className="form-input"
                  rows={4}
                  placeholder="Explain why the report was mistaken, or describe the steps taken to resolve the issue..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  style={{ width: '100%', resize: 'vertical', fontSize: '13px', padding: '10px 12px' }}
                  required
                />
              </div>

              <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Submissions are reviewed directly by platform administrators. False appeals or continued violations can result in a permanent ban.
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
                style={{ fontWeight: 700 }}
                disabled={submitting || loadingStatus}
              >
                {submitting ? 'Submitting Appeal...' : 'Submit Unfreeze Appeal'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
