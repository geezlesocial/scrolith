import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { AuthPagesConfig } from '../types';
import { ArrowRight, Eye, EyeOff, KeyRound, Lock, Mail, ShieldCheck } from 'lucide-react';
import { CMSService } from '../services/cms';
import AuthSocialButtons from './AuthSocialButtons';
import { useT } from '../i18n/useT';
import { resolveAuthenticatedEntryPath } from '../utils/authRedirect';
import { resolveOptimizedStaticImageUrl, resolveResponsiveAssetUrl } from '../utils/assetUrl';
import ScrolithHumanVerification from '../components/human-verification/ScrolithHumanVerification';
import { PasskeyService, passkeySupport } from '../services/passkeys';

const IS_MOBILE_APP_BUILD = import.meta.env.VITE_SCROLITH_MOBILE_APP === 'true';
const BRAND_LOGO_FALLBACK = '/logo-64.png';

const handleBrandLogoError = (event: React.SyntheticEvent<HTMLImageElement>) => {
  const image = event.currentTarget;
  if (image.src.endsWith(BRAND_LOGO_FALLBACK)) {
    image.style.display = 'none';
    return;
  }
  image.src = BRAND_LOGO_FALLBACK;
};

const shouldUseMobilePostLoginRoute = () => {
  if (typeof window === 'undefined') return false;
  if (IS_MOBILE_APP_BUILD) return true;
  try {
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
    // Match mobile shell floor (lg / 1024). Do not treat touch laptops ≤1366 as mobile —
    // that mis-routed post-login into MobileHome and incomplete desktop chrome.
    return (
      viewportWidth < 1024 ||
      (touchDevice && screenWidth <= 900 && viewportWidth < 1024)
    );
  } catch {
    return window.innerWidth < 1024;
  }
};

const MOBILE_POST_AUTH_TARGET_KEY = 'scrolith:mobile-post-auth-target';

