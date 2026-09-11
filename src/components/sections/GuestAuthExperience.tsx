import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { KeyRound, Sparkles, X } from "lucide-react";
import AuthSocialButtons from "../../auth/AuthSocialButtons";
import { useContent } from "../../context/ContentContext";
import { useUser } from "../../context/UserContext";
import { CMSService } from "../../services/cms";
import { executeRecaptcha } from "../../services/recaptcha";
import ScrolithHumanVerification from "../human-verification/ScrolithHumanVerification";
import {
  AuthPagesConfig,
  GuestHeroAuthContent,
  GuestHeroAuthPopupContent,
  GuestHeroScrolithaEmbedContent,
  UserRole
} from "../../types";
import { buildScrolithaPath } from "../../utils/scrolithaLaunch";
import { resolveAuthenticatedEntryPath } from "../../utils/authRedirect";
import { PasskeyService, passkeySupport } from "../../services/passkeys";

type LoginApprovalState = { id: string; approvalToken: string; expiresAt?: string | null };

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
const formatLoginApprovalExpiry = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const describeLoginError = (error: any) => {
  const code = String(error?.code || error?.response?.data?.code || error?.response?.data?.data?.code || '').toUpperCase();
  if (code === 'DEVICE_POSSESSION_REQUIRED') return 'This trusted device must verify its security key before signing in.';
  if (code === 'DEVICE_KEY_REQUIRED') return 'This device cannot create its security key. Enable secure storage and try again.';
  if (code === 'LOGIN_APPROVAL_INVALID') return 'This login approval is no longer valid. Please sign in again.';
  if (code === 'LOGIN_APPROVAL_REQUIRED') return 'Approve this login from an existing trusted Scrolith session.';
  return error?.message || 'Unable to sign in.';
};

