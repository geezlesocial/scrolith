import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUser } from '../../context/UserContext';
import { UserRole } from '../../types';
import { useMessages } from '../../context/MessageContext';
import { SupportService } from '../../services/support';

interface SidebarItemProps {
  tab: string;
  label: string;
  isActive: boolean;
  badgeCount?: number;
  onClick: (tab: string) => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ tab, label, isActive, badgeCount, onClick }) => {
  return (
    <li>
      <button
        onClick={() => onClick(tab)}
        className={`w-full text-left px-3 py-2 rounded-md transition-colors ${
          isActive
            ? 'bg-indigo-100 text-indigo-700 font-semibold'
            : 'text-gray-700 hover:bg-gray-100'
        }`}
      >
        <span className="flex items-center justify-between">
          <span>{label}</span>
          {badgeCount && badgeCount > 0 && (
            <span className="ml-2 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-600 text-white">
              {badgeCount > 99 ? '99+' : badgeCount}
            </span>
          )}
        </span>
      </button>
    </li>
  );
};

export const DashboardLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, switchRole } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('overview');
  const { unreadCount } = useMessages();
  const [unreadSupportCount, setUnreadSupportCount] = useState(0);

  useEffect(() => {
    // Set initial tab from URL
    const searchParams = new URLSearchParams(location.search);
    const tab = searchParams.get('tab') || 'overview';
    setActiveTab(tab);
  }, [location]);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    let timer: number | undefined;

    const loadSupportUnread = async () => {
      try {
        const tickets = await SupportService.getMyTickets();
        if (!mounted) return;
        const unread = tickets.filter((t) => !t.is_read_by_user).length;
        setUnreadSupportCount(unread);
      } catch {
        if (mounted) setUnreadSupportCount(0);
      }
    };

    loadSupportUnread();
    timer = window.setInterval(loadSupportUnread, 30000);

    return () => {
      mounted = false;
      if (timer) window.clearInterval(timer);
    };
  }, [user?.id]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    // Update URL without causing a navigation
    const newUrl = `${location.pathname}?tab=${tab}`;
    window.history.replaceState({}, '', newUrl);

    // Dispatch custom event for DashboardRouter
    window.dispatchEvent(new CustomEvent('dashboard-navigation', { detail: { tab } }));
  };

  const handleRoleSwitch = () => {
    if (switchRole) {
      switchRole();
    }
  };

  const getSidebarItems = () => {
    if (user?.role === 'freelancer') {
      return [
        { tab: 'overview', label: 'Overview' },
        { tab: 'my-gigs', label: 'My Gigs' },
        { tab: 'orders', label: 'Orders' },
        { tab: 'contracts', label: 'Contracts' },
        { tab: 'my-proposals', label: 'My Proposals' },
        { tab: 'wallet', label: 'Wallet' },
        { tab: 'gcoin', label: 'Gcoin' },
        { tab: 'favorites', label: 'Favorites' },
        { tab: 'reviews', label: 'Reviews' },
        { tab: 'likes', label: 'Likes' },
        { tab: 'messages', label: 'Messages' },
        { tab: 'support', label: 'Support' },
        { tab: 'uploaded-files', label: 'Uploaded Files' },
        { tab: 'kyc', label: 'KYC Verification' },
      ];
    } else if (user?.role === 'employer' || user?.role === 'client') {
      return [
        { tab: 'overview', label: 'Overview' },
        { tab: 'my-jobs', label: 'My Jobs' },
        { tab: 'proposals-offers', label: 'Proposals & Offers' },
        { tab: 'contracts', label: 'Contracts' },
        { tab: 'wallet', label: 'Wallet' },
        { tab: 'gcoin', label: 'Gcoin' },
        { tab: 'favorites', label: 'Favorites' },
        { tab: 'reviews', label: 'Reviews' },
        { tab: 'messages', label: 'Messages' },
        { tab: 'support', label: 'Support' },
        { tab: 'uploaded-files', label: 'Uploaded Files' },
        { tab: 'kyc', label: 'KYC Verification' },
      ];
    }
    return [];
  };

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-white p-4 border-r border-gray-200">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Dashboard</h3>
          <button
            onClick={handleRoleSwitch}
            className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-full hover:bg-blue-200 transition-colors"
            title={`Switch to ${user?.role === UserRole.FREELANCER ? 'Client' : 'Freelancer'} mode`}
          >
            Switch to {user?.role === UserRole.FREELANCER ? 'Client' : 'Freelancer'}
          </button>
        </div>
        <ul className="space-y-1">
          {getSidebarItems().map((item) => (
            <SidebarItem
              key={item.tab}
              tab={item.tab}
              label={item.label}
              isActive={activeTab === item.tab}
              badgeCount={item.tab === 'messages' ? unreadCount : item.tab === 'support' ? unreadSupportCount : undefined}
              onClick={handleTabChange}
            />
          ))}
          <li className="pt-4 border-t border-gray-200">
            <button
              onClick={() => navigate('/')}
              className="w-full text-left px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
            >
              Back to site
            </button>
          </li>
        </ul>
      </aside>
      <main className="flex-1 bg-gray-50 p-6">
        {children}
      </main>
    </div>
  );
};

export default DashboardLayout;
