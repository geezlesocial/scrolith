import React, { Suspense, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { DashboardLayout } from './shared/DashboardLayout';
import type { UserRole } from '../types';
import { USER_ROLES } from '../utils/userRoles';
import { Overview as FreelancerOverview } from './freelancer/Overview';
import MyGigs from './freelancer/MyGigs';
import Orders from './freelancer/Orders';
import FreelancerContracts from './freelancer/Contracts';
import MyProposals from './freelancer/MyProposals';
import FreelancerUploadedFiles from './freelancer/UploadedFiles';
import WalletModule from './freelancer/WalletModule';
import EmployerOverview from './employer/Overview';
import MyJobs from './employer/MyJobs';
import ProposalsOffers from './employer/ProposalsOffers';
import ProjectBriefs from './employer/ProjectBriefs';
import EmployerContracts from './employer/Contracts';
import EmployerUploadedFiles from './employer/UploadedFiles';
import EmployerFavorites from './employer/Favorites';
import EmployerReviews from './employer/Reviews';
import FreelancerReviews from './freelancer/Reviews';
import FreelancerLikes from './freelancer/Likes';
import MyAds from '../pages/MyAds';
import CommunityDashboard from './shared/CommunityDashboard';
import SupportCenter from './shared/SupportCenter';
import GcoinPanel from './shared/GcoinPanel';
import MessagesPanel from './shared/MessagesPanel';
import Favorites from '../pages/Favorites';
import KYCVerification from './shared/KYCVerification';
import EditProfile from '../profile/EditProfile';
import SettingsModule from './shared/SettingsModule';
import Membership from './shared/Membership';
import ManagePagesModule from './shared/ManagePagesModule';
import AffiliateDashboardModule from './shared/AffiliateDashboardModule';

const DashboardSectionLoader = () => (
  <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
    Loading dashboard module...
  </div>
);

const getDashboardTabFromPath = (pathname: string): string | null => {
  const parts = String(pathname || '')
    .split('/')
    .filter(Boolean)
    .map((part) => part.toLowerCase());
  const dashboardIndex = parts.lastIndexOf('dashboard');
  if (dashboardIndex < 0) return null;
  const tabCandidate = parts[dashboardIndex + 1];
  return tabCandidate || null;
};

const normalizeDashboardTab = (value: string, role: UserRole): string => {
  const tab = String(value || 'overview').toLowerCase().trim();
  if (!tab) return 'overview';

  const commonMap: Record<string, string> = {
    contract: 'contracts',
    contracts: 'contracts',
    wallets: 'wallet',
    billing: 'wallet',
    withdrawal: 'wallet',
    withdrawals: 'wallet',
    message: 'messages',
    messages: 'messages',
    notification: 'messages',
    notifications: 'messages',
    inbox: 'messages',
    kycverification: 'kyc',
    'kyc-verification': 'kyc',
    uploadedfiles: 'uploaded-files',
    uploaded_files: 'uploaded-files',
    affiliate: 'affiliate-program',
    affiliates: 'affiliate-program',
    referral: 'affiliate-program',
    referrals: 'affiliate-program'
  };

  if (commonMap[tab]) return commonMap[tab];

  if (role === USER_ROLES.EMPLOYER) {
    const employerMap: Record<string, string> = {
      jobs: 'my-jobs',
      job: 'my-jobs',
      'my-jobs': 'my-jobs',
      order: 'orders',
      orders: 'orders',
      proposals: 'proposals-offers',
      proposal: 'proposals-offers',
      offers: 'proposals-offers',
      'proposals-offers': 'proposals-offers',
      briefs: 'project-briefs',
      brief: 'project-briefs',
      projectbriefs: 'project-briefs',
      'project-briefs': 'project-briefs'
    };
    return employerMap[tab] || tab;
  }

  if (role === USER_ROLES.FREELANCER) {
    const freelancerMap: Record<string, string> = {
      gigs: 'my-gigs',
      gig: 'my-gigs',
      'my-gigs': 'my-gigs',
      proposals: 'my-proposals',
      proposal: 'my-proposals',
      'my-proposals': 'my-proposals'
    };
    return freelancerMap[tab] || tab;
  }

  return tab;
};

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
      if (asParam.startsWith('f')) return USER_ROLES.FREELANCER;
      if (asParam.startsWith('e') || asParam.startsWith('c')) return USER_ROLES.EMPLOYER;
    }

    // If the current route indicates a dashboard type, prefer that view for admins
    const path = location.pathname || '';
    if (path.startsWith('/freelancer')) return USER_ROLES.FREELANCER;
    if (path.startsWith('/client')) return USER_ROLES.EMPLOYER;

    // Default to the user's role or guest
    return (user?.role as UserRole) || USER_ROLES.GUEST;
  }, [asParam, user, location.pathname]);

  useEffect(() => {
    const handleNavigation = (event: CustomEvent) => {
      setCurrentTab(normalizeDashboardTab(event.detail.tab, effectiveRole));
    };

    // Listen for navigation events from the sidebar
    window.addEventListener('dashboard-navigation', handleNavigation as EventListener);

    return () => {
      window.removeEventListener('dashboard-navigation', handleNavigation as EventListener);
    };
  }, [effectiveRole]);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const searchTab = searchParams.get('tab');
    const pathTab = getDashboardTabFromPath(location.pathname);
    const tab = normalizeDashboardTab(searchTab || pathTab || 'overview', effectiveRole);
    setCurrentTab(tab);
  }, [location.search, location.pathname, effectiveRole]);

  if (!user) return null;

  const renderContent = () => {
    if (effectiveRole === USER_ROLES.FREELANCER) {
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
          return <Orders viewerRole="freelancer" />;
        case 'contracts':
          return <FreelancerContracts />;
        case 'my-proposals':
          return <MyProposals />;
        case 'wallet':
          return <WalletModule />;
        case 'membership':
          return <Membership />;
        case 'affiliate-program':
          return <AffiliateDashboardModule />;
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
    } else if (effectiveRole === USER_ROLES.EMPLOYER) {
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
        case 'project-briefs':
          return <ProjectBriefs />;
        case 'contracts':
          return <EmployerContracts />;
        case 'orders':
          return <Orders viewerRole="employer" />;
        case 'wallet':
          return <WalletModule />;
        case 'membership':
          return <Membership />;
        case 'affiliate-program':
          return <AffiliateDashboardModule />;
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
