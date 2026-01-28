import React, { Component, useEffect, Suspense, ReactNode } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
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

// Lazy Loaded Components
const Landing = React.lazy(() => import('./main/Landing'));
const Login = React.lazy(() => import('./auth/Login'));
const Signup = React.lazy(() => import('./auth/Signup'));
const BrowseTalent = React.lazy(() => import('./main/BrowseTalent'));
const BrowseJobs = React.lazy(() => import('./main/BrowseJobs'));
const SearchResults = React.lazy(() => import('./pages/SearchResults'));
const AdminDashboard = React.lazy(() => import('./dashboard/AdminDashboard'));
const FreelancerDashboard = React.lazy(() => import('./dashboard/FreelancerDashboard'));
const ClientDashboard = React.lazy(() => import('./dashboard/ClientDashboard'));
const CreateJob = React.lazy(() => import('./create-job-post/CreateJob'));
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

// Community Components
const CommunityLayout = React.lazy(() => import('./community/CommunityLayout'));
const CommunityHome = React.lazy(() => import('./community/CommunityHome'));
const Forum = React.lazy(() => import('./community/Forum'));
const ThreadDetail = React.lazy(() => import('./community/ThreadDetail'));
const Clubs = React.lazy(() => import('./community/Clubs'));
const Events = React.lazy(() => import('./community/Events'));
const Chat = React.lazy(() => import('./community/Chat'));
const Leaderboard = React.lazy(() => import('./community/Leaderboard'));

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: any): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-gray-50 text-center p-4">
          <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-gray-900">Something went wrong.</h2>
          <p className="text-gray-600 mb-4">We encountered an unexpected error.</p>
          <button onClick={() => window.location.reload()} className="bg-blue-600 text-white px-4 py-2 rounded-lg">
            Reload Page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const AppContent = () => {
  const { user } = useUser();
  const { settings } = useContent();
  const location = useLocation();

  useEffect(() => {
    if (settings?.faviconUrl) {
      let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
      }
      // Append a cache-busting query param so browsers pick up updated favicons
      try {
        const url = String(settings.faviconUrl || '');
        const separator = url.includes('?') ? '&' : '?';
        const cacheBusted = `${url}${separator}v=${Date.now()}`;
        link.href = cacheBusted;
      } catch (e) {
        link.href = settings.faviconUrl as string;
      }
    }
  }, [settings?.faviconUrl]);

  const isAdminRoute = location.pathname.startsWith('/admin') || location.pathname.startsWith('/dev-docs');
  
  return (
    <div className="flex flex-col min-h-screen relative">
      {!isAdminRoute && <Navbar />}
      <main className="flex-grow">
        <ErrorBoundary>
          <Suspense fallback={
            <div className="h-screen flex items-center justify-center bg-white">
              <Loader className="w-8 h-8 animate-spin text-blue-600" />
            </div>
          }>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/auth/login" element={<Login />} />
              <Route path="/auth/signup" element={<Signup />} />
              <Route path="/browse" element={<BrowseTalent />} />
              <Route path="/browse-jobs" element={<BrowseJobs />} />
              <Route path="/search" element={<SearchResults />} />
              <Route path="/gigs/:id" element={<GigDetail />} />
              <Route path="/jobs/:id" element={<JobDetail />} />
              <Route path="/blog" element={<Blog />} />
              <Route path="/blog/:slug" element={<BlogPost />} />
              <Route path="/p/:slug" element={<StaticPage />} />
              <Route path="/support" element={<Support />} />
              <Route path="/affiliate-program" element={<AffiliateProgram />} />
              
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
              
              <Route path="/profile/:id" element={<FreelancerProfile />} />
              <Route path="/profile/edit" element={<ProtectedRoute><EditProfile /></ProtectedRoute>} />
              <Route path="/kyc" element={<ProtectedRoute><KYCVerification /></ProtectedRoute>} />
              <Route path="/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
              <Route path="/messages/:conversationId" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
              <Route path="/favorites" element={<ProtectedRoute><Favorites /></ProtectedRoute>} />

              <Route path="/admin/*" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]}><AdminDashboard /></ProtectedRoute>} />
              <Route path="/freelancer/dashboard" element={<ProtectedRoute allowedRoles={[UserRole.FREELANCER]}><FreelancerDashboard /></ProtectedRoute>} />
              <Route path="/create-gig" element={<ProtectedRoute allowedRoles={[UserRole.FREELANCER]}><CreateGig /></ProtectedRoute>} />
              <Route path="/client/dashboard" element={<ProtectedRoute allowedRoles={[UserRole.EMPLOYER]}><ClientDashboard /></ProtectedRoute>} />
              <Route path="/create-job" element={<ProtectedRoute allowedRoles={[UserRole.EMPLOYER]}><CreateJob /></ProtectedRoute>} />
              <Route path="/dev-docs" element={<ProtectedRoute allowedRoles={[UserRole.ADMIN]}><DeveloperDocs /></ProtectedRoute>} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      {!isAdminRoute && <DynamicFooter />}
      <SupportWidget />
    </div>
  );
};

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { user, isAuthenticated, isLoading } = useUser();
  if (isLoading) return <div className="h-screen flex items-center justify-center"><Loader className="w-8 h-8 animate-spin text-blue-600" /></div>;
  if (!isAuthenticated || !user) return <Navigate to="/auth/login" />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/" />;
  return <>{children}</>;
};

function App() {
  return (
    <UserProvider>
      <ContentProvider>
        <NotificationProvider>
          <CurrencyProvider>
            <SocketProvider>
              <FavoritesProvider>
                <MessageProvider>
                  <AppContent />
                </MessageProvider>
              </FavoritesProvider>
            </SocketProvider>
          </CurrencyProvider>
        </NotificationProvider>
      </ContentProvider>
    </UserProvider>
  );
}

export default App;