const scheduleGuestIdleTask = (callback: () => void, timeout = 1200) => {
  if (typeof window === "undefined") return () => {};
  const idleCallback = (window as any).requestIdleCallback;
  if (typeof idleCallback === "function") {
    const id = idleCallback(callback, { timeout });
    return () => {
      const cancelIdleCallback = (window as any).cancelIdleCallback;
      if (typeof cancelIdleCallback === "function") cancelIdleCallback(id);
    };
  }
  const timer = window.setTimeout(callback, timeout);
  return () => window.clearTimeout(timer);
};

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
  const [passkeyLoading, setPasskeyLoading] = React.useState(false);
  const [signupLoading, setSignupLoading] = React.useState(false);
  const [loginError, setLoginError] = React.useState("");
  const [signupErrors, setSignupErrors] = React.useState<Record<string, string>>({});
  const [loginHvToken, setLoginHvToken] = React.useState<string | null>(null);
  const [loginHvRequired, setLoginHvRequired] = React.useState(false);
  const [signupHvToken, setSignupHvToken] = React.useState<string | null>(null);
  const [signupHvRequired, setSignupHvRequired] = React.useState(false);
  const [loginApproval, setLoginApproval] = React.useState<LoginApprovalState | null>(null);
  const approvalStatusInFlightRef = React.useRef(false);
  const approvalExchangeInFlightRef = React.useRef(false);
  const embeddedModalSurface = hideStandaloneLinks;
  const formSpacingClass = embeddedModalSurface ? "space-y-3" : "space-y-4";
  const inputPaddingClass = embeddedModalSurface && !compactSurface ? "py-2.5" : "py-3";

  React.useEffect(() => {
    setActiveTab(normalizeGuestAuthTab(defaultTab || content?.defaultTab));
  }, [content?.defaultTab, defaultTab]);

  React.useEffect(() => {
    let mounted = true;
    const cancel = scheduleGuestIdleTask(() => {
      void CMSService.getAuthPagesConfig()
        .then((data) => {
          if (mounted) setAuthConfig(data || null);
        })
        .catch(() => {
          if (mounted) setAuthConfig(null);
        });
    }, 1200);
    return () => {
      mounted = false;
      cancel();
    };
  }, []);

  React.useEffect(() => {
    approvalStatusInFlightRef.current = false;
    approvalExchangeInFlightRef.current = false;
  }, [loginApproval?.id]);

  React.useEffect(() => {
    if (!loginApproval?.id || !loginApproval.approvalToken) return undefined;
    let stopped = false;
    const pollApproval = async () => {
      if (approvalStatusInFlightRef.current || approvalExchangeInFlightRef.current) return;
      approvalStatusInFlightRef.current = true;
      try {
        const { DeviceSecurityService, traceDeviceSecurity } = await import("../../services/deviceSecurity");
        traceDeviceSecurity("approval_poll_started", { approvalStateInitialized: true, statusPollingStarted: true });
        const status = await DeviceSecurityService.getApprovalStatus(loginApproval.id, loginApproval.approvalToken);
        if (stopped) return;
        const current = String(status?.status || "").toUpperCase();
        if (!current || current === "PENDING") return;
        if (current === "APPROVED") {
          approvalExchangeInFlightRef.current = true;
          setLoginLoading(true);
          const { AuthService } = await import("../../services/authService");
          const exchanged = await AuthService.exchangeApprovedLogin(loginApproval.id, loginApproval.approvalToken);
          if (stopped) return;
          if (exchanged.success && exchanged.user) {
            window.dispatchEvent(new Event("scrolith:auth-changed"));
            window.location.assign(resolveAuthenticatedEntryPath(exchanged.user as any));
            return;
          }
          setLoginApproval(null);
          setLoginError(exchanged.error || "Unable to complete approved login.");
          return;
        }
        setLoginApproval(null);
        setLoginError(current === "REJECTED" ? "This login was rejected from your trusted session." : current === "EXPIRED" ? "This login approval expired. Please sign in again." : "This login approval is no longer valid. Please sign in again.");
      } catch (error: any) {
        if (!stopped) {
          setLoginApproval(null);
          setLoginError(error?.response?.data?.error || error?.message || "Unable to check login approval.");
        }
      } finally {
        approvalStatusInFlightRef.current = false;
        if (!stopped && approvalExchangeInFlightRef.current) setLoginLoading(false);
      }
    };
    void pollApproval();
    const timer = window.setInterval(() => void pollApproval(), 3000);
    return () => { stopped = true; window.clearInterval(timer); };
  }, [loginApproval]);

  const socialConfig = authConfig?.social_auth ?? (authConfig as any)?.socialAuth;
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
    if (loginApproval) return;
    if (loginHvRequired && !loginHvToken) {
      setLoginError("Please complete human verification to continue.");
      return;
    }
    setLoginLoading(true);
    let approvalRequired = false;
    try {
      const ok = await login(loginForm.email.trim(), loginForm.password, {
        humanVerificationToken: loginHvToken || undefined,
        onLoginApprovalRequired: (approval) => {
          approvalRequired = true;
          setLoginApproval(approval);
          setLoginError("");
        }
      });
      if (!ok && !approvalRequired) setLoginError("Invalid credentials. Please try again.");
    } catch (error: any) {
      setLoginError(describeLoginError(error));
    } finally {
      setLoginLoading(false);
    }
  };

  const handlePasskeyLogin = async () => {
    if (loginLoading || passkeyLoading || loginApproval) return;
    setLoginError("");
    setPasskeyLoading(true);
    try {
      const result = await PasskeyService.authenticate(loginForm.email.trim());
      window.dispatchEvent(new Event("scrolith:auth-changed"));
      window.location.assign(resolveAuthenticatedEntryPath(result.user as any));
    } catch (error: any) {
      const message = PasskeyService.getErrorMessage(error, "Passkey sign-in was cancelled or could not be completed.");
      if (!/cancel|abort|dismiss/i.test(message)) setLoginError(message);
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleSignupSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateSignup()) return;
    if (signupHvRequired && !signupHvToken) {
      setSignupErrors((prev) => ({ ...prev, submit: "Please complete human verification to continue." }));
      return;
    }
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
      const ok = await register(
        signupForm.email.trim(),
        fullName,
        signupForm.password,
        signupRole,
        recaptchaToken,
        signupHvToken
      );
      if (!ok) {
        setSignupErrors((prev) => ({ ...prev, submit: "Unable to create account right now." }));
        return;
      }
      navigate("/", { replace: true });
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
      <div className={embeddedModalSurface ? "mb-3" : "mb-4"}>
        <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">
          {title || content?.authPanelTitle || "Welcome back"}
        </h2>
        {subtitle || content?.authPanelSubtitle ? (
          <p className="mt-1 text-sm text-slate-500">{subtitle || content?.authPanelSubtitle}</p>
        ) : null}
      </div>
      <div className={`${embeddedModalSurface ? "mb-3" : "mb-4"} flex min-w-0 rounded-full border border-slate-200 bg-slate-50 p-1`}>
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
        <form className={formSpacingClass} onSubmit={handleLoginSubmit}>
          {content?.enableSocialLogin !== false ? (
            <AuthSocialButtons mode="login" config={socialConfig || undefined} redirectTo="/" />
          ) : null}
          {passkeySupport.available() ? (
            <>
              <button
                type="button"
                onClick={() => void handlePasskeyLogin()}
                disabled={loginLoading || passkeyLoading || Boolean(loginApproval)}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                {passkeyLoading ? "Waiting for passkey..." : "Continue with a passkey"}
              </button>
              <p className="-mt-1 text-center text-xs leading-5 text-slate-500">
                Use a saved Scrolith passkey. Leave email blank to choose from available accounts, or enter it to narrow the selection.
              </p>
            </>
          ) : null}
          {loginError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{loginError}</div>
          ) : null}
          {loginApproval ? (
            <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 shadow-sm">
              <p className="font-semibold text-blue-950">Waiting for trusted-device approval</p>
              <p className="mt-1 leading-6">Open Scrolith on a device that is already signed in, go to Settings &gt; Security, then approve this login.</p>
              {formatLoginApprovalExpiry(loginApproval.expiresAt) ? <p className="mt-1 text-xs font-medium text-blue-800">Expires at {formatLoginApprovalExpiry(loginApproval.expiresAt)}</p> : null}
              <button type="button" disabled={loginLoading} onClick={() => { if (!loginLoading) { setLoginApproval(null); setLoginError(""); } }} className="mt-3 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60">
                {loginLoading ? "Completing approved login..." : "Cancel approval request"}
              </button>
            </div>
          ) : null}
          <input
            type="email"
            required
            autoComplete="email"
            value={loginForm.email}
            onChange={(event) => setLoginForm((prev) => ({ ...prev, email: event.target.value }))}
            placeholder="Email address"
            className={`w-full rounded-xl border border-slate-300 bg-white px-4 ${inputPaddingClass} text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200`}
          />
          <div className="relative">
            <input
              type={showLoginPassword ? "text" : "password"}
              required
              autoComplete="current-password"
              value={loginForm.password}
              onChange={(event) => setLoginForm((prev) => ({ ...prev, password: event.target.value }))}
              placeholder="Password"
              className={`w-full rounded-xl border border-slate-300 bg-white px-4 ${inputPaddingClass} pr-20 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200`}
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
          <ScrolithHumanVerification
            endpoint="login"
            onVerified={setLoginHvToken}
            onRequiredChange={setLoginHvRequired}
            onError={setLoginError}
            className={embeddedModalSurface ? "p-3 shadow-none" : ""}
          />
          <div className={embeddedModalSurface ? "pt-1" : ""}>
            <button
              type="submit"
              disabled={loginLoading || Boolean(loginApproval) || (loginHvRequired && !loginHvToken)}
              className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loginApproval ? "Waiting for approval..." : loginLoading ? "Signing in..." : content?.loginCtaLabel || "Login"}
            </button>
          </div>
          {!hideStandaloneLinks ? (
            <Link to="/auth/login" className="block text-center text-xs font-semibold text-slate-500 hover:text-slate-700">
              Open full login page
            </Link>
          ) : null}
        </form>
      ) : (
        <form className={formSpacingClass} onSubmit={handleSignupSubmit}>
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
                className={`w-full rounded-xl border border-slate-300 bg-white px-4 ${inputPaddingClass} text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200`}
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
                className={`w-full rounded-xl border border-slate-300 bg-white px-4 ${inputPaddingClass} text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200`}
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
              className={`w-full rounded-xl border border-slate-300 bg-white px-4 ${inputPaddingClass} text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200`}
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
                className={`w-full rounded-xl border border-slate-300 bg-white px-4 ${inputPaddingClass} pr-20 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200`}
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
                className={`w-full rounded-xl border border-slate-300 bg-white px-4 ${inputPaddingClass} pr-20 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200`}
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
          <ScrolithHumanVerification
            endpoint="signup"
            onVerified={setSignupHvToken}
            onRequiredChange={setSignupHvRequired}
            onError={(message) => setSignupErrors((prev) => ({ ...prev, submit: message }))}
            className={embeddedModalSurface ? "p-3 shadow-none" : ""}
          />
          <div className={embeddedModalSurface ? "pt-1" : ""}>
            <button
              type="submit"
              disabled={signupLoading || (signupHvRequired && !signupHvToken)}
              className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {signupLoading ? "Creating account..." : content?.signupCtaLabel || "Sign up"}
            </button>
          </div>
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

const GUEST_SCROLITHA_OPENING =
  "I can help you explore gigs, hiring, AI briefs, and the right signup path before you create an account. Try a prompt below — then open Scrolitha or create a free account to keep drafts and full coaching.";

const DEFAULT_GUEST_PROMPT_CHIPS = [
  "Create a gig draft",
  "Find freelancers for a launch",
  "Write a hiring brief",
  "Improve my proposal",
  "What can I do on Scrolith?"
];

const GUEST_WORKFLOW_EXAMPLES = [
  { title: "Gig draft", detail: "Outline offer, pricing, and delivery steps" },
  { title: "Hiring brief", detail: "Scope role, skills, and success criteria" },
  { title: "Proposal polish", detail: "Sharpen value, timeline, and trust" }
] as const;

type GuestSessionMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

/** Curated guest-safe education replies — no protected APIs or private data. */
const resolveGuestPreviewReply = (prompt: string) => {
  const normalized = String(prompt || "").toLowerCase();
  if (normalized.includes("gig") || normalized.includes("service")) {
    return "Here's a guest-safe path: name the outcome, who it's for, deliverables, timeline, and starting price. Open Scrolitha to expand this into a full draft — saved only after you join.";
  }
  if (normalized.includes("freelancer") || normalized.includes("talent") || normalized.includes("hire")) {
    return "For hiring, define the problem, must-have skills, budget band, and decision date. Scrolitha can turn that into a brief and suggest next steps once you're signed in.";
  }
  if (normalized.includes("brief") || normalized.includes("job")) {
    return "A strong brief covers objective, constraints, success metrics, and review cadence. I can scaffold that structure here; create an account to generate and save a full brief.";
  }
  if (normalized.includes("proposal")) {
    return "Lead with the client's outcome, prove fit in two lines, then timeline and clear next step. Guest preview stays high-level — join to rewrite with your profile context.";
  }
  if (normalized.includes("scrolith") || normalized.includes("what can")) {
    return "Scrolith combines network, marketplace, jobs, communities, wallet, and Scrolitha AI in one graph. Guests can explore; members unlock personalization, history, and protected actions.";
  }
  return "I can outline first steps for gigs, hiring, proposals, and platform navigation. This guest session keeps a short memory of your prompts — create a free account for full coaching and saved drafts.";
};

export const GuestScrolithaPanel: React.FC<GuestScrolithaPanelProps> = ({ content, onRequestAuth }) => {
  const compactSurface = useCompactGuestSurface();
  const navigate = useNavigate();
  const location = useLocation();
  const settings = (content?.scrolitha || {}) as GuestHeroScrolithaEmbedContent;
  const promptChips = sanitizeLines(settings.promptChips);
  const chips = (promptChips.length ? promptChips : DEFAULT_GUEST_PROMPT_CHIPS).slice(0, 6);
  const enabled = settings.enabled !== false;
  const reduceMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const logRef = React.useRef<HTMLDivElement | null>(null);
  const typeTimerRef = React.useRef<number | null>(null);
  const messageSeq = React.useRef(0);

  const [messages, setMessages] = React.useState<GuestSessionMessage[]>([
    {
      id: "guest-open-user",
      role: "user",
      text: "I want help starting quickly on Scrolith."
    },
    {
      id: "guest-open-assistant",
      role: "assistant",
      text: reduceMotion ? GUEST_SCROLITHA_OPENING : ""
    }
  ]);
  const [streamingId, setStreamingId] = React.useState<string | null>(
    reduceMotion ? null : "guest-open-assistant"
  );
  const [activeChip, setActiveChip] = React.useState<string | null>(null);
  const [liveStatus, setLiveStatus] = React.useState("Scrolitha is ready");
  const [sessionError, setSessionError] = React.useState("");

  const streamAssistantText = React.useCallback(
    (messageId: string, fullText: string) => {
      if (typeTimerRef.current) {
        window.clearInterval(typeTimerRef.current);
        typeTimerRef.current = null;
      }
      if (reduceMotion) {
        setMessages((prev) =>
          prev.map((entry) => (entry.id === messageId ? { ...entry, text: fullText } : entry))
        );
        setStreamingId(null);
        setLiveStatus("Scrolitha is ready");
        return;
      }
      let index = 0;
      setStreamingId(messageId);
      setLiveStatus("Scrolitha is typing");
      typeTimerRef.current = window.setInterval(() => {
        index += 3;
        if (index >= fullText.length) {
          setMessages((prev) =>
            prev.map((entry) => (entry.id === messageId ? { ...entry, text: fullText } : entry))
          );
          setStreamingId(null);
          setLiveStatus("Scrolitha is ready");
          if (typeTimerRef.current) {
            window.clearInterval(typeTimerRef.current);
            typeTimerRef.current = null;
          }
          return;
        }
        const slice = fullText.slice(0, index);
        setMessages((prev) =>
          prev.map((entry) => (entry.id === messageId ? { ...entry, text: slice } : entry))
        );
      }, 22);
    },
    [reduceMotion]
  );

  React.useEffect(() => {
    if (!reduceMotion) {
      streamAssistantText("guest-open-assistant", GUEST_SCROLITHA_OPENING);
    }
    return () => {
      if (typeTimerRef.current) {
        window.clearInterval(typeTimerRef.current);
        typeTimerRef.current = null;
      }
    };
    // Opening stream once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    const node = logRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, streamingId]);

  if (!enabled) return null;

  const primaryPrompt = String(settings.primaryPrompt || "Create a gig draft").trim();
  const secondaryUrl = String(settings.secondaryUrl || "/auth/signup").trim();
  const isBusy = Boolean(streamingId);

  const launchScrolitha = (prompt?: string) => {
    const nextPrompt = String(prompt || activeChip || primaryPrompt).trim();
    setLiveStatus("Opening Scrolitha…");
    navigate(buildScrolithaPath(location.pathname, nextPrompt));
  };

  const previewPrompt = (prompt: string) => {
    const nextPrompt = String(prompt || "").trim();
    if (!nextPrompt || isBusy) return;
    setSessionError("");
    setActiveChip(nextPrompt);
    messageSeq.current += 1;
    const userId = `guest-user-${messageSeq.current}`;
    const assistantId = `guest-assistant-${messageSeq.current}`;
    const reply = resolveGuestPreviewReply(nextPrompt);

    setMessages((prev) => {
      const next = [
        ...prev,
        { id: userId, role: "user" as const, text: nextPrompt },
        { id: assistantId, role: "assistant" as const, text: "" }
      ];
      // Keep guest session memory bounded (presentation-only, in-memory)
      return next.slice(-8);
    });
    streamAssistantText(assistantId, reply);
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

  const resetGuestSession = () => {
    if (typeTimerRef.current) {
      window.clearInterval(typeTimerRef.current);
      typeTimerRef.current = null;
    }
    setSessionError("");
    setActiveChip(null);
    setStreamingId(null);
    setMessages([
      {
        id: "guest-open-user",
        role: "user",
        text: "I want help starting quickly on Scrolith."
      },
      {
        id: "guest-open-assistant",
        role: "assistant",
        text: reduceMotion ? GUEST_SCROLITHA_OPENING : ""
      }
    ]);
    streamAssistantText("guest-open-assistant", GUEST_SCROLITHA_OPENING);
  };

  return (
    <section
      aria-label="Scrolitha guest AI preview"
      className="guest-scrolitha-panel min-w-0 overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-5 text-white shadow-[0_24px_70px_-28px_rgba(15,23,42,0.55)] sm:p-6"
    >
      <div className="sr-only" aria-live="polite">
        {liveStatus}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/90">
            {settings.eyebrow || "Scrolitha Live Assistant"}
          </p>
          <h3 className="mt-2 text-lg font-semibold leading-tight tracking-tight text-white sm:text-xl">
            {settings.title || "See what Scrolitha can do before you sign up"}
          </h3>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-300">
            {settings.subtitle ||
              "Enterprise AI for gigs, hiring, proposals, and first steps — guest-safe preview with session memory on this page only."}
          </p>
        </div>
        <div className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-[11px] font-semibold text-emerald-100">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          Live guest preview
        </div>
      </div>
      {settings.description ? (
        <p className="mt-3 text-sm leading-relaxed text-slate-300/90">{settings.description}</p>
      ) : null}

      <div className="mt-4 grid gap-2 sm:grid-cols-3" aria-label="Scrolitha workflow examples">
        {GUEST_WORKFLOW_EXAMPLES.map((workflow) => (
          <div
            key={workflow.title}
            className="rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2.5"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100/80">{workflow.title}</p>
            <p className="mt-1 text-[11px] leading-4 text-slate-300">{workflow.detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.06] p-4 shadow-inner backdrop-blur-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Conversation</p>
          <button
            type="button"
            onClick={resetGuestSession}
            className="text-[11px] font-semibold text-slate-400 underline-offset-2 transition hover:text-white hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300"
          >
            Reset preview
          </button>
        </div>

        {sessionError ? (
          <div className="mb-3 rounded-2xl border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100" role="alert">
            {sessionError}
          </div>
        ) : null}

        <div
          ref={logRef}
          className="guest-scrolitha-log max-h-[16rem] space-y-3 overflow-y-auto pr-1"
          role="log"
          aria-label="Guest Scrolitha conversation"
          aria-live="polite"
        >
          {messages.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-6 text-center text-sm text-slate-300">
              Choose a prompt below to start a guest-safe Scrolitha preview.
            </div>
          ) : (
            messages.map((message) => {
              if (message.role === "user") {
                return (
                  <div
                    key={message.id}
                    className="ml-auto max-w-[92%] rounded-2xl rounded-br-md bg-gradient-to-br from-cyan-300 to-sky-400 px-4 py-3 text-sm font-medium text-slate-950 shadow-sm sm:max-w-[85%]"
                  >
                    {message.text}
                  </div>
                );
              }
              const isStreaming = streamingId === message.id;
              return (
                <div
                  key={message.id}
                  className="flex max-w-[94%] gap-3 rounded-2xl rounded-bl-md border border-white/10 bg-white/10 px-4 py-3 text-sm leading-relaxed text-slate-100 shadow-sm sm:max-w-[88%]"
                >
                  <div
                    className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-cyan-400/15 ring-1 ring-cyan-200/20"
                    aria-hidden="true"
                  >
                    <Sparkles className="h-4 w-4 text-cyan-200" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-white">Scrolitha</p>
                      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-cyan-100/90">
                        Enterprise AI
                      </span>
                    </div>
                    <p className="mt-1.5 min-h-[1.5rem] text-slate-200">
                      {message.text}
                      {isStreaming ? (
                        <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse rounded-sm bg-cyan-200/90 motion-reduce:animate-none" />
                      ) : null}
                    </p>
                    {!isStreaming && message.text ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-200">
                          Guest session memory
                        </span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] text-slate-200">
                          No protected data
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Try a prompt
          </p>
          <div
            className="guest-prompt-rail -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
            role="list"
            aria-label="Suggested Scrolitha prompts"
          >
            {chips.map((prompt) => {
              const selected = activeChip === prompt;
              return (
                <button
                  key={prompt}
                  type="button"
                  role="listitem"
                  disabled={isBusy}
                  onClick={() => previewPrompt(prompt)}
                  className={`guest-chip whitespace-nowrap rounded-full border px-3 py-2 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-not-allowed disabled:opacity-50 ${
                    selected
                      ? "border-cyan-200/80 bg-cyan-300/20 text-white"
                      : "border-white/12 bg-white/8 text-white hover:border-cyan-200/60 hover:bg-white/14"
                  }`}
                >
                  {prompt}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div
        className={`mt-5 flex gap-3 ${compactSurface ? "flex-col" : "flex-wrap"}`}
        style={compactSurface ? { paddingBottom: "env(safe-area-inset-bottom, 0px)" } : undefined}
      >
        <button
          type="button"
          onClick={() => launchScrolitha(primaryPrompt)}
          className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-sm transition hover:bg-cyan-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          {settings.primaryLabel || "Open Scrolitha"}
        </button>
        {settings.secondaryLabel ? (
          <button
            type="button"
            onClick={handleSecondary}
            className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/15 bg-white/8 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-white/35 hover:bg-white/12 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
          >
            {settings.secondaryLabel}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => (onRequestAuth ? onRequestAuth("signup") : navigate("/auth/signup"))}
            className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/15 bg-white/8 px-5 py-2.5 text-sm font-semibold text-white transition hover:border-white/35 hover:bg-white/12 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-200"
          >
            Create free account
          </button>
        )}
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
        Guest preview keeps short session memory in this browser tab only. Sign in to unlock personalization,
        history, and protected actions.
      </p>
    </section>
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
        compactSurface ? "items-start justify-center overflow-y-auto px-2" : "items-center justify-center overflow-y-auto px-4 py-3"
      }`}
      style={
        compactSurface
          ? {
              paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.5rem)",
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)"
            }
          : undefined
      }
      onClick={onClose}
    >
      <div
        className={`grid w-full gap-4 border border-white/10 bg-white shadow-[0_40px_120px_rgba(15,23,42,0.45)] ${
          compactSurface
            ? "mx-auto max-w-[34rem] grid-cols-1 overflow-y-auto overscroll-contain rounded-[28px]"
            : "h-[calc(100dvh-1.5rem)] max-h-[54rem] max-w-5xl grid-rows-[minmax(0,1fr)] overflow-hidden rounded-[32px] p-3 md:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)] md:p-4"
        }`}
        style={
          compactSurface
            ? {
                maxHeight: "calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 1.25rem)",
                WebkitOverflowScrolling: "touch"
              }
            : undefined
        }
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={`relative min-h-0 ${
            compactSurface
              ? "order-1 overflow-visible px-3 pb-4 pt-3"
              : "order-2 flex max-h-full min-h-0 flex-col overflow-y-auto overscroll-contain pr-1"
          }`}
          style={{ WebkitOverflowScrolling: "touch", scrollbarGutter: "stable" }}
        >
          <div
            className={`sticky top-0 z-10 mb-3 flex justify-end bg-white/96 pb-2 pt-1 backdrop-blur ${
              compactSurface ? "-mx-3 px-3" : "-mx-1 px-1"
            }`}
          >
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
            surfaceClassName={
              compactSurface
                ? "rounded-[22px] border border-slate-200 bg-white p-3 shadow-sm sm:rounded-[28px] sm:p-4"
                : "min-h-0 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:rounded-[28px]"
            }
          />
          <div className={`text-center ${compactSurface ? "mt-3" : "mt-4"}`}>
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
            compactSurface ? "order-2 mx-3 mb-3 rounded-[22px] p-4" : "order-1 min-h-0 max-h-full overflow-y-auto rounded-[28px] p-5"
          }`}
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-100">
            <Sparkles className="h-3.5 w-3.5" />
            Guest access unlock
          </div>
          <h3 className={`font-semibold leading-tight text-white ${compactSurface ? "mt-3 text-lg" : "mt-4 text-xl sm:mt-5 sm:text-2xl md:text-3xl"}`}>
            {popup.headline || "Stay on the homepage and continue with your account"}
          </h3>
          <p className={`max-w-xl leading-relaxed text-slate-200 ${compactSurface ? "mt-2 text-[13px]" : "mt-3 text-sm md:text-base"}`}>
            {popup.subheadline ||
              "Sign in or create your Scrolith account directly here. No separate auth page is required for the guest homepage flow."}
          </p>
          <div className={`grid gap-3 ${compactSurface ? "mt-4" : "mt-6 sm:mt-8 sm:grid-cols-2"}`}>
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
          <p className={`text-xs leading-relaxed text-slate-300 ${compactSurface ? "mt-4" : "mt-6 sm:mt-8"}`}>
            {popup.trustNote ||
              "This prompt is guest-homepage specific. It does not replace your existing login or signup routes, and users can dismiss it any time."}
          </p>
        </div>
      </div>
    </div>
  );
};
