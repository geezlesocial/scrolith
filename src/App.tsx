import React, { useEffect, Suspense } from 'react';
import { 
  BrowserRouter, 
  Routes, 
  Route, 
  Navigate, 
  useLocation
} from 'react-router-dom';
import Navbar from './components/Navbar';
import DynamicFooter from './components/DynamicFooter';
import SupportWidget from './components/SupportWidget';
import { UserRole } from './types';
import { CurrencyProvider } from './context/CurrencyContext';
import { ContentProvider, useContent } from './context/ContentContext';
import { NotificationProvider } from './context/NotificationContext';
import { FavoritesProvider } from './context/FavoritesContext';
import { MessageProvider } from './context/MessageContext';
import { UserProvider, useUser } from './context/UserContext';
import { SocketProvider } from './context/SocketContext';
import { Loader, AlertTriangle } from 'lucide-react';

// Eagerly loaded dashboard component (frequently used)
import { DashboardRouter } from './dashboard/DashboardRouter';

// Lazy Loaded Components
const Landing = React.lazy(() => import('./main/Landing'));
const Login = React.lazy(() => import('./auth/Login'));
const Signup = React.lazy(() => import('./auth/Signup'));
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
const EditProfile = React.lazy(() => import('./profile/EditProfile'));
const DeveloperDocs = React.lazy(() => import('./dashboard/DeveloperDocs'));
const GigDetail = React.lazy(() => import('./main/GigDetail'));
const JobDetail = React.lazy(() => import('./main/JobDetail'));
const Blog = React.lazy(() => import('./pages/Blog'));
const BlogPost = React.lazy(() => import('./pages/BlogPost'));
const StaticPage = React.lazy(() => import('./pages/StaticPage'));
const Support = React.lazy(() => import('./pages/Support'));
const AffiliateProgram = React.lazy(() => import('./pages/AffiliateProgram'));
const Favorites = React.lazy(() => import('./pages/Favorites'));
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

// Error Boundary Component
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-gray-50 text-center p-4">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900">Something went wrong.</h2>
          <p className="text-gray-600 mb-4">We encountered an unexpected error displaying this page.</p>
          <button onClick={() => window.location.reload()} className="bg-blue-600 text-white px-4 py-2 rounded-lg">
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Inner App component to use hooks
const AppContent = () => {
  const { user } = useUser();
  const { settings } = useContent();
  const location = useLocation();
  const themeKey = 'geezle.pref.theme';

  // Dynamic Favicon Update
  useEffect(() => {
    const faviconUrl = settings?.favicon_url || settings?.faviconUrl;
    if (faviconUrl) {
      let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      link.href = faviconUrl;
      console.log('✅ Favicon updated:', faviconUrl);
    } else {
      console.warn('⚠️ No favicon URL in settings');
    }
  }, [settings?.favicon_url, settings?.faviconUrl]);

  useEffect(() => {
    const storedTheme = localStorage.getItem(themeKey);
    if (storedTheme === 'dark' || storedTheme === 'light') {
      document.documentElement.dataset.theme = storedTheme;
    }
  }, []);

  // Hide Navbar/Footer on Admin Dashboard for full screen feel
  const isAdminRoute = location.pathname.startsWith('/admin') || location.pathname.startsWith('/dev-docs');
  
  return (
    <div className="flex flex-col min-h-screen relative">
      {!isAdminRoute && <Navbar />}
      <main className="flex-grow">
        <ErrorBoundary>
          <Suspense fallback={
            <div className="h-screen flex items-center justify-center bg-white">
              <div className="text-center">
                <Loader className="w-10 h-10 animate-spin text-blue-600 mx-auto mb-4" />
                <p className="text-gray-500 font-medium">Loading Geezle...</p>
              </div>
            </div>
          }>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/auth/login" element={<Login />} />
              <Route path="/auth/signup" element={<Signup />} />
              
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
              <Route path="/p/:slug" element={<StaticPage />} />
              
              {/* Support Page */}
              <Route path="/support" element={<Support />} />
              
              {/* Affiliate Program */}
              <Route path="/affiliate-program" element={<AffiliateProgram />} />
              
              {/* Community Platform Routes */}
              <Route path="/community" element={<CommunityLayout />}>
                  <Route index element={<CommunityHome />} />
                  <Route path="forum" element={<Forum />} />
                  <Route path="thread/:id" element={<ThreadDetail />} />
                  <Route path="chat" element={<Chat />} />
                  <Route path="clubs" element={<Clubs />} />
                  <Route path="events" element={<Events />} />
                  <Route path="leaderboard" element={<Leaderboard />} />
                  <Route path="content" element={<div className="p-12 text-center text-gray-500">Knowledge Hub Coming Soon</div>} />
              </Route>
              
              {/* Profiles */}
              <Route path="/profile/:id" element={<FreelancerProfile />} />
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

              {/* Admin Routes */}
              <Route 
                path="/admin/dashboard" 
                element={
                  <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                    <AdminDashboard />
                  </ProtectedRoute>
                } 
              />
              
              {/* Freelancer Routes */}
              <Route
                path="/freelancer/dashboard/*"
                element={
                    <ProtectedRoute allowedRoles={[UserRole.FREELANCER]}>
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
                      <ProtectedRoute allowedRoles={[UserRole.EMPLOYER]}>
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
    </div>
  );
};

// ============ SINGLE ProtectedRoute Definition ============
interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

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
  if (allowedRoles && !allowedRoles.includes(user.role as UserRole)) {
    // Only redirect if the current path is NOT the homepage
    if (location.pathname !== '/') {
      switch (user.role) {
        case UserRole.ADMIN:
          return <Navigate to="/admin/dashboard" replace />;
        case UserRole.FREELANCER:
          return <Navigate to="/freelancer/dashboard" replace />;
        case UserRole.EMPLOYER:
          return <Navigate to="/client/dashboard" replace />;
        default:
          return <Navigate to="/" replace />;
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
          <ContentProvider>
            <NotificationProvider>
              <CurrencyProvider>
                <FavoritesProvider>
                  <MessageProvider>
                    <AppContent />
                  </MessageProvider>
                </FavoritesProvider>
              </CurrencyProvider>
            </NotificationProvider>
          </ContentProvider>
        </SocketProvider>
      </UserProvider>
    </BrowserRouter>
  );
}

export default App;
