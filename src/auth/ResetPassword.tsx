import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { CMSService } from '../services/cms';
import { AuthPagesConfig } from '../types';
import api from '../services/api';
import { useNotification } from '../context/NotificationContext';
import { resolveOptimizedStaticImageUrl, resolveResponsiveAssetUrl } from '../utils/assetUrl';
import ScrolithHumanVerification from '../components/human-verification/ScrolithHumanVerification';

const ResetPassword = () => {
  const { showNotification } = useNotification();
  const location = useLocation();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [authConfig, setAuthConfig] = useState<AuthPagesConfig | null>(null);
  const [hvToken, setHvToken] = useState<string | null>(null);
  const [hvRequired, setHvRequired] = useState(false);

  const token = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('token') || '';
  }, [location.search]);

  const defaultContent = {
    headline: 'Reset your password',
    subheadline: 'Create a new password to regain access to your account.',
    submit_label: 'Update password',
    footer_text: 'Remembered your password?',
    footer_link_label: 'Back to sign in',
    footer_link_url: '/auth/login'
  };

  const defaultBranding = {
    show_logo: true,
    logo_url: '',
    logo_link_url: '/'
  };

  useEffect(() => {
    let isMounted = true;
    const loadConfig = async () => {
      try {
        const data = await CMSService.getAuthPagesConfig();
        if (isMounted && data) {
          setAuthConfig(data);
        }
      } catch {
        // Ignore and use defaults
      }
    };
    loadConfig();
    return () => {
      isMounted = false;
    };
  }, []);

  const resetContent = (authConfig as any)?.reset_password ?? defaultContent;
  const branding = authConfig?.branding ?? defaultBranding;
  const logoSrc = resolveResponsiveAssetUrl(
    resolveOptimizedStaticImageUrl(branding.logo_url),
    { width: 160, height: 48, fit: 'inside', quality: 72 }
  );

  const validatePassword = (value: string) => {
    if (value.length < 8) return 'Password must be at least 8 characters.';
    if (!/(?=.*[A-Za-z])(?=.*\d)/.test(value)) return 'Password must contain letters and numbers.';
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Reset token is missing or invalid. Please request a new link.');
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (hvRequired && !hvToken) {
      setError('Please complete human verification to continue.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/reset-password', {
        token,
        password,
        humanVerificationToken: hvToken || undefined
      });
      showNotification('success', 'Password updated', 'You can now sign in with your new password.');
      navigate('/auth/login?reset=success', { replace: true });
    } catch (err: any) {
      const message = err?.response?.data?.message || 'Reset link is invalid or expired. Please request a new one.';
      setError(message);
      showNotification('alert', 'Reset failed', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="space-y-3">
          {branding.show_logo && branding.logo_url && (
            <div className="flex justify-center">
              <a href={branding.logo_link_url || '/'}>
                <img src={logoSrc} alt="Logo" width="160" height="48" loading="eager" decoding="async" className="h-10 w-auto" />
              </a>
            </div>
          )}
          <h2 className="text-center text-3xl font-extrabold text-gray-900">
            {resetContent.headline}
          </h2>
          {resetContent.subheadline && (
            <p className="text-center text-sm text-gray-600">
              {resetContent.subheadline}
            </p>
          )}
        </div>

        <div className="mt-8 space-y-6">
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div className="relative">
                <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="New password"
                  className="appearance-none rounded-md relative block w-full px-10 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div className="relative">
                <Lock className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="appearance-none rounded-md relative block w-full px-10 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 hover:text-gray-700"
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <p className="text-xs text-gray-500">Passwords must be at least 8 characters and include letters and numbers.</p>
            </div>

            <ScrolithHumanVerification
              endpoint="password_reset"
              onVerified={setHvToken}
              onRequiredChange={setHvRequired}
            />

            <div>
              <button
                type="submit"
                disabled={loading || (hvRequired && !hvToken)}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {loading ? 'Updating...' : resetContent.submit_label}
              </button>
            </div>
          </form>

          <div className="text-center">
            <p className="text-sm text-gray-600">
              {resetContent.footer_text}{' '}
              <Link to={resetContent.footer_link_url || '/auth/login'} className="font-medium text-blue-600 hover:text-blue-500">
                {resetContent.footer_link_label}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
