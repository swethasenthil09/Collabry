import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, useLocation, Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { connectSocket } from '../services/socket';
import CollabryLogo from '../components/common/CollabryLogo';
import HumanVerificationModal from '../components/common/HumanVerificationModal';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();

  const tokenParam = searchParams.get('token');
  const emailParam = searchParams.get('email') || '';

  const [email, setEmail] = useState(emailParam);
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState(location.state?.devOtp || '');
  const [loading, setLoading] = useState(false);
  const [autoVerifying, setAutoVerifying] = useState(Boolean(tokenParam));
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showCaptcha, setShowCaptcha] = useState(false);

  const handleCaptchaSuccess = async () => {
    setShowCaptcha(false);
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.post('/auth/verify-human', { email: email?.trim() });
      const { user: userData, accessToken, refreshToken } = res.data;
      if (accessToken) {
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
        connectSocket(accessToken);
      }
      setSuccess('🎉 Security puzzle solved! Account verified successfully.');
      setTimeout(() => {
        navigate('/');
      }, 1200);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Verification failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Sync emailParam from searchParams
  useEffect(() => {
    if (emailParam) {
      setEmail(emailParam);
    }
  }, [emailParam]);

  // Auto-verify if user clicked the 1-Click Magic Link from email
  useEffect(() => {
    if (tokenParam && emailParam) {
      handleAutoTokenVerify(tokenParam, emailParam);
    }
  }, [tokenParam, emailParam]);

  // Resend countdown timer
  useEffect(() => {
    let timer;
    if (countdown > 0) {
      timer = setInterval(() => setCountdown(c => c - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [countdown]);

  const handleAutoTokenVerify = async (token, userEmail) => {
    setAutoVerifying(true);
    setError('');
    try {
      const res = await api.post('/auth/verify-email-token', { token, email: userEmail });
      const { user: userData, accessToken, refreshToken } = res.data;
      if (accessToken) {
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
        connectSocket(accessToken);
      }
      setSuccess('🎉 Email verified successfully! Redirecting to Collabry...');
      setTimeout(() => {
        navigate('/');
      }, 1500);
    } catch (err) {
      setAutoVerifying(false);
      setError(err.response?.data?.error?.message || 'Verification link is invalid or has expired.');
    }
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (otp.trim().length !== 6) {
      setError('Please enter the 6-digit verification PIN.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/verify-email-otp', {
        otp: otp.trim(),
        email: email.trim(),
      });
      const { user: userData, accessToken, refreshToken } = res.data;
      if (accessToken) {
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
        connectSocket(accessToken);
      }
      setSuccess('🎉 Verification successful! Welcome to Collabry.');
      setTimeout(() => {
        navigate('/');
      }, 1200);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Invalid or expired 6-digit PIN code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email || countdown > 0 || resending) return;
    setResending(true);
    setError('');
    setSuccess('');

    try {
      const res = await api.post('/auth/resend-verification', { email: email.trim() });
      setSuccess(res.data.message || 'New verification link and PIN sent!');
      if (res.data.devOtp) {
        setDevOtp(res.data.devOtp);
      }
      setCountdown(60);
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Failed to resend verification email.');
    } finally {
      setResending(false);
    }
  };

  if (autoVerifying && !error) {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: 'center', padding: '40px 24px' }}>
          <CollabryLogo size={42} showText={true} />
          <div className="spinner" style={{ margin: '24px auto', width: 32, height: 32 }}></div>
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-heading)' }}>
            Verifying your email...
          </h2>
          <p className="subtitle">Hold on tight, setting up your Collabry workspace.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <CollabryLogo size={42} showText={true} />
          <h2 style={{ fontSize: '20px', fontWeight: 800, marginTop: 12, color: 'var(--text-heading)' }}>
            Verify Your Email
          </h2>
          <p className="subtitle">
            We sent a verification email to{' '}
            <strong style={{ color: 'var(--text-heading)' }}>{email || 'your email'}</strong>.
            <br />
            Click the link in the email <strong>or</strong> enter your 6-digit PIN below:
          </p>
        </div>

        {error && <div className="error-msg">{error}</div>}
        {success && (
          <div
            style={{
              background: 'rgba(59, 165, 93, 0.15)',
              border: '1px solid var(--discord-green)',
              color: 'var(--discord-green)',
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
              fontSize: '13px',
              marginBottom: '16px',
              textAlign: 'center',
              fontWeight: 600,
            }}
          >
            {success}
          </div>
        )}

        {devOtp && (
          <div
            style={{
              background: 'rgba(88, 101, 242, 0.12)',
              border: '1px solid rgba(88, 101, 242, 0.4)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 16px',
              marginBottom: '16px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: 4 }}>
              Instant Verification PIN:
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '6px', color: '#ffffff', fontFamily: 'monospace' }}>
              {devOtp}
            </div>
            <button
              type="button"
              onClick={() => setOtp(devOtp)}
              style={{
                marginTop: 8,
                background: 'var(--discord-blurple)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                padding: '5px 14px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Click to Auto-fill PIN
            </button>
          </div>
        )}

        {/* 1-Click Game Verification */}
        <div style={{ marginBottom: 20 }}>
          <button
            type="button"
            onClick={() => setShowCaptcha(true)}
            className="btn btn-primary"
            style={{
              width: '100%',
              padding: '13px',
              fontSize: '14px',
              fontWeight: 800,
              background: 'linear-gradient(135deg, #5865F2 0%, #7289da 100%)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              boxShadow: '0 4px 14px rgba(88, 101, 242, 0.4)',
            }}
          >
            <span style={{ fontSize: 18 }}>🧩</span>
            <span>Solve Puzzle to Verify Instantly</span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', margin: '16px 0', gap: 10 }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--border-medium)' }} />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>or verify with 6-digit email PIN</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border-medium)' }} />
          </div>
        </div>

        <form onSubmit={handleOtpSubmit}>
          {!emailParam && (
            <div className="form-group">
              <label htmlFor="email">Your Email Address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="otp">6-Digit PIN Code</label>
            <input
              id="otp"
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
                padding: '12px',
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
            {loading ? 'Verifying...' : 'Verify PIN & Enter Collabry'}
          </button>
        </form>

        <div style={{ marginTop: 16, textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)' }}>
          Didn't receive the email?{' '}
          <button
            onClick={handleResend}
            disabled={countdown > 0 || resending || !email}
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
            {resending ? 'Sending...' : countdown > 0 ? `Resend email in ${countdown}s` : 'Resend Verification Email'}
          </button>
        </div>

        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="btn btn-secondary"
            style={{
              width: '100%',
              padding: '10px',
              fontSize: '13px',
              fontWeight: 600,
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-medium)',
              color: 'var(--text-normal)',
            }}
          >
            Continue to Dashboard (Verify Later) &rarr;
          </button>
        </div>

        <div className="switch-link" style={{ marginTop: 16 }}>
          Already verified or wrong email? <Link to="/login">Back to Log In</Link>
        </div>

        <HumanVerificationModal
          isOpen={showCaptcha}
          onClose={() => setShowCaptcha(false)}
          onSuccess={handleCaptchaSuccess}
          title="Security Challenge"
          subtitle="Solve the puzzle to verify your account"
        />
      </div>
    </div>
  );
}
