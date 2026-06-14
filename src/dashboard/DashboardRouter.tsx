import React, { Suspense, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { useContent } from '../context/ContentContext';
import { DashboardLayout } from './shared/DashboardLayout';
import type { UserRole } from '../types';
import { USER_ROLES } from '../utils/userRoles';

const FreelancerOverview = React.lazy(() => import('./freelancer/Overview'));
const MyGigs = React.lazy(() => import('./freelancer/MyGigs'));
const Orders = React.lazy(() => import('./freelancer/Orders'));
const FreelancerContracts = React.lazy(() => import('./freelancer/Contracts'));
const MyProposals = React.lazy(() => import('./freelancer/MyProposals'));
const FreelancerUploadedFiles = React.lazy(() => import('./freelancer/UploadedFiles'));
const WalletModule = React.lazy(() => import('./freelancer/WalletModule'));
const EmployerOverview = React.lazy(() => import('./employer/Overview'));
const MyJobs = React.lazy(() => import('./employer/MyJobs'));
const ProposalsOffers = React.lazy(() => import('./employer/ProposalsOffers'));
const ProjectBriefs = React.lazy(() => import('./employer/ProjectBriefs'));
const EmployerContracts = React.lazy(() => import('./employer/Contracts'));
const EmployerUploadedFiles = React.lazy(() => import('./employer/UploadedFiles'));
const EmployerFavorites = React.lazy(() => import('./employer/Favorites'));
const EmployerReviews = React.lazy(() => import('./employer/Reviews'));
const FreelancerReviews = React.lazy(() => import('./freelancer/Reviews'));
const FreelancerLikes = React.lazy(() => import('./freelancer/Likes'));
const SupportCenter = React.lazy(() => import('./shared/SupportCenter'));
const GcoinPanel = React.lazy(() => import('./shared/GcoinPanel'));
const MessagesPanel = React.lazy(() => import('./shared/MessagesPanel'));
const MarketplacePage = React.lazy(() => import('../pages/marketplace/MarketplacePage'));
const Favorites = React.lazy(() => import('../pages/Favorites'));
const KYCVerification = React.lazy(() => import('./shared/KYCVerification'));
const SettingsModule = React.lazy(() => import('./shared/SettingsModule'));
const Membership = React.lazy(() => import('./shared/Membership'));
const ManagePagesModule = React.lazy(() => import('./shared/ManagePagesModule'));
const AffiliateDashboardModule = React.lazy(() => import('./shared/AffiliateDashboardModule'));
const MyAds = React.lazy(() => import('../pages/MyAds'));
const CommunityDashboard = React.lazy(() => import('./shared/CommunityDashboard'));
const EditProfile = React.lazy(() => import('../profile/EditProfile'));
const ResumeBuilder = React.lazy(() => import('../pages/freelancer/ResumeBuilder'));
const ResumeReviewer = React.lazy(() => import('../pages/client/ResumeReviewer'));

const DashboardSectionLoader = () => (
  <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
    Loading dashboard module...
  </div>
);

const ResumeModuleDisabled = ({ title, description }: { title: string; description: string }) => (
  <div className="rounded-[8px] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
    <p className="font-semibold text-amber-950">{title}</p>
    <p className="mt-2 leading-6">{description}</p>
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
    referrals: 'affiliate-program',
    marketplace: 'marketplace'
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
      'project-briefs': 'project-briefs',
      'resume-builder': 'resume-reviewer',
      resume: 'resume-reviewer',
      resumes: 'resume-reviewer',
      cv: 'resume-reviewer',
      cvs: 'resume-reviewer',
      reviewer: 'resume-reviewer',
      'resume-reviewer': 'resume-reviewer'
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
      'my-proposals': 'my-proposals',
      'resume-builder': 'resume-builder',
      resume: 'resume-builder',
      resumes: 'resume-builder',
      cv: 'resume-builder',
      cvs: 'resume-builder'
    };
    return freelancerMap[tab] || tab;
  }

  return tab;
};

export const DashboardRouter: React.FC = () => {
  const { user } = useUser();
  const { settings } = useContent();
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

  const resumeAiPolicy = React.useMemo(() => {
    const source = (settings?.system as any)?.resumeAi ?? (settings?.system as any)?.resume_ai ?? {};
    return {
      enabled: source.enabled !== false && source.resume_enabled !== false,
      builderEnabled: source.builderEnabled !== false && source.builder_enabled !== false,
      reviewerEnabled: source.reviewerEnabled !== false && source.reviewer_enabled !== false,
      adminAccessEnabled: source.adminAccessEnabled !== false && source.admin_access_enabled !== false
    };
  }, [settings]);

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
        case 'resume-builder':
          return resumeAiPolicy.enabled && resumeAiPolicy.builderEnabled
            ? <ResumeBuilder />
            : <ResumeModuleDisabled
                title="Resume/CV Builder is disabled"
                description="An administrator has temporarily disabled the resume builder. You can still browse the rest of your dashboard."
              />;
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
        case 'marketplace':
          return <MarketplacePage variant="dashboard" />;
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
        case 'resume-reviewer':
          return resumeAiPolicy.enabled && resumeAiPolicy.reviewerEnabled
            ? <ResumeReviewer />
            : <ResumeModuleDisabled
                title="Resume/CV Reviewer is disabled"
                description="An administrator has temporarily disabled the resume reviewer. You can still browse the rest of your dashboard."
              />;
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
        case 'marketplace':
          return <MarketplacePage variant="dashboard" />;
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
