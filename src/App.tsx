import React, { useEffect, Suspense, useRef, useState, useCallback, lazy } from 'react';
import { 
  BrowserRouter, 
  Routes, 
  Route, 
  Navigate,
  useLocation,
  useNavigate
} from 'react-router-dom';
import { SkipLink, RouteAnnouncer, KeyboardShortcutsHelp } from './components/a11y';
import { UserRole } from './types';
import { CurrencyProvider } from './context/CurrencyContext';
import { ContentProvider, useContent } from './context/ContentContext';
import { LiveFeatureProvider, useLiveFeature } from './context/LiveFeatureContext';
import { NotificationProvider, useNotification } from './context/NotificationContext';
import { FavoritesProvider } from './context/FavoritesContext';
import { CartProvider } from './context/CartContext';
import { NetworkStatusProvider } from './context/NetworkStatusContext';
import { UserProvider, useUser } from './context/UserContext';
import { SocketProvider } from './context/SocketContext';
import { PreloaderProvider } from './context/PreloaderContext';
import { I18nProvider } from './i18n/I18nProvider';
import GlobalPreloader from './components/GlobalPreloader';
import { AlertTriangleIcon } from './components/icons/ShellIcons';
import { resolveResponsiveAssetUrl } from './utils/assetUrl';
import { getCanonicalAppOrigin, getCanonicalRedirectUrl } from './utils/siteUrl';
import { isLikelyChunkLoadError, normalizeRouteHref } from './mobile/runtime/routeRecovery';
import { applyNativeChrome, ensureDocumentScrollEnabled } from './mobile/runtime/nativeChrome';
import { shouldUseMobileShellViewport } from './mobile/home/mobileShellLayout';
import {
  FOLLOW_ONBOARDING_PATH,
  hasPendingFollowOnboarding,
  resolveAuthenticatedEntryPath,
  resolveDashboardPath,
  resolveSignedInHomepagePath
} from './utils/authRedirect';

const HISTORY_SYNC_EVENT = 'scrolith:history-sync';
const CHUNK_RELOAD_GUARD_KEY = 'scrolith:chunk-reload-target';
const ROUTE_SYNC_RELOAD_GUARD_KEY = 'scrolith:route-sync-reload-target';

const LazyLoginApprovalOverlay = lazy(() =>
  import('./components/security/LoginApprovalOverlay').then((module) => ({ default: module.LoginApprovalOverlay }))
);

const AuthenticatedLoginApprovalOverlay: React.FC = () => {
  const { isAuthenticated } = useUser();
  if (!isAuthenticated) return null;
  return (
    <Suspense fallback={null}>
      <LazyLoginApprovalOverlay />
    </Suspense>
  );
};
const BIOMETRIC_PREF_KEY = 'Scrolith.pref.biometric.enabled';
const MOBILE_POST_AUTH_TARGET_KEY = 'scrolith:mobile-post-auth-target';
const IS_MOBILE_APP_BUILD = import.meta.env.VITE_SCROLITH_MOBILE_APP === 'true';
const AuthenticatedRuntimeProviders = lazy(() => import('./context/AuthenticatedRuntimeProviders'));
const DesktopMessagingDock = lazy(() => import('./components/messaging/DesktopMessagingDock'));
const Navbar = lazy(() => import('./components/Navbar'));
const ToastContainer = lazy(() => import('./components/ToastContainer'));
const OfflineBanner = lazy(() => import('./components/OfflineBanner'));

const getCapacitorRuntime = () => {
  if (typeof window === 'undefined') return null;
  try {
    return (window as any)?.Capacitor || null;
  } catch {
    return null;
  }
};

const hasNativeRuntime = () => {
  if (IS_MOBILE_APP_BUILD) return true;
  const runtime = getCapacitorRuntime();
  if (!runtime || typeof runtime.isNativePlatform !== 'function') return false;
  try {
    return Boolean(runtime.isNativePlatform());
  } catch {
    return false;
  }
};

const isCompactTouchRuntime = () => {
  if (typeof window === 'undefined') return false;
  if ((window as any)?.scrolithDesktop?.shell === 'desktop') return false;
  try {
    const coarsePointer = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    const maxTouchPoints = Number(window.navigator?.maxTouchPoints || 0);
    const touchDevice = coarsePointer || maxTouchPoints > 0;
    if (!touchDevice) return false;
    const widths = [
      window.innerWidth,
      document.documentElement?.clientWidth,
      window.visualViewport?.width,
      window.screen?.width,
      window.screen?.availWidth
    ].filter((value): value is number => Number.isFinite(value) && value > 0);
    if (!widths.length) return false;
    return Math.min(...widths) <= 900;
  } catch {
    return false;
  }
};

const readBiometricPreference = () =>
  typeof localStorage !== 'undefined' && localStorage.getItem(BIOMETRIC_PREF_KEY) === 'true';

const writeBiometricPreference = (enabled: boolean) => {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(BIOMETRIC_PREF_KEY, enabled ? 'true' : 'false');
};

const trackRuntimeEvent = (eventName: string, payload: Record<string, unknown>, options?: Record<string, unknown>) => {
  void import('./mobile/mobileTelemetry')
    .then(({ trackMobileRuntimeEvent }) => trackMobileRuntimeEvent(eventName, payload, options))
    .catch(() => {});
};

const getBiometryLabel = (value: unknown) => {
  const normalized =
    typeof value === 'string'
      ? value.toLowerCase()
      : value === undefined || value === null
        ? ''
        : String(value).toLowerCase();
  if (normalized.includes('face')) return 'Face ID';
  if (normalized.includes('touch')) return 'Touch ID';
  if (normalized.includes('finger')) return 'Fingerprint';
  if (normalized.includes('iris')) return 'Iris';
  return 'Biometric';
};

const getCurrentBrowserRoute = () =>
  typeof window === 'undefined'
    ? ''
    : `${window.location.pathname}${window.location.search}${window.location.hash}`;

const scheduleChunkRecoveryReload = (targetHref?: string) => {
  if (typeof window === 'undefined') return;
  const nextRoute = normalizeRouteHref(targetHref || getCurrentBrowserRoute());
  if (!nextRoute) return;

  try {
    const guardedTarget = sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY);
    if (guardedTarget === nextRoute) return;
    sessionStorage.setItem(CHUNK_RELOAD_GUARD_KEY, nextRoute);
  } catch {
    // Ignore session storage failures and still attempt reload.
  }

  trackRuntimeEvent(
    'chunk_load_recovery',
    {
      targetRoute: nextRoute
    },
    { dedupeMs: 10_000, sourcePath: nextRoute }
  );

  window.setTimeout(() => {
    if (window.location.href === window.location.origin) {
      window.location.assign(nextRoute || '/');
      return;
    }
    window.location.reload();
  }, 40);
};

const scheduleRouteSyncReload = (targetHref?: string) => {
  if (typeof window === 'undefined') return;
  const nextRoute = normalizeRouteHref(targetHref || getCurrentBrowserRoute());
  if (!nextRoute) return;

  try {
    const guardedTarget = sessionStorage.getItem(ROUTE_SYNC_RELOAD_GUARD_KEY);
    if (guardedTarget === nextRoute) return;
    sessionStorage.setItem(ROUTE_SYNC_RELOAD_GUARD_KEY, nextRoute);
  } catch {
    // Ignore session storage failures and still attempt reload.
  }

  trackRuntimeEvent(
    'route_sync_recovery',
    {
      targetRoute: nextRoute
    },
    { dedupeMs: 10_000, sourcePath: nextRoute }
  );

  window.setTimeout(() => {
    const currentBrowserRoute = getCurrentBrowserRoute();
    if (currentBrowserRoute !== nextRoute) return;
    window.location.replace(nextRoute);
  }, 40);
};

const patchBrowserHistoryEvents = () => {
  if (typeof window === 'undefined') return;
  const historyRef = window.history as History & { __scrolithHistoryPatched?: boolean };
  if (historyRef.__scrolithHistoryPatched) return;

  (['pushState', 'replaceState'] as const).forEach((method) => {
    const original = historyRef[method];
    if (typeof original !== 'function') return;
    historyRef[method] = function patchedHistoryState(...args: Parameters<History[typeof method]>) {
      const result = original.apply(this, args);
      try {
        window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
      } catch {
        // Ignore popstate synthesis failures.
      }
      try {
        window.dispatchEvent(
          new CustomEvent(HISTORY_SYNC_EVENT, {
            detail: {
              method,
              href: `${window.location.pathname}${window.location.search}${window.location.hash}`
            }
          })
        );
      } catch {
        // Ignore history sync event failures.
      }
      return result;
    } as History[typeof method];
  });

  historyRef.__scrolithHistoryPatched = true;
};

