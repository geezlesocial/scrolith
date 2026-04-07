import React, { useEffect, Suspense, useRef, useState, useCallback } from 'react';
import { 
  BrowserRouter, 
  Routes, 
  Route, 
  Navigate,
  useLocation,
  useNavigate
} from 'react-router-dom';
import Navbar from './components/Navbar';
import ToastContainer from './components/ToastContainer';
import OfflineBanner from './components/OfflineBanner';
import AppDistributionPrompt from './components/AppDistributionPrompt';
import { UserRole } from './types';
import { CurrencyProvider } from './context/CurrencyContext';
import { ContentProvider, useContent } from './context/ContentContext';
import { LiveFeatureProvider, useLiveFeature } from './context/LiveFeatureContext';
import { NotificationProvider, useNotification } from './context/NotificationContext';
import { FavoritesProvider } from './context/FavoritesContext';
import { CartProvider } from './context/CartContext';
import { MessageProvider } from './context/MessageContext';
import { NetworkStatusProvider } from './context/NetworkStatusContext';
import { UserProvider, useUser } from './context/UserContext';
import { SocketProvider } from './context/SocketContext';
import { PreloaderProvider } from './context/PreloaderContext';
import { I18nProvider } from './i18n/I18nProvider';
import GlobalPreloader from './components/GlobalPreloader';
import { AlertTriangleIcon } from './components/icons/ShellIcons';
import IntegrationsManager from './components/IntegrationsManager';
import { registerDeepLinks } from './mobile/deeplinks';
import { initPushNotifications, syncStoredPushToken } from './mobile/push';
import { App as CapacitorApp } from '@capacitor/app';
import {
  authenticateBiometrics,
  checkBiometrics,
  getBiometricPreference,
  getBiometryLabel,
  isNativePlatform,
  setBiometricPreference
} from './mobile/biometrics';
import { MarketingService } from './services/marketing';
import { resolveResponsiveAssetUrl } from './utils/assetUrl';
import { getCanonicalAppOrigin, getCanonicalRedirectUrl } from './utils/siteUrl';
import { trackMobileRuntimeEvent } from './mobile/mobileTelemetry';
import { isLikelyChunkLoadError, normalizeRouteHref } from './mobile/runtime/routeRecovery';
import BrowseTalent from './main/BrowseTalent';
import BrowseJobs from './main/BrowseJobs';
import SearchResults from './pages/SearchResults';
import Messages from './messages/Messages';
import FreelancerProfile from './profile/FreelancerProfile';
import CompanyPage from './pages/CompanyPage';
import ContactPage from './pages/ContactPage';
import AffiliateProgram from './pages/AffiliateProgram';
import Favorites from './pages/Favorites';
import Cart from './pages/Cart';
import SettingsModule from './dashboard/shared/SettingsModule';
import { DashboardRouter } from './dashboard/DashboardRouter';
import CommunityLayout from './community/CommunityLayout';
import CommunityHome from './community/CommunityHome';
import { shouldUseMobileShellViewport } from './mobile/home/mobileShellLayout';
import {
  FOLLOW_ONBOARDING_PATH,
  hasPendingFollowOnboarding,
  resolveAuthenticatedEntryPath,
  resolveDashboardPath
} from './utils/authRedirect';

