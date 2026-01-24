import React, { useEffect, useState } from 'react';
import { useUser } from '../context/UserContext';
import { DashboardLayout } from './shared/DashboardLayout';
import { UserRole } from '../types';

// Import all dashboard components
import { Overview as FreelancerOverview, MyGigs, Orders, Contracts as FreelancerContracts, MyProposals, UploadedFiles as FreelancerUploadedFiles, WalletModule } from './freelancer';
import { Overview as EmployerOverview, MyJobs, ProposalsOffers, Contracts as EmployerContracts, UploadedFiles as EmployerUploadedFiles } from './employer';
import FreelancerReviews from './freelancer/Reviews';
import FreelancerLikes from './freelancer/Likes';
import EmployerFavorites from './employer/Favorites';
import EmployerReviews from './employer/Reviews';
import SupportCenter from './shared/SupportCenter';
import GcoinPanel from './shared/GcoinPanel';
import MessagesPanel from './shared/MessagesPanel';
import Favorites from '../pages/Favorites';
import { KYCVerification } from './shared';

export const DashboardRouter: React.FC = () => {
  const { user } = useUser();
  const [currentTab, setCurrentTab] = useState('overview');

  useEffect(() => {
    const handleNavigation = (event: CustomEvent) => {
      setCurrentTab(event.detail.tab);
    };

    // Listen for navigation events from the sidebar
    window.addEventListener('dashboard-navigation', handleNavigation as EventListener);

    // Set initial tab from URL
    const searchParams = new URLSearchParams(window.location.search);
    const tab = searchParams.get('tab') || 'overview';
    setCurrentTab(tab);

    return () => {
      window.removeEventListener('dashboard-navigation', handleNavigation as EventListener);
    };
  }, []);

  if (!user) return null;

  const renderContent = () => {
    if (user.role === UserRole.FREELANCER) {
      switch (currentTab) {
        case 'overview':
          return <FreelancerOverview />;
        case 'my-gigs':
          return <MyGigs />;
        case 'orders':
          return <Orders />;
        case 'contracts':
          return <FreelancerContracts />;
        case 'my-proposals':
          return <MyProposals />;
        case 'wallet':
          return <WalletModule />;
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
    } else if (user.role === UserRole.EMPLOYER) {
      switch (currentTab) {
        case 'overview':
          return <EmployerOverview />;
        case 'my-jobs':
          return <MyJobs />;
        case 'proposals-offers':
          return <ProposalsOffers />;
        case 'contracts':
          return <EmployerContracts />;
        case 'wallet':
          return <WalletModule />;
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
      {renderContent()}
    </DashboardLayout>
  );
};
