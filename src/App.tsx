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
import DynamicFooter from './components/DynamicFooter';
import SupportWidget from './components/SupportWidget';
import ToastContainer from './components/ToastContainer';
import MarketingPopups from './components/MarketingPopups';
import OfflineBanner from './components/OfflineBanner';
import AppDistributionPrompt from './components/AppDistributionPrompt';
import { UserRole } from './types';
import { CurrencyProvider } from './context/CurrencyContext';
import { ContentProvider, useContent } from './context/ContentContext';
import { NotificationProvider, useNotification } from './context/NotificationContext';
import { FavoritesProvider } from './context/FavoritesContext';
import { CartProvider } from './context/CartContext';
import { MessageProvider } from './context/MessageContext';
import { UserProvider, useUser } from './context/UserContext';
import { SocketProvider } from './context/SocketContext';
import { PreloaderProvider } from './context/PreloaderContext';
import { I18nProvider } from './i18n/I18nProvider';
import GlobalPreloader from './components/GlobalPreloader';
import { AlertTriangleIcon, LoaderIcon } from './components/icons/ShellIcons';
import IntegrationsManager from './components/IntegrationsManager';
import { registerDeepLinks } from './mobile/deeplinks';
import { initPushNotifications } from './mobile/push';
import { App as CapacitorApp } from '@capacitor/app';
import {
  authenticateBiometrics,
  checkBiometrics,
  getBiometricPreference,
  getBiometryLabel,
  isNativePlatform,
  setBiometricPreference
} from './mobile/biometrics';

// Lazy Loaded Components
const Landing = React.lazy(() => import('./main/Landing'));
const Login = React.lazy(() => import('./auth/Login'));
const Signup = React.lazy(() => import('./auth/Signup'));
const ForgotPassword = React.lazy(() => import('./auth/ForgotPassword'));
const ResetPassword = React.lazy(() => import('./auth/ResetPassword'));
const OAuthCallback = React.lazy(() => import('./auth/OAuthCallback'));
const BrowseTalent = React.lazy(() => import('./main/BrowseTalent'));
const BrowseJobs = React.lazy(() => import('./main/BrowseJobs'));
const SearchResults = React.lazy(() => import('./pages/SearchResults'));
const AdminDashboard = React.lazy(() => import('./dashboard/AdminDashboard'));
const CreateJob = React.lazy(() => import('./create-job-post/CreateJob'));
const EditJob = React.lazy(() => import('./dashboard/employer/EditJob'));
const CreateGig = React.lazy(() => import('./create-gig/CreateGig'));
const KYCVerification = React.lazy(() => import('./kyc/KYCVerification'));
const Messages = React.lazy(() => import('./messages/Messages'));
const FreelancerProfile = React.lazy(() => import('./profile/FreelancerProfile'));
const CompanyPage = React.lazy(() => import('./pages/CompanyPage'));
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
const AffiliateProgram = React.lazy(() => import('./pages/AffiliateProgram'));
const Favorites = React.lazy(() => import('./pages/Favorites'));
const Cart = React.lazy(() => import('./pages/Cart'));
const SettingsModule = React.lazy(() => import('./dashboard/shared/SettingsModule'));
const PostDetailView = React.lazy(() => import('./pages/PostDetailView'));
const DashboardRouter = React.lazy(() =>
  import('./dashboard/DashboardRouter').then((module) => ({ default: module.DashboardRouter }))
);

// Mobile (LinkedIn-style) logged-in home shell
const MobileHome = React.lazy(() => import('./mobile/home/MobileHome'));
const MobileFeedScreen = React.lazy(() => import('./mobile/home/screens/MobileFeedScreen'));
const MobileNetworkScreen = React.lazy(() => import('./mobile/home/screens/MobileNetworkScreen'));
const MobilePostScreen = React.lazy(() => import('./mobile/home/screens/MobilePostScreen'));
const MobileNotificationsScreen = React.lazy(() => import('./mobile/home/screens/MobileNotificationsScreen'));
const MobileJobsScreen = React.lazy(() => import('./mobile/home/screens/MobileJobsScreen'));
const MobileBriefsScreen = React.lazy(() => import('./mobile/home/screens/MobileBriefsScreen'));

