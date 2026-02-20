import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUser } from '../../context/UserContext';
import { UserRole } from '../../types';
import { useMessages } from '../../context/MessageContext';
import { SupportService } from '../../services/support';
import { Menu, X } from 'lucide-react';

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

const getDashboardTabFromPath = (pathname: string): string | null => {
  const parts = String(pathname || '')
    .split('/')
    .filter(Boolean)
    .map((part) => part.toLowerCase());
  const dashboardIndex = parts.lastIndexOf('dashboard');
  if (dashboardIndex < 0) return null;
  return parts[dashboardIndex + 1] || null;
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
    uploaded_files: 'uploaded-files'
  };

  if (commonMap[tab]) return commonMap[tab];

  if (role === UserRole.EMPLOYER) {
    const employerMap: Record<string, string> = {
      jobs: 'my-jobs',
      job: 'my-jobs',
      proposals: 'proposals-offers',
      proposal: 'proposals-offers',
      offers: 'proposals-offers'
    };
    return employerMap[tab] || tab;
  }

  if (role === UserRole.FREELANCER) {
    const freelancerMap: Record<string, string> = {
      gigs: 'my-gigs',
      gig: 'my-gigs',
      proposals: 'my-proposals',
      proposal: 'my-proposals'
    };
    return freelancerMap[tab] || tab;
  }

  return tab;
};

