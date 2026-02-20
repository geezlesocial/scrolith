import React, { Suspense, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { DashboardLayout } from './shared/DashboardLayout';
import { UserRole } from '../types';

const FreelancerOverview = React.lazy(() =>
  import('./freelancer/Overview').then((module) => ({ default: module.Overview }))
);
const MyGigs = React.lazy(() => import('./freelancer/MyGigs'));
const Orders = React.lazy(() => import('./freelancer/Orders'));
const FreelancerContracts = React.lazy(() => import('./freelancer/Contracts'));
const MyProposals = React.lazy(() => import('./freelancer/MyProposals'));
const FreelancerUploadedFiles = React.lazy(() => import('./freelancer/UploadedFiles'));
const WalletModule = React.lazy(() => import('./freelancer/WalletModule'));

const EmployerOverview = React.lazy(() => import('./employer/Overview'));
const MyJobs = React.lazy(() => import('./employer/MyJobs'));
const ProposalsOffers = React.lazy(() =>
  import('./employer/ProposalsOffers').then((module) => ({ default: module.ProposalsOffers }))
);
const EmployerContracts = React.lazy(() => import('./employer/Contracts'));
const EmployerUploadedFiles = React.lazy(() => import('./employer/UploadedFiles'));
const EmployerFavorites = React.lazy(() => import('./employer/Favorites'));
const EmployerReviews = React.lazy(() => import('./employer/Reviews'));

const FreelancerReviews = React.lazy(() => import('./freelancer/Reviews'));
const FreelancerLikes = React.lazy(() => import('./freelancer/Likes'));
const MyAds = React.lazy(() => import('../pages/MyAds'));
const CommunityDashboard = React.lazy(() => import('./shared/CommunityDashboard'));
const SupportCenter = React.lazy(() => import('./shared/SupportCenter'));
const GcoinPanel = React.lazy(() => import('./shared/GcoinPanel'));
const MessagesPanel = React.lazy(() => import('./shared/MessagesPanel'));
const Favorites = React.lazy(() => import('../pages/Favorites'));
const KYCVerification = React.lazy(() =>
  import('./shared/KYCVerification').then((module) => ({ default: module.KYCVerification }))
);
const EditProfile = React.lazy(() => import('../profile/EditProfile'));
const SettingsModule = React.lazy(() => import('./shared/SettingsModule'));
const Membership = React.lazy(() => import('./shared/Membership'));
const ManagePagesModule = React.lazy(() => import('./shared/ManagePagesModule'));

const DashboardSectionLoader = () => (
  <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
    Loading dashboard module...
  </div>
);

export const DashboardRouter: React.FC = () => {
  const { user } = useUser();
  const [currentTab, setCurrentTab] = useState('overview');
  const location = useLocation();

  // Determine which role view to render: either the user's role or an override via `?as=freelancer|employer`
  const urlParams = new URLSearchParams(location.search);
  const asParam = (urlParams.get('as') || urlParams.get('view') || '').toString().toLowerCase();

  const effectiveRole = React.useMemo(() => {
    // If explicit override provided via query param, honor it
    if (asParam) {
      if (asParam.startsWith('f')) return UserRole.FREELANCER;
      if (asParam.startsWith('e') || asParam.startsWith('c')) return UserRole.EMPLOYER;
    }

    // If the current route indicates a dashboard type, prefer that view for admins
    const path = location.pathname || '';
    if (path.startsWith('/freelancer')) return UserRole.FREELANCER;
    if (path.startsWith('/client')) return UserRole.EMPLOYER;

    // Default to the user's role or guest
    return (user?.role as UserRole) || UserRole.GUEST;
  }, [asParam, user, location.pathname]);

  useEffect(() => {
    const handleNavigation = (event: CustomEvent) => {
      setCurrentTab(event.detail.tab);
    };

    // Listen for navigation events from the sidebar
    window.addEventListener('dashboard-navigation', handleNavigation as EventListener);

    return () => {
      window.removeEventListener('dashboard-navigation', handleNavigation as EventListener);
    };
  }, []);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const tab = searchParams.get('tab') || 'overview';
    setCurrentTab(tab);
  }, [location.search]);

  if (!user) return null;

  const renderContent = () => {
    if (effectiveRole === UserRole.FREELANCER) {
      switch (currentTab) {
        case 'overview':
          return <FreelancerOverview />;
        case 'community':
          return <CommunityDashboard />;
        case 'manage-pages':
          return <ManagePagesModule />;
        case 'my-gigs':
          return <MyGigs />;
        case 'my-ads':
          return <MyAds />;
        case 'orders':
          return <Orders />;
        case 'contracts':
          return <FreelancerContracts />;
        case 'my-proposals':
          return <MyProposals />;
        case 'wallet':
          return <WalletModule />;
        case 'membership':
          return <Membership />;
        case 'profile':
          return <EditProfile isEmbedded={true} />;
        case 'settings':
          return <SettingsModule />;
        case 'gcoin':
          return <GcoinPanel />;
        case 'messages':
          return <MessagesPanel />;
        case 'support':
          return <SupportCenter />;
        case 'uploaded-files':
          return <FreelancerUploadedFiles />;
        case 'favorites':
          return <Favorites />;
        case 'reviews':
          return <FreelancerReviews />;
        case 'likes':
          return <FreelancerLikes />;
        case 'kyc':
          return <KYCVerification />;
        default:
          return <FreelancerOverview />;
      }
    } else if (effectiveRole === UserRole.EMPLOYER) {
      switch (currentTab) {
        case 'overview':
          return <EmployerOverview />;
        case 'community':
          return <CommunityDashboard />;
        case 'manage-pages':
          return <ManagePagesModule />;
        case 'my-ads':
          return <MyAds />;
        case 'my-jobs':
          return <MyJobs />;
        case 'proposals-offers':
          return <ProposalsOffers />;
        case 'contracts':
          return <EmployerContracts />;
        case 'wallet':
          return <WalletModule />;
        case 'membership':
          return <Membership />;
        case 'profile':
          return <EditProfile isEmbedded={true} />;
        case 'settings':
          return <SettingsModule />;
        case 'gcoin':
          return <GcoinPanel />;
        case 'messages':
          return <MessagesPanel />;
        case 'support':
          return <SupportCenter />;
        case 'uploaded-files':
          return <EmployerUploadedFiles />;
        case 'favorites':
          return <EmployerFavorites />;
        case 'reviews':
          return <EmployerReviews />;
        case 'kyc':
          return <KYCVerification />;
        default:
          return <EmployerOverview />;
      }
    }

    return <div>Invalid role</div>;
  };

  return (
    <DashboardLayout>
      {effectiveRole !== user.role && (
        <div className="mb-4 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
          <span className="break-words">
            Viewing dashboard as <strong className="capitalize">{effectiveRole}</strong>. Use the{' '}
            <code className="break-all rounded bg-yellow-100 px-1 py-0.5">?as=freelancer</code> or{' '}
            <code className="break-all rounded bg-yellow-100 px-1 py-0.5">?as=employer</code> query to toggle views, or switch roles in your profile.
          </span>
        </div>
      )}
      <Suspense fallback={<DashboardSectionLoader />}>{renderContent()}</Suspense>
    </DashboardLayout>
  );
};
