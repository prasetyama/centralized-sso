import { useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { googleLogin } from '../api/api';

export const GoogleLoginButton = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState('');

  const queryParams = new URLSearchParams(location.search);
  const redirectUrl = queryParams.get('redirect_url');

  const handleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const response = await googleLogin(tokenResponse.access_token);
        const { access_token, user } = response.data;
        login(user, access_token);

        if (redirectUrl) {
          window.location.href = `${redirectUrl}?token=${access_token}`;
        } else {
          navigate('/dashboard');
        }
      } catch (err: any) {
        setError(err.response?.data?.error || 'Authentication failed');
      }
    },
    onError: (errorResponse) => {
      setError('Google Login Failed');
      console.error(errorResponse);
    },
  });

  return (
    <div className="flex flex-col items-center">
      <button
        onClick={() => handleLogin()}
        className="flex items-center gap-3 bg-white text-gray-700 font-semibold py-3 px-6 border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 hover:shadow-md transition duration-200 cursor-pointer"
      >
        <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5" />
        Sign in with Google
      </button>
      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
    </div>
  );
};
