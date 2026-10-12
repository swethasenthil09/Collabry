import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api';
import CollabryLogo from '../components/common/CollabryLogo';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: Request OTP, 2: Reset Password with OTP
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const res = await api.post('/auth/forgot-password', { email: email.trim() });
      setSuccess(res.data.message || 'Verification PIN sent to your email!');
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      return setError('Passwords do not match');
    }
    if (newPassword.length < 8) {
      return setError('Password must be at least 8 characters long');
    }
    if (otp.trim().length !== 6) {
      return setError('Please enter the 6-digit PIN code');
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/reset-password', {
        email: email.trim(),
        otp: otp.trim(),
        newPassword,
      });
      setSuccess(res.data.message || 'Password successfully updated!');
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Invalid or expired verification PIN');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <CollabryLogo size={42} showText={true} />
          <h2 style={{ fontSize: '20px', fontWeight: 800, marginTop: 12, color: 'var(--text-heading)' }}>
            {step === 1 ? 'Forgot Password?' : 'Reset Your Password'}
          </h2>
          <p className="subtitle">
            {step === 1
              ? 'Enter your account email to receive a 6-digit verification PIN.'
              : `Enter the 6-digit PIN sent to ${email} and choose a new password.`}
          </p>
        </div>

        {error && <div className="error-msg">{error}</div>}
        {success && (
          <div style={{
            background: 'rgba(59, 165, 93, 0.15)',
            border: '1px solid var(--discord-green)',
            color: 'var(--discord-green)',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            fontSize: '13px',
            marginBottom: '14px',
            textAlign: 'center',
          }}>
            {success}
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleRequestOtp}>
            <div className="form-group">
              <label htmlFor="email">Registered Email Address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 8, padding: '12px' }}
              disabled={loading || !email}
            >
              {loading ? 'Sending PIN...' : 'Send Verification PIN'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword}>
            <div className="form-group">
              <label htmlFor="otp">6-Digit Verification PIN</label>
              <input
                id="otp"
                type="text"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="123456"
                style={{ textAlign: 'center', letterSpacing: '6px', fontSize: '20px', fontWeight: 700 }}
                required
                autoFocus
              />
            </div>

            <div className="form-group">
              <label htmlFor="newPassword">New Password (min 8 characters)</label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm New Password</label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 8, padding: '12px' }}
              disabled={loading || !otp || !newPassword}
            >
              {loading ? 'Resetting Password...' : 'Update Password & Log In'}
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%', marginTop: 10, padding: '8px' }}
              onClick={() => { setStep(1); setError(''); setSuccess(''); }}
            >
              ← Back / Resend PIN
            </button>
          </form>
        )}

        <div className="switch-link" style={{ marginTop: 16 }}>
          Remember your password? <Link to="/login">Back to Log In</Link>
        </div>
      </div>
    </div>
  );
}
