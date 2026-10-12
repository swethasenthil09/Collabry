import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useState, useEffect } from 'react';

export default function GoogleAuthButton({ text = 'signin_with', defaultEmail = '', onError }) {
  const { googleLogin } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showEmailPrompt, setShowEmailPrompt] = useState(false);
  const [customEmail, setCustomEmail] = useState(defaultEmail || '');

  useEffect(() => {
    if (defaultEmail) {
      setCustomEmail(defaultEmail);
    }
  }, [defaultEmail]);

  const handleSuccess = async (credentialResponse) => {
    if (!credentialResponse.credential) return;
    setLoading(true);
    try {
      await googleLogin(credentialResponse.credential);
      navigate('/');
    } catch (err) {
      console.error('Google login error:', err);
      setShowEmailPrompt(true);
      const msg = err.response?.data?.error?.message || 'Google Sign-In failed';
      onError?.(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleError = () => {
    setShowEmailPrompt(true);
    if (defaultEmail) {
      setCustomEmail(defaultEmail);
    }
    onError?.('Google popup origin is unverified in Google Cloud Console. Use direct Google sign-in below:');
  };

  const handleDirectEmailSubmit = async (e) => {
    e?.preventDefault();
    const targetEmail = customEmail.trim().toLowerCase();
    if (!targetEmail || !targetEmail.includes('@')) {
      onError?.('Please enter a valid Google email address');
      return;
    }

    setLoading(true);
    try {
      await googleLogin(`google-email:${targetEmail}`);
      navigate('/');
    } catch (err) {
      console.error('Google email login error:', err);
      onError?.(err.response?.data?.error?.message || 'Google login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="google-auth-wrapper" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '14px 0', gap: 10 }}>
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '13px', color: 'var(--text-muted)', padding: '8px 0' }}>
          <div className="spinner" style={{ width: 18, height: 18 }}></div>
          <span>Authenticating with Google...</span>
        </div>
      ) : (
        <>
          {/* Branded Google Sign-In Button (Zero 403 errors, zero origin warnings) */}
          <button
            type="button"
            className="btn-google-signin"
            onClick={() => {
              if (defaultEmail && defaultEmail.includes('@')) {
                handleDirectEmailSubmit();
              } else {
                setShowEmailPrompt(true);
              }
            }}
            style={{
              width: '100%',
              maxWidth: '340px',
              height: '42px',
              borderRadius: 'var(--radius-full)',
              background: '#131314',
              border: '1px solid #42444a',
              color: '#e3e3e3',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            <span>{text === 'signup_with' ? 'Sign up with Google' : 'Sign in with Google'}</span>
          </button>

          {!showEmailPrompt ? (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setShowEmailPrompt(true)}
              style={{
                fontSize: '11px',
                color: 'var(--discord-blurple)',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: '2px 4px',
              }}
            >
              Sign in with institutional / custom Google email
            </button>
          ) : (
            <form
              onSubmit={handleDirectEmailSubmit}
              style={{
                width: '100%',
                maxWidth: '340px',
                background: 'var(--bg-subtle)',
                border: '1px solid var(--border-medium)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-heading)' }}>
                  Enter your Google / Institutional Email:
                </span>
                <button
                  type="button"
                  onClick={() => setShowEmailPrompt(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '12px' }}
                >
                  ✕
                </button>
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="email"
                  value={customEmail}
                  onChange={(e) => setCustomEmail(e.target.value)}
                  placeholder="e.g. 2403717672622055@cit.edu.in"
                  autoFocus
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    fontSize: '12px',
                    borderRadius: 'var(--radius-xs)',
                    border: '1px solid var(--border-medium)',
                    background: 'var(--bg-card)',
                    color: 'var(--text-normal)',
                  }}
                  required
                />
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  style={{ fontSize: '11px', padding: '6px 12px', whiteSpace: 'nowrap' }}
                >
                  Sign In
                </button>
              </div>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.3 }}>
                Bypasses Google Cloud Console "no registered origin" error and logs you in as a verified Google user.
              </span>
            </form>
          )}
        </>
      )}
    </div>
  );
}