const HISTORY_SYNC_EVENT = 'scrolith:history-sync';
const CHUNK_RELOAD_GUARD_KEY = 'scrolith:chunk-reload-target';
const ROUTE_SYNC_RELOAD_GUARD_KEY = 'scrolith:route-sync-reload-target';

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

  void trackMobileRuntimeEvent(
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

  void trackMobileRuntimeEvent(
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
const AnswersPage = React.lazy(() => import('./pages/AnswersPage'));
const GuidesPage = React.lazy(() => import('./pages/GuidesPage'));
const HirePage = React.lazy(() => import('./pages/HirePage'));
const FreelancerPage = React.lazy(() => import('./pages/FreelancerPage'));
const Support = React.lazy(() => import('./pages/Support'));
const PostDetailView = React.lazy(() => import('./pages/PostDetailView'));

// Mobile (LinkedIn-style) logged-in home shell
const MobileHome = React.lazy(() => import('./mobile/home/MobileHome'));
const MobileFeedScreen = React.lazy(() => import('./mobile/home/screens/MobileFeedScreen'));
const MobileNetworkScreen = React.lazy(() => import('./mobile/home/screens/MobileNetworkScreen'));
const MobilePostScreen = React.lazy(() => import('./mobile/home/screens/MobilePostScreen'));
const MobileNotificationsScreen = React.lazy(() => import('./mobile/home/screens/MobileNotificationsScreen'));
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

const preloadAuthenticatedRouteModules = () =>
  Promise.allSettled([
    import('./mobile/home/components/MobileAppRouteFrame'),
    import('./mobile/home/screens/MobileNotificationsScreen'),
    import('./mobile/home/screens/MobileJobsScreen'),
    import('./mobile/home/screens/MobileBriefsScreen'),
    import('./pages/PostDetailView'),
    import('./features/scroll/ScrollFeed'),
    import('./create-gig/CreateGig'),
    import('./create-job-post/CreateJob'),
    import('./pages/Support'),
    import('./profile/EditProfile')
  ]);

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
    void trackMobileRuntimeEvent(
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
      return <div>Something went wrong.</div>;
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
            src="/logo.png"
            alt="Scrolith logo"
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
  let normalized = String(value || '').trim();
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

const MOBILE_STANDALONE_ROUTE_RULES = [
  '/dashboard*',
  '/freelancer/dashboard*',
  '/client/dashboard*',
  '/admin/dashboard*',
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
  const { user, isAuthenticated, logout } = useUser();
  const { settings, loading: settingsLoading } = useContent();
  const { showNotification } = useNotification();
  const location = useLocation();
  const navigate = useNavigate();
  const canonicalRedirectUrl = getCanonicalRedirectUrl();
  const isHomeRoute = location.pathname === '/';
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
  const appBackgroundAtRef = useRef<number | null>(null);
  const appWasBackgroundedRef = useRef(false);
  const lastBiometricSuccessAtRef = useRef(0);
  const lastBiometricPromptAtRef = useRef(0);
  const isNative = isNativePlatform();

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
    let idleId: number | null = null;
    const complete = () => {
      if (disposed) return;
      disposed = true;
      setNonCriticalUiReady(true);
      window.removeEventListener('pointerdown', complete);
      window.removeEventListener('keydown', complete);
      window.removeEventListener('touchstart', complete);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (idleId !== null && 'cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(idleId);
      }
    };

    window.addEventListener('pointerdown', complete, { once: true, passive: true });
    window.addEventListener('keydown', complete, { once: true });
    window.addEventListener('touchstart', complete, { once: true, passive: true });

    if ('requestIdleCallback' in window) {
      idleId = (window as any).requestIdleCallback(complete, { timeout: 1800 });
    } else {
      timeoutId = window.setTimeout(complete, 1800);
    }

    return () => {
      window.removeEventListener('pointerdown', complete);
      window.removeEventListener('keydown', complete);
      window.removeEventListener('touchstart', complete);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      if (idleId !== null && 'cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(idleId);
      }
      disposed = true;
    };
  }, [isHomeRoute]);

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    let cancelled = false;
    let idleId: number | null = null;
    let timeoutId: number | null = null;

    const warmRoutes = () => {
      if (cancelled) return;
      void preloadAuthenticatedRouteModules();
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleId = (window as any).requestIdleCallback(warmRoutes, { timeout: 1200 });
    } else {
      timeoutId = window.setTimeout(warmRoutes, 180);
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
    MarketingService.linkReferralCode(normalized)
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
    setBiometricEnabled(Boolean(isNative && getBiometricPreference()));
    if (!isNative) {
      updateBiometricVerified(true);
    }
  }, [isNative, biometricPrefVersion]);

  const promptBiometrics = useCallback(
    async (reason?: string) => {
      if (!isNative || !biometricEnabled || biometricCheckingRef.current) return;
      if (!isAuthenticated || !user) return;
      if (biometricVerifiedRef.current) return;
      const now = Date.now();
      if (now - lastBiometricPromptAtRef.current < 1200) return;
      lastBiometricPromptAtRef.current = now;

      updateBiometricChecking(true);
      setBiometricError(null);

      const info = await checkBiometrics();
      if (!info.available) {
        setBiometricEnabled(false);
        setBiometricPreference(false);
        updateBiometricVerified(true);
        updateBiometricChecking(false);
        showNotification('alert', 'Biometrics Unavailable', 'No biometric hardware detected on this device.');
        return;
      }

      const label = getBiometryLabel(info.biometryType);
      setBiometryLabel(label);

      const auth = await authenticateBiometrics(reason || `Unlock Scrolith with ${label}`);
      if (auth.ok) {
        updateBiometricVerified(true);
        lastBiometricSuccessAtRef.current = Date.now();
        setBiometricError(null);
      } else {
        updateBiometricVerified(false);
        setBiometricError(auth.error || 'Authentication failed.');
      }
      updateBiometricChecking(false);
    },
    [
      isNative,
      biometricEnabled,
      isAuthenticated,
      user,
      showNotification
    ]
  );

  useEffect(() => {
    const cleanup = registerDeepLinks((path) => navigate(path, { replace: true }));
    return () => {
      void cleanup?.();
    };
  }, [navigate]);

  useEffect(() => {
    let isCancelled = false;
    const bootstrapNativePush = async () => {
      await initPushNotifications((path) => navigate(path, { replace: true }));
      if (!isCancelled) {
        await syncStoredPushToken();
      }
    };
    void bootstrapNativePush();
    return () => {
      isCancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let isCancelled = false;
    const bootstrapPush = async () => {
      if (!isCancelled) await syncStoredPushToken();
    };
    void bootstrapPush();
    return () => {
      isCancelled = true;
    };
  }, [isAuthenticated, navigate, user?.id]);

  useEffect(() => {
    if (!biometricEnabled || !isAuthenticated || !user) {
      updateBiometricVerified(true);
      setBiometricError(null);
      return;
    }
    updateBiometricVerified(false);
    void promptBiometrics();
  }, [biometricEnabled, isAuthenticated, user, promptBiometrics]);

  useEffect(() => {
    if (!isNative || !biometricEnabled) return;
    let isMounted = true;
    let listenerHandle: { remove: () => Promise<void> } | null = null;
    void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) {
        appBackgroundAtRef.current = Date.now();
        appWasBackgroundedRef.current = true;
        updateBiometricVerified(false);
        return;
      }

      const backgroundAt = appBackgroundAtRef.current;
      const backgroundDurationMs = backgroundAt ? Date.now() - backgroundAt : 0;
      const resumedFromBackground = appWasBackgroundedRef.current && backgroundDurationMs >= 1000;
      appWasBackgroundedRef.current = false;
      appBackgroundAtRef.current = null;

      if (!resumedFromBackground) return;

      // Avoid immediate re-prompts caused by OEM app-state callbacks around biometric dialogs.
      if (Date.now() - lastBiometricSuccessAtRef.current < 15_000) return;
      updateBiometricVerified(false);
      void promptBiometrics(`Unlock Scrolith with ${biometryLabel}`);
    }).then((handle) => {
      if (!isMounted) {
        void handle.remove();
        return;
      }
      listenerHandle = handle;
    });
    return () => {
      isMounted = false;
      if (listenerHandle) {
        void listenerHandle.remove();
      }
    };
  }, [isNative, biometricEnabled, promptBiometrics, biometryLabel]);

  // Hide Navbar/Footer on Admin Dashboard for full screen feel
  const isAdminRoute = location.pathname.startsWith('/admin') || location.pathname.startsWith('/dev-docs');
  const isMessagesRoute = /^\/messages(\/|$)/.test(location.pathname);
  const isMobileShellRoute = /^\/m(\/|$)/.test(location.pathname);
  const isScrollRoute = /^\/scroll(\/|$)/.test(location.pathname);
  const isGigDetailRoute = /^\/gigs\/[^/]+/.test(location.pathname);
  const activeTab = new URLSearchParams(location.search).get('tab')?.toLowerCase();
  const isMessagesTabRoute = activeTab === 'messages';
  const uiVisibility = ((settings as any)?.uiVisibility || (settings as any)?.ui_visibility || {}) as Record<string, any>;
  const footerHiddenRoutes = parseRouteRules(
    uiVisibility.footerHiddenRoutes ??
      uiVisibility.footer_hidden_routes ??
      (settings as any)?.footerHiddenRoutes ??
      (settings as any)?.footer_hidden_routes ??
      []
  );
  const supportWidgetHiddenRoutes = parseRouteRules(
    uiVisibility.supportWidgetHiddenRoutes ??
      uiVisibility.support_widget_hidden_routes ??
      uiVisibility.chatWidgetHiddenRoutes ??
      uiVisibility.chat_widget_hidden_routes ??
      (settings as any)?.supportWidgetHiddenRoutes ??
      (settings as any)?.support_widget_hidden_routes ??
      []
  );

  const isFooterSuppressedByRule = matchesAnyRouteRule(location.pathname, footerHiddenRoutes);
  const isSupportWidgetSuppressedByRule = matchesAnyRouteRule(location.pathname, supportWidgetHiddenRoutes);
  const memberHomeDesktopOverride =
    new URLSearchParams(location.search).get('desktop') === '1' ||
    new URLSearchParams(location.search).get('view') === 'desktop';
  const isMobileViewport = shouldUseMobileShellViewport();
  const shouldUseMobileMemberHome = isMobileViewport && !memberHomeDesktopOverride;
  const isMobileStandaloneRoute =
    shouldUseMobileMemberHome &&
    !isMobileShellRoute &&
    !isAdminRoute &&
    !isMessagesRoute &&
    matchesAnyRouteRule(location.pathname, MOBILE_STANDALONE_ROUTE_RULES);
  const shouldHideAppDistributionPrompt =
    isMobileShellRoute ||
    isMessagesRoute ||
    isMessagesTabRoute ||
    isGigDetailRoute ||
    isScrollRoute;
  const shouldHideSupportWidget =
    isAdminRoute ||
    isMobileShellRoute ||
    isMobileStandaloneRoute ||
    isMessagesRoute ||
    isMessagesTabRoute ||
    isGigDetailRoute ||
    isScrollRoute ||
    isSupportWidgetSuppressedByRule;
  const shouldHideFooter =
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
  
  return (
    <div className="flex flex-col min-h-screen relative">
      <IntegrationsManager />
      <OfflineBanner />
      {!shouldHideAppDistributionPrompt && !isMobileStandaloneRoute && nonCriticalUiReady && <AppDistributionPrompt />}
      {!isAdminRoute && !isMobileShellRoute && !isScrollRoute && !isMobileStandaloneRoute && <Navbar />}
      <main className="flex-grow">
        <ErrorBoundary key={routeRenderKey}>
          <Suspense key={routeRenderKey} fallback={<RouteLoadingFallback />}>
            <Routes location={location} key={routeRenderKey}>
              <Route path="/" element={<Landing />} />
              <Route
                path="/member_home"
                element={
                  <ProtectedRoute>
                    {shouldUseMobileMemberHome ? <Navigate to="/m/home" replace /> : <MemberHomeSection />}
                  </ProtectedRoute>
                }
              />

              {/* Mobile logged-in shell (LinkedIn-style) */}
              <Route
                path="/m"
                element={
                  <ProtectedRoute>
                    <MobileHome />
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
              </Route>
              <Route
                path="/auth/login"
                element={
                  <PublicOnlyRoute>
                    <Login />
                  </PublicOnlyRoute>
                }
              />
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
              <Route
                path="/auth/follow-onboarding"
                element={
                  <ProtectedRoute>
                    <FollowOnboarding />
                  </ProtectedRoute>
                }
              />
              <Route path="/auth/oauth/callback" element={<OAuthCallback />} />
              
               {/* Browse & Search Pages */}
               <Route path="/browse" element={renderResponsiveMobilePage('Browse gigs', <BrowseTalent />)} />
               <Route path="/browse-jobs" element={renderResponsiveMobilePage('Browse jobs', <BrowseJobs />)} />
               <Route path="/search" element={renderResponsiveMobilePage('Search', <SearchResults />)} />
               
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
                     {renderResponsiveMobilePage('Scroll', <ScrollFeed />, false)}
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
              
               {/* Profiles */}
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
                     <ProtectedRoute allowedRoles={[UserRole.FREELANCER]}>
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
                     <ProtectedRoute allowedRoles={[UserRole.EMPLOYER]}>
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
              
            </Routes>
          </Suspense>
        </ErrorBoundary>
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

const PublicOnlyRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated, isLoading } = useUser();

  if (isLoading) {
    return null;
  }

  if (isAuthenticated && user) {
    return <Navigate to={resolveAuthenticatedEntryPath(user)} replace />;
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

// Update the ProtectedRoute component to NOT redirect for homepage
  const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
    const { user, isAuthenticated, isLoading } = useUser();
    const location = useLocation();

  if (isLoading) {
    return null;
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

  // TODO: Re-add RealtimeProvider after fixing socket initialization issues
  // RealtimeProvider removed temporarily to fix lazy loading errors

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
          <SocketProvider>
            <PreloaderProvider>
              <ContentProvider>
                <I18nProvider>
                  <NotificationProvider>
                    <ToastContainer />
                    <CurrencyProvider>
                      <FavoritesProvider>
                        <CartProvider>
                          <MessageProvider>
                            <LiveFeatureProvider>
                              <GlobalPreloader />
                              <AppContent />
                            </LiveFeatureProvider>
                          </MessageProvider>
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