export const DashboardLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, switchRole } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { unreadCount } = useMessages();
  const [unreadSupportCount, setUnreadSupportCount] = useState(0);
  // Determine effective role view (honor ?as= override for admins or explicit view)
  const urlParams = new URLSearchParams(location.search);
  const asParam = (urlParams.get('as') || urlParams.get('view') || '').toString().toLowerCase();

  const effectiveRole = React.useMemo(() => {
    if (asParam) {
      if (asParam.startsWith('f')) return UserRole.FREELANCER;
      if (asParam.startsWith('e') || asParam.startsWith('c')) return UserRole.EMPLOYER;
    }

    const path = location.pathname || '';
    if (path.startsWith('/freelancer')) return UserRole.FREELANCER;
    if (path.startsWith('/client')) return UserRole.EMPLOYER;

    return (user?.role as UserRole) || UserRole.GUEST;
  }, [asParam, user, location.pathname]);

  useEffect(() => {
    if (!user) return;
    try {
      sessionStorage.setItem('activeRole', String(effectiveRole));
    } catch {}
  }, [effectiveRole, user?.id]);

  useEffect(() => {
    // Set initial tab from URL
    const searchParams = new URLSearchParams(location.search);
    const searchTab = searchParams.get('tab');
    const pathTab = getDashboardTabFromPath(location.pathname);
    const tab = normalizeDashboardTab(searchTab || pathTab || 'overview', effectiveRole);
    setActiveTab(tab);
  }, [location.pathname, location.search, effectiveRole]);

  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location.pathname, location.search]);

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
    setIsSidebarOpen(false);

    // Dispatch custom event for DashboardRouter
    window.dispatchEvent(new CustomEvent('dashboard-navigation', { detail: { tab } }));
  };

  const handleRoleSwitch = () => {
    if (!user) return;

    // Admins should not mutate their stored role — toggle the view via query param instead
    if (user.role === UserRole.ADMIN) {
      const params = new URLSearchParams(location.search);
      const currentAs = (params.get('as') || '').toString().toLowerCase();
      const newAs = (effectiveRole === UserRole.FREELANCER) ? 'employer' : 'freelancer';
      params.set('as', newAs);
      // Preserve tab param if present
      const newSearch = params.toString();
      navigate(`${location.pathname}${newSearch ? `?${newSearch}` : ''}`, { replace: true });
      // Dispatch navigation event to update sidebar/tab state
      window.dispatchEvent(new CustomEvent('dashboard-navigation', { detail: { tab: 'overview' } }));
      return;
    }

    // Non-admins: switch view explicitly to avoid role refresh conflicts
    const targetRole = effectiveRole === UserRole.FREELANCER ? UserRole.EMPLOYER : UserRole.FREELANCER;
    const targetPath = targetRole === UserRole.FREELANCER ? '/freelancer/dashboard' : '/client/dashboard';
    try {
      sessionStorage.setItem('activeRole', String(targetRole));
    } catch {}
    navigate(`${targetPath}?as=${targetRole}`, { replace: true });
    window.dispatchEvent(new CustomEvent('dashboard-navigation', { detail: { tab: 'overview' } }));
  };

  const getSidebarItems = () => {
    const roleToUse = effectiveRole;

    if (roleToUse === UserRole.FREELANCER) {
      return [
        { tab: 'overview', label: 'Overview' },
        { tab: 'community', label: 'Community' },
        { tab: 'manage-pages', label: 'Manage Pages' },
        { tab: 'my-gigs', label: 'My Gigs' },
        { tab: 'my-ads', label: 'My Ads' },
        { tab: 'orders', label: 'Orders' },
        { tab: 'contracts', label: 'Contracts' },
        { tab: 'my-proposals', label: 'My Proposals' },
        { tab: 'wallet', label: 'Wallet' },
        { tab: 'membership', label: 'Membership' },
        { tab: 'gcoin', label: 'Gcoin' },
        { tab: 'favorites', label: 'Favorites' },
        { tab: 'reviews', label: 'Reviews' },
        { tab: 'likes', label: 'Likes' },
        { tab: 'messages', label: 'Messages' },
        { tab: 'support', label: 'Support' },
        { tab: 'uploaded-files', label: 'Uploaded Files' },
        { tab: 'kyc', label: 'KYC Verification' },
      ];
    } else if (roleToUse === UserRole.EMPLOYER) {
      return [
        { tab: 'overview', label: 'Overview' },
        { tab: 'community', label: 'Community' },
        { tab: 'manage-pages', label: 'Manage Pages' },
        { tab: 'my-ads', label: 'My Ads' },
        { tab: 'my-jobs', label: 'My Jobs' },
        { tab: 'proposals-offers', label: 'Proposals & Offers' },
        { tab: 'contracts', label: 'Contracts' },
        { tab: 'wallet', label: 'Wallet' },
        { tab: 'membership', label: 'Membership' },
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
    <div className="min-h-screen bg-gray-50">
      <div className="flex min-h-screen">
        {isSidebarOpen && (
          <button
            type="button"
            className="fixed inset-0 z-30 bg-black/40 md:hidden"
            aria-label="Close dashboard menu"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        <aside
          className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[88vw] overflow-y-auto border-r border-gray-200 bg-white p-4 transition-transform duration-200 ease-out md:static md:z-auto md:w-64 md:max-w-none md:translate-x-0 ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="mb-4 flex items-start justify-between gap-2">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Dashboard</h3>
              <p className="text-xs text-gray-500 capitalize">Viewing as {effectiveRole}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsSidebarOpen(false)}
              className="rounded-md p-1 text-gray-600 hover:bg-gray-100 md:hidden"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <button
            onClick={handleRoleSwitch}
            className="mb-4 w-full rounded-full bg-blue-100 px-3 py-2 text-sm text-blue-700 transition-colors hover:bg-blue-200"
            title="Switch view"
          >
            {user?.role === UserRole.ADMIN ? `View as ${effectiveRole === UserRole.FREELANCER ? 'Client' : 'Freelancer'}` : `Switch to ${effectiveRole === UserRole.FREELANCER ? 'Client' : 'Freelancer'}`}
          </button>

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
                onClick={() => {
                  setIsSidebarOpen(false);
                  navigate('/');
                }}
                className="w-full rounded-md px-3 py-2 text-left text-gray-600 transition-colors hover:bg-gray-100"
              >
                Back to site
              </button>
            </li>
          </ul>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 px-3 py-2 backdrop-blur md:hidden">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                className="rounded-md border border-gray-200 p-2 text-gray-700"
                aria-label="Open dashboard menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900">Dashboard</p>
                <p className="truncate text-xs text-gray-500 capitalize">{effectiveRole}</p>
              </div>
              <button
                onClick={handleRoleSwitch}
                className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700"
              >
                Switch
              </button>
            </div>
          </header>

          <main className="min-w-0 flex-1 p-3 sm:p-4 md:p-6">
            <div className="mx-auto w-full max-w-7xl min-w-0">
              {children}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default DashboardLayout;
