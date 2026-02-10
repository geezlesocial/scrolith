
import React, { useEffect, Suspense } from 'react';
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
import { Loader } from 'lucide-react';

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

// Inner App component to use hooks
const AppContent = () => {
  const { user, logout } = useUser();
  const { settings } = useContent();
  const location = useLocation();

  // Dynamic Favicon Update
  useEffect(() => {
    if (settings?.faviconUrl) {
      let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement;
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.getElementsByTagName('head')[0].appendChild(link);
      }
      link.href = settings.faviconUrl;
    }
  }, [settings?.faviconUrl]);

  // Hide Navbar/Footer on Admin Dashboard for full screen feel
  const isAdminRoute = location.pathname.startsWith('/admin') || location.pathname.startsWith('/dev-docs');
  
  return (
    <div className="flex flex-col min-h-screen relative">
      {!isAdminRoute && <Navbar />}
      <main className="flex-grow">
        <Suspense fallback={<div className="h-screen flex items-center justify-center"><Loader className="w-8 h-8 animate-spin text-blue-600" /></div>}>
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
            <Route path="/u/:username" element={<FreelancerProfile />} />
            <Route path="/community/u/:username" element={<FreelancerProfile />} />
            <Route path="/profile/edit" element={
              <ProtectedRoute>
                <EditProfile />
              </ProtectedRoute>
            } />

            {/* Protected Common Routes */}
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
              path="/admin/*" 
              element={
                <ProtectedRoute allowedRoles={[UserRole.ADMIN]}>
                  <AdminDashboard />
                </ProtectedRoute>
              } 
            />
            
            {/* Freelancer Routes */}
            <Route 
              path="/freelancer/dashboard" 
              element={
                  <ProtectedRoute allowedRoles={[UserRole.FREELANCER]}>
                    <FreelancerDashboard />
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
              path="/client/dashboard" 
              element={
                  <ProtectedRoute allowedRoles={[UserRole.EMPLOYER]}>
                    <ClientDashboard />
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
      </main>
      {!isAdminRoute && <DynamicFooter />}
      <SupportWidget />
    </div>
  );
};



function App() {
  return (
    <UserProvider>
      <ContentProvider>
        <NotificationProvider>
          <CurrencyProvider>
            {/* Socket Provider must be INSIDE NotificationProvider and UserProvider as it consumes them */}
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

// Add this component definition at the bottom of App.tsx (before the export)
interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

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
    // Redirect unauthorized users to appropriate dashboard
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
  
  return <>{children}</>;
};

export default App;
