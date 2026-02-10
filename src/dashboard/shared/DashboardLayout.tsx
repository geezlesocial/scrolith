import React, { useState } from 'react';
import { useUser } from '../../context/UserContext';
import { useNavigate, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children }) => {
  const { user } = useUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!user) return null;

  const isFreelancer = user.role === 'freelancer';

  const navigationItems = isFreelancer ? [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'my-gigs', label: 'My Gigs', icon: '🎯' },
    { id: 'orders', label: 'Orders', icon: '📦' },
    { id: 'wallet', label: 'Earnings & Wallet', icon: '💰' },
    { id: 'withdrawals', label: 'Withdrawals', icon: '💸' },
    { id: 'messages', label: 'Messages', icon: '💬' },
    { id: 'notifications', label: 'Notifications', icon: '🔔' },
    { id: 'profile', label: 'Profile', icon: '👤' },
    { id: 'kyc', label: 'KYC Verification', icon: '🛡️' },
    { id: 'hourly-work', label: 'Hourly Work', icon: '⏰' },
    { id: 'uploaded-files', label: 'Uploaded Files', icon: '📁' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ] : [
    { id: 'overview', label: 'Overview', icon: '📊' },
    { id: 'my-jobs', label: 'My Jobs', icon: '💼' },
    { id: 'proposals-offers', label: 'Proposals & Offers', icon: '📝' },
    { id: 'contracts', label: 'Contracts', icon: '📄' },
    { id: 'escrow', label: 'Payments & Escrow', icon: '💳' },
    { id: 'messages', label: 'Messages', icon: '💬' },
    { id: 'notifications', label: 'Notifications', icon: '🔔' },
    { id: 'favorites', label: 'Favorites', icon: '❤️' },
    { id: 'project-briefs', label: 'Project Briefs', icon: '💡' },
    { id: 'uploaded-files', label: 'Uploaded Files', icon: '📁' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  const getCurrentTab = () => {
    const searchParams = new URLSearchParams(window.location.search);
    return searchParams.get('tab') || 'overview';
  };

  const handleNavigation = (tabId: string) => {
    const basePath = `/${user.role}/dashboard`;
    const newUrl = `${basePath}?tab=${tabId}`;
    window.history.pushState({}, '', newUrl);

    // Trigger a custom event that components can listen to
    window.dispatchEvent(new CustomEvent('dashboard-navigation', { detail: { tab: tabId } }));
    setSidebarOpen(false);
  };

  const currentTab = getCurrentTab();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        >
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75" />
        </div>
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {/* Logo */}
        <div className="flex items-center justify-center h-16 px-4 bg-indigo-600">
          <h1 className="text-xl font-bold text-white">SCROLITH</h1>
        </div>

        {/* Navigation */}
        <nav className="mt-8">
          <div className="space-y-1 px-2">
            {navigationItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleNavigation(item.id)}
                className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  currentTab === item.id
                    ? 'bg-indigo-100 text-indigo-700 border-r-2 border-indigo-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <span className="mr-3">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </nav>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-md text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            >
              <Menu className="w-6 h-6" />
            </button>

            <div className="flex-1 lg:flex-initial">
              <h2 className="text-lg font-semibold text-gray-900 capitalize">
                {isFreelancer ? 'Freelancer' : 'Employer'} Dashboard
              </h2>
            </div>

            <div className="flex items-center space-x-4">
              {/* User menu placeholder */}
              <div className="text-sm text-gray-700">
                Welcome, {user.firstName || user.email}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="py-6">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};