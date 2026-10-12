import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import CollabryLogo from '../components/common/CollabryLogo';
import GoogleAuthButton from '../components/common/GoogleAuthButton';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', email: '', password: '', name: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.username.trim() || !form.email.trim() || !form.password) {
      setError('Please fill in all required fields.');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setLoading(true);
    try {
      await register(form);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <CollabryLogo size={42} showText={true} />
          <p className="subtitle">Create an account & join the collaboration community</p>
        </div>

        {error && (
          <div className="error-msg">
            {error}{' '}
            {error.toLowerCase().includes('log in') && (
              <Link to="/login" style={{ color: '#5865F2', fontWeight: 600, textDecoration: 'underline', marginLeft: 4 }}>
                Log In
              </Link>
            )}
          </div>
        )}

        {/* 1-Click Google Sign-In */}
        <GoogleAuthButton text="signup_with" defaultEmail={form.email} onError={(err) => setError(err)} />

        <div style={{ display: 'flex', alignItems: 'center', margin: '14px 0', gap: 10 }}>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-medium)' }} />
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>or register with email</span>
          <div style={{ flex: 1, height: '1px', background: 'var(--border-medium)' }} />
        </div>

        <form onSubmit={handleFormSubmit}>
          <div className="form-group">
            <label htmlFor="name">Display Name</label>
            <input
              id="name"
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="How should we call you?"
            />
          </div>

          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              name="username"
              value={form.username}
              onChange={handleChange}
              placeholder="e.g. alex_dev"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="you@example.com"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              value={form.password}
              onChange={handleChange}
              placeholder="Min 8 characters"
              required
              minLength={8}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 8, padding: '12px' }}
            disabled={loading}
          >
            {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <div className="switch-link">
          Already have an account? <Link to="/login">Log In</Link>
        </div>
      </div>
    </div>
  );
}
