import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import CollabryLogo from '../components/common/CollabryLogo';
import GoogleAuthButton from '../components/common/GoogleAuthButton';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const userData = await login(email, password);
      if (userData?.role === 'admin' || userData?.username === 'admin@09') {
        navigate('/admin');
      } else {
        navigate('/');
      }
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <CollabryLogo size={42} showText={true} />
          <p className="subtitle">Welcome back! We're so excited to see you again.</p>
        </div>

        {error && <div className="error-msg">{error}</div>}

        {/* 1-Click Google Sign-In */}
        <GoogleAuthButton text="signin_with" defaultEmail={email} onError={(err) => setError(err)} />

        <div style={{ display: 'flex', alignItems: 'center', margin: '14px 0', gap: 10 }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-medium)' }} />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>or sign in with credentials</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-medium)' }} />
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email or Username</label>
            <input
              id="email"
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com or admin@09"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label htmlFor="password" style={{ margin: 0 }}>Password</label>
              <Link to="/forgot-password" style={{ fontSize: '11px', color: 'var(--discord-blurple)', textDecoration: 'none' }}>
                Forgot password?
              </Link>
            </div>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 8, padding: '12px' }}
            disabled={loading}
          >
            {loading ? 'Logging In...' : 'Log In'}
          </button>
        </form>

        <div className="switch-link">
          Need an account? <Link to="/register">Register</Link>
        </div>
      </div>
    </div>
  );
}
