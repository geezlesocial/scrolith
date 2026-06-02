import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { AuthPagesConfig } from '../types';
import { ArrowRight, Eye, EyeOff, Lock, Mail, ShieldCheck } from 'lucide-react';
import { CMSService } from '../services/cms';
import AuthSocialButtons from './AuthSocialButtons';
import { useT } from '../i18n/useT';
import { Capacitor } from '@capacitor/core';
import { resolveAuthenticatedEntryPath } from '../utils/authRedirect';

const IS_MOBILE_APP_BUILD = import.meta.env.VITE_SCROLITH_MOBILE_APP === 'true';

const shouldUseMobilePostLoginRoute = () => {
  if (typeof window === 'undefined') return false;
  if (IS_MOBILE_APP_BUILD) return true;
  try {
    if (Capacitor.isNativePlatform()) return true;
    const runtime = (window as any)?.Capacitor;
    if (runtime && typeof runtime.isNativePlatform === 'function' && runtime.isNativePlatform()) return true;
    if (runtime && typeof runtime.getPlatform === 'function') {
      const platform = String(runtime.getPlatform() || '').toLowerCase();
      if (platform && platform !== 'web') return true;
    }
    const ua = String(window.navigator?.userAgent || '');
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
    const coarsePointer = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    const maxTouchPoints = Number(window.navigator?.maxTouchPoints || 0);
    const viewportWidth = Math.min(
      window.innerWidth || Number.POSITIVE_INFINITY,
      document.documentElement?.clientWidth || Number.POSITIVE_INFINITY,
      window.visualViewport?.width || Number.POSITIVE_INFINITY
    );
    const screenWidth = Math.min(
      window.screen?.width || Number.POSITIVE_INFINITY,
      window.screen?.availWidth || Number.POSITIVE_INFINITY,
      window.screen?.height || Number.POSITIVE_INFINITY,
      window.screen?.availHeight || Number.POSITIVE_INFINITY
    );
    const touchDevice = coarsePointer || maxTouchPoints > 0;
    return (
      viewportWidth < 1180 ||
      (touchDevice && viewportWidth <= 1366) ||
      (touchDevice && screenWidth <= 900)
    );
  } catch {
    return window.innerWidth < 1180;
  }
};

const MOBILE_POST_AUTH_TARGET_KEY = 'scrolith:mobile-post-auth-target';