const RouterHistorySync: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const currentRouteRef = useRef('');
  const pendingRouteRef = useRef<string | null>(null);
  const desyncFallbackTimerRef = useRef<number | null>(null);

  useEffect(() => {
    patchBrowserHistoryEvents();
  }, []);

  useEffect(() => {
    const currentRoute = `${location.pathname}${location.search}${location.hash}`;
    currentRouteRef.current = currentRoute;
    if (pendingRouteRef.current === currentRoute) {
      pendingRouteRef.current = null;
    }
    if (desyncFallbackTimerRef.current !== null) {
      window.clearTimeout(desyncFallbackTimerRef.current);
      desyncFallbackTimerRef.current = null;
    }
    try {
      if (sessionStorage.getItem(ROUTE_SYNC_RELOAD_GUARD_KEY) === currentRoute) {
        sessionStorage.removeItem(ROUTE_SYNC_RELOAD_GUARD_KEY);
      }
    } catch {
      // Ignore session storage failures.
    }
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let frame: number | null = null;

    const syncRouterLocation = () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      frame = window.requestAnimationFrame(() => {
        const browserRoute = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        const currentRoute = currentRouteRef.current;
        if (!browserRoute || browserRoute === currentRoute || pendingRouteRef.current === browserRoute) {
          return;
        }
        pendingRouteRef.current = browserRoute;
        navigate(browserRoute, { replace: true, state: window.history.state as Record<string, unknown> | null });
        if (desyncFallbackTimerRef.current !== null) {
          window.clearTimeout(desyncFallbackTimerRef.current);
        }
        desyncFallbackTimerRef.current = window.setTimeout(() => {
          desyncFallbackTimerRef.current = null;
          if (currentRouteRef.current === browserRoute) return;
          if (getCurrentBrowserRoute() !== browserRoute) return;
          scheduleRouteSyncReload(browserRoute);
        }, 220);
      });
    };

    window.addEventListener('popstate', syncRouterLocation);
    window.addEventListener(HISTORY_SYNC_EVENT, syncRouterLocation as EventListener);

    return () => {
      if (frame !== null) {
        window.cancelAnimationFrame(frame);
      }
      if (desyncFallbackTimerRef.current !== null) {
        window.clearTimeout(desyncFallbackTimerRef.current);
      }
      window.removeEventListener('popstate', syncRouterLocation);
      window.removeEventListener(HISTORY_SYNC_EVENT, syncRouterLocation as EventListener);
    };
  }, [navigate]);

  return null;
};

const ChunkLoadRecovery: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    const currentRoute = `${location.pathname}${location.search}${location.hash}`;
    try {
      if (sessionStorage.getItem(CHUNK_RELOAD_GUARD_KEY) === currentRoute) {
        sessionStorage.removeItem(CHUNK_RELOAD_GUARD_KEY);
      }
    } catch {
      // Ignore session storage failures.
    }
  }, [location.pathname, location.search, location.hash]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleChunkFailure = (error: unknown, href?: string) => {
      if (!isLikelyChunkLoadError(error)) return;
      scheduleChunkRecoveryReload(href);
    };

    const handlePreloadError = (event: Event) => {
      const preloadEvent = event as Event & {
        payload?: unknown;
        detail?: { href?: string; url?: string };
        preventDefault?: () => void;
      };
      preloadEvent.preventDefault?.();
      handleChunkFailure(preloadEvent.payload || preloadEvent, preloadEvent.detail?.href || preloadEvent.detail?.url);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      handleChunkFailure(event.reason);
    };

    const handleWindowError = (event: ErrorEvent) => {
      handleChunkFailure(event.error || event.message || event, event.filename);
    };

    window.addEventListener('vite:preloadError', handlePreloadError as EventListener);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleWindowError);

    return () => {
      window.removeEventListener('vite:preloadError', handlePreloadError as EventListener);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleWindowError);
    };
  }, []);

  return null;
};

// Lazy Loaded Components
const Landing = React.lazy(() => import('./main/Landing'));
const Login = React.lazy(() => import('./auth/Login'));
const Signup = React.lazy(() => import('./auth/Signup'));
const ForgotPassword = React.lazy(() => import('./auth/ForgotPassword'));
const ResetPassword = React.lazy(() => import('./auth/ResetPassword'));
const OAuthCallback = React.lazy(() => import('./auth/OAuthCallback'));
const FollowOnboarding = React.lazy(() => import('./auth/FollowOnboarding'));
const DynamicFooter = React.lazy(() => import('./components/DynamicFooter'));
const IntegrationsManager = React.lazy(() => import('./components/IntegrationsManager'));
const AppDistributionPrompt = React.lazy(() => import('./components/AppDistributionPrompt'));
const SupportWidget = React.lazy(() => import('./components/SupportWidget'));
const MarketingPopups = React.lazy(() => import('./components/MarketingPopups'));
const AdminDashboard = React.lazy(() => import('./dashboard/AdminDashboard'));
const CreateJob = React.lazy(() => import('./create-job-post/CreateJob'));
const EditJob = React.lazy(() => import('./dashboard/employer/EditJob'));
const CreateGig = React.lazy(() => import('./create-gig/CreateGig'));
const KYCVerification = React.lazy(() => import('./kyc/KYCVerification'));
const EditProfile = React.lazy(() => import('./profile/EditProfile'));
const DeveloperDocs = React.lazy(() => import('./dashboard/DeveloperDocs'));
const LanguagesAdmin = React.lazy(() => import('./dashboard/admin/Languages'));
const GigDetail = React.lazy(() => import('./main/GigDetail'));
const JobDetail = React.lazy(() => import('./main/JobDetail'));
const Blog = React.lazy(() => import('./pages/Blog'));
const BlogPost = React.lazy(() => import('./pages/BlogPost'));
const StaticPage = React.lazy(() => import('./pages/StaticPage'));
const MaintenancePage = React.lazy(() => import('./pages/MaintenancePage'));
const MarketplacePage = React.lazy(() => import('./pages/marketplace/MarketplacePage'));
const AnswersPage = React.lazy(() => import('./pages/AnswersPage'));
const GuidesPage = React.lazy(() => import('./pages/GuidesPage'));
const HirePage = React.lazy(() => import('./pages/HirePage'));
const FreelancerPage = React.lazy(() => import('./pages/FreelancerPage'));
const Support = React.lazy(() => import('./pages/Support'));
const PostDetailView = React.lazy(() => import('./pages/PostDetailView'));
const BrowseTalent = React.lazy(() => import('./main/BrowseTalent'));
const BrowseJobs = React.lazy(() => import('./main/BrowseJobs'));
const SearchResults = React.lazy(() => import('./pages/SearchResults'));
const Messages = React.lazy(() => import('./messages/Messages'));
const FreelancerProfile = React.lazy(() => import('./profile/FreelancerProfile'));
const ScrolithaOfficialProfile = React.lazy(() => import('./profile/ScrolithaOfficialProfile'));
const CompanyPage = React.lazy(() => import('./pages/CompanyPage'));
const ContactPage = React.lazy(() => import('./pages/ContactPage'));
const AffiliateProgram = React.lazy(() => import('./pages/AffiliateProgram'));
const Favorites = React.lazy(() => import('./pages/Favorites'));
const Cart = React.lazy(() => import('./pages/Cart'));
const SettingsModule = React.lazy(() => import('./dashboard/shared/SettingsModule'));
const CommunityLayout = React.lazy(() => import('./community/CommunityLayout'));
const CommunityHome = React.lazy(() => import('./community/CommunityHome'));
const DashboardRouter = React.lazy(() =>
  import('./dashboard/DashboardRouter').then((module) => ({ default: module.DashboardRouter }))
);

// Mobile (LinkedIn-style) logged-in home shell
const MobileHome = React.lazy(() => import('./mobile/home/MobileHome'));
const MobileFeedScreen = React.lazy(() => import('./mobile/home/screens/MobileFeedScreen'));
const MobileNetworkScreen = React.lazy(() => import('./mobile/home/screens/MobileNetworkScreen'));
const MobilePostScreen = React.lazy(() => import('./mobile/home/screens/MobilePostScreen'));
const MobileNotificationsScreen = React.lazy(() => import('./mobile/home/screens/MobileNotificationsScreen'));
const NotificationCenter = React.lazy(() => import('./pages/NotificationCenter'));
const NotificationSettings = React.lazy(() => import('./pages/settings/NotificationSettings'));
const AISettings = React.lazy(() => import('./pages/settings/AISettings'));
const ScrolithaAssistantPage = React.lazy(() => import('./pages/assistant/ScrolithaAssistantPage'));
const PersonalizedDiscovery = React.lazy(() => import('./pages/discovery/PersonalizedDiscovery'));
const MobileJobsScreen = React.lazy(() => import('./mobile/home/screens/MobileJobsScreen'));
const MobileBriefsScreen = React.lazy(() => import('./mobile/home/screens/MobileBriefsScreen'));
const MobileAppRouteFrame = React.lazy(() => import('./mobile/home/components/MobileAppRouteFrame'));

