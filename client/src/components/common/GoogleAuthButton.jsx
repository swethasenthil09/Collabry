import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useState } from 'react';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';

export default function GoogleAuthButton({ text = 'signin_with', onError }) {
  const { googleLogin } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  const handleSuccess = async (credentialResponse) => {
    if (!credentialResponse?.credential) return;
    setLoading(true);
    try {
      await googleLogin(credentialResponse.credential);
      navigate('/');
    } catch (err) {
      console.error('Google login error:', err);
      onError?.(err.response?.data?.error?.message || 'Google Sign-In failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleError = () => {
    console.warn('Google Sign-In popup closed or failed');
    onError?.('Google Sign-In was cancelled or failed.');
  };

  if (!clientId || clientId.includes('your_google_client_id')) {
    return null;
  }

  return (
    <div className="google-auth-wrapper" style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '13px', color: 'var(--text-muted)', padding: '8px 0' }}>
          <div className="spinner" style={{ width: 18, height: 18 }}></div>
          <span>Authenticating with Google...</span>
        </div>
      ) : (
        <GoogleOAuthProvider clientId={clientId}>
          <div style={{ width: '100%', maxWidth: '340px', display: 'flex', justifyContent: 'center' }}>
            <GoogleLogin
              onSuccess={handleSuccess}
              onError={handleGoogleError}
              text={text === 'signup_with' ? 'signup_with' : 'signin_with'}
              theme="filled_black"
              shape="pill"
              width="340"
              size="large"
            />
          </div>
        </GoogleOAuthProvider>
      )}
    </div>
  );
}
