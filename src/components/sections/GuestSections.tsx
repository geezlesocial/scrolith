import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useUser } from "../../context/UserContext";
import { useContent } from "../../context/ContentContext";
import { executeRecaptcha } from "../../services/recaptcha";
import AuthSocialButtons from "../../auth/AuthSocialButtons";
import { CMSService } from "../../services/cms";
import {
  AuthPagesConfig,
  FooterCtaStripContent,
  GuestCommunityPreviewContent,
  GuestFeatureShowcaseContent,
  GuestFinalCtaContent,
  GuestHeroAuthContent,
  GuestPathsContent,
  GuestTrendingPreviewContent,
  GuestWhatIsScrolithContent,
  GuidesGridContent,
  MadeOnScrolithContent,
  MarketplaceTilesContent,
  PopularServicesContent,
  PromoBannersContent,
  TrustValueContent,
  UserRole,
  VideoFeatureContent,
} from "../../types";

const ensureArray = <T = any,>(value: any): T[] => (Array.isArray(value) ? value : []);

const resolveUrl = (item: any) => item?.url ?? item?.href ?? item?.link ?? "";

const isExternalUrl = (url: string) => /^https?:\/\//i.test(url);

const Wrapper: React.FC<{
  url?: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ url, className, style, children }) => {
  if (!url) return <div className={className} style={style}>{children}</div>;
  if (isExternalUrl(url)) {
    return (
      <a href={url} className={className} style={style} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }
  return (
    <Link to={url} className={className} style={style}>
      {children}
    </Link>
  );
};

const ActionLink: React.FC<{
  label?: string;
  url?: string;
  className?: string;
}> = ({ label, url, className }) => {
  if (!label || !url) return null;
  if (isExternalUrl(url)) {
    return (
      <a href={url} className={className} target="_blank" rel="noreferrer">
        {label}
      </a>
    );
  }
  return (
    <Link to={url} className={className}>
      {label}
    </Link>
  );
};

const getEmbedUrl = (videoUrl?: string): string | null => {
  if (!videoUrl) return null;
  try {
    const url = new URL(videoUrl);
    if (url.hostname.includes("youtube.com")) {
      const id = url.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (url.hostname.includes("youtu.be")) {
      const id = url.pathname.replace("/", "");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (url.hostname.includes("vimeo.com")) {
      const id = url.pathname.split("/").filter(Boolean)[0];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch {
    return null;
  }
  return null;
};

export const GuestHeroAuthSection: React.FC<{ content: GuestHeroAuthContent; style?: any }> = ({
  content,
  style
}) => {
  const initialTab = String(content?.defaultTab || 'signup').toLowerCase() === 'login' ? 'login' : 'signup';
  const [activeTab, setActiveTab] = React.useState<'login' | 'signup'>(initialTab);
  const { login, register } = useUser();
  const { settings } = useContent();
  const navigate = useNavigate();
  const [authConfig, setAuthConfig] = React.useState<AuthPagesConfig | null>(null);
  const [loginForm, setLoginForm] = React.useState({ email: '', password: '' });
  const [signupRole, setSignupRole] = React.useState<UserRole>(UserRole.FREELANCER);
  const [signupForm, setSignupForm] = React.useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [acceptTerms, setAcceptTerms] = React.useState(false);
  const [showLoginPassword, setShowLoginPassword] = React.useState(false);
  const [showSignupPassword, setShowSignupPassword] = React.useState(false);
  const [showSignupConfirm, setShowSignupConfirm] = React.useState(false);
  const [loginLoading, setLoginLoading] = React.useState(false);
  const [signupLoading, setSignupLoading] = React.useState(false);
  const [loginError, setLoginError] = React.useState('');
  const [signupErrors, setSignupErrors] = React.useState<Record<string, string>>({});

  const backgroundImageUrl = String(content?.heroBackgroundUrl || '').trim();
  const sideBanners = ensureArray<any>((content as any)?.sideBanners);
  const trustPoints = ensureArray<string>((content as any)?.trustPoints);
  const sideImageUrl = String((content as any)?.sideImageUrl || '').trim();
  const sideImageAlt = String((content as any)?.sideImageAlt || 'Scrolith platform preview').trim();
  const brandLogos = ensureArray<any>((content as any)?.brandLogos);
  const compactMode = (content as any)?.compactMode !== false;
  const displayedTrustPoints = (trustPoints.length ? trustPoints : ['Realtime marketplace', 'Secure payments', 'Verified talent'])
    .slice(0, compactMode ? 3 : 6);
  const displayedBanners = (sideBanners.length
    ? sideBanners
    : [
        { title: 'Smart Hiring Pipeline', subtitle: 'Post, screen, and hire with automated workflows.' },
        { title: 'Creator Growth Engine', subtitle: 'Publish once and distribute across network, stories, and scroll.' }
      ]).slice(0, compactMode ? 2 : 3);

  React.useEffect(() => {
    let mounted = true;
    const loadAuthConfig = async () => {
      try {
        const data = await CMSService.getAuthPagesConfig();
        if (mounted) setAuthConfig(data || null);
      } catch {
        if (mounted) setAuthConfig(null);
      }
    };
    loadAuthConfig();
    return () => {
      mounted = false;
    };
  }, []);

  const socialConfig = authConfig?.social_auth;
  const signupContent = authConfig?.signup;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setLoginLoading(true);
    try {
      const ok = await login(loginForm.email.trim(), loginForm.password);
      if (!ok) setLoginError('Invalid credentials. Please try again.');
    } catch (error: any) {
      setLoginError(error?.message || 'Unable to sign in.');
    } finally {
      setLoginLoading(false);
    }
  };

  const validateSignup = () => {
    const nextErrors: Record<string, string> = {};
    if (!signupForm.firstName.trim()) nextErrors.firstName = 'First name is required.';
    if (!signupForm.lastName.trim()) nextErrors.lastName = 'Last name is required.';
    if (!signupForm.email.trim()) {
      nextErrors.email = 'Email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupForm.email.trim())) {
      nextErrors.email = 'Please enter a valid email address.';
    }
    if (!signupForm.password) {
      nextErrors.password = 'Password is required.';
    } else if (signupForm.password.length < 8 || !/(?=.*[A-Za-z])(?=.*\d)/.test(signupForm.password)) {
      nextErrors.password = 'Use at least 8 characters with letters and numbers.';
    }
    if (signupForm.password !== signupForm.confirmPassword) {
      nextErrors.confirmPassword = 'Passwords do not match.';
    }
    if (!acceptTerms) nextErrors.terms = 'Accept the terms to continue.';
    setSignupErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateSignup()) return;
    setSignupLoading(true);
    setSignupErrors((prev) => ({ ...prev, submit: '' }));
    try {
      const recaptchaConfig = (settings as any)?.integrations?.recaptcha || {};
      const legacySiteKey = (settings as any)?.recaptcha_site_key || (settings as any)?.recaptchaSiteKey || '';
      const recaptchaEnabled = Boolean(recaptchaConfig?.enabled) || Boolean(legacySiteKey);
      const siteKey = String(recaptchaConfig?.siteKey || legacySiteKey || '').trim();
      const version = (recaptchaConfig?.version || 'v3') as 'v2' | 'v3';
      let recaptchaToken: string | undefined;

      if (recaptchaEnabled) {
        if (version !== 'v3') {
          setSignupErrors((prev) => ({ ...prev, submit: 'reCAPTCHA v3 is required for signup.' }));
          setSignupLoading(false);
          return;
        }
        if (!siteKey) {
          setSignupErrors((prev) => ({ ...prev, submit: 'reCAPTCHA configuration is missing.' }));
          setSignupLoading(false);
          return;
        }
        recaptchaToken = await executeRecaptcha(siteKey, 'signup');
      }

      const fullName = `${signupForm.firstName.trim()} ${signupForm.lastName.trim()}`.trim();
      const ok = await register(signupForm.email.trim(), fullName, signupForm.password, signupRole, recaptchaToken);
      if (!ok) {
        setSignupErrors((prev) => ({ ...prev, submit: 'Unable to create account right now.' }));
        return;
      }
      if (signupRole === UserRole.EMPLOYER) navigate('/client/dashboard');
      else navigate('/freelancer/dashboard');
    } catch (error: any) {
      setSignupErrors((prev) => ({ ...prev, submit: error?.message || 'Signup failed. Please try again.' }));
    } finally {
      setSignupLoading(false);
    }
  };

  return (
    <section className="py-8 sm:py-10" style={{ background: style?.background }}>
      <div className="mx-auto grid w-full max-w-7xl gap-5 px-4 sm:px-6 lg:grid-cols-2 lg:gap-8 lg:px-8">
        <div
          className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
          style={!backgroundImageUrl ? undefined : { backgroundColor: 'rgba(255,255,255,0.92)' }}
        >
          {backgroundImageUrl ? (
            <img
              src={backgroundImageUrl}
              alt=""
              aria-hidden="true"
              loading="eager"
              decoding="async"
              fetchPriority="high"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : null}
          <div className={backgroundImageUrl ? 'relative z-10 rounded-2xl bg-white/90 p-5 backdrop-blur' : ''}>
            <h1 className="text-2xl font-bold leading-tight text-slate-900 sm:text-3xl xl:text-4xl">
              {content?.headline || 'Build your next opportunity on Scrolith'}
            </h1>
            {content?.subheadline ? (
              <p className="mt-3 text-base text-slate-600">{content.subheadline}</p>
            ) : null}
            {content?.description ? (
              <p className="mt-3 text-sm text-slate-500">{content.description}</p>
            ) : null}
            <div className="mt-6 flex flex-wrap gap-3">
              <ActionLink
                label={content?.primaryCtaLabel || 'Create account'}
                url={content?.primaryCtaUrl || '/auth/signup'}
                className="inline-flex items-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
              />
              <ActionLink
                label={content?.secondaryCtaLabel || 'Log in'}
                url={content?.secondaryCtaUrl || '/auth/login'}
                className="inline-flex items-center rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              />
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              {displayedTrustPoints.map((point, index) => (
                <div key={`trust-point-${index}`} className="rounded-xl border border-white/60 bg-white/75 px-3 py-2 text-xs font-semibold text-slate-700 backdrop-blur-sm">
                  {point}
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {displayedBanners.map((banner, index) => (
                <div
                  key={banner.id || `side-banner-${index}`}
                  className="rounded-2xl border border-slate-200/70 bg-white/80 p-3.5 backdrop-blur-sm"
                >
                  {banner.image ? (
                    <div className="mb-2 overflow-hidden rounded-xl border border-slate-200 bg-white/60">
                      <img
                        src={banner.image}
                        alt={banner.title || `Scrolith highlight ${index + 1}`}
                        loading="lazy"
                        decoding="async"
                        className="h-20 w-full object-cover"
                      />
                    </div>
                  ) : null}
                  <p className="text-sm font-semibold text-slate-900">{banner.title || `Scrolith Advantage ${index + 1}`}</p>
                  {banner.subtitle ? <p className="mt-1 text-xs text-slate-600">{banner.subtitle}</p> : null}
                </div>
              ))}
            </div>
            {sideImageUrl ? (
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 p-2 backdrop-blur-sm">
                <img
                  src={sideImageUrl}
                  alt={sideImageAlt}
                  loading={backgroundImageUrl ? 'lazy' : 'eager'}
                  decoding="async"
                  className="h-40 w-full rounded-xl object-cover sm:h-48"
                />
              </div>
            ) : null}
            {brandLogos.length ? (
              <div className="mt-4 rounded-2xl border border-slate-200/70 bg-white/80 p-3 backdrop-blur-sm">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Trusted by teams worldwide</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {brandLogos.slice(0, 8).map((logo, index) => (
                    <Wrapper
                      key={logo.id || `brand-logo-${index}`}
                      url={logo.url}
                      className="flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-2"
                    >
                      {logo.image ? (
                        <img
                          src={logo.image}
                          alt={logo.label || `Brand ${index + 1}`}
                          loading="lazy"
                          decoding="async"
                          className="max-h-6 w-auto object-contain"
                        />
                      ) : (
                        <span className="text-[11px] font-semibold text-slate-600">{logo.label || `Brand ${index + 1}`}</span>
                      )}
                    </Wrapper>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          {backgroundImageUrl ? <div className="absolute inset-0 bg-gradient-to-t from-white/40 to-white/10" /> : null}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 lg:sticky lg:top-24 lg:self-start">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-slate-900">{content?.authPanelTitle || 'Welcome back'}</h2>
            {content?.authPanelSubtitle ? <p className="mt-1 text-sm text-slate-500">{content.authPanelSubtitle}</p> : null}
          </div>
          <div className="mb-4 flex rounded-full border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setActiveTab('login')}
              className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition ${
                activeTab === 'login' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('signup')}
              className={`flex-1 rounded-full px-3 py-2 text-sm font-semibold transition ${
                activeTab === 'signup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
              >
                Signup
              </button>
            </div>
          {activeTab === 'login' ? (
            <form className="space-y-4" onSubmit={handleLoginSubmit}>
              {content?.enableSocialLogin !== false ? <AuthSocialButtons mode="login" config={socialConfig || undefined} redirectTo="/" /> : null}
              {loginError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loginError}</div>
              ) : null}
              <input
                type="email"
                required
                autoComplete="email"
                value={loginForm.email}
                onChange={(e) => setLoginForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="Email address"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <div className="relative">
                <input
                  type={showLoginPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm((prev) => ({ ...prev, password: e.target.value }))}
                  placeholder="Password"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-20 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
                <button
                  type="button"
                  onClick={() => setShowLoginPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-3 my-auto h-fit rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                >
                  {showLoginPassword ? 'Hide' : 'Show'}
                </button>
              </div>
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab('signup')}
                  className="font-semibold text-blue-700 hover:text-blue-800"
                >
                  New here? Create account
                </button>
                <Link to="/auth/forgot-password" className="font-semibold text-blue-700 hover:text-blue-800">
                  Forgot password?
                </Link>
              </div>
              <button
                type="submit"
                disabled={loginLoading}
                className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loginLoading ? 'Signing in...' : (content?.loginCtaLabel || 'Login')}
              </button>
              <Link to="/auth/login" className="block text-center text-xs font-semibold text-slate-500 hover:text-slate-700">
                Open full login page
              </Link>
            </form>
          ) : (
            <form className="space-y-4" onSubmit={handleSignupSubmit}>
              <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setSignupRole(UserRole.FREELANCER)}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    signupRole === UserRole.FREELANCER ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Freelancer
                </button>
                <button
                  type="button"
                  onClick={() => setSignupRole(UserRole.EMPLOYER)}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                    signupRole === UserRole.EMPLOYER ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Employer
                </button>
              </div>
              {content?.enableSocialLogin !== false ? (
                <AuthSocialButtons mode="signup" role={signupRole} config={socialConfig || undefined} redirectTo="/" />
              ) : null}
              {signupErrors.submit ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{signupErrors.submit}</div>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <input
                    type="text"
                    required
                    value={signupForm.firstName}
                    onChange={(e) => setSignupForm((prev) => ({ ...prev, firstName: e.target.value }))}
                    placeholder="First name"
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  {signupErrors.firstName ? <p className="mt-1 text-xs text-red-600">{signupErrors.firstName}</p> : null}
                </div>
                <div>
                  <input
                    type="text"
                    required
                    value={signupForm.lastName}
                    onChange={(e) => setSignupForm((prev) => ({ ...prev, lastName: e.target.value }))}
                    placeholder="Last name"
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  {signupErrors.lastName ? <p className="mt-1 text-xs text-red-600">{signupErrors.lastName}</p> : null}
                </div>
              </div>
              <div>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={signupForm.email}
                  onChange={(e) => setSignupForm((prev) => ({ ...prev, email: e.target.value }))}
                  placeholder="Email address"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
                {signupErrors.email ? <p className="mt-1 text-xs text-red-600">{signupErrors.email}</p> : null}
              </div>
              <div>
                <div className="relative">
                  <input
                    type={showSignupPassword ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    value={signupForm.password}
                    onChange={(e) => setSignupForm((prev) => ({ ...prev, password: e.target.value }))}
                    placeholder="Password"
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-20 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignupPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-3 my-auto h-fit rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    {showSignupPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
                {signupErrors.password ? <p className="mt-1 text-xs text-red-600">{signupErrors.password}</p> : null}
              </div>
              <div>
                <div className="relative">
                  <input
                    type={showSignupConfirm ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    value={signupForm.confirmPassword}
                    onChange={(e) => setSignupForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                    placeholder="Confirm password"
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-20 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSignupConfirm((prev) => !prev)}
                    className="absolute inset-y-0 right-3 my-auto h-fit rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                  >
                    {showSignupConfirm ? 'Hide' : 'Show'}
                  </button>
                </div>
                {signupErrors.confirmPassword ? <p className="mt-1 text-xs text-red-600">{signupErrors.confirmPassword}</p> : null}
              </div>
              <label className="flex items-start gap-2 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>
                  I agree to the{' '}
                  <Link to={(signupContent?.terms_url as string) || '/p/terms'} className="font-semibold text-blue-700 hover:text-blue-800">
                    Terms
                  </Link>{' '}
                  and{' '}
                  <Link to={(signupContent?.privacy_url as string) || '/p/privacy'} className="font-semibold text-blue-700 hover:text-blue-800">
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>
              {signupErrors.terms ? <p className="mt-1 text-xs text-red-600">{signupErrors.terms}</p> : null}
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab('login')}
                  className="font-semibold text-blue-700 hover:text-blue-800"
                >
                  Already have an account?
                </button>
                <Link to="/auth/signup" className="font-semibold text-slate-500 hover:text-slate-700">
                  Open full signup page
                </Link>
              </div>
              <button
                type="submit"
                disabled={signupLoading}
                className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {signupLoading ? 'Creating account...' : (content?.signupCtaLabel || 'Sign up')}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
};

export const GuestWhatIsScrolithSection: React.FC<{ content: GuestWhatIsScrolithContent; style?: any }> = ({
  content,
  style
}) => {
  const cards = ensureArray(content?.cards);
  const compactMode = content?.compactMode !== false;
  const maxCards = Number.isFinite(Number(content?.maxCards))
    ? Math.max(3, Math.min(8, Math.trunc(Number(content?.maxCards))))
    : 4;
  const visibleCards = compactMode ? cards.slice(0, maxCards) : cards;
  if (!content?.title && !content?.subtitle && visibleCards.length === 0) return null;
  return (
    <section className="py-10 sm:py-12" style={{ background: style?.background }}>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        {(content?.title || content?.subtitle) && (
          <div className="mb-8 text-center">
            {content?.title ? <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">{content.title}</h2> : null}
            {content?.subtitle ? <p className="mt-2 text-sm text-slate-600 sm:text-base">{content.subtitle}</p> : null}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {visibleCards.map((card, index) => (
            <div key={card.id || `guest-card-${index}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              {card.icon || card.image ? (
                <div className="mb-3 flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  <img src={card.icon || card.image} alt={card.title || `Feature ${index + 1}`} className="h-6 w-6 object-contain" />
                </div>
              ) : null}
              {card.title ? <h3 className="text-sm font-semibold text-slate-900">{card.title}</h3> : null}
              {card.description ? <p className="mt-2 text-sm text-slate-600">{card.description}</p> : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export const GuestPathsSection: React.FC<{ content: GuestPathsContent; style?: any }> = ({ content, style }) => {
  const freelancerBullets = ensureArray<string>(content?.freelancerBullets);
  const employerBullets = ensureArray<string>(content?.employerBullets);
  return (
    <section className="py-12 sm:py-16" style={{ background: style?.background }}>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        {(content?.title || content?.subtitle) && (
          <div className="mb-8 text-center">
            {content?.title ? <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">{content.title}</h2> : null}
            {content?.subtitle ? <p className="mt-2 text-sm text-slate-600 sm:text-base">{content.subtitle}</p> : null}
          </div>
        )}
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-emerald-900">{content?.freelancerTitle || 'Freelancer'}</h3>
            <ul className="mt-3 space-y-2 text-sm text-emerald-900">
              {freelancerBullets.map((bullet, index) => (
                <li key={`freelancer-bullet-${index}`} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-emerald-600" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
            <ActionLink
              label={content?.freelancerCtaLabel || 'Start freelancing'}
              url={content?.freelancerCtaUrl || '/auth/signup'}
              className="mt-5 inline-flex rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
            />
          </div>
          <div className="rounded-3xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-blue-900">{content?.employerTitle || 'Employer'}</h3>
            <ul className="mt-3 space-y-2 text-sm text-blue-900">
              {employerBullets.map((bullet, index) => (
                <li key={`employer-bullet-${index}`} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-600" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
            <ActionLink
              label={content?.employerCtaLabel || 'Start hiring'}
              url={content?.employerCtaUrl || '/auth/signup'}
              className="mt-5 inline-flex rounded-full bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export const GuestFeatureShowcaseSection: React.FC<{ content: GuestFeatureShowcaseContent; style?: any }> = ({
  content,
  style
}) => {
  const tabs = ensureArray(content?.tabs);
  const compactMode = content?.compactMode !== false;
  const maxTabs = Number.isFinite(Number(content?.maxTabs))
    ? Math.max(3, Math.min(8, Math.trunc(Number(content?.maxTabs))))
    : 5;
  const visibleTabs = compactMode ? tabs.slice(0, maxTabs) : tabs;
  const [activeIndex, setActiveIndex] = React.useState(0);
  const activeTab = visibleTabs[activeIndex] || visibleTabs[0];
  if (!content?.title && visibleTabs.length === 0) return null;
  return (
    <section className="py-10 sm:py-12" style={{ background: style?.background }}>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        {(content?.title || content?.subtitle) && (
          <div className="mb-6 text-center">
            {content?.title ? <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">{content.title}</h2> : null}
            {content?.subtitle ? <p className="mt-2 text-sm text-slate-600 sm:text-base">{content.subtitle}</p> : null}
          </div>
        )}
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-5 flex flex-wrap gap-2">
            {visibleTabs.map((tab, index) => (
              <button
                key={tab.id || `showcase-tab-${index}`}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  index === activeIndex ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label || tab.title || `Feature ${index + 1}`}
              </button>
            ))}
          </div>
          {activeTab ? (
            <div className="grid gap-4 lg:grid-cols-2 lg:items-center">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">{activeTab.title || activeTab.label}</h3>
                {activeTab.description ? <p className="mt-2 text-sm text-slate-600">{activeTab.description}</p> : null}
              </div>
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                {activeTab.image ? (
                  <img src={activeTab.image} alt={activeTab.title || ''} className="h-52 w-full object-cover sm:h-64" />
                ) : (
                  <div className="flex h-52 w-full items-center justify-center text-sm font-medium text-slate-500 sm:h-64">
                    Feature preview
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
};

export const GuestTrendingPreviewSection: React.FC<{ content: GuestTrendingPreviewContent; style?: any }> = ({
  content,
  style
}) => {
  const jobs = ensureArray(content?.jobs);
  const gigs = ensureArray(content?.gigs);
  const posts = ensureArray(content?.posts);
  const compactMode = content?.compactMode !== false;
  const maxItems = Number.isFinite(Number(content?.maxItems))
    ? Math.max(2, Math.min(6, Math.trunc(Number(content?.maxItems))))
    : 3;
  const showEmptyState = content?.showEmptyState === true;
  const hasData = jobs.length > 0 || gigs.length > 0 || posts.length > 0;
  if (!hasData && !showEmptyState) return null;

  return (
    <section className="py-10 sm:py-12" style={{ background: style?.background }}>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        {(content?.title || content?.subtitle) && (
          <div className="mb-6 text-center">
            {content?.title ? <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">{content.title}</h2> : null}
            {content?.subtitle ? <p className="mt-2 text-sm text-slate-600 sm:text-base">{content.subtitle}</p> : null}
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">{content?.jobsTitle || 'Trending Jobs'}</h3>
            <div className="mt-3 space-y-3">
              {jobs.slice(0, compactMode ? maxItems : 6).map((job, index) => (
                <Link key={`${job.id || 'job'}-${index}`} to="/auth/login" className="block rounded-xl border border-slate-100 p-3 hover:bg-slate-50">
                  <p className="text-sm font-medium text-slate-800">{job.title || 'Job opening'}</p>
                  <p className="mt-1 text-xs text-slate-500">{job.type || 'Role'}{job.budget ? ` | ${job.budget}` : ''}</p>
                </Link>
              ))}
              {jobs.length === 0 ? <p className="text-xs text-slate-500">No live jobs yet.</p> : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">{content?.gigsTitle || 'Trending Gigs'}</h3>
            <div className="mt-3 space-y-3">
              {gigs.slice(0, compactMode ? maxItems : 6).map((gig, index) => (
                <Link key={`${gig.id || 'gig'}-${index}`} to="/auth/login" className="block rounded-xl border border-slate-100 p-3 hover:bg-slate-50">
                  <p className="text-sm font-medium text-slate-800">{gig.title || 'Professional service'}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {typeof gig.price === 'number' ? `$${gig.price}` : 'Price on request'}
                    {gig.rating ? ` | ${gig.rating.toFixed ? gig.rating.toFixed(1) : gig.rating}*` : ''}
                  </p>
                </Link>
              ))}
              {gigs.length === 0 ? <p className="text-xs text-slate-500">No live gigs yet.</p> : null}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">{content?.postsTitle || 'Popular Posts'}</h3>
            <div className="mt-3 space-y-3">
              {posts.slice(0, compactMode ? maxItems : 6).map((post, index) => (
                <Link key={`${post.id || 'post'}-${index}`} to="/auth/login" className="block rounded-xl border border-slate-100 p-3 hover:bg-slate-50">
                  <p className="text-sm font-medium text-slate-800">{post.title || 'Community discussion'}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{post.content || ''}</p>
                </Link>
              ))}
              {posts.length === 0 ? <p className="text-xs text-slate-500">No live community posts yet.</p> : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export const GuestCommunityPreviewSection: React.FC<{ content: GuestCommunityPreviewContent; style?: any }> = ({
  content,
  style
}) => {
  const posts = ensureArray(content?.posts);
  const compactMode = content?.compactMode !== false;
  const maxItems = Number.isFinite(Number(content?.maxItems))
    ? Math.max(2, Math.min(8, Math.trunc(Number(content?.maxItems))))
    : 4;
  const showEmptyState = content?.showEmptyState === true;
  if (posts.length === 0 && !showEmptyState) return null;

  return (
    <section className="py-10 sm:py-12" style={{ background: style?.background }}>
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        {(content?.title || content?.subtitle) && (
          <div className="mb-6 text-center">
            {content?.title ? <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">{content.title}</h2> : null}
            {content?.subtitle ? <p className="mt-2 text-sm text-slate-600 sm:text-base">{content.subtitle}</p> : null}
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {posts.slice(0, compactMode ? maxItems : 8).map((post, index) => (
            <div key={`${post.id || 'community-post'}-${index}`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-3">
                {post.author?.avatar ? (
                  <img src={post.author.avatar} alt={post.author?.name || 'User'} className="h-10 w-10 rounded-full object-cover" />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                    {(post.author?.name || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-slate-900">{post.author?.name || 'Scrolith user'}</p>
                  <p className="text-xs text-slate-500">@{post.author?.username || 'community'}</p>
                </div>
              </div>
              {post.title ? <p className="text-sm font-semibold text-slate-900">{post.title}</p> : null}
              <p className="mt-1 line-clamp-3 text-sm text-slate-600">{post.content || ''}</p>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>{post.likesCount || 0} reactions</span>
                <span>{post.commentsCount || 0} comments</span>
              </div>
            </div>
          ))}
          {posts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6 text-sm text-slate-500">
              Community preview is updating. Sign up to unlock live discussions and interactions.
            </div>
          ) : null}
        </div>
        <div className="mt-6 text-center">
          <ActionLink
            label={content?.ctaLabel || 'Sign up to interact'}
            url={content?.ctaUrl || '/auth/signup'}
            className="inline-flex items-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
          />
        </div>
      </div>
    </section>
  );
};

export const GuestFinalCtaSection: React.FC<{ content: GuestFinalCtaContent; style?: any }> = ({
  content,
  style
}) => {
  if (!content?.title && !content?.subtitle) return null;
  return (
    <section className="py-12 sm:py-16">
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          className="rounded-3xl border border-slate-200 px-6 py-10 text-center shadow-sm sm:px-10"
          style={{ background: style?.background || 'linear-gradient(120deg, #0f172a 0%, #1d4ed8 100%)' }}
        >
          {content?.title ? <h2 className="text-2xl font-bold text-white sm:text-3xl">{content.title}</h2> : null}
          {content?.subtitle ? <p className="mx-auto mt-2 max-w-3xl text-sm text-blue-100 sm:text-base">{content.subtitle}</p> : null}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <ActionLink
              label={content?.primaryCtaLabel || 'Sign up'}
              url={content?.primaryCtaUrl || '/auth/signup'}
              className="inline-flex rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 hover:bg-slate-100"
            />
            <ActionLink
              label={content?.secondaryCtaLabel || 'Login'}
              url={content?.secondaryCtaUrl || '/auth/login'}
              className="inline-flex rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white hover:border-white"
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export const PopularServicesSection: React.FC<{ content: PopularServicesContent; style?: any }> = ({
  content,
  style,
}) => {
  const items = ensureArray(content?.items);
  if (!content?.title && !content?.subtitle && items.length === 0) return null;

  return (
    <section className="py-12 sm:py-16" style={{ background: style?.background }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {(content?.title || content?.subtitle) && (
          <div className="mb-8 sm:mb-10 text-center">
            {content?.title && (
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">{content.title}</h2>
            )}
            {content?.subtitle && (
              <p className="mt-2 text-sm sm:text-base text-gray-600">{content.subtitle}</p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {items.map((item, index) => {
            const url = resolveUrl(item);
            return (
              <Wrapper
                key={item.id || `popular-${index}`}
                url={url}
                className="group rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm hover:shadow-lg transition"
              >
                {item.image && (
                  <div className="h-40 w-full overflow-hidden bg-gray-100">
                    <img src={item.image} alt={item.title || ""} className="h-full w-full object-cover" />
                  </div>
                )}
                <div className="p-4 space-y-2">
                  {item.badge && (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-600">
                      {item.badge}
                    </span>
                  )}
                  {item.title && <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>}
                  {item.subtitle && <p className="text-xs text-gray-500">{item.subtitle}</p>}
                  {(item.meta || item.price || item.rating) && (
                    <div className="flex flex-wrap gap-3 text-xs text-gray-500">
                      {item.meta && <span>{item.meta}</span>}
                      {item.price && <span>{item.price}</span>}
                      {item.rating && <span>{item.rating}</span>}
                    </div>
                  )}
                </div>
              </Wrapper>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export const PromoBannersSection: React.FC<{ content: PromoBannersContent; style?: any }> = ({
  content,
  style,
}) => {
  const items = ensureArray(content?.items);
  if (!content?.title && items.length === 0) return null;

  return (
    <section className="py-10 sm:py-12" style={{ background: style?.background }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        {content?.title && (
          <h2 className="text-xl sm:text-2xl font-semibold text-gray-900">{content.title}</h2>
        )}

        <div className={`grid gap-6 ${items.length > 1 ? "md:grid-cols-2" : "grid-cols-1"}`}>
          {items.map((item, index) => {
            const isImageLeft = item.imagePosition === "left";
            const bannerStyle = item.background ? { background: item.background, color: item.textColor } : undefined;
            return (
              <div
                key={item.id || `promo-${index}`}
                className="rounded-3xl overflow-hidden border border-gray-200 bg-white shadow-sm"
                style={bannerStyle}
              >
                <div className={`flex flex-col md:flex-row ${isImageLeft ? "md:flex-row-reverse" : ""}`}>
                  <div className="flex-1 p-6 sm:p-8 space-y-4">
                    {item.heading && (
                      <h3 className="text-xl sm:text-2xl font-semibold text-current">{item.heading}</h3>
                    )}
                    {item.body && <p className="text-sm sm:text-base text-current opacity-80">{item.body}</p>}
                    <ActionLink
                      label={item.ctaLabel}
                      url={item.ctaUrl}
                      className="inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800 transition"
                    />
                  </div>
                  {item.image && (
                    <div className="md:w-1/2 bg-white/20 flex items-center justify-center p-6">
                      <img src={item.image} alt={item.heading || ""} className="w-full h-48 md:h-56 object-contain" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export const TrustValueSection: React.FC<{ content: TrustValueContent; style?: any }> = ({
  content,
  style,
}) => {
  const items = ensureArray(content?.items);
  if (!content?.title && !content?.subtitle && items.length === 0) return null;

  return (
    <section className="py-12 sm:py-16" style={{ background: style?.background }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {(content?.title || content?.subtitle) && (
          <div className="mb-8 text-center">
            {content?.title && <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">{content.title}</h2>}
            {content?.subtitle && <p className="mt-2 text-sm sm:text-base text-gray-600">{content.subtitle}</p>}
          </div>
        )}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => (
            <div
              key={item.id || `trust-${index}`}
              className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              {item.icon && (
                <div className="mb-4 h-10 w-10 rounded-xl bg-gray-100 flex items-center justify-center">
                  <img src={item.icon} alt={item.title || ""} className="h-6 w-6 object-contain" />
                </div>
              )}
              {item.title && <h3 className="text-base font-semibold text-gray-900">{item.title}</h3>}
              {item.description && <p className="mt-2 text-sm text-gray-600">{item.description}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export const VideoFeatureSection: React.FC<{ content: VideoFeatureContent; style?: any }> = ({
  content,
  style,
}) => {
  const embedUrl = getEmbedUrl(content?.videoUrl);
  if (!content?.title && !content?.subtitle && !content?.videoUrl) return null;

  return (
    <section className="py-12 sm:py-16" style={{ background: style?.background }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <div className="space-y-4">
            {content?.eyebrow && (
              <div className="inline-flex px-3 py-1 rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                {content.eyebrow}
              </div>
            )}
            {content?.title && <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">{content.title}</h2>}
            {content?.subtitle && <p className="text-sm sm:text-base text-gray-600">{content.subtitle}</p>}
            <ActionLink
              label={content?.ctaLabel}
              url={content?.ctaUrl}
              className="inline-flex items-center px-5 py-2.5 rounded-full text-sm font-semibold bg-gray-900 text-white hover:bg-gray-800 transition"
            />
          </div>
          <div className="rounded-2xl overflow-hidden border border-gray-200 bg-black">
            {embedUrl ? (
              <iframe
                src={embedUrl}
                title={content?.title || ""}
                className="w-full h-56 sm:h-72 lg:h-80"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : content?.videoUrl ? (
              <video
                src={content.videoUrl}
                poster={content.poster}
                controls
                className="w-full h-56 sm:h-72 lg:h-80 object-cover"
              />
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
};

export const MarketplaceTilesSection: React.FC<{ content: MarketplaceTilesContent; style?: any }> = ({
  content,
  style,
}) => {
  const items = ensureArray(content?.items);
  if (!content?.title && !content?.subtitle && items.length === 0) return null;

  return (
    <section className="py-12 sm:py-16" style={{ background: style?.background }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {(content?.title || content?.subtitle) && (
          <div className="mb-8 text-center">
            {content?.title && <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">{content.title}</h2>}
            {content?.subtitle && <p className="mt-2 text-sm sm:text-base text-gray-600">{content.subtitle}</p>}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item, index) => {
            const url = resolveUrl(item);
            const tileStyle = item.background ? { background: item.background, color: item.textColor } : undefined;
            const tileClass = `rounded-2xl border border-gray-200 p-5 shadow-sm hover:shadow-lg transition ${
              item.background ? "" : "bg-white"
            }`;
            return (
              <Wrapper
                key={item.id || `tile-${index}`}
                url={url}
                className={tileClass}
                style={tileStyle}
              >
                <div className="space-y-3">
                  {(item.icon || item.image) && (
                    <div className="h-12 w-12 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden">
                      {item.image ? (
                        <img src={item.image} alt={item.title || ""} className="h-full w-full object-cover" />
                      ) : item.icon ? (
                        <img src={item.icon} alt={item.title || ""} className="h-6 w-6 object-contain" />
                      ) : null}
                    </div>
                  )}
                  {item.badge && (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-600">
                      {item.badge}
                    </span>
                  )}
                  {item.title && <h3 className="text-sm font-semibold text-current">{item.title}</h3>}
                  {item.subtitle && <p className="text-xs text-current opacity-70">{item.subtitle}</p>}
                </div>
              </Wrapper>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export const GuidesGridSection: React.FC<{ content: GuidesGridContent; style?: any }> = ({
  content,
  style,
}) => {
  const items = ensureArray(content?.items);
  if (!content?.title && !content?.subtitle && items.length === 0) return null;

  return (
    <section className="py-12 sm:py-16" style={{ background: style?.background }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {(content?.title || content?.subtitle) && (
          <div className="mb-8">
            {content?.title && <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">{content.title}</h2>}
            {content?.subtitle && <p className="mt-2 text-sm sm:text-base text-gray-600">{content.subtitle}</p>}
          </div>
        )}

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => (
            <Wrapper
              key={item.id || `guide-${index}`}
              url={resolveUrl(item)}
              className="group rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-sm hover:shadow-lg transition"
            >
              {item.image && (
                <div className="h-40 w-full overflow-hidden bg-gray-100">
                  <img src={item.image} alt={item.title || ""} className="h-full w-full object-cover" />
                </div>
              )}
              <div className="p-5 space-y-2">
                {item.category && (
                  <span className="text-[10px] uppercase tracking-wide font-semibold text-gray-500">
                    {item.category}
                  </span>
                )}
                {item.title && <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>}
                {item.excerpt && <p className="text-xs text-gray-600">{item.excerpt}</p>}
              </div>
            </Wrapper>
          ))}
        </div>
      </div>
    </section>
  );
};

export const MadeOnScrolithSection: React.FC<{ content: MadeOnScrolithContent; style?: any }> = ({
  content,
  style,
}) => {
  const items = ensureArray(content?.items);
  if (!content?.title && !content?.subtitle && items.length === 0) return null;

  return (
    <section className="py-12 sm:py-16" style={{ background: style?.background }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {(content?.title || content?.subtitle) && (
          <div className="mb-8">
            {content?.title && <h2 className="text-2xl sm:text-3xl font-bold text-gray-900">{content.title}</h2>}
            {content?.subtitle && <p className="mt-2 text-sm sm:text-base text-gray-600">{content.subtitle}</p>}
          </div>
        )}
        <div className="columns-2 md:columns-3 lg:columns-4 gap-4">
          {items.map((item, index) => (
            <Wrapper
              key={item.id || `made-${index}`}
              url={resolveUrl(item)}
              className="mb-4 block break-inside-avoid"
            >
              {item.image && (
                <div className="rounded-2xl overflow-hidden border border-gray-200 shadow-sm hover:shadow-lg transition">
                  <img src={item.image} alt={item.title || ""} className="w-full object-cover" />
                </div>
              )}
            </Wrapper>
          ))}
        </div>
      </div>
    </section>
  );
};

export const FooterCtaStripSection: React.FC<{ content: FooterCtaStripContent; style?: any }> = ({
  content,
  style,
}) => {
  if (!content?.title && !content?.subtitle && !content?.ctaLabel) return null;
  const background = content?.background || style?.background || "#2f1c24";
  const textColor = content?.textColor || style?.textColor || "#ffffff";

  return (
    <section className="py-12 sm:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-3xl px-6 sm:px-10 py-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6"
          style={{ background, color: textColor }}
        >
          <div className="space-y-2">
            {content?.title && <h2 className="text-2xl sm:text-3xl font-semibold">{content.title}</h2>}
            {content?.subtitle && <p className="text-sm sm:text-base opacity-80">{content.subtitle}</p>}
          </div>
          <div className="flex flex-wrap gap-3">
            <ActionLink
              label={content?.ctaLabel}
              url={content?.ctaUrl}
              className="inline-flex items-center px-5 py-2.5 rounded-full text-sm font-semibold bg-white text-gray-900 hover:bg-gray-100 transition"
            />
            <ActionLink
              label={content?.secondaryCtaLabel}
              url={content?.secondaryCtaUrl}
              className="inline-flex items-center px-5 py-2.5 rounded-full text-sm font-semibold border border-white/50 text-white hover:border-white transition"
            />
          </div>
        </div>
      </div>
    </section>
  );
};


