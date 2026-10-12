import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import CollabryLogo from '../components/common/CollabryLogo';
import { FaGithub } from 'react-icons/fa';

export default function GitHubCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { githubLogin } = useAuth();
  const [error, setError] = useState('');
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    handledRef.current = true;

    const code = searchParams.get('code');
    const errParam = searchParams.get('error_description') || searchParams.get('error');

    if (errParam) {
      setError(errParam);
      return;
    }

    if (!code) {
      setError('No authorization code was returned from GitHub.');
      return;
    }

    githubLogin({ code })
      .then(() => {
        navigate('/');
      })
      .catch((err) => {
        console.error('GitHub callback error:', err);
        setError(err.response?.data?.error?.message || 'Failed to authenticate with GitHub.');
      });
  }, [searchParams, githubLogin, navigate]);

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center', padding: '36px 24px' }}>
        <CollabryLogo size={42} showText={true} />

        <div style={{ margin: '24px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: '50%',
              background: '#24292f',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            }}
          >
            <FaGithub size={30} />
          </div>

          {error ? (
            <>
              <h3 style={{ fontSize: '18px', color: 'var(--discord-red, #ED4245)', margin: 0 }}>
                GitHub Sign-In Failed
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, maxWidth: 300 }}>
                {error}
              </p>
              <Link to="/login" className="btn btn-primary" style={{ marginTop: 12, padding: '10px 20px' }}>
                Back to Login
              </Link>
            </>
          ) : (
            <>
              <h3 style={{ fontSize: '18px', color: 'var(--text-normal)', margin: 0 }}>
                Authenticating with GitHub...
              </h3>
              <div className="spinner" style={{ width: 24, height: 24, margin: '8px 0' }}></div>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0 }}>
                Please wait while we verify your account.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
