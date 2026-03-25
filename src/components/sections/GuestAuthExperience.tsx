import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Sparkles, X } from "lucide-react";
import AuthSocialButtons from "../../auth/AuthSocialButtons";
import { useContent } from "../../context/ContentContext";
import { useUser } from "../../context/UserContext";
import { CMSService } from "../../services/cms";
import { executeRecaptcha } from "../../services/recaptcha";
import {
  AuthPagesConfig,
  GuestHeroAuthContent,
  GuestHeroAuthPopupContent,
  GuestHeroScrolithaEmbedContent,
  UserRole
} from "../../types";
import { buildScrolithaPath } from "../../utils/scrolithaLaunch";

const sanitizeLines = (value: any): string[] =>
  Array.isArray(value)
    ? value.map((entry) => String(entry || "").trim()).filter(Boolean)
    : [];

export const normalizeGuestAuthTab = (value: any): "login" | "signup" =>
  String(value || "signup").toLowerCase() === "login" ? "login" : "signup";

export const isInlineGuestAuthUrl = (url?: string): boolean => {
  const source = String(url || "").trim().toLowerCase();
  return source === "" || source === "/auth/login" || source === "/auth/signup";
};

const isExternalUrl = (url?: string): boolean => /^https?:\/\//i.test(String(url || "").trim());

const useCompactGuestSurface = () => {
  const [compact, setCompact] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setCompact(media.matches);
    sync();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", sync);
      return () => media.removeEventListener("change", sync);
    }
    media.addListener(sync);
    return () => media.removeListener(sync);
  }, []);

  return compact;
};

type GuestAuthCardProps = {
  content: GuestHeroAuthContent;
  defaultTab?: "login" | "signup" | string;
  title?: string;
  subtitle?: string;
  hideStandaloneLinks?: boolean;
  footerNote?: string;
  surfaceClassName?: string;
};

