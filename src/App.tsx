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
import PwaInstallPrompt from './components/PwaInstallPrompt';
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
import GlobalPreloader from './components/GlobalPreloader';
import { Loader, AlertTriangle } from 'lucide-react';
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

// Eagerly loaded dashboard component (frequently used)
import { DashboardRouter } from './dashboard/DashboardRouter';

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
  const isNative = isNativePlatform();

  // Dynamic Favicon Update
  useEffect(() => {
    // Try multiple possible keys coming from platform or header config
    const candidateKeys = [
      (settings as any)?.favicon_url,
      (settings as any)?.faviconUrl,
      (settings as any)?.favicon,
      (settings as any)?.faviconFile,
      (settings as any)?.favicon_file,
      (settings as any)?.favicon_file_id
    ];

    const faviconUrl = candidateKeys.find(Boolean) as string | undefined;

    if (!faviconUrl) {
      if (settingsLoading) return;
      const fallbackFavicon = `${window.location.origin}/favicon.ico`;
      const existing = document.querySelector("link[rel='icon']") as HTMLLinkElement | null;
      if (existing) {
        existing.href = fallbackFavicon;
      } else {
        const link = document.createElement('link');
        link.rel = 'icon';
        link.href = fallbackFavicon;
        document.head.appendChild(link);
      }
      return;
    }

    const updateLinks = (href: string, type?: string) => {
      // Determine whether the favicon is cross-origin so we only set
      // `crossOrigin` when necessary (avoids CORS failures for same-origin)
      const isCrossOrigin = (() => {
        try {
          const resolved = new URL(href, window.location.origin);
          return resolved.origin !== window.location.origin;
        } catch (e) {
          return false;
        }
      })();

      const selectors = ["link[rel*='icon']", "link[rel='shortcut icon']"];
      selectors.forEach(sel => {
        const existing = Array.from(document.querySelectorAll(sel));
        if (existing.length) {
          existing.forEach((el: Element) => {
            const link = el as HTMLLinkElement;
            link.href = href;
            if (type) link.type = type;
            if (isCrossOrigin) link.crossOrigin = 'anonymous'; else link.removeAttribute('crossorigin');
          });
        } else if (sel === "link[rel='shortcut icon']") {
          const l = document.createElement('link');
          l.rel = 'shortcut icon';
          l.href = href;
          if (type) l.type = type;
          if (isCrossOrigin) l.crossOrigin = 'anonymous';
          document.head.appendChild(l);
        }
      });
    };

    (async () => {
      try {
        const resolved = faviconUrl && (faviconUrl.startsWith('http://') || faviconUrl.startsWith('https://'))
          ? faviconUrl
          : new URL(faviconUrl, window.location.origin).toString();

        // Try to fetch to validate resource and determine content-type
        try {
          const resp = await fetch(resolved, { method: 'GET', cache: 'no-store' });
          if (resp.ok) {
            const contentType = resp.headers.get('content-type') || undefined;
            const isSvg = contentType?.includes('svg') || resolved.endsWith('.svg');
            const type = isSvg ? 'image/svg+xml' : contentType || undefined;
            updateLinks(resolved, type);
            console.log('✅ Favicon updated:', resolved, 'type=', type);
            return;
          }
          // Throw so we handle non-OK statuses in the catch below
          throw new Error(`HTTP ${resp.status}`);
        } catch (fetchErr: any) {
          // If the resource is a 404, prefer the inline SVG fallback instead of
          // applying a raw URL which will cause the browser to request a missing
          // file and spam the console with 404s. For other errors (403, network),
          // we still attempt to apply the raw URL which may be behind auth/proxy.
          const is404 = typeof fetchErr === 'string' ? fetchErr.includes('HTTP 404') : (fetchErr?.message || '').includes('HTTP 404') || fetchErr?.status === 404;
          if (!is404) {
            try {
              updateLinks(resolved);
              console.warn('Favicon fetch failed but applied raw URL:', fetchErr);
              return;
            } catch (e) {
              console.warn('Failed to apply raw favicon URL, will fallback to inline SVG', e);
            }
          } else {
            console.warn('Favicon returned 404; skipping raw URL and using inline fallback', fetchErr);
          }
        }
      } catch (e) {
        console.warn('Could not resolve favicon URL, using raw value:', faviconUrl, e);
      }

      // Final fallback: inline SVG data URL
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='%230D8ABC'/><text x='50' y='55' font-size='55' text-anchor='middle' fill='white' font-family='Arial,Helvetica,sans-serif'>G</text></svg>`;
      const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
      updateLinks(dataUrl, 'image/svg+xml');
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
    const listener = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) return;
      updateBiometricVerified(false);
      void promptBiometrics(`Unlock Scrolith with ${biometryLabel}`);
    });
    return () => {
      listener.remove();
    };
  }, [isNative, biometricEnabled, promptBiometrics, biometryLabel]);

  // Hide Navbar/Footer on Admin Dashboard for full screen feel
  const isAdminRoute = location.pathname.startsWith('/admin') || location.pathname.startsWith('/dev-docs');
  
  return (
    <div className="flex flex-col min-h-screen relative">
      <IntegrationsManager />
      <OfflineBanner />
      <PwaInstallPrompt />
      <AppDistributionPrompt />
      {!isAdminRoute && <Navbar />}
      <main className="flex-grow">
        <ErrorBoundary>
          <Suspense fallback={
            <div className="h-screen flex items-center justify-center bg-white">
              <div className="text-center">
                <Loader className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-4" />
                <p className="text-gray-500 font-medium">Loading Scrolith...</p>
              </div>
            </div>
          }>
            <Routes>
              <Route path="/" element={<Landing />} />
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
      {!isAdminRoute && <DynamicFooter />}
      <SupportWidget />
      {!isAdminRoute && <MarketingPopups />}
      {biometricEnabled && !biometricVerified && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/80 p-6">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-slate-900 p-3 text-white">
                <AlertTriangle className="h-5 w-5" />
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
            </ContentProvider>
          </PreloaderProvider>
        </SocketProvider>
      </UserProvider>
    </BrowserRouter>
  );
}

export default App;