// Community Components
const CommunityLayout = React.lazy(() => import('./community/CommunityLayout'));
const CommunityHome = React.lazy(() => import('./community/CommunityHome'));
const Forum = React.lazy(() => import('./community/Forum'));
const ThreadDetail = React.lazy(() => import('./community/ThreadDetail'));
const Clubs = React.lazy(() => import('./community/Clubs'));
const Events = React.lazy(() => import('./community/Events'));
const Chat = React.lazy(() => import('./community/Chat'));
const Leaderboard = React.lazy(() => import('./community/Leaderboard'));
const GcoinDash = React.lazy(() => import('./community/GcoinDash'));
const CommunityDashboard = React.lazy(() => import('./dashboard/shared/CommunityDashboard'));
const MyAds = React.lazy(() => import('./pages/MyAds'));

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
    console.error(error, info);
  }

  render() {
    if (this.state.hasError) {
      return <div>Something went wrong.</div>;
    }
    return this.props.children as React.ReactElement;
  }
}

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

// Inner App component to use hooks
const AppContent = () => {
  const { user, isAuthenticated, logout } = useUser();
  const { settings, loading: settingsLoading } = useContent();
  const { showNotification } = useNotification();
  const location = useLocation();
  const navigate = useNavigate();
  const pushInitRef = useRef(false);
  const themeKey = 'Scrolith.pref.theme';
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricVerified, setBiometricVerified] = useState(false);
  const [biometricChecking, setBiometricChecking] = useState(false);
  const [biometricError, setBiometricError] = useState<string | null>(null);
  const [biometryLabel, setBiometryLabel] = useState('Biometric');
  const [biometricPrefVersion, setBiometricPrefVersion] = useState(0);
  const biometricCheckingRef = useRef(false);
  const biometricVerifiedRef = useRef(false);
  const appBackgroundAtRef = useRef<number | null>(null);
  const appWasBackgroundedRef = useRef(false);
  const lastBiometricSuccessAtRef = useRef(0);
  const lastBiometricPromptAtRef = useRef(0);
  const isNative = isNativePlatform();

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
      const versionedHref = href.includes('?') ? `${href}&v=${Date.now()}` : `${href}?v=${Date.now()}`;
      const isCrossOrigin = (() => {
        try {
          const resolved = new URL(versionedHref, window.location.origin);
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
            link.href = versionedHref;
            if (type) link.type = type;
            if (isCrossOrigin) link.crossOrigin = 'anonymous';
            else link.removeAttribute('crossorigin');
          });
          return;
        }
        const link = document.createElement('link');
        link.rel = rel;
        link.href = versionedHref;
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

    (async () => {
      try {
        const resolved =
          faviconUrl.startsWith('http://') || faviconUrl.startsWith('https://')
            ? faviconUrl
            : new URL(faviconUrl, window.location.origin).toString();

        try {
          const resp = await fetch(resolved, { method: 'GET', cache: 'no-store' });
          if (resp.ok) {
            const contentType = resp.headers.get('content-type') || undefined;
            const isSvg = contentType?.includes('svg') || resolved.endsWith('.svg');
            const type = isSvg ? 'image/svg+xml' : contentType || undefined;
            ensureRelLinks(resolved, type);
            localStorage.setItem(LAST_FAVICON_KEY, resolved);
            console.log('Favicon updated:', resolved, 'type=', type);
            return;
          }
          throw new Error(`HTTP ${resp.status}`);
        } catch (fetchErr: any) {
          const is404 =
            typeof fetchErr === 'string'
              ? fetchErr.includes('HTTP 404')
              : (fetchErr?.message || '').includes('HTTP 404') || fetchErr?.status === 404;
          if (!is404) {
            ensureRelLinks(resolved);
            localStorage.setItem(LAST_FAVICON_KEY, resolved);
            console.warn('Favicon fetch failed but applied raw URL:', fetchErr);
            return;
          }
          console.warn('Favicon returned 404; using inline fallback', fetchErr);
        }
      } catch (e) {
        console.warn('Could not resolve favicon URL, falling back:', faviconUrl, e);
      }

      const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='%230D8ABC'/><text x='50' y='55' font-size='55' text-anchor='middle' fill='white' font-family='Arial,Helvetica,sans-serif'>G</text></svg>`;
      const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
      ensureRelLinks(dataUrl, 'image/svg+xml');
      localStorage.setItem(LAST_FAVICON_KEY, dataUrl);
      console.warn('Favicon fetch failed, using inline fallback favicon');
    })();
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
    registerDeepLinks((path) => navigate(path, { replace: true }));
  }, [navigate]);

  useEffect(() => {
    if (!isAuthenticated || pushInitRef.current) return;
    pushInitRef.current = true;
    void initPushNotifications((path) => navigate(path, { replace: true }));
  }, [isAuthenticated, navigate]);

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
  const shouldHideSupportWidget = isMobileShellRoute || isMessagesRoute || isMessagesTabRoute || isSupportWidgetSuppressedByRule;
  const shouldHideFooter = isMobileShellRoute || isAdminRoute || isMessagesRoute || isFooterSuppressedByRule;
  
  return (
    <div className="flex flex-col min-h-screen relative">
      <IntegrationsManager />
      <OfflineBanner />
      {!isMobileShellRoute && <AppDistributionPrompt />}
      {!isAdminRoute && !isMobileShellRoute && <Navbar />}
      <main className="flex-grow">
        <ErrorBoundary>
          <Suspense fallback={
            <div className="h-screen flex items-center justify-center bg-white">
              <div className="text-center">
                <LoaderIcon className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-4" />
                <p className="text-gray-500 font-medium">Loading Scrolith...</p>
              </div>
            </div>
          }>
            <Routes>
              <Route path="/" element={<Landing />} />

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
              <Route path="/auth/oauth/callback" element={<OAuthCallback />} />
              
              {/* Browse & Search Pages */}
              <Route path="/browse" element={<BrowseTalent />} />
              <Route path="/browse-jobs" element={<BrowseJobs />} />
              <Route path="/search" element={<SearchResults />} />
              
              {/* Detail Pages */}
              <Route path="/gigs/:id" element={<GigDetail />} />
              <Route path="/jobs/:id" element={<JobDetail />} />
              
              {/* CMS Pages */}
              <Route path="/blog" element={<Blog />} />
              <Route path="/blog/:slug" element={<BlogPost />} />
              <Route path="/answers" element={<AnswersPage />} />
              <Route path="/guides" element={<GuidesPage />} />
              <Route path="/hire" element={<HirePage />} />
              <Route path="/freelancer" element={<FreelancerPage />} />
              <Route path="/p/:slug" element={<StaticPage />} />
              
              {/* Support Page */}
              <Route path="/support" element={<Support />} />
              
              {/* Affiliate Program */}
              <Route path="/affiliate-program" element={<AffiliateProgram />} />
              
              {/* Community Platform Routes (auth required) */}
              <Route
                path="/post/:postId"
                element={
                  <ProtectedRoute>
                    <PostDetailView />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/community"
                element={
                  <ProtectedRoute>
                    <CommunityLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<CommunityHome />} />
                <Route path="posts/:id" element={<CommunityHome />} />
                <Route path="forum" element={<Forum />} />
                <Route path="thread/:id" element={<ThreadDetail />} />
                <Route path="dashboard" element={<CommunityDashboard />} />
                <Route path="gcoin" element={<GcoinDash />} />
                <Route path="chat" element={<Chat />} />
                <Route path="clubs" element={<Clubs />} />
                <Route path="events" element={<Events />} />
                <Route path="leaderboard" element={<Leaderboard />} />
                <Route path="content" element={<div className="p-12 text-center text-gray-500">Knowledge Hub Coming Soon</div>} />
              </Route>

              {/* My Ads - user-owned ads */}
              <Route path="/my-ads" element={
                <ProtectedRoute>
                  <MyAds />
                </ProtectedRoute>
              } />
              
              {/* Profiles */}
              <Route path="/profile/:id" element={<FreelancerProfile />} />
              <Route path="/u/:username" element={<FreelancerProfile />} />
              <Route path="/community/u/:username" element={<FreelancerProfile />} />
              <Route path="/company/:slug" element={<CompanyPage />} />
              <Route path="/profile/edit" element={
                <ProtectedRoute>
                  <EditProfile />
                </ProtectedRoute>
              } />

              {/* Protected Common Routes */}
              <Route path="/settings" element={
                  <ProtectedRoute>
                    <SettingsModule />
                  </ProtectedRoute>
              } />
              <Route path="/kyc" element={
                  <ProtectedRoute>
                    <KYCVerification />
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
                    <Favorites />
                  </ProtectedRoute>
              } />
              <Route path="/cart" element={
                  <ProtectedRoute>
                    <Cart />
                  </ProtectedRoute>
              } />

              {/* Admin Routes */}
              <Route 
                path="/admin/dashboard" 
                element={
                  <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                    <AdminDashboard />
                  </ProtectedRoute>
                } 
              />
              <Route
                path="/admin/settings/languages"
                element={
                  <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                    <React.Suspense fallback={<div>Loading...</div>}>
                      <LanguagesAdmin />
                    </React.Suspense>
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
                      <DashboardRouter />
                    </ProtectedRoute>
                }
              />
                <Route 
                path="/create-gig" 
                element={
                    <ProtectedRoute allowedRoles={[UserRole.FREELANCER]}>
                      <CreateGig />
                    </ProtectedRoute>
                } 
              />

              {/* Client Routes */}
                <Route
                  path="/client/dashboard/*"
                  element={
                      <ProtectedRoute>
                        <DashboardRouter />
                      </ProtectedRoute>
                  }
                />
              <Route 
                path="/create-job" 
                element={
                    <ProtectedRoute allowedRoles={[UserRole.EMPLOYER]}>
                      <CreateJob />
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
              
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      {!shouldHideFooter && <DynamicFooter />}
      {!shouldHideSupportWidget && <SupportWidget />}
      {!isAdminRoute && !isMobileShellRoute && <MarketingPopups />}
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

const resolveDashboardPath = (role?: UserRole | string) => {
  const normalizedRole = (role || '').toString().toLowerCase() as UserRole;
  switch (normalizedRole) {
    case UserRole.ADMIN:
      return '/admin/dashboard';
    case UserRole.FREELANCER:
      return '/freelancer/dashboard';
    case UserRole.EMPLOYER:
      return '/client/dashboard';
    default:
      return '/';
  }
};

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

  const effectiveRole = user.role === UserRole.ADMIN ? overrideRole || user.role : user.role;
  const targetPath = resolveDashboardPath(effectiveRole);
  const targetUrl = `${targetPath}${location.search || ''}`;

  return <Navigate to={targetUrl} replace />;
};

const PublicOnlyRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
      </div>
    );
  }

  if (isAuthenticated && user) {
    return <Navigate to={resolveDashboardPath(user.role)} replace />;
  }

  return <>{children}</>;
};

// Update the ProtectedRoute component to NOT redirect for homepage
  const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
    const { user, isAuthenticated, isLoading } = useUser();
    const location = useLocation();

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto"></div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/auth/login" state={{ from: location }} replace />;
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
                          <GlobalPreloader />
                          <AppContent />
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
    </BrowserRouter>
  );
}

export default App;