type LoginApprovalState = {
  id: string;
  approvalToken: string;
  expiresAt?: string | null;
};

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
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [authConfig, setAuthConfig] = useState<AuthPagesConfig | null>(null);
  const [twoFAChallenge, setTwoFAChallenge] = useState<string | null>(null);
  const [twoFACode, setTwoFACode] = useState('');
  const [hvToken, setHvToken] = useState<string | null>(null);
  const [hvRequired, setHvRequired] = useState(false);
  const [loginApproval, setLoginApproval] = useState<LoginApprovalState | null>(null);
  const approvalStatusInFlightRef = useRef(false);
  const approvalExchangeInFlightRef = useRef(false);
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
    logo_url: '/logo.png',
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
  const logoSrc = resolveResponsiveAssetUrl(
    resolveOptimizedStaticImageUrl(branding.logo_url),
    { width: 96, height: 96, fit: 'inside', quality: 72 }
  );
  const socialConfig = authConfig?.social_auth ?? (authConfig as any)?.socialAuth;
  const passkeysEnabled = passkeySupport.enabled();
  const passkeysAvailable = passkeySupport.available();

  const completePostLogin = () => {
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
  };

  useEffect(() => {
    approvalStatusInFlightRef.current = false;
    approvalExchangeInFlightRef.current = false;
  }, [loginApproval?.id]);

  useEffect(() => {
    if (!loginApproval?.id || !loginApproval.approvalToken) return undefined;
    let stopped = false;

    const pollApproval = async () => {
      if (approvalStatusInFlightRef.current || approvalExchangeInFlightRef.current) return;
      approvalStatusInFlightRef.current = true;
      try {
        const { DeviceSecurityService } = await import('../services/deviceSecurity');
        const status = await DeviceSecurityService.getApprovalStatus(loginApproval.id, loginApproval.approvalToken);
        if (stopped) return;
        const current = String(status?.status || '').toUpperCase();
        if (!current || current === 'PENDING') return;
        if (current === 'APPROVED') {
          approvalExchangeInFlightRef.current = true;
          setLoading(true);
          const { AuthService } = await import('../services/authService');
          const exchanged = await AuthService.exchangeApprovedLogin(loginApproval.id, loginApproval.approvalToken);
          if (stopped) return;
          if (exchanged.success && exchanged.user) {
            try { window.dispatchEvent(new Event('scrolith:auth-changed')); } catch { /* best effort */ }
            const role = String(exchanged.user.role || '').toLowerCase();
            if (role.includes('admin')) {
              window.location.assign('/admin/dashboard');
            } else {
              completePostLogin();
              window.location.assign(resolveAuthenticatedEntryPath(exchanged.user as any));
            }
            return;
          }
          setLoginApproval(null);
          setError(exchanged.error || 'Unable to complete approved login.');
          return;
        }
        setLoginApproval(null);
        setError(
          current === 'REJECTED'
            ? 'This login was rejected from your trusted session.'
            : current === 'EXPIRED'
              ? 'This login approval expired. Please sign in again.'
              : 'This login approval is no longer valid. Please sign in again.'
        );
      } catch (error: any) {
        // Keep the one-time approval state during transient network failures; the next poll retries it.
        if (!stopped) setError(error?.response?.data?.error || error?.message || 'Unable to check login approval. Retrying...');
      } finally {
        approvalStatusInFlightRef.current = false;
        if (!stopped && approvalExchangeInFlightRef.current) setLoading(false);
      }
    };

    void pollApproval();
    const timer = window.setInterval(() => void pollApproval(), 3000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [loginApproval]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (loginApproval) return;
    setLoading(true);

    try {
      // Step 2 — Google Authenticator challenge for admin accounts when Admin 2FA is enforced
      if (twoFAChallenge) {
        const { AuthService } = await import('../services/authService');
        const result = await AuthService.verify2FALogin(twoFAChallenge, twoFACode.trim());
        if (result.success && result.user) {
          try {
            localStorage.setItem('user', JSON.stringify(result.user));
          } catch {
            /* ignore */
          }
          window.location.assign(
            String(result.user.role || '').toLowerCase().includes('admin')
              ? '/admin/dashboard'
              : resolveAuthenticatedEntryPath(result.user as any)
          );
          return;
        }
        setError(result.error || 'Invalid authenticator code');
        return;
      }

      if (hvRequired && !hvToken) {
        setError(t('auth.login.hv_required', 'Please complete human verification to continue.'));
        setLoading(false);
        return;
      }

      // Intercept Admin 2FA challenge before establishing a session.
      const { AuthService } = await import('../services/authService');
      const raw = await AuthService.login({
        email,
        password,
        humanVerificationToken: hvToken || undefined
      });
      if ((raw as any).requires2FA && (raw as any).challengeToken) {
        setTwoFAChallenge(String((raw as any).challengeToken));
        setTwoFACode('');
        setError('');
        return;
      }
      if ((raw as any).requiresLoginApproval && (raw as any).loginApproval?.id) {
        const approval = {
          id: String((raw as any).loginApproval.id),
          approvalToken: String((raw as any).loginApproval.approvalToken || ''),
          expiresAt: (raw as any).loginApproval.expiresAt ? String((raw as any).loginApproval.expiresAt) : null
        };
        if (approval.approvalToken) {
          setLoginApproval(approval);
          setError('');
          return;
        }
      }
      if (raw.success && raw.user) {
        // AuthService already persisted token + user; refresh app state and route.
        try {
          window.dispatchEvent(new Event('scrolith:auth-changed'));
        } catch {
          /* ignore */
        }
        const role = String(raw.user.role || '').toLowerCase();
        if (role.includes('admin')) {
          window.location.assign('/admin/dashboard');
          return;
        }
        completePostLogin();
        window.location.assign(resolveAuthenticatedEntryPath(raw.user as any));
        return;
      }
      setError(raw.error || t('auth.login.invalid_credentials', 'Invalid credentials'));
    } catch (err: any) {
      setError(err.message || t('auth.login.failed', 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    if (loading || passkeyLoading || loginApproval) return;
    setError('');
    setPasskeyLoading(true);
    try {
      const result = await PasskeyService.authenticate(email);
      try {
        window.dispatchEvent(new Event('scrolith:auth-changed'));
      } catch {
        /* best effort */
      }
      const role = String(result.user.role || '').toLowerCase();
      if (role.includes('admin')) {
        window.location.assign('/admin/dashboard');
        return;
      }
      completePostLogin();
      window.location.assign(resolveAuthenticatedEntryPath(result.user as any));
    } catch (err: any) {
      const message = PasskeyService.getErrorMessage(err, 'Passkey sign-in was cancelled or could not be completed.');
      if (!/cancel|abort|dismiss/i.test(message)) setError(message);
    } finally {
      setPasskeyLoading(false);
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
                <img
                  src={logoSrc}
                  alt="Scrolith"
                  className="h-10 w-10 rounded-xl object-contain"
                  onError={handleBrandLogoError}
                />
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
                  <img
                    src={logoSrc}
                    alt="Scrolith"
                    className="h-11 w-11 rounded-xl object-contain"
                    onError={handleBrandLogoError}
                  />
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
          {passkeysEnabled && !twoFAChallenge && (
            <>
              <button
                type="button"
                onClick={handlePasskeyLogin}
                disabled={loading || passkeyLoading || Boolean(loginApproval) || !passkeysAvailable}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3.5 text-sm font-bold text-blue-900 transition hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <KeyRound className="h-4 w-4" />
                {passkeyLoading ? 'Waiting for passkey...' : passkeysAvailable ? 'Continue with a passkey' : 'Passkey unavailable in this browser'}
              </button>
              <p className="text-center text-xs leading-5 text-slate-500">
                {passkeysAvailable
                  ? 'Enter your email above to find that account’s passkey. After password sign-in, open Settings > Security to save this email account on a device.'
                  : 'Passkeys require a supported secure browser or the latest Scrolith mobile app. You can still sign in with your password or social login.'}
              </p>
              <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                <span className="h-px flex-1 bg-slate-200" />
                <span>or use password</span>
                <span className="h-px flex-1 bg-slate-200" />
              </div>
            </>
          )}
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
          {loginApproval && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900" aria-live="polite">
              <p className="font-semibold">Waiting for trusted-device approval</p>
              <p className="mt-1 leading-6">Approve this login from an existing trusted Scrolith session. This page will continue automatically after approval.</p>
              {loginApproval.expiresAt ? <p className="mt-1 text-xs font-medium text-blue-800">Approval expires at {new Date(loginApproval.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p> : null}
              <button
                type="button"
                disabled={loading}
                onClick={() => { if (!loading) { setLoginApproval(null); setError(''); } }}
                className="mt-3 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel approval request
              </button>
            </div>
          )}
          <div className="space-y-4">
            {twoFAChallenge ? (
              <div className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-5 w-5 text-indigo-600" />
                  <div>
                    <p className="text-sm font-semibold text-indigo-950">Two-Factor Authentication</p>
                    <p className="mt-1 text-xs text-indigo-800">
                      Enter the 6-digit code from Google Authenticator (or a one-time backup code). If you lost access,
                      ask an admin for an emergency waiver.
                    </p>
                  </div>
                </div>
                <input
                  id="totp-code"
                  name="totp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  maxLength={12}
                  value={twoFACode}
                  onChange={(e) => setTwoFACode(e.target.value)}
                  className="block w-full rounded-xl border border-indigo-200 bg-white px-4 py-3 text-center text-lg tracking-[0.35em] text-slate-950 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="000000"
                  data-testid="login-2fa-code"
                />
                <button
                  type="button"
                  className="text-xs font-semibold text-indigo-700 hover:text-indigo-900"
                  onClick={() => {
                    setTwoFAChallenge(null);
                    setTwoFACode('');
                  }}
                >
                  Back to password
                </button>
              </div>
            ) : (
              <>
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
              </>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div />
            <Link to="/auth/forgot-password" className="text-sm font-semibold text-blue-700 hover:text-blue-600">
              {t('auth.login.forgot_password', 'Forgot password?')}
            </Link>
          </div>

          {!twoFAChallenge && (
            <ScrolithHumanVerification
              endpoint="login"
              onVerified={setHvToken}
              onRequiredChange={setHvRequired}
            />
          )}

          <div>
            <button
              type="submit"
              disabled={loading || Boolean(loginApproval) || (hvRequired && !hvToken && !twoFAChallenge)}
              className="flex w-full items-center justify-center rounded-xl border border-transparent bg-slate-950 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-slate-950/15 transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
              {loginApproval ? 'Waiting for approval...' : loading ? t('auth.login.loading', 'Signing in...') : loginContent.submit_label}
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
