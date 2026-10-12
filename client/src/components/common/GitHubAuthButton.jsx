import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { FaGithub } from 'react-icons/fa';

export default function GitHubAuthButton({ text = 'signin_with', defaultUsername = '', onError }) {
  const { githubLogin } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [usernameInput, setUsernameInput] = useState(defaultUsername || '');

  const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID || import.meta.env.GITHUB_CLIENT_ID;

  const handleGitHubClick = () => {
    if (clientId && clientId.trim() && !clientId.includes('your_github_client_id')) {
      // Production / Live OAuth Redirect
      const redirectUri = `${window.location.origin}/auth/github/callback`;
      const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId.trim()}&scope=user:email&redirect_uri=${encodeURIComponent(redirectUri)}`;
      window.location.href = githubAuthUrl;
    } else {
      // Seamless direct GitHub developer login (or if OAuth App is in setup)
      setShowPrompt(true);
    }
  };

  const handleDirectGitHubSubmit = async (e) => {
    e?.preventDefault();
    const handle = usernameInput.trim();
    if (!handle) {
      onError?.('Please enter your GitHub username or email');
      return;
    }

    setLoading(true);
    try {
      const isEmail = handle.includes('@');
      await githubLogin(isEmail ? { email: handle } : { username: handle });
      navigate('/');
    } catch (err) {
      console.error('GitHub login error:', err);
      onError?.(err.response?.data?.error?.message || 'GitHub authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const buttonLabel = text === 'signup_with' ? 'Sign up with GitHub' : 'Sign in with GitHub';

  return (
    <div className="github-auth-wrapper" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '13px', color: 'var(--text-muted)', padding: '8px 0' }}>
          <div className="spinner" style={{ width: 18, height: 18 }}></div>
          <span>Connecting with GitHub...</span>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="btn-github-signin"
            onClick={handleGitHubClick}
            style={{
              width: '100%',
              maxWidth: '340px',
              height: '40px',
              borderRadius: '20px',
              background: '#24292f',
              border: '1px solid #3d444d',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
            }}
          >
            <FaGithub size={20} />
            <span>{buttonLabel}</span>
          </button>

          {showPrompt && (
            <div
              style={{
                width: '100%',
                maxWidth: '340px',
                background: 'var(--bg-subtle, rgba(255, 255, 255, 0.04))',
                border: '1px solid var(--border-medium, rgba(255, 255, 255, 0.12))',
                borderRadius: '10px',
                padding: '12px 14px',
                marginTop: '4px',
                animation: 'fadeIn 0.2s ease',
              }}
            >
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <FaGithub size={14} />
                <span>Enter your GitHub username or email:</span>
              </div>
              <form onSubmit={handleDirectGitHubSubmit} style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder="e.g. swethasenthil09"
                  autoFocus
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    fontSize: '13px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-strong, #444)',
                    background: 'var(--bg-input, #1e1f22)',
                    color: 'var(--text-normal, #fff)',
                  }}
                />
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ padding: '8px 14px', fontSize: '12px', fontWeight: 600, borderRadius: '6px' }}
                >
                  Connect
                </button>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
}
