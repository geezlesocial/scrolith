import React, { useEffect, useState } from 'react';
import { useUser } from '../context/UserContext';
import { DashboardLayout } from './shared/DashboardLayout';
import { RealtimeProvider } from './shared/RealtimeProvider';

// Import all dashboard components
import { Overview as FreelancerOverview, MyGigs, Orders, UploadedFiles as FreelancerUploadedFiles } from './freelancer';
import { Overview as EmployerOverview, MyJobs, UploadedFiles as EmployerUploadedFiles } from './employer';

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
    if (user.role === 'freelancer') {
      switch (currentTab) {
        case 'overview':
          return <FreelancerOverview />;
        case 'my-gigs':
          return <MyGigs />;
        case 'orders':
          return <Orders />;
        case 'uploaded-files':
          return <FreelancerUploadedFiles />;
        default:
          return <FreelancerOverview />;
      }
    } else if (user.role === 'employer' || user.role === 'client') {
      switch (currentTab) {
        case 'overview':
          return <EmployerOverview />;
        case 'my-jobs':
          return <MyJobs />;
        case 'uploaded-files':
          return <EmployerUploadedFiles />;
        default:
          return <EmployerOverview />;
      }
    }

    return <div>Invalid role</div>;
  };

  return (
    <RealtimeProvider>
      <DashboardLayout>
        {renderContent()}
      </DashboardLayout>
    </RealtimeProvider>
  );
};