import React, { useEffect, useState } from 'react';
import { Loader } from 'lucide-react';
import { AuthService } from '../services/authService';

const OAuthCallback = () => {
  const [message, setMessage] = useState('Completing sign in...');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));

    const token = params.get('token') || hashParams.get('token') || '';
    const error = params.get('error') || hashParams.get('error') || '';
    const redirect = params.get('redirect') || hashParams.get('redirect') || '';

    if (error) {
      setMessage(decodeURIComponent(error));
      return;
    }

    if (token) {
      AuthService.setToken(token);
    }

    const next = redirect && redirect.startsWith('/') ? redirect : '/';

    const finish = async () => {
      try {
        await AuthService.getCurrentUser();
      } catch (e) {
        // Ignore; navigation will re-trigger auth bootstrap
      } finally {
        window.location.replace(next);
      }
    };

    finish();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center space-y-3">
        <Loader className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
        <p className="text-sm text-gray-600">{message}</p>
      </div>
    </div>
  );
};

export default OAuthCallback;