// Community Components
const Forum = React.lazy(() => import('./community/Forum'));
const ThreadDetail = React.lazy(() => import('./community/ThreadDetail'));
const Clubs = React.lazy(() => import('./community/Clubs'));
const Events = React.lazy(() => import('./community/Events'));
const Chat = React.lazy(() => import('./community/Chat'));
const Leaderboard = React.lazy(() => import('./community/Leaderboard'));
const GcoinDash = React.lazy(() => import('./community/GcoinDash'));
const KnowledgeHub = React.lazy(() => import('./community/KnowledgeHub'));
const CommunityDashboard = React.lazy(() => import('./dashboard/shared/CommunityDashboard'));
const MyAds = React.lazy(() => import('./pages/MyAds'));
const DeveloperPortal = React.lazy(() => import('./pages/DeveloperPortal'));
const DeveloperDocsPortal = React.lazy(() => import('./pages/DeveloperDocsPage'));
const AdminDeveloperPlatform = React.lazy(() => import('./pages/AdminDeveloperPlatform'));
const AdminLivePlatform = React.lazy(() => import('./pages/AdminLivePlatform'));
const ScrollFeed = React.lazy(() => import('./features/scroll/ScrollFeed'));
const LiveStudio = React.lazy(() => import('./features/live/LiveStudio'));
const LiveViewer = React.lazy(() => import('./features/live/LiveViewer'));
const MemberHomeSection = React.lazy(() => import('./components/sections/MemberHomeSection'));
const MemberHomeDeveloperWidget = React.lazy(
  () => import('./components/member-home/MemberHomeDeveloperWidget')
);

const preloadAuthenticatedRouteModules = ({ mobileShell }: { mobileShell: boolean }) => {
  // Warm only the two existing media/detail destinations most commonly opened
  // from the home surface. Other routes remain lazy until the user requests them.
  const priorityModules = mobileShell
    ? [import('./features/scroll/ScrollFeed')]
    : [import('./pages/PostDetailView'), import('./features/scroll/ScrollFeed')];

  return Promise.allSettled(priorityModules);
};

const shouldAvoidAggressiveRouteWarmup = () => {
  if (typeof window === 'undefined') return false;
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (connection?.saveData) return true;
  if (['slow-2g', '2g', '3g'].includes(String(connection?.effectiveType || '').toLowerCase())) return true;

  const deviceMemory = Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 0);
  if (deviceMemory > 0 && deviceMemory <= 2) return true;
  const hardwareConcurrency = Number(navigator.hardwareConcurrency || 0);
  return hardwareConcurrency > 0 && hardwareConcurrency <= 2;
};

// Error Boundary Component
type ErrorBoundaryState = { hasError: boolean };
class ErrorBoundary extends React.Component<React.PropsWithChildren<{}>, ErrorBoundaryState> {
  public props: React.PropsWithChildren<{}>;
  public state: ErrorBoundaryState;