const isStoredAdminUser = () => {
  if (typeof window === 'undefined') return false;
  try {
    const stored = window.localStorage.getItem('user');
    if (!stored) return false;
    const parsed = JSON.parse(stored);
    return String(parsed?.role || '').toLowerCase().includes('admin');
  } catch {
    return false;
  }
};

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
  const navigate = useNavigate();

  const resetSuccess = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const value = params.get('reset');
    return value === 'success' || value === '1' || value === 'true';
  }, [location.search]);

  const defaultLoginContent = {
    headline: t('auth.login.headline', 'Sign in to Scrolith'),
    subheadline: t('auth.login.subheadline', 'Access your dashboard, messages, marketplace activity, and community workspace.'),
    email_placeholder: t('auth.login.email_placeholder', 'Email address'),
    password_placeholder: t('auth.login.password_placeholder', 'Password'),
    submit_label: t('auth.login.submit_label', 'Sign in'),
    footer_text: t('auth.login.footer_text', "Don't have an account?"),
    footer_link_label: t('auth.login.footer_link_label', 'Sign up'),
    footer_link_url: '/auth/signup'
  };

  const defaultBranding = {
    show_logo: true,
    logo_url: '/logo.webp',
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

  const loginContent = { ...defaultLoginContent, ...(authConfig?.login ?? {}) };
  const brandingSource = (authConfig?.branding ?? {}) as Partial<AuthPagesConfig['branding']>;
  const branding = {
    ...defaultBranding,
    ...brandingSource,
    logo_url: brandingSource.logo_url || defaultBranding.logo_url,
    logo_link_url: brandingSource.logo_link_url || defaultBranding.logo_link_url
  };
  const socialConfig = authConfig?.social_auth ?? (authConfig as any)?.socialAuth;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Call login without a hardcoded role - the backend will determine the role
      const success = await login(email, password, { redirect: false });
      
      if (success) {
        // Native/mobile auth pages must not race back to the desktop root shell.
        if (shouldUseMobilePostLoginRoute() && !isStoredAdminUser()) {
          const target = resolveAuthenticatedEntryPath(null);
          try {
            window.sessionStorage.setItem(MOBILE_POST_AUTH_TARGET_KEY, target);
            window.localStorage.setItem(MOBILE_POST_AUTH_TARGET_KEY, target);
          } catch {
            // Best-effort route recovery for Android WebView.
          }
          navigate(target, { replace: true });
          window.setTimeout(() => {
            if (window.location.pathname.replace(/\/+$/, '') !== target) {
              window.location.replace(new URL(target, window.location.origin).href);
            }
          }, 1_500);
        }
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
    <main className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-5rem)] max-w-6xl overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_24px_90px_rgba(15,23,42,0.12)] lg:grid-cols-[0.95fr_1.05fr]">
        <section className="relative hidden min-h-full overflow-hidden bg-slate-950 p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(59,130,246,0.28),transparent_32%),radial-gradient(circle_at_80%_10%,rgba(14,165,233,0.22),transparent_28%)]" />
          <div className="relative">
            <Link to="/" className="inline-flex items-center gap-3">
              {branding.show_logo && branding.logo_url ? (
                <img src={branding.logo_url} alt="Scrolith" className="h-10 w-10 rounded-xl object-contain" />
              ) : null}
              <span className="text-2xl font-bold tracking-tight">Scrolith</span>
            </Link>
            <div className="mt-16 max-w-md">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-200">Secure access</p>
              <h1 className="mt-4 text-4xl font-black leading-tight tracking-tight">Welcome back to your Scrolith workspace.</h1>
              <p className="mt-5 text-base leading-8 text-slate-300">
                Continue managing gigs, jobs, messages, payments, and community activity from one professional account.
              </p>
            </div>
          </div>
          <div className="relative grid gap-3 text-sm text-slate-300">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-sky-300" />
              <span>Protected login with authenticated API sessions.</span>
            </div>
            <div className="flex items-center gap-3">
              <ArrowRight className="h-5 w-5 text-sky-300" />
              <span>Role-aware redirect to the right dashboard after sign-in.</span>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-10 sm:px-10">
          <div className="w-full max-w-md space-y-7">
            <div className="space-y-4 text-center lg:text-left">
              <Link to={branding.logo_link_url || '/'} className="mx-auto inline-flex items-center gap-3 lg:mx-0">
                {branding.show_logo && branding.logo_url ? (
                  <img src={branding.logo_url} alt="Scrolith" className="h-11 w-11 rounded-xl object-contain" />
                ) : null}
                <span className="text-xl font-bold text-slate-950">Scrolith</span>
              </Link>
              <div>
                <h2 className="text-3xl font-black tracking-tight text-slate-950">
                  {loginContent.headline}
                </h2>
                {loginContent.subheadline && (
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {loginContent.subheadline}
                  </p>
                )}
              </div>
            </div>

          <div className="space-y-6">
          <AuthSocialButtons mode="login" config={socialConfig || undefined} />
          <form className="space-y-6" onSubmit={handleSubmit}>
          {resetSuccess && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4">
              <div className="text-sm text-green-700">
                {t('auth.login.reset_success', 'Password updated. Please sign in with your new password.')}
              </div>
            </div>
          )}
          <div
            aria-live="polite"
            className={error ? 'rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700' : 'sr-only'}
          >
            {error || t('auth.login.error_region', 'Login status messages will appear here.')}
          </div>
          <div className="space-y-4">
            <div>
              <label htmlFor="email-address" className="mb-1.5 block text-sm font-semibold text-slate-800">
                {t('auth.login.email_placeholder', 'Email address')}
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <input
                  id="email-address"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pl-11 text-slate-950 placeholder-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder={loginContent.email_placeholder || 'Email address'}
                />
              </div>
            </div>
            <div className="relative">
              <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-slate-800">
                {t('auth.login.password_placeholder', 'Password')}
              </label>
              <Lock className="pointer-events-none absolute left-3 top-[2.65rem] h-5 w-5 text-slate-400" />
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pl-11 pr-11 text-slate-950 placeholder-slate-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder={loginContent.password_placeholder || 'Password'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(prev => !prev)}
                className="absolute bottom-0 right-0 flex h-12 items-center px-3 text-slate-500 hover:text-slate-700"
                aria-label={showPassword ? t('auth.login.hide_password', 'Hide password') : t('auth.login.show_password', 'Show password')}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div />
            <Link to="/auth/forgot-password" className="text-sm font-semibold text-blue-700 hover:text-blue-600">
              {t('auth.login.forgot_password', 'Forgot password?')}
            </Link>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center rounded-xl border border-transparent bg-slate-950 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-slate-950/15 transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {loading ? t('auth.login.loading', 'Signing in...') : loginContent.submit_label}
            </button>
          </div>

          <div className="text-center">
            <p className="text-sm text-slate-600">
              {loginContent.footer_text}{' '}
              <Link to={loginContent.footer_link_url || '/auth/signup'} className="font-semibold text-blue-700 hover:text-blue-600">
                {loginContent.footer_link_label}
              </Link>
            </p>
          </div>
          </form>
          </div>
        </div>
    </section>
  </div>
</main>
  );
};

export default Login;