export const GuestAuthCard: React.FC<GuestAuthCardProps> = ({
  content,
  defaultTab,
  title,
  subtitle,
  hideStandaloneLinks = false,
  footerNote,
  surfaceClassName
}) => {
  const compactSurface = useCompactGuestSurface();
  const initialTab = normalizeGuestAuthTab(defaultTab || content?.defaultTab);
  const [activeTab, setActiveTab] = React.useState<"login" | "signup">(initialTab);
  const { login, register } = useUser();
  const { settings } = useContent();
  const navigate = useNavigate();
  const [authConfig, setAuthConfig] = React.useState<AuthPagesConfig | null>(null);
  const [loginForm, setLoginForm] = React.useState({ email: "", password: "" });
  const [signupRole, setSignupRole] = React.useState<UserRole>(UserRole.FREELANCER);
  const [signupForm, setSignupForm] = React.useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: ""
  });
  const [acceptTerms, setAcceptTerms] = React.useState(false);
  const [showLoginPassword, setShowLoginPassword] = React.useState(false);
  const [showSignupPassword, setShowSignupPassword] = React.useState(false);
  const [showSignupConfirm, setShowSignupConfirm] = React.useState(false);
  const [loginLoading, setLoginLoading] = React.useState(false);
  const [signupLoading, setSignupLoading] = React.useState(false);
  const [loginError, setLoginError] = React.useState("");
  const [signupErrors, setSignupErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    setActiveTab(normalizeGuestAuthTab(defaultTab || content?.defaultTab));
  }, [content?.defaultTab, defaultTab]);

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
    void loadAuthConfig();
    return () => {
      mounted = false;
    };
  }, []);

  const socialConfig = authConfig?.social_auth;
  const signupContent = authConfig?.signup;

  const validateSignup = () => {
    const nextErrors: Record<string, string> = {};
    if (!signupForm.firstName.trim()) nextErrors.firstName = "First name is required.";
    if (!signupForm.lastName.trim()) nextErrors.lastName = "Last name is required.";
    if (!signupForm.email.trim()) {
      nextErrors.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupForm.email.trim())) {
      nextErrors.email = "Please enter a valid email address.";
    }
    if (!signupForm.password) {
      nextErrors.password = "Password is required.";
    } else if (signupForm.password.length < 8 || !/(?=.*[A-Za-z])(?=.*\d)/.test(signupForm.password)) {
      nextErrors.password = "Use at least 8 characters with letters and numbers.";
    }
    if (signupForm.password !== signupForm.confirmPassword) {
      nextErrors.confirmPassword = "Passwords do not match.";
    }
    if (!acceptTerms) nextErrors.terms = "Accept the terms to continue.";
    setSignupErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleLoginSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      const ok = await login(loginForm.email.trim(), loginForm.password);
      if (!ok) setLoginError("Invalid credentials. Please try again.");
    } catch (error: any) {
      setLoginError(error?.message || "Unable to sign in.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSignupSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateSignup()) return;
    setSignupLoading(true);
    setSignupErrors((prev) => ({ ...prev, submit: "" }));
    try {
      const recaptchaConfig = (settings as any)?.integrations?.recaptcha || {};
      const legacySiteKey = (settings as any)?.recaptcha_site_key || (settings as any)?.recaptchaSiteKey || "";
      const recaptchaEnabled = Boolean(recaptchaConfig?.enabled) || Boolean(legacySiteKey);
      const siteKey = String(recaptchaConfig?.siteKey || legacySiteKey || "").trim();
      const version = (recaptchaConfig?.version || "v3") as "v2" | "v3";
      let recaptchaToken: string | undefined;

      if (recaptchaEnabled) {
        if (version !== "v3") {
          setSignupErrors((prev) => ({ ...prev, submit: "reCAPTCHA v3 is required for signup." }));
          setSignupLoading(false);
          return;
        }
        if (!siteKey) {
          setSignupErrors((prev) => ({ ...prev, submit: "reCAPTCHA configuration is missing." }));
          setSignupLoading(false);
          return;
        }
        recaptchaToken = await executeRecaptcha(siteKey, "signup");
      }

      const fullName = `${signupForm.firstName.trim()} ${signupForm.lastName.trim()}`.trim();
      const ok = await register(signupForm.email.trim(), fullName, signupForm.password, signupRole, recaptchaToken);
      if (!ok) {
        setSignupErrors((prev) => ({ ...prev, submit: "Unable to create account right now." }));
        return;
      }
      if (signupRole === UserRole.EMPLOYER) navigate("/client/dashboard");
      else navigate("/freelancer/dashboard");
    } catch (error: any) {
      setSignupErrors((prev) => ({ ...prev, submit: error?.message || "Signup failed. Please try again." }));
    } finally {
      setSignupLoading(false);
    }
  };

  return (
    <div
      className={
        surfaceClassName ||
        "min-w-0 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-7"
      }
    >
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">
          {title || content?.authPanelTitle || "Welcome back"}
        </h2>
        {subtitle || content?.authPanelSubtitle ? (
          <p className="mt-1 text-sm text-slate-500">{subtitle || content?.authPanelSubtitle}</p>
        ) : null}
      </div>
      <div className="mb-4 flex min-w-0 rounded-full border border-slate-200 bg-slate-50 p-1">
        <button
          type="button"
          onClick={() => setActiveTab("login")}
          className={`min-w-0 flex-1 rounded-full px-3 py-2.5 text-sm font-semibold transition ${
            activeTab === "login" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
          }`}
        >
          Login
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("signup")}
          className={`min-w-0 flex-1 rounded-full px-3 py-2.5 text-sm font-semibold transition ${
            activeTab === "signup" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
          }`}
        >
          Signup
        </button>
      </div>
      {activeTab === "login" ? (
        <form className="space-y-4" onSubmit={handleLoginSubmit}>
          {content?.enableSocialLogin !== false ? (
            <AuthSocialButtons mode="login" config={socialConfig || undefined} redirectTo="/" />
          ) : null}
          {loginError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loginError}</div>
          ) : null}
          <input
            type="email"
            required
            autoComplete="email"
            value={loginForm.email}
            onChange={(event) => setLoginForm((prev) => ({ ...prev, email: event.target.value }))}
            placeholder="Email address"
            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
          <div className="relative">
            <input
              type={showLoginPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={loginForm.password}
              onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
              placeholder="Password"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-20 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <button
              type="button"
              onClick={() => setShowLoginPassword((prev) => !prev)}
              className="absolute inset-y-0 right-3 my-auto h-fit rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              {showLoginPassword ? "Hide" : "Show"}
            </button>
          </div>
          <div className="flex flex-col gap-2 text-xs sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => setActiveTab("signup")}
              className="text-left font-semibold text-blue-700 hover:text-blue-800"
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
            {loginLoading ? "Signing in..." : content?.loginCtaLabel || "Login"}
          </button>
          {!hideStandaloneLinks ? (
            <Link to="/auth/login" className="block text-center text-xs font-semibold text-slate-500 hover:text-slate-700">
              Open full login page
            </Link>
          ) : null}
        </form>
      ) : (
        <form className="space-y-4" onSubmit={handleSignupSubmit}>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              onClick={() => setSignupRole(UserRole.FREELANCER)}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                signupRole === UserRole.FREELANCER ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
              }`}
            >
              Freelancer
            </button>
            <button
              type="button"
              onClick={() => setSignupRole(UserRole.EMPLOYER)}
              className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${
                signupRole === UserRole.EMPLOYER ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
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
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <input
                type="text"
                required
                value={signupForm.firstName}
                onChange={(event) => setSignupForm((prev) => ({ ...prev, firstName: event.target.value }))}
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
                onChange={(event) => setSignupForm((prev) => ({ ...prev, lastName: event.target.value }))}
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
              onChange={(event) => setSignupForm((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="Email address"
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            {signupErrors.email ? <p className="mt-1 text-xs text-red-600">{signupErrors.email}</p> : null}
          </div>
          <div>
            <div className="relative">
              <input
                type={showSignupPassword ? "text" : "password"}
                required
                autoComplete="new-password"
                value={signupForm.password}
                onChange={(event) => setSignupForm((prev) => ({ ...prev, password: event.target.value }))}
                placeholder="Password"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-20 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <button
                type="button"
                onClick={() => setShowSignupPassword((prev) => !prev)}
                className="absolute inset-y-0 right-3 my-auto h-fit rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                {showSignupPassword ? "Hide" : "Show"}
              </button>
            </div>
            {signupErrors.password ? <p className="mt-1 text-xs text-red-600">{signupErrors.password}</p> : null}
          </div>
          <div>
            <div className="relative">
              <input
                type={showSignupConfirm ? "text" : "password"}
                required
                autoComplete="new-password"
                value={signupForm.confirmPassword}
                onChange={(event) => setSignupForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                placeholder="Confirm password"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 pr-20 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <button
                type="button"
                onClick={() => setShowSignupConfirm((prev) => !prev)}
                className="absolute inset-y-0 right-3 my-auto h-fit rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                {showSignupConfirm ? "Hide" : "Show"}
              </button>
            </div>
            {signupErrors.confirmPassword ? <p className="mt-1 text-xs text-red-600">{signupErrors.confirmPassword}</p> : null}
          </div>
          <label className="flex items-start gap-2 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(event) => setAcceptTerms(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span>
              I agree to the{" "}
              <Link to={(signupContent?.terms_url as string) || "/p/terms"} className="font-semibold text-blue-700 hover:text-blue-800">
                Terms
              </Link>{" "}
              and{" "}
              <Link to={(signupContent?.privacy_url as string) || "/p/privacy"} className="font-semibold text-blue-700 hover:text-blue-800">
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          {signupErrors.terms ? <p className="mt-1 text-xs text-red-600">{signupErrors.terms}</p> : null}
          <div className="flex flex-col gap-2 text-xs sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={() => setActiveTab("login")}
              className="text-left font-semibold text-blue-700 hover:text-blue-800"
            >
              Already have an account?
            </button>
            {!hideStandaloneLinks ? (
              <Link to="/auth/signup" className="font-semibold text-slate-500 hover:text-slate-700">
                Open full signup page
              </Link>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={signupLoading}
            className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {signupLoading ? "Creating account..." : content?.signupCtaLabel || "Sign up"}
          </button>
        </form>
      )}
      {footerNote ? (
        <p
          className="mt-4 text-xs leading-relaxed text-slate-500"
          style={compactSurface ? { paddingBottom: "env(safe-area-inset-bottom, 0px)" } : undefined}
        >
          {footerNote}
        </p>
      ) : null}
    </div>
  );
};

type GuestScrolithaPanelProps = {
  content: GuestHeroAuthContent;
  onRequestAuth?: (tab: "login" | "signup") => void;
};

export const GuestScrolithaPanel: React.FC<GuestScrolithaPanelProps> = ({ content, onRequestAuth }) => {
  const compactSurface = useCompactGuestSurface();
  const navigate = useNavigate();
  const location = useLocation();
  const settings = (content?.scrolitha || {}) as GuestHeroScrolithaEmbedContent;
  const promptChips = sanitizeLines(settings.promptChips);
  const enabled = settings.enabled !== false;

  if (!enabled) return null;

  const primaryPrompt = String(settings.primaryPrompt || "Create a gig draft").trim();
  const secondaryUrl = String(settings.secondaryUrl || "/auth/signup").trim();
  const launchScrolitha = (prompt?: string) => {
    const nextPrompt = String(prompt || primaryPrompt).trim();
    navigate(buildScrolithaPath(location.pathname, nextPrompt));
  };

  const handleSecondary = () => {
    if (isInlineGuestAuthUrl(secondaryUrl) && onRequestAuth) {
      onRequestAuth(secondaryUrl.includes("/auth/login") ? "login" : "signup");
      return;
    }
    if (!secondaryUrl) return;
    if (isExternalUrl(secondaryUrl)) {
      window.open(secondaryUrl, "_blank", "noopener,noreferrer");
      return;
    }
    navigate(secondaryUrl);
  };

  return (
    <div className="min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-5 text-white shadow-[0_20px_65px_rgba(15,23,42,0.3)] sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/90">
            {settings.eyebrow || "Scrolitha Live Assistant"}
          </p>
          <h3 className="mt-2 text-lg font-semibold leading-tight text-white sm:text-xl">
            {settings.title || "Preview AI-guided onboarding directly on the homepage"}
          </h3>
        </div>
        <div className="inline-flex items-center gap-2 self-start rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-medium text-cyan-50">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Live guest assist
        </div>
      </div>
      {settings.subtitle ? <p className="mt-3 text-sm leading-relaxed text-slate-200">{settings.subtitle}</p> : null}
      {settings.description ? <p className="mt-2 text-sm leading-relaxed text-slate-300">{settings.description}</p> : null}

      <div className="mt-5 rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
        <div className="space-y-3">
          <div className="ml-auto max-w-[92%] rounded-2xl rounded-br-md bg-cyan-400 px-4 py-3 text-sm font-medium text-slate-950 shadow-sm sm:max-w-[85%]">
            I want help starting quickly on Scrolith.
          </div>
          <div className="flex max-w-[94%] gap-3 rounded-2xl rounded-bl-md border border-white/10 bg-white/10 px-4 py-3 text-sm leading-relaxed text-slate-100 shadow-sm sm:max-w-[88%]">
            <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-2xl bg-white/10">
              <Sparkles className="h-4 w-4 text-cyan-200" />
            </div>
            <div>
              <p className="font-semibold text-white">Scrolitha</p>
              <p className="mt-1 text-slate-200">
                I can help you explore gigs, hiring, AI briefs, and the right signup path before you create an account.
              </p>
            </div>
          </div>
        </div>
        {promptChips.length ? (
          <div className="mt-4 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {promptChips.slice(0, 6).map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => launchScrolitha(prompt)}
                className="whitespace-nowrap rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-xs font-medium text-white transition hover:border-cyan-200/70 hover:bg-white/14"
              >
                {prompt}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div
        className={`mt-5 flex gap-3 ${compactSurface ? "flex-col" : "flex-wrap"}`}
        style={compactSurface ? { paddingBottom: "env(safe-area-inset-bottom, 0px)" } : undefined}
      >
        <button
          type="button"
          onClick={() => launchScrolitha(primaryPrompt)}
          className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-50"
        >
          {settings.primaryLabel || "Open Scrolitha"}
        </button>
        {settings.secondaryLabel ? (
          <button
            type="button"
            onClick={handleSecondary}
            className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/8 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-white/35 hover:bg-white/12"
          >
            {settings.secondaryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
};

type GuestAuthModalProps = {
  open: boolean;
  onClose: () => void;
  content: GuestHeroAuthContent;
  defaultTab?: "login" | "signup";
};

export const GuestAuthModal: React.FC<GuestAuthModalProps> = ({ open, onClose, content, defaultTab }) => {
  const compactSurface = useCompactGuestSurface();
  const popup = (content?.authPopup || {}) as GuestHeroAuthPopupContent;

  React.useEffect(() => {
    if (!open) return undefined;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-[120] flex bg-slate-950/72 backdrop-blur-sm ${
        compactSurface ? "items-end justify-stretch overflow-y-auto px-0 py-0" : "items-center justify-center px-4 py-6"
      }`}
      onClick={onClose}
    >
      <div
        className={`grid w-full gap-4 border border-white/10 bg-white shadow-[0_40px_120px_rgba(15,23,42,0.45)] ${
          compactSurface
            ? "max-h-[100dvh] grid-cols-1 overflow-y-auto rounded-t-[30px] px-3 pb-3 pt-3"
            : "max-w-5xl rounded-[32px] p-4 md:grid-cols-[1.1fr_0.9fr] md:p-5"
        }`}
        style={
          compactSurface
            ? {
                paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.75rem)",
                WebkitOverflowScrolling: "touch"
              }
            : undefined
        }
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={`relative min-h-0 ${compactSurface ? "order-1 overflow-visible" : "order-2 overflow-y-auto"}`}
          style={compactSurface ? { WebkitOverflowScrolling: "touch" } : undefined}
        >
          <div className="sticky top-0 z-10 -mx-1 mb-3 flex justify-end bg-white/96 px-1 pb-2 pt-1 backdrop-blur">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
              aria-label="Close sign in prompt"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <GuestAuthCard
            key={`guest-modal-auth-${defaultTab || "signup"}`}
            content={content}
            defaultTab={defaultTab}
            title={popup.headline || content?.authPanelTitle || "Welcome to Scrolith"}
            subtitle={popup.subheadline || content?.authPanelSubtitle}
            footerNote={popup.trustNote}
            hideStandaloneLinks
            surfaceClassName="h-full rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[28px] sm:p-6"
          />
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={onClose}
              className="text-sm font-semibold text-slate-500 transition hover:text-slate-900"
            >
              {popup.dismissLabel || "Maybe later"}
            </button>
          </div>
        </div>

        <div
          className={`overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-white ${
            compactSurface ? "order-2 rounded-[24px] p-4" : "order-1 rounded-[28px] p-6"
          }`}
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100">
            <Sparkles className="h-3.5 w-3.5" />
            Guest access unlock
          </div>
          <h3 className="mt-4 text-xl font-semibold leading-tight text-white sm:mt-5 sm:text-2xl md:text-3xl">
            {popup.headline || "Stay on the homepage and continue with your account"}
          </h3>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-200 md:text-base">
            {popup.subheadline ||
              "Sign in or create your Scrolith account directly here. No separate auth page is required for the guest homepage flow."}
          </p>
          <div className="mt-6 grid gap-3 sm:mt-8 sm:grid-cols-2">
            <div className="rounded-3xl border border-white/12 bg-white/10 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100">Scrolitha ready</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-100">
                Join and continue with AI-guided gig creation, hiring briefs, and growth recommendations.
              </p>
            </div>
            <div className="rounded-3xl border border-white/12 bg-white/10 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100">Enterprise controls</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-100">
                Secure auth, social sign-in, and admin-managed homepage messaging stay aligned with your current platform settings.
              </p>
            </div>
          </div>
          <p className="mt-6 text-xs leading-relaxed text-slate-300 sm:mt-8">
            {popup.trustNote ||
              "This prompt is guest-homepage specific. It does not replace your existing login or signup routes, and users can dismiss it any time."}
          </p>
        </div>
      </div>
    </div>
  );
};
