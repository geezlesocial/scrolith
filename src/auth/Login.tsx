import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { AuthPagesConfig } from '../types';
import { Eye, EyeOff } from 'lucide-react';
import { CMSService } from '../services/cms';
import AuthSocialButtons from './AuthSocialButtons';
import { useT } from '../i18n/useT';

const Login = () => {
  const t = useT();
  const { login } = useUser(); // Ensure login function accepts email and password only
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [authConfig, setAuthConfig] = useState<AuthPagesConfig | null>(null);
  const location = useLocation();

  const resetSuccess = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const value = params.get('reset');
    return value === 'success' || value === '1' || value === 'true';
  }, [location.search]);

  const defaultLoginContent = {
    headline: t('auth.login.headline', 'Sign in to your account'),
    subheadline: '',
    email_placeholder: t('auth.login.email_placeholder', 'Email address'),
    password_placeholder: t('auth.login.password_placeholder', 'Password'),
    submit_label: t('auth.login.submit_label', 'Sign in'),
    footer_text: t('auth.login.footer_text', "Don't have an account?"),
    footer_link_label: t('auth.login.footer_link_label', 'Sign up'),
    footer_link_url: '/auth/signup'
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
      } catch (err) {
        // Ignore and use defaults
      }
    };
    loadConfig();
    return () => {
      isMounted = false;
    };
  }, []);

  const loginContent = authConfig?.login ?? defaultLoginContent;
  const branding = authConfig?.branding ?? defaultBranding;
  const socialConfig = authConfig?.social_auth;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Call login without a hardcoded role - the backend will determine the role
      const success = await login(email, password);
      
      if (success) {
        // UserContext handles role-based redirect after login.
        return;
      } else {
        setError(t('auth.login.invalid_credentials', 'Invalid credentials'));
      }
    } catch (err: any) {
      setError(err.message || t('auth.login.failed', 'Login failed'));
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
                <img src={branding.logo_url} alt="Logo" className="h-10" />
              </a>
            </div>
          )}
          <h2 className="text-center text-3xl font-extrabold text-gray-900">
            {loginContent.headline}
          </h2>
          {loginContent.subheadline && (
            <p className="text-center text-sm text-gray-600">
              {loginContent.subheadline}
            </p>
          )}
        </div>
        <div className="mt-8 space-y-6">
          <AuthSocialButtons mode="login" config={socialConfig || undefined} />
          <form className="space-y-6" onSubmit={handleSubmit}>
          {resetSuccess && (
            <div className="rounded-md bg-green-50 p-4">
              <div className="text-sm text-green-700">
                {t('auth.login.reset_success', 'Password updated. Please sign in with your new password.')}
              </div>
            </div>
          )}
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-700">{error}</div>
            </div>
          )}
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email-address" className="sr-only">
                {t('auth.login.email_placeholder', 'Email address')}
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder={loginContent.email_placeholder || 'Email address'}
              />
            </div>
            <div className="relative">
              <label htmlFor="password" className="sr-only">
                {t('auth.login.password_placeholder', 'Password')}
              </label>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 pr-10 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder={loginContent.password_placeholder || 'Password'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(prev => !prev)}
                className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 hover:text-gray-700"
                aria-label={showPassword ? t('auth.login.hide_password', 'Hide password') : t('auth.login.show_password', 'Show password')}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div />
            <Link to="/auth/forgot-password" className="text-xs font-medium text-blue-600 hover:text-blue-500">
              {t('auth.login.forgot_password', 'Forgot password?')}
            </Link>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? t('auth.login.loading', 'Signing in...') : loginContent.submit_label}
            </button>
          </div>

          <div className="text-center">
            <p className="text-sm text-gray-600">
              {loginContent.footer_text}{' '}
              <Link to={loginContent.footer_link_url || '/auth/signup'} className="font-medium text-blue-600 hover:text-blue-500">
                {loginContent.footer_link_label}
              </Link>
            </p>
          </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
