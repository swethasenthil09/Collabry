import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { IconCheck, IconX, IconMail } from './Icons';

export default function VerifyEmailModal({ onClose, onVerified }) {
  const { user, setUser } = useAuth();
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    let timer;
    if (countdown > 0) {
      timer = setInterval(() => setCountdown(c => c - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (otp.trim().length !== 6) {
      setMessage({ type: 'error', text: 'Please enter the 6-digit verification PIN.' });
      return;
    }

    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const res = await api.post('/auth/verify-email-otp', { otp: otp.trim() });
      setMessage({ type: 'success', text: res.data.message || 'Email verified successfully!' });
      if (user) {
        const updated = { ...user, email_verified: true };
        setUser(updated);
        localStorage.setItem('user', JSON.stringify(updated));
      }
      setTimeout(() => {
        onVerified?.();
        onClose?.();
      }, 1500);
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.response?.data?.error?.message || 'Invalid or expired verification PIN.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0 || resending) return;
    setResending(true);
    setMessage({ type: '', text: '' });

    try {
      const res = await api.post('/auth/send-verification-otp');
      setMessage({ type: 'success', text: res.data.message || 'A new verification PIN has been sent!' });
      if (res.data.devOtp) {
        setDevOtp(res.data.devOtp);
      }
      setCountdown(60);
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.response?.data?.error?.message || 'Failed to resend verification PIN.',
      });
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconMail size={22} style={{ color: 'var(--discord-blurple)' }} />
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: 'var(--text-heading)' }}>
              Verify Your Email
            </h3>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <IconX size={18} />
          </button>
        </div>

        <div className="modal-body">
          <p style={{ fontSize: '13px', color: 'var(--text-normal)', lineHeight: 1.5, marginTop: 0 }}>
            A 6-digit verification PIN has been sent to <strong>{user?.email}</strong>. Enter it below to verify your account:
          </p>

          {message.text && (
            <div
              style={{
                background: message.type === 'error' ? 'rgba(237, 66, 69, 0.15)' : 'rgba(59, 165, 93, 0.15)',
                border: `1px solid ${message.type === 'error' ? 'var(--discord-red)' : 'var(--discord-green)'}`,
                color: message.type === 'error' ? 'var(--discord-red)' : 'var(--discord-green)',
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                fontSize: '13px',
                marginBottom: '14px',
                textAlign: 'center',
              }}
            >
              {message.text}
            </div>
          )}

          {devOtp && (
            <div
              style={{
                background: 'rgba(88, 101, 242, 0.12)',
                border: '1px solid rgba(88, 101, 242, 0.4)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 14px',
                marginBottom: '14px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: 4 }}>
                Instant Verification PIN:
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '4px', color: '#ffffff', fontFamily: 'monospace' }}>
                {devOtp}
              </div>
              <button
                type="button"
                onClick={() => setOtp(devOtp)}
                style={{
                  marginTop: 6,
                  background: 'var(--discord-blurple)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 10px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Click to Auto-fill PIN
              </button>
            </div>
          )}

          <form onSubmit={handleVerify}>
            <div className="form-group" style={{ textAlign: 'center' }}>
              <label htmlFor="modal-otp" style={{ textAlign: 'left' }}>6-Digit Verification PIN</label>
              <input
                id="modal-otp"
                type="text"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="123456"
                style={{
                  textAlign: 'center',
                  letterSpacing: '8px',
                  fontSize: '24px',
                  fontWeight: 800,
                  fontFamily: 'monospace',
                  padding: '10px',
                }}
                required
                autoFocus
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 8, padding: '12px' }}
              disabled={loading || otp.length !== 6}
            >
              {loading ? 'Verifying PIN...' : 'Verify Email Address'}
            </button>
          </form>

          <div style={{ marginTop: 16, textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
            Didn't receive the PIN?{' '}
            <button
              onClick={handleResend}
              disabled={countdown > 0 || resending}
              style={{
                background: 'none',
                border: 'none',
                color: countdown > 0 ? 'var(--text-muted)' : 'var(--discord-blurple)',
                fontWeight: 600,
                cursor: countdown > 0 ? 'default' : 'pointer',
                padding: 0,
                textDecoration: countdown > 0 ? 'none' : 'underline',
              }}
            >
              {resending ? 'Sending...' : countdown > 0 ? `Resend in ${countdown}s` : 'Resend PIN'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