  constructor(props: React.PropsWithChildren<{}>) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    trackRuntimeEvent(
      'mobile_runtime_error',
      {
        message:
          (error as { message?: string } | null)?.message ||
          'react_error_boundary',
        componentStack:
          (info as { componentStack?: string } | null)?.componentStack || ''
      },
      {
        dedupeMs: 15_000
      }
    );
    console.error(error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex min-h-[50vh] items-center justify-center px-4 py-10"
          role="alert"
          data-testid="global-error-boundary"
        >
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
              <img
                src="/logo-64.png"
                alt=""
                width={44}
                height={44}
                decoding="async"
                className="h-11 w-11 object-contain"
                onError={(event) => {
                  (event.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-slate-900">Something went wrong</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              This view hit a temporary render issue. Retry to reload the page, or go back home.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
              >
                Retry
              </button>
              <a
                href="/"
                className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
              >
                Go home
              </a>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children as React.ReactElement;
  }
}

class SignedInHomepageBoundary extends React.Component<React.PropsWithChildren<{}>, ErrorBoundaryState> {
  public props: React.PropsWithChildren<{}>;
  public state: ErrorBoundaryState;

  constructor(props: React.PropsWithChildren<{}>) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: unknown) {
    trackRuntimeEvent(
      'mobile_runtime_error',
      {
        message:
          (error as { message?: string } | null)?.message ||
          'signed_in_home_error_boundary',
        componentStack:
          (info as { componentStack?: string } | null)?.componentStack || ''
      },
      {
        dedupeMs: 15_000
      }
    );
    console.error(error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
              <img
                src="/logo-64.png"
                alt="Scrolith logo"
                width={44}
                height={44}
                decoding="async"
                className="h-11 w-11 object-contain"
                onError={(event) => {
                  (event.currentTarget as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-slate-900">Home is reloading</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              The signed-in homepage hit a render issue. Reload to try again.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children as React.ReactElement;
  }
}

const RouteLoadingFallback = () => (
  <div className="flex min-h-[48vh] items-center justify-center px-4">
    <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-[1.75rem] border border-slate-200 bg-slate-50 shadow-sm">
          <img
            src="/logo-64.png"
            alt="Scrolith logo"
            width={56}
            height={56}
            decoding="async"
            className="h-14 w-14 object-contain"
            onError={(event) => {
              (event.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
          <div className="text-sm font-medium text-slate-700">Loading Scrolith...</div>
        </div>
      </div>
    </div>
  </div>
);

const normalizeRouteRule = (value: string) => {
  let normalized = String(value || '').trim().split('#')[0].split('?')[0].trim();
  if (!normalized) return '';

  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    try {
      normalized = new URL(normalized).pathname || '/';
    } catch {
      return '';
    }
  }

  if (normalized !== '*' && !normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }

  if (normalized.length > 1 && normalized.endsWith('/') && !normalized.endsWith('/*')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
};

const parseRouteRules = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((entry) => normalizeRouteRule(String(entry || '')))
          .filter(Boolean)
      )
    );
  }

  if (typeof value === 'string') {
    return Array.from(
      new Set(
        value
          .split(/[\n,]/)
          .map((entry) => normalizeRouteRule(entry))
          .filter(Boolean)
      )
    );
  }

  return [];
};

const matchesRouteRule = (pathname: string, ruleValue: string) => {
  const current = normalizeRouteRule(pathname || '/');
  const rule = normalizeRouteRule(ruleValue);
  if (!rule) return false;
  if (rule === '*') return true;

  if (rule.endsWith('*')) {
    const prefix = rule.slice(0, -1).replace(/\/+$/, '');
    if (!prefix) return true;
    return current === prefix || current.startsWith(`${prefix}/`);
  }

  return current === rule || current.startsWith(`${rule}/`);
};

const matchesAnyRouteRule = (pathname: string, rules: string[]) =>
  rules.some((rule) => matchesRouteRule(pathname, rule));

const DEFAULT_FOOTER_HIDDEN_ROUTES = [
  '/',
  '/messages',
  '/client/dashboard/*',
  '/freelancer/dashboard',
  '/dashboard',
  '/auth/signup',
  '/auth/login',
  '/community',
  '/create-gig'
];

const DEFAULT_SUPPORT_WIDGET_HIDDEN_ROUTES = [
  '/',
  '/messages',
  '/client/dashboard/*',
  '/freelancer/dashboard',
  '/dashboard',
  '/developer',
  '/community',
  '/create-gig'
];

const MOBILE_STANDALONE_ROUTE_RULES = [
  '/dashboard*',
  '/freelancer/dashboard*',
  '/client/dashboard*',
  '/admin/dashboard*',
  '/marketplace*',
  '/browse',
  '/browse-jobs',
  '/search',
  '/gigs/*',
  '/jobs/*',
  '/post/*',
  '/community*',
  '/scroll*',
  '/profile/*',
  '/u/*',
  '/company/*',
  '/settings',
  '/kyc',
  '/create-gig',
  '/create-job',
  '/favorites',
  '/cart',
  '/support',
  '/contact',
  '/affiliate-program'
];

// Inner App component to use hooks
const AppContent = () => {
  const { user, isAuthenticated, isLoading, logout } = useUser();
  const { settings, loading: settingsLoading } = useContent();
  const { showNotification } = useNotification();
  const location = useLocation();
  const navigate = useNavigate();
  const canonicalRedirectUrl = getCanonicalRedirectUrl();
  const isHomeRoute = location.pathname === '/';
  const isGuestLandingRoute = isHomeRoute && !isAuthenticated;
  const themeKey = 'Scrolith.pref.theme';
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricVerified, setBiometricVerified] = useState(false);
  const [biometricChecking, setBiometricChecking] = useState(false);
  const [biometricError, setBiometricError] = useState<string | null>(null);
  const [biometryLabel, setBiometryLabel] = useState('Biometric');
  const [biometricPrefVersion, setBiometricPrefVersion] = useState(0);
  const [nonCriticalUiReady, setNonCriticalUiReady] = useState(() =>
    typeof window !== 'undefined' ? window.location.pathname !== '/' : false
  );
  const biometricCheckingRef = useRef(false);
  const biometricVerifiedRef = useRef(false);
  const biometricEnabledRef = useRef(false);
  const appBackgroundAtRef = useRef<number | null>(null);
  const appWasBackgroundedRef = useRef(false);
  const lastBiometricSuccessAtRef = useRef(0);
  const lastBiometricPromptAtRef = useRef(0);
  /** True while OS biometric sheet is open — ignore app background/foreground churn from that sheet. */
  const biometricPromptInFlightRef = useRef(false);
  const promptBiometricsRef = useRef<(reason?: string) => Promise<void>>(async () => undefined);
  const [isNative, setIsNative] = useState(() => hasNativeRuntime());

  useEffect(() => {
    if (!IS_MOBILE_APP_BUILD && !getCapacitorRuntime()) {
      setIsNative(false);
      return;
    }

    let cancelled = false;
    void import('@capacitor/core')
      .then(({ Capacitor }) => {
        if (!cancelled) setIsNative(Boolean(Capacitor.isNativePlatform()));
      })
      .catch(() => {
        if (!cancelled) setIsNative(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Next-gen native / compact-touch chrome: safe-area + theme only (never lock scroll).
  useEffect(() => {
    const dispose = applyNativeChrome({
      isNative,
      isCompactTouch: isNative || isCompactTouchRuntime() || shouldUseMobileShellViewport(),
      brandThemeColor: '#0B5FFF'
    });
    // Re-assert document scroll on route changes (modals/sheets can leave overflow locks).
    ensureDocumentScrollEnabled();
    return () => {
      dispose?.();
    };
  }, [isNative]);

  useEffect(() => {
    ensureDocumentScrollEnabled();
  }, [location.pathname]);

  useEffect(() => {
    if (!canonicalRedirectUrl || typeof window === 'undefined') return;
    if (window.location.href === canonicalRedirectUrl) return;
    window.location.replace(canonicalRedirectUrl);
  }, [canonicalRedirectUrl]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const canonicalUrl = `${getCanonicalAppOrigin()}${location.pathname || '/'}`;
    let link = document.querySelector("link[rel='canonical']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    if (link.href !== canonicalUrl) {
      link.href = canonicalUrl;
    }
  }, [location.pathname]);

  useEffect(() => {
    if (!isHomeRoute) {
      setNonCriticalUiReady(true);
      return;
    }

    setNonCriticalUiReady(false);

    let disposed = false;
    let timeoutId: number | null = null;
    const complete = () => {
      if (disposed) return;
      disposed = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      setNonCriticalUiReady(true);
      window.removeEventListener('pointerdown', complete);
      window.removeEventListener('keydown', complete);
      window.removeEventListener('touchstart', complete);
      window.removeEventListener('scroll', complete);
    };

    window.addEventListener('pointerdown', complete, { once: true, passive: true });
    window.addEventListener('keydown', complete, { once: true });
    window.addEventListener('touchstart', complete, { once: true, passive: true });
    window.addEventListener('scroll', complete, { once: true, passive: true });
    timeoutId = window.setTimeout(complete, 1800);

    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      window.removeEventListener('pointerdown', complete);
      window.removeEventListener('keydown', complete);
      window.removeEventListener('touchstart', complete);
      window.removeEventListener('scroll', complete);
      disposed = true;
    };
  }, [isHomeRoute]);

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    if (shouldAvoidAggressiveRouteWarmup()) return;

    let cancelled = false;
    let idleId: number | null = null;
    let timeoutId: number | null = null;

    const warmRoutes = () => {
      if (cancelled) return;
      void preloadAuthenticatedRouteModules({
        mobileShell: hasNativeRuntime() || isCompactTouchRuntime()
      });
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = (window as any).requestIdleCallback(warmRoutes, { timeout: 2400 });
    } else if (typeof window !== 'undefined') {
      const browserWindow = window as Window;
      timeoutId = browserWindow.setTimeout(warmRoutes, 1200);
    }

    return () => {
      cancelled = true;
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (idleId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(idleId);
      }
    };
  }, [isAuthenticated, user?.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const frame = window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event('scrolith:app-ready'));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const referralCode = new URLSearchParams(location.search).get('ref');
    if (!referralCode || !user?.id) return;
    const normalized = referralCode.trim();
    if (!normalized) return;
    const linkedKey = `affiliate.ref.linked.${user.id}.${normalized}`;
    if (sessionStorage.getItem(linkedKey) === '1') return;
    import('./services/marketing')
      .then(({ MarketingService }) => MarketingService.linkReferralCode(normalized))
      .then(() => {
        sessionStorage.setItem(linkedKey, '1');
      })
      .catch(() => {
        // Ignore: invalid, duplicate, or self-referral
      });
  }, [location.search, user?.id]);

  // Dynamic Favicon Update
  useEffect(() => {
    const LAST_FAVICON_KEY = 'Scrolith.lastFaviconUrl';

    const candidateKeys = [
      (settings as any)?.favicon_url,
      (settings as any)?.faviconUrl,
      (settings as any)?.favicon,
      (settings as any)?.faviconFile,
      (settings as any)?.favicon_file,
      (settings as any)?.favicon_file_id
    ];

    const configuredFavicon = candidateKeys.find(Boolean) as string | undefined;
    const persistedFavicon = localStorage.getItem(LAST_FAVICON_KEY) || undefined;
    const faviconUrl = configuredFavicon || persistedFavicon;

    const ensureRelLinks = (href: string, type?: string) => {
      const isCrossOrigin = (() => {
        try {
          const resolved = new URL(href, window.location.origin);
          return resolved.origin !== window.location.origin;
        } catch {
          return false;
        }
      })();

      const targets = ['icon', 'shortcut icon', 'apple-touch-icon'];
      targets.forEach((rel) => {
        const selector = `link[rel='${rel}']`;
        const existing = Array.from(document.querySelectorAll(selector)) as HTMLLinkElement[];
        if (existing.length) {
          existing.forEach((link) => {
            link.href = href;
            if (type) link.type = type;
            if (isCrossOrigin) link.crossOrigin = 'anonymous';
            else link.removeAttribute('crossorigin');
          });
          return;
        }
        const link = document.createElement('link');
        link.rel = rel;
        link.href = href;
        if (type) link.type = type;
        if (isCrossOrigin) link.crossOrigin = 'anonymous';
        document.head.appendChild(link);
      });
    };

    if (!faviconUrl) {
      if (settingsLoading) return;
      ensureRelLinks(`${window.location.origin}/favicon.png`, 'image/png');
      return;
    }

    try {
      const resolved =
        faviconUrl.startsWith('http://') || faviconUrl.startsWith('https://')
          ? faviconUrl
          : new URL(faviconUrl, window.location.origin).toString();
      const optimizedFavicon = resolveResponsiveAssetUrl(resolved, {
        width: 64,
        height: 64,
        fit: 'contain'
      });
      ensureRelLinks(optimizedFavicon);
      localStorage.setItem(LAST_FAVICON_KEY, optimizedFavicon);
      return;
    } catch (e) {
      console.warn('Could not resolve favicon URL, falling back:', faviconUrl, e);
    }

    const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='%230D8ABC'/><text x='50' y='55' font-size='55' text-anchor='middle' fill='white' font-family='Arial,Helvetica,sans-serif'>G</text></svg>`;
    const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
    ensureRelLinks(dataUrl, 'image/svg+xml');
    localStorage.setItem(LAST_FAVICON_KEY, dataUrl);
    console.warn('Favicon fallback in use');
  }, [settings, settingsLoading]);

  // Dynamic title and meta description from platform settings
  useEffect(() => {
    try {
      const siteName = settings?.siteName || settings?.site_name || 'Scrolith';
      const tagline = settings?.tagline || settings?.siteTagline || settings?.site_tagline || '';
      const title = tagline ? `${siteName} | ${tagline}` : siteName;
      if (document.title !== title) document.title = title;

      const descContent = (settings as any)?.siteDescription || (settings as any)?.site_description || tagline || '';
      let desc = document.querySelector("meta[name='description']") as HTMLMetaElement | null;
      if (!desc) {
        desc = document.createElement('meta');
        desc.name = 'description';
        document.head.appendChild(desc);
      }
      if (desc.content !== descContent) desc.content = descContent;
    } catch (e) {
      console.warn('Failed to update document title/meta from settings', e);
    }
  }, [settings?.siteName, settings?.site_name, settings?.tagline, settings?.siteTagline, settings?.site_tagline, settings]);

  useEffect(() => {
    const storedTheme = localStorage.getItem(themeKey);
    if (storedTheme === 'dark' || storedTheme === 'light') {
      document.documentElement.dataset.theme = storedTheme;
    }
  }, []);

  const updateBiometricChecking = (value: boolean) => {
    biometricCheckingRef.current = value;
    setBiometricChecking(value);
  };

  const updateBiometricVerified = (value: boolean) => {
    biometricVerifiedRef.current = value;
    setBiometricVerified(value);
  };

  useEffect(() => {
    const handler = () => setBiometricPrefVersion((value) => value + 1);
    window.addEventListener('Scrolith:biometric_pref_changed', handler);
    return () => window.removeEventListener('Scrolith:biometric_pref_changed', handler);
  }, []);

  useEffect(() => {
    const enabled = Boolean(isNative && readBiometricPreference());
    biometricEnabledRef.current = enabled;
    setBiometricEnabled(enabled);
    if (!isNative) {
      updateBiometricVerified(true);
    }
  }, [isNative, biometricPrefVersion]);

  const promptBiometrics = useCallback(
    async (reason?: string) => {
      if (!isNative || !biometricEnabledRef.current) return;
      if (!isAuthenticated || !user) return;
      // Already unlocked — never re-open OS sheet or re-show overlay race.
      if (biometricVerifiedRef.current) return;
      if (biometricCheckingRef.current || biometricPromptInFlightRef.current) return;

      const now = Date.now();
      // Grace window after a successful unlock (covers OEM app-state thrash + dialog dismiss).
      if (now - lastBiometricSuccessAtRef.current < 8_000) {
        updateBiometricVerified(true);
        return;
      }
      if (now - lastBiometricPromptAtRef.current < 1500) return;
      lastBiometricPromptAtRef.current = now;

      updateBiometricChecking(true);
      biometricPromptInFlightRef.current = true;
      setBiometricError(null);

      try {
        const { authenticateBiometrics, checkBiometrics } = await import('./mobile/biometrics');
        const info = await checkBiometrics();
        if (!info.available) {
          setBiometricEnabled(false);
          biometricEnabledRef.current = false;
          writeBiometricPreference(false);
          updateBiometricVerified(true);
          showNotification('alert', 'Biometrics Unavailable', 'No biometric hardware detected on this device.');
          return;
        }

        const label = getBiometryLabel(info.biometryType);
        setBiometryLabel(label);

        const auth = await authenticateBiometrics(reason || `Unlock Scrolith with ${label}`);
        if (auth.ok) {
          lastBiometricSuccessAtRef.current = Date.now();
          // Clear background flags so dismiss of OS sheet doesn't re-lock.
          appWasBackgroundedRef.current = false;
          appBackgroundAtRef.current = null;
          updateBiometricVerified(true);
          setBiometricError(null);
        } else {
          // User cancelled or failed — keep overlay, allow retry (not stuck on Checking).
          updateBiometricVerified(false);
          const code = String((auth as any)?.code || '').toLowerCase();
          const cancelled =
            code.includes('cancel') ||
            code.includes('user') ||
            /cancel|dismiss|user.?cancel/i.test(String(auth.error || ''));
          setBiometricError(cancelled ? null : auth.error || 'Authentication failed.');
        }
      } catch (error: any) {
        updateBiometricVerified(false);
        setBiometricError(error?.message || 'Authentication failed.');
      } finally {
        biometricPromptInFlightRef.current = false;
        updateBiometricChecking(false);
      }
    },
    [isNative, isAuthenticated, user, showNotification]
  );

  promptBiometricsRef.current = promptBiometrics;

  useEffect(() => {
    if (!isNative) return;
    let disposed = false;
    let cleanup: void | (() => void | Promise<void>);

    void import('./mobile/deeplinks')
      .then(({ registerDeepLinks }) => {
        if (disposed) return;
        cleanup = registerDeepLinks((path) => navigate(path, { replace: true }));
      })
      .catch(() => {});

    return () => {
      disposed = true;
      void cleanup?.();
    };
  }, [navigate, isNative]);

  useEffect(() => {
    if (!isNative) return;
    let isCancelled = false;
    const bootstrapNativePush = async () => {
      const { initPushNotifications, syncStoredPushToken } = await import('./mobile/push');
      await initPushNotifications((path) => navigate(path, { replace: true }));
      if (!isCancelled) {
        await syncStoredPushToken();
      }
    };
    void bootstrapNativePush();
    return () => {
      isCancelled = true;
    };
  }, [navigate, isNative]);

  useEffect(() => {
    if (!isAuthenticated || !isNative) return;
    let isCancelled = false;
    const bootstrapPush = async () => {
      const { forcePushRegistrationAfterAuth } = await import('./mobile/push');
      if (isCancelled) return;
      await forcePushRegistrationAfterAuth((path) => navigate(path, { replace: true }));
    };
    void bootstrapPush();
    return () => {
      isCancelled = true;
    };
  }, [isAuthenticated, isNative, navigate, user?.id]);

  // Gate: prompt once when biometric unlock is required. Depend on user.id only
  // so callback identity churn does not re-lock after a successful unlock.
  useEffect(() => {
    if (!biometricEnabled || !isAuthenticated || !user?.id) {
      updateBiometricVerified(true);
      setBiometricError(null);
      return;
    }
    // Already verified this session — do not reset (prevents duplicate lock overlay).
    if (biometricVerifiedRef.current) return;
    if (Date.now() - lastBiometricSuccessAtRef.current < 8_000) {
      updateBiometricVerified(true);
      return;
    }
    updateBiometricVerified(false);
    void promptBiometricsRef.current();
  }, [biometricEnabled, isAuthenticated, user?.id]);

  useEffect(() => {
    if (!isNative || !biometricEnabled) return;
    let isMounted = true;
    let listenerHandle: { remove: () => Promise<void> } | null = null;

    void import('@capacitor/app')
      .then(({ App: CapacitorApp }) => {
        return CapacitorApp.addListener('appStateChange', ({ isActive }) => {
          // OS biometric sheet often pauses the WebView. Do not treat that as a full lock.
          if (biometricPromptInFlightRef.current || biometricCheckingRef.current) {
            if (isActive) {
              // Sheet closed; if we already unlocked, keep unlocked.
              if (biometricVerifiedRef.current) {
                appWasBackgroundedRef.current = false;
                appBackgroundAtRef.current = null;
              }
            }
            return;
          }

          if (!isActive) {
            appBackgroundAtRef.current = Date.now();
            appWasBackgroundedRef.current = true;
            // Only re-lock after a real background, not during an in-flight prompt.
            if (biometricVerifiedRef.current) {
              updateBiometricVerified(false);
            }
            return;
          }

          const backgroundAt = appBackgroundAtRef.current;
          const backgroundDurationMs = backgroundAt ? Date.now() - backgroundAt : 0;
          const resumedFromBackground = appWasBackgroundedRef.current && backgroundDurationMs >= 1500;
          appWasBackgroundedRef.current = false;
          appBackgroundAtRef.current = null;

          if (!resumedFromBackground) return;

          // Skip re-lock right after a successful unlock or while still verified.
          if (biometricVerifiedRef.current) return;
          if (Date.now() - lastBiometricSuccessAtRef.current < 15_000) {
            updateBiometricVerified(true);
            return;
          }
          if (!biometricEnabledRef.current) return;
          updateBiometricVerified(false);
          void promptBiometricsRef.current(`Unlock Scrolith with ${biometryLabel}`);
        });
      })
      .then((handle) => {
        if (!handle) return;
        if (!isMounted) {
          void handle.remove();
          return;
        }
        listenerHandle = handle;
      })
      .catch(() => {});

    return () => {
      isMounted = false;
      if (listenerHandle) {
        void listenerHandle.remove();
      }
    };
  }, [isNative, biometricEnabled, biometryLabel]);

  // Hide Navbar/Footer on Admin Dashboard for full screen feel
  const isAdminRoute = location.pathname.startsWith('/admin') || location.pathname.startsWith('/dev-docs');
  const isMessagesRoute = /^\/messages(\/|$)/.test(location.pathname);
  const isMobileShellRoute = /^\/m(\/|$)/.test(location.pathname);
  const isScrollRoute = /^\/scroll(\/|$)/.test(location.pathname);
  // Phase 26B — simplified chrome during follow onboarding (no dense nav / messaging dock).
  const isFollowOnboardingRoute = /^\/auth\/follow-onboarding(\/|$)/.test(location.pathname);
  const isGigDetailRoute = /^\/gigs\/[^/]+/.test(location.pathname);
  const activeTab = new URLSearchParams(location.search).get('tab')?.toLowerCase();
  const isMessagesTabRoute = activeTab === 'messages';
  const uiVisibility = ((settings as any)?.uiVisibility || (settings as any)?.ui_visibility || {}) as Record<string, any>;
  const footerHiddenRoutes = parseRouteRules(
    uiVisibility.footerHiddenRoutes ??
      uiVisibility.footer_hidden_routes ??
      (settings as any)?.footerHiddenRoutes ??
      (settings as any)?.footer_hidden_routes ??
      DEFAULT_FOOTER_HIDDEN_ROUTES
  );
  const supportWidgetHiddenRoutes = parseRouteRules(
    uiVisibility.supportWidgetHiddenRoutes ??
      uiVisibility.support_widget_hidden_routes ??
      uiVisibility.chatWidgetHiddenRoutes ??
      uiVisibility.chat_widget_hidden_routes ??
      (settings as any)?.supportWidgetHiddenRoutes ??
      (settings as any)?.support_widget_hidden_routes ??
      DEFAULT_SUPPORT_WIDGET_HIDDEN_ROUTES
  );

  const isFooterSuppressedByRule = matchesAnyRouteRule(location.pathname, footerHiddenRoutes);
  const isSupportWidgetSuppressedByRule = matchesAnyRouteRule(location.pathname, supportWidgetHiddenRoutes);
  const memberHomeDesktopOverride =
    new URLSearchParams(location.search).get('desktop') === '1' ||
    new URLSearchParams(location.search).get('view') === 'desktop';
  const isMobileUserAgent =
    typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobile/i.test(String(navigator.userAgent || ''));
  const isMobileViewport =
    isNative || isMobileUserAgent || shouldUseMobileShellViewport() || isCompactTouchRuntime();
  const shouldUseMobileMemberHome = isMobileViewport && !memberHomeDesktopOverride;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isMobileShellRoute) {
      try {
        window.sessionStorage.removeItem(MOBILE_POST_AUTH_TARGET_KEY);
        window.localStorage.removeItem(MOBILE_POST_AUTH_TARGET_KEY);
      } catch {
        // Ignore cleanup failures.
      }
      return;
    }
    if (!isAuthenticated || !user) return;
    if (String(user.role || '').toLowerCase().includes('admin')) return;

    let target = '';
    try {
      target =
        window.sessionStorage.getItem(MOBILE_POST_AUTH_TARGET_KEY) ||
        window.localStorage.getItem(MOBILE_POST_AUTH_TARGET_KEY) ||
        '';
    } catch {
      target = '';
    }

    if (!target) return;
    const safeTarget = target.startsWith('/') ? target : '/member-home';
    const absoluteTarget = new URL(safeTarget, window.location.origin).href;
    const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';
    const targetPath = new URL(safeTarget, window.location.origin).pathname.replace(/\/+$/, '') || '/';
    if (currentPath === targetPath) {
      try {
        window.sessionStorage.removeItem(MOBILE_POST_AUTH_TARGET_KEY);
        window.localStorage.removeItem(MOBILE_POST_AUTH_TARGET_KEY);
      } catch {
        // Ignore cleanup failures.
      }
      return;
    }
    const redirect = () => {
      if ((window.location.pathname.replace(/\/+$/, '') || '/') === targetPath) return;
      window.location.replace(absoluteTarget);
    };
    redirect();
    const retryTimers = [750, 2_500, 6_000, 12_000, 18_000].map((delay) =>
      window.setTimeout(redirect, delay)
    );
    return () => {
      retryTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [isAuthenticated, isMobileShellRoute, user]);

  useEffect(() => {
    if (isLoading || !isAuthenticated || !user || !shouldUseMobileMemberHome) return;
    if (String(user.role || '').toLowerCase().includes('admin')) return;
    if (isMobileShellRoute) return;

    const normalizedPath = location.pathname.replace(/\/+$/, '') || '/';
    const shouldNormalizeToMobileHome =
      normalizedPath === '/' ||
      normalizedPath === '/home' ||
      normalizedPath === '/auth/login' ||
      normalizedPath === '/auth/signup' ||
      normalizedPath === '/auth/follow-onboarding';

    if (shouldNormalizeToMobileHome) {
      navigate(resolveAuthenticatedEntryPath(user), { replace: true });
    }
  }, [
    isAuthenticated,
    isLoading,
    isMobileShellRoute,
    location.pathname,
    navigate,
    shouldUseMobileMemberHome,
    user
  ]);
  const isMobileStandaloneRoute =
    shouldUseMobileMemberHome &&
    !isMobileShellRoute &&
    !isAdminRoute &&
    !isMessagesRoute &&
    matchesAnyRouteRule(location.pathname, MOBILE_STANDALONE_ROUTE_RULES);
  const normalizedAppPath = location.pathname.replace(/\/+$/, '') || '/';
  const shouldRenderForcedMobileHome = false;
  const shouldHideAppDistributionPrompt =
    shouldRenderForcedMobileHome ||
    isMobileShellRoute ||
    isMessagesRoute ||
    isMessagesTabRoute ||
    isGigDetailRoute ||
    isScrollRoute;
  const shouldHideSupportWidget =
    shouldRenderForcedMobileHome ||
    isAdminRoute ||
    isMobileShellRoute ||
    isMobileStandaloneRoute ||
    (isMobileViewport && isGuestLandingRoute) ||
    isMessagesRoute ||
    isMessagesTabRoute ||
    isGigDetailRoute ||
    isScrollRoute ||
    isSupportWidgetSuppressedByRule;
  const shouldHideFooter =
    shouldRenderForcedMobileHome ||
    isMobileShellRoute ||
    isMobileStandaloneRoute ||
    isAdminRoute ||
    isMessagesRoute ||
    isScrollRoute ||
    isFooterSuppressedByRule;
  const routeRenderKey = `${location.pathname}${location.search}${location.hash}`;
  const renderResponsiveMobilePage = (title: string, node: React.ReactNode, fullBleed = true) =>
    isMobileStandaloneRoute ? (
      <MobileAppRouteFrame title={title} fullBleed={fullBleed}>
        {node}
      </MobileAppRouteFrame>
    ) : (
      <>{node}</>
    );
  const signedInHomepageElement = isLoading ? (
    <RouteLoadingFallback />
  ) : !isAuthenticated || !user ? (
    <Landing />
  ) : hasPendingFollowOnboarding(user) ? (
    <Navigate to={FOLLOW_ONBOARDING_PATH} replace />
  ) : (
    <SignedInHomepageBoundary>
      {shouldUseMobileMemberHome ? <MobileHome /> : <MemberHomeSection />}
      <Suspense fallback={null}>
        <MemberHomeDeveloperWidget />
      </Suspense>
    </SignedInHomepageBoundary>
  );
  const unmatchedRouteElement =
    isAuthenticated && user ? (
      <Navigate to={resolveAuthenticatedEntryPath(user)} replace />
    ) : (
      <Navigate to="/" replace />
    );
  
  return (
    <div className="flex flex-col min-h-screen relative">
      <SkipLink />
      <RouteAnnouncer />
      {nonCriticalUiReady && (
        <Suspense fallback={null}>
          <IntegrationsManager />
        </Suspense>
      )}
      <OfflineBanner />
      {isAuthenticated && nonCriticalUiReady && !isMobileShellRoute && !isAdminRoute && (
        <Suspense fallback={null}>
          <KeyboardShortcutsHelp />
        </Suspense>
      )}
      {!shouldHideAppDistributionPrompt && !isMobileStandaloneRoute && nonCriticalUiReady && (
        <Suspense fallback={null}>
          <AppDistributionPrompt />
        </Suspense>
      )}
      {!shouldRenderForcedMobileHome &&
        !isAdminRoute &&
        !isMobileShellRoute &&
        !isScrollRoute &&
        !isFollowOnboardingRoute &&
        !isMobileStandaloneRoute && (
          <Suspense fallback={null}>
            <Navbar />
          </Suspense>
        )}
      {isAuthenticated &&
        user &&
        !isAdminRoute &&
        !isMobileShellRoute &&
        !isMobileStandaloneRoute &&
        !shouldRenderForcedMobileHome &&
        // Phase 20.7 patch: full /messages workspace replaces floating dock (unmount, not hide).
        !isMessagesRoute &&
        !isFollowOnboardingRoute &&
        nonCriticalUiReady && (
          <Suspense fallback={null}>
            <DesktopMessagingDock />
          </Suspense>
        )}
      <main id="main-content" className="w-full min-w-0 flex-grow" tabIndex={-1}>
        {shouldRenderForcedMobileHome ? (
          <ErrorBoundary key="forced-mobile-home">
            <Suspense fallback={<RouteLoadingFallback />}>
              <SignedInHomepageBoundary>
                <MobileHome />
              </SignedInHomepageBoundary>
            </Suspense>
          </ErrorBoundary>
        ) : (
          <ErrorBoundary key={routeRenderKey}>
            <Suspense key={routeRenderKey} fallback={<RouteLoadingFallback />}>
              <Routes location={location} key={routeRenderKey}>
              <Route path="/" element={signedInHomepageElement} />
              <Route path="/home" element={signedInHomepageElement} />
              <Route path="/member-home" element={signedInHomepageElement} />
              <Route
                path="/member_home"
                element={
                  <ProtectedRoute>
                    <LegacyMemberHomeRedirect />
                  </ProtectedRoute>
                }
              />

              {/* Mobile logged-in shell (LinkedIn-style) */}
              <Route
                path="/m"
                element={
                  <ProtectedRoute>
                    <SignedInHomepageBoundary>
                      <MobileHome />
                      <Suspense fallback={null}>
                        <MemberHomeDeveloperWidget />
                      </Suspense>
                    </SignedInHomepageBoundary>
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="home" replace />} />
                <Route path="home" element={<MobileFeedScreen />} />
                <Route path="network" element={<MobileNetworkScreen />} />
                <Route path="post" element={<MobilePostScreen />} />
                <Route path="notifications" element={<MobileNotificationsScreen />} />
                <Route path="jobs" element={<MobileJobsScreen />} />
                <Route path="briefs" element={<MobileBriefsScreen />} />
                <Route path="marketplace" element={<MarketplacePage />} />
                <Route path="marketplace/create" element={<MarketplacePage />} />
                <Route path="marketplace/sell" element={<MarketplacePage />} />
                <Route path="marketplace/edit/:id" element={<MarketplacePage />} />
                <Route path="marketplace/my-listings" element={<MarketplacePage />} />
                <Route path="marketplace/saved" element={<MarketplacePage />} />
                <Route path="marketplace/category/:slug" element={<MarketplacePage />} />
                <Route path="marketplace/listing/:slug" element={<MarketplacePage />} />
              </Route>
              <Route
                path="/auth/login"
                element={
                  <PublicOnlyRoute>
                    <Login />
                  </PublicOnlyRoute>
                }
              />
              <Route path="/login" element={<Navigate to="/auth/login" replace />} />
              <Route path="/signin" element={<Navigate to="/auth/login" replace />} />
              <Route
                path="/auth/forgot-password"
                element={
                  <PublicOnlyRoute>
                    <ForgotPassword />
                  </PublicOnlyRoute>
                }
              />
              <Route
                path="/auth/reset-password"
                element={
                  <PublicOnlyRoute>
                    <ResetPassword />
                  </PublicOnlyRoute>
                }
              />
              <Route
                path="/auth/signup"
                element={
                  <PublicOnlyRoute>
                    <Signup />
                  </PublicOnlyRoute>
                }
              />
              <Route path="/signup" element={<Navigate to="/auth/signup" replace />} />
              <Route path="/join" element={<Navigate to="/auth/signup" replace />} />
              <Route
                path="/auth/follow-onboarding"
                element={
                  <ProtectedRoute>
                    <FollowOnboarding />
                  </ProtectedRoute>
                }
              />
              <Route path="/auth/oauth/callback" element={<OAuthCallback />} />
              <Route path="/maintenance" element={<MaintenancePage />} />
              
               {/* Browse & Search Pages */}
               <Route path="/browse" element={renderResponsiveMobilePage('Browse gigs', <BrowseTalent />)} />
               <Route path="/browse-jobs" element={renderResponsiveMobilePage('Browse jobs', <BrowseJobs />)} />
               <Route path="/search" element={renderResponsiveMobilePage('Search', <SearchResults />)} />
               <Route path="/marketplace" element={renderResponsiveMobilePage('Marketplace', <MarketplacePage />)} />
               <Route path="/marketplace/create" element={renderResponsiveMobilePage('Marketplace', <MarketplacePage />)} />
               <Route path="/marketplace/sell" element={renderResponsiveMobilePage('Marketplace', <MarketplacePage />)} />
               <Route path="/marketplace/edit/:id" element={renderResponsiveMobilePage('Marketplace', <MarketplacePage />)} />
               <Route path="/marketplace/my-listings" element={renderResponsiveMobilePage('Marketplace', <MarketplacePage />)} />
               <Route path="/marketplace/saved" element={renderResponsiveMobilePage('Marketplace', <MarketplacePage />)} />
               <Route path="/marketplace/category/:slug" element={renderResponsiveMobilePage('Marketplace', <MarketplacePage />)} />
               <Route path="/marketplace/listing/:slug" element={renderResponsiveMobilePage('Marketplace', <MarketplacePage />)} />
               
               {/* Detail Pages */}
               <Route path="/gigs/:id" element={renderResponsiveMobilePage('Gig details', <GigDetail />)} />
               <Route path="/jobs/:id" element={renderResponsiveMobilePage('Job details', <JobDetail />)} />
              
              {/* CMS Pages */}
              <Route path="/blog" element={<Blog />} />
              <Route path="/blog/:slug" element={<BlogPost />} />
              <Route path="/answers" element={<AnswersPage />} />
              <Route path="/guides" element={<GuidesPage />} />
              <Route path="/hire" element={<HirePage />} />
              <Route path="/freelancer" element={<FreelancerPage />} />
              <Route path="/careers" element={<StaticPage slugOverride="careers" canonicalPathOverride="/careers" />} />
              <Route path="/p/:slug" element={<StaticPage />} />
              
               {/* Support Page */}
               <Route
                 path="/notifications"
                 element={
                   <ProtectedRoute>
                     <NotificationCenter />
                   </ProtectedRoute>
                 }
               />
               <Route
                 path="/settings/notifications"
                 element={
                   <ProtectedRoute>
                     <NotificationSettings />
                   </ProtectedRoute>
                 }
               />
               <Route
                 path="/settings/ai"
                 element={
                   <ProtectedRoute>
                     <AISettings />
                   </ProtectedRoute>
                 }
               />
               <Route
                 path="/assistant"
                 element={
                   <ProtectedRoute>
                     <ScrolithaAssistantPage />
                   </ProtectedRoute>
                 }
               />
               <Route
                 path="/discovery"
                 element={
                   <ProtectedRoute>
                     <PersonalizedDiscovery />
                   </ProtectedRoute>
                 }
               />
               <Route path="/support" element={renderResponsiveMobilePage('Support', <Support />)} />
               <Route
                 path="/contact"
                 element={
                   <ProtectedRoute>
                     {renderResponsiveMobilePage('Contact', <ContactPage />)}
                   </ProtectedRoute>
                 }
               />
               
               {/* Affiliate Program */}
               <Route path="/affiliate-program" element={renderResponsiveMobilePage('Referral', <AffiliateProgram />)} />
              
              {/* Community Platform Routes (auth required) */}
              <Route
                path="/post/create"
                element={
                  <ProtectedRoute>
                    {renderResponsiveMobilePage('Create post', <MobilePostScreen />)}
                  </ProtectedRoute>
                }
              />
              <Route
                path="/post/:postId"
                element={
                   <ProtectedRoute>
                     {renderResponsiveMobilePage('Post', <PostDetailView />)}
                   </ProtectedRoute>
                 }
               />
               <Route
                 path="/community"
                 element={
                   <ProtectedRoute>
                     {renderResponsiveMobilePage('Community', <CommunityLayout />)}
                   </ProtectedRoute>
                 }
               >
                <Route index element={<CommunityHome />} />
                <Route path="posts/:id" element={<CommunityHome />} />
                <Route path="forum" element={<Forum />} />
                <Route path="new-topic" element={<Forum />} />
                <Route path="thread/:id" element={<ThreadDetail />} />
                <Route path="dashboard" element={<CommunityDashboard />} />
                <Route path="gcoin" element={<GcoinDash />} />
                <Route path="chat" element={<Chat />} />
                <Route path="clubs" element={<Clubs />} />
                <Route path="events" element={<Events />} />
                <Route path="leaderboard" element={<Leaderboard />} />
                <Route path="resources" element={<KnowledgeHub />} />
                <Route path="content" element={<KnowledgeHub />} />
              </Route>
              <Route
                path="/community/new-post"
                element={
                  <ProtectedRoute>
                    <Navigate to="/community" replace />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/community/new"
                element={
                  <ProtectedRoute>
                    <Navigate to="/community" replace />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/community/scroll"
                element={
                  <ProtectedRoute>
                    <Navigate to="/scroll" replace />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/scroll"
                element={
                  <ProtectedRoute>
                    <ScrollFeed />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/live"
                element={
                  <ProtectedRoute>
                    <LiveFeatureRoute>
                      <Navigate to="/live/studio" replace />
                    </LiveFeatureRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/live/studio"
                element={
                  <ProtectedRoute>
                    <LiveFeatureRoute>
                      <LiveStudio />
                    </LiveFeatureRoute>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/live/:id"
                element={
                  <ProtectedRoute>
                    <LiveFeatureRoute>
                      <LiveViewer />
                    </LiveFeatureRoute>
                  </ProtectedRoute>
                }
              />

              {/* My Ads - user-owned ads */}
              <Route path="/my-ads" element={
                <ProtectedRoute>
                  <MyAds />
                </ProtectedRoute>
              } />
              
               {/* Profiles — Phase 20.7.8: canonical Scrolitha enterprise profile first */}
               <Route path="/u/scrolitha" element={renderResponsiveMobilePage('Profile', <ScrolithaOfficialProfile />)} />
               <Route path="/u/Scrolitha" element={<Navigate to="/u/scrolitha" replace />} />
               <Route path="/community/u/scrolitha" element={<Navigate to="/u/scrolitha" replace />} />
               <Route path="/profile/:id" element={renderResponsiveMobilePage('Profile', <FreelancerProfile />)} />
               <Route path="/u/:username" element={renderResponsiveMobilePage('Profile', <FreelancerProfile />)} />
               <Route path="/community/u/:username" element={renderResponsiveMobilePage('Profile', <FreelancerProfile />)} />
               <Route path="/company/:slug" element={renderResponsiveMobilePage('Page', <CompanyPage />)} />
              <Route path="/profile/edit" element={
                <ProtectedRoute>
                  <EditProfile />
                </ProtectedRoute>
              } />

               {/* Protected Common Routes */}
               <Route path="/settings" element={
                   <ProtectedRoute>
                     {renderResponsiveMobilePage('Settings', <SettingsModule />)}
                   </ProtectedRoute>
               } />
               <Route path="/kyc" element={
                   <ProtectedRoute>
                     {renderResponsiveMobilePage('Verification', <KYCVerification />)}
                   </ProtectedRoute>
               } />

              <Route path="/messages" element={
                  <ProtectedRoute>
                    <Messages />
                  </ProtectedRoute>
              } />

              {/* Phase 22.2 — group invite accept deep link */}
              <Route path="/messages/join/:inviteCode" element={
                  <ProtectedRoute>
                    <Messages />
                  </ProtectedRoute>
              } />
              
              {/* Deep link for messages */}
              <Route path="/messages/:conversationId" element={
                  <ProtectedRoute>
                    <Messages />
                  </ProtectedRoute>
              } />

               <Route path="/favorites" element={
                   <ProtectedRoute>
                     {renderResponsiveMobilePage('Favorites', <Favorites />)}
                   </ProtectedRoute>
               } />
               <Route path="/cart" element={
                   <ProtectedRoute>
                     {renderResponsiveMobilePage('Cart', <Cart />)}
                   </ProtectedRoute>
               } />

              {/* Admin Routes */}
              <Route
                path="/admin/marketplace"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                    <Navigate to="/admin/dashboard?tab=marketplace" replace />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/dashboard/admin/marketplace"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                    <Navigate to="/admin/dashboard?tab=marketplace" replace />
                  </ProtectedRoute>
                }
              />
              <Route 
                path="/admin/dashboard" 
                element={
                  <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                    {renderResponsiveMobilePage('Dashboard', <AdminDashboard />)}
                  </ProtectedRoute>
                } 
              />
              <Route
                path="/admin/settings/languages"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                    <React.Suspense fallback={<RouteLoadingFallback />}>
                      <LanguagesAdmin />
                    </React.Suspense>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/community"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                    <Navigate to="/admin/dashboard?tab=community" replace />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/scroll"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                    <Navigate to="/admin/dashboard?tab=scroll" replace />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/live"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                    <AdminLivePlatform />
                  </ProtectedRoute>
                }
              />

              <Route
                path="/dashboard/*"
                element={
                  <ProtectedRoute>
                    <DashboardAliasRedirect />
                  </ProtectedRoute>
                }
              />
              
              {/* Freelancer Routes (allow any authenticated user to view; dashboard will respect `as` query) */}
              <Route
                path="/freelancer/dashboard/*"
                element={
                    <ProtectedRoute>
                      {renderResponsiveMobilePage('Dashboard', <DashboardRouter />)}
                    </ProtectedRoute>
                }
              />
               <Route 
                 path="/create-gig" 
                 element={
                    <ProtectedRoute allowedRoles={[UserRole.FREELANCER, UserRole.ADMIN]}>
                       {renderResponsiveMobilePage('Create gig', <CreateGig />)}
                     </ProtectedRoute>
                 } 
               />

              {/* Client Routes */}
                <Route
                  path="/client/dashboard/*"
                  element={
                      <ProtectedRoute>
                        {renderResponsiveMobilePage('Dashboard', <DashboardRouter />)}
                      </ProtectedRoute>
                  }
                />
               <Route 
                 path="/create-job" 
                 element={
                    <ProtectedRoute allowedRoles={[UserRole.EMPLOYER, UserRole.ADMIN]}>
                       {renderResponsiveMobilePage('Create job', <CreateJob />)}
                     </ProtectedRoute>
                 } 
               />
              <Route
                path="/client/dashboard/jobs/edit/:id"
                element={
                    <ProtectedRoute allowedRoles={[UserRole.EMPLOYER]}>
                      <EditJob />
                    </ProtectedRoute>
                }
              />

              {/* Developer Documentation */}
              <Route 
                path="/dev-docs" 
                element={
                  <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                    <DeveloperDocs />
                  </ProtectedRoute>
                } 
              />

              {/* Developer Platform */}
              <Route
                path="/developer"
                element={
                  <ProtectedRoute>
                    <DeveloperPortal />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/developer/apps"
                element={
                  <ProtectedRoute>
                    <DeveloperPortal />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/developer/products"
                element={
                  <ProtectedRoute>
                    <DeveloperPortal />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/developer/docs"
                element={
                  <ProtectedRoute>
                    <DeveloperDocsPortal />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/developer-platform"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                    <AdminDeveloperPlatform />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={unmatchedRouteElement} />
              
              </Routes>
            </Suspense>
          </ErrorBoundary>
        )}
      </main>
      {!shouldHideFooter && nonCriticalUiReady && (
        <Suspense fallback={null}>
          <DynamicFooter />
        </Suspense>
      )}
      {!shouldHideSupportWidget && nonCriticalUiReady && (
        <Suspense fallback={null}>
          <SupportWidget />
        </Suspense>
      )}
      {!isAdminRoute && !isMobileShellRoute && !isMobileStandaloneRoute && nonCriticalUiReady && (
        <Suspense fallback={null}>
          <MarketingPopups />
        </Suspense>
      )}
      {biometricEnabled && !biometricVerified && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/80 p-6">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-slate-900 p-3 text-white">
                <AlertTriangleIcon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-900">{biometryLabel} required</p>
                <p className="text-xs text-slate-500">Unlock Scrolith to continue.</p>
              </div>
            </div>
            {biometricError && (
              <div className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-xs text-red-600">
                {biometricError}
              </div>
            )}
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={() => promptBiometrics(`Unlock Scrolith with ${biometryLabel}`)}
                disabled={biometricChecking}
                className="flex-1 rounded-2xl bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:opacity-60"
              >
                {biometricChecking ? 'Checking...' : `Use ${biometryLabel}`}
              </button>
              <button
                onClick={logout}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============ SINGLE ProtectedRoute Definition ============
interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

const DashboardAliasRedirect: React.FC = () => {
  const { user } = useUser();
  const location = useLocation();

  if (!user) {
    return <Navigate to="/auth/login" state={{ from: location }} replace />;
  }

  const params = new URLSearchParams(location.search);
  const overrideRaw =
    (params.get('as') || params.get('view') || sessionStorage.getItem('activeRole') || '')
      .toString()
      .toLowerCase();

  let overrideRole: UserRole | undefined;
  if (overrideRaw.startsWith('f')) overrideRole = UserRole.FREELANCER;
  if (overrideRaw.startsWith('e') || overrideRaw.startsWith('c')) overrideRole = UserRole.EMPLOYER;
  if (overrideRaw.startsWith('a')) overrideRole = UserRole.ADMIN;

  if (hasPendingFollowOnboarding(user)) {
    return <Navigate to={FOLLOW_ONBOARDING_PATH} replace />;
  }

  const effectiveRole = user.role === UserRole.ADMIN ? overrideRole || user.role : user.role;
  const targetPath = resolveDashboardPath(effectiveRole);
  const targetUrl = `${targetPath}${location.search || ''}`;

  return <Navigate to={targetUrl} replace />;
};

const LegacyMemberHomeRedirect: React.FC = () => {
  const { user } = useUser();
  const location = useLocation();
  const target = resolveSignedInHomepagePath();
  return <Navigate to={{ pathname: target, search: location.search, hash: location.hash }} replace />;
};

const PublicOnlyRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated, isLoading } = useUser();

  if (isAuthenticated && user) {
    const target = hasPendingFollowOnboarding(user) ? FOLLOW_ONBOARDING_PATH : resolveAuthenticatedEntryPath(user);
    return <Navigate to={target} replace />;
  }

  // Public auth pages should remain usable while session bootstrap is checking
  // native storage. Returning null here caused Android WebView to show only the
  // global header/search shell on /auth/login and /auth/signup.
  if (isLoading) {
    return <>{children}</>;
  }

  return <>{children}</>;
};

const LiveFeatureRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useUser();
  const { loading, status } = useLiveFeature();

  if (loading) {
    return null;
  }

  if (!status.enabled) {
    return <Navigate to={resolveDashboardPath(user?.role)} replace />;
  }

  return <>{children}</>;
};

const AuthenticatedRuntimeBoundary: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated, isLoading } = useUser();

  if (isLoading || !isAuthenticated || !user) {
    return <>{children}</>;
  }

  return (
    <Suspense fallback={<GlobalPreloader />}>
      <AuthenticatedRuntimeProviders>{children}</AuthenticatedRuntimeProviders>
    </Suspense>
  );
};

// Update the ProtectedRoute component to NOT redirect for homepage
  const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
    const { user, isAuthenticated, isLoading } = useUser();
    const location = useLocation();

  if (isLoading) {
    return <RouteLoadingFallback />;
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/auth/login" state={{ from: location }} replace />;
  }

  if (hasPendingFollowOnboarding(user) && location.pathname !== FOLLOW_ONBOARDING_PATH) {
    return <Navigate to={FOLLOW_ONBOARDING_PATH} replace />;
  }

  // If allowedRoles is provided, check if user has the required role
    if (allowedRoles) {
      const normalizedRole = (user.role || '').toString().toLowerCase() as UserRole;
      if (!allowedRoles.includes(normalizedRole)) {
        const params = new URLSearchParams(location.search);
        const override = (params.get('as') || params.get('view') || sessionStorage.getItem('activeRole') || '').toString().toLowerCase();
        if (override && allowedRoles.includes(override as UserRole)) {
          return <>{children}</>;
        }
        // Only redirect if the current path is NOT the homepage
        if (location.pathname !== '/') {
          return <Navigate to={resolveDashboardPath(normalizedRole)} replace />;
        }
      }
  }

  return <>{children}</>;
};
// ============ END ProtectedRoute ============

function App() {
  return (
    <BrowserRouter>
      <NetworkStatusProvider>
        <RouterHistorySync />
        <ChunkLoadRecovery />
        <UserProvider>
          {/*
            SocketProvider must wrap every useSocket() consumer (notifications,
            currency, favorites, cart, preloader, realtime, messages). Exactly
            one physical socket lives in socketService; this only provides context.
          */}
          <SocketProvider>
            <PreloaderProvider>
              <ContentProvider>
                <I18nProvider>
                  <NotificationProvider>
                    <ToastContainer />
                    <CurrencyProvider>
                      <FavoritesProvider>
                        <CartProvider>
                          <LiveFeatureProvider>
                            <AuthenticatedRuntimeBoundary>
                              <GlobalPreloader />
                              <AppContent />
                              <AuthenticatedLoginApprovalOverlay />
                            </AuthenticatedRuntimeBoundary>
                          </LiveFeatureProvider>
                        </CartProvider>
                      </FavoritesProvider>
                    </CurrencyProvider>
                  </NotificationProvider>
                </I18nProvider>
              </ContentProvider>
            </PreloaderProvider>
          </SocketProvider>
        </UserProvider>
      </NetworkStatusProvider>
    </BrowserRouter>
  );
}

export default App;




