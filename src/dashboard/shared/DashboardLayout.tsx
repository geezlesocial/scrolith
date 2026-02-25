import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BriefcaseBusiness,
  Building2,
  ClipboardList,
  Coins,
  Crown,
  FileText,
  FolderOpen,
  Heart,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  Menu,
  MessageCircle,
  ShieldCheck,
  ShoppingBag,
  Star,
  ThumbsUp,
  Users,
  Wallet
} from 'lucide-react';
import { useUser } from '../../context/UserContext';
import { UserRole } from '../../types';
import { useMessages } from '../../context/MessageContext';
import { SupportService } from '../../services/support';
import { MarketingService } from '../../services/marketing';
import MobileDrawerNav, { DrawerSection } from '../../components/dashboard/MobileDrawerNav';

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
    uploaded_files: 'uploaded-files',
    affiliate: 'affiliate-program',
    affiliates: 'affiliate-program',
    referral: 'affiliate-program',
    referrals: 'affiliate-program'
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
  const [showAffiliateModule, setShowAffiliateModule] = useState(false);

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
    } catch {
      // ignore storage failures
    }
  }, [effectiveRole, user?.id]);

  useEffect(() => {
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
        const unread = tickets.filter((ticket) => !ticket.is_read_by_user).length;
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

  useEffect(() => {
    let mounted = true;
    let timer: number | undefined;

    const canViewAffiliate = effectiveRole === UserRole.FREELANCER || effectiveRole === UserRole.EMPLOYER;
    if (!user || !canViewAffiliate) {
      setShowAffiliateModule(false);
      return () => undefined;
    }

    const loadAffiliateStatus = async () => {
      try {
        const payload = await MarketingService.getMyAffiliateDashboard();
        if (!mounted) return;
        const approved = payload?.status === 'approved' || Boolean(payload?.partner);
        setShowAffiliateModule(Boolean(approved));
      } catch {
        if (mounted) setShowAffiliateModule(false);
      }
    };

    loadAffiliateStatus();
    timer = window.setInterval(loadAffiliateStatus, 30000);

    return () => {
      mounted = false;
      if (timer) window.clearInterval(timer);
    };
  }, [user?.id, effectiveRole]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    const newUrl = `${location.pathname}?tab=${tab}`;
    window.history.replaceState({}, '', newUrl);
    setIsSidebarOpen(false);
    window.dispatchEvent(new CustomEvent('dashboard-navigation', { detail: { tab } }));
  };

  const handleRoleSwitch = () => {
    if (!user) return;

    if (user.role === UserRole.ADMIN) {
      const params = new URLSearchParams(location.search);
      const newAs = effectiveRole === UserRole.FREELANCER ? 'employer' : 'freelancer';
      params.set('as', newAs);
      const newSearch = params.toString();
      navigate(`${location.pathname}${newSearch ? `?${newSearch}` : ''}`, { replace: true });
      window.dispatchEvent(new CustomEvent('dashboard-navigation', { detail: { tab: 'overview' } }));
      return;
    }

    const targetRole = effectiveRole === UserRole.FREELANCER ? UserRole.EMPLOYER : UserRole.FREELANCER;
    const targetPath = targetRole === UserRole.FREELANCER ? '/freelancer/dashboard' : '/client/dashboard';
    try {
      sessionStorage.setItem('activeRole', String(targetRole));
    } catch {
      // ignore storage failures
    }
    navigate(`${targetPath}?as=${targetRole}`, { replace: true });
    window.dispatchEvent(new CustomEvent('dashboard-navigation', { detail: { tab: 'overview' } }));
  };

  const getSidebarSections = (): DrawerSection[] => {
    if (effectiveRole === UserRole.FREELANCER) {
      const financeItems = [
        { tab: 'wallet', label: 'Wallet', icon: Wallet },
        { tab: 'membership', label: 'Membership', icon: Crown },
        ...(showAffiliateModule
          ? [{ tab: 'affiliate-program', label: 'Affiliate Program', icon: BadgeDollarSign }]
          : []),
        { tab: 'gcoin', label: 'Gcoin', icon: Coins }
      ];

      return [
        {
          id: 'dashboard',
          title: 'Dashboard',
          items: [
            { tab: 'overview', label: 'Overview', icon: LayoutDashboard },
            { tab: 'community', label: 'Community', icon: Users },
            { tab: 'manage-pages', label: 'Manage Pages', icon: Building2 }
          ]
        },
        {
          id: 'work',
          title: 'Work',
          items: [
            { tab: 'my-gigs', label: 'My Gigs', icon: BriefcaseBusiness },
            { tab: 'my-ads', label: 'My Ads', icon: Megaphone },
            { tab: 'orders', label: 'Orders', icon: ShoppingBag },
            { tab: 'contracts', label: 'Contracts', icon: ClipboardList },
            { tab: 'my-proposals', label: 'My Proposals', icon: FileText }
          ]
        },
        { id: 'finance', title: 'Finance', items: financeItems },
        {
          id: 'account',
          title: 'Account',
          items: [
            { tab: 'favorites', label: 'Favorites', icon: Heart },
            { tab: 'reviews', label: 'Reviews', icon: Star },
            { tab: 'likes', label: 'Likes', icon: ThumbsUp },
            { tab: 'messages', label: 'Messages', icon: MessageCircle, badgeCount: unreadCount || undefined },
            { tab: 'support', label: 'Support', icon: LifeBuoy, badgeCount: unreadSupportCount || undefined },
            { tab: 'uploaded-files', label: 'Uploaded Files', icon: FolderOpen },
            { tab: 'kyc', label: 'KYC Verification', icon: ShieldCheck }
          ]
        }
      ];
    }

    if (effectiveRole === UserRole.EMPLOYER) {
      const financeItems = [
        { tab: 'wallet', label: 'Wallet', icon: Wallet },
        { tab: 'membership', label: 'Membership', icon: Crown },
        ...(showAffiliateModule
          ? [{ tab: 'affiliate-program', label: 'Affiliate Program', icon: BadgeDollarSign }]
          : []),
        { tab: 'gcoin', label: 'Gcoin', icon: Coins }
      ];

      return [
        {
          id: 'dashboard',
          title: 'Dashboard',
          items: [
            { tab: 'overview', label: 'Overview', icon: LayoutDashboard },
            { tab: 'community', label: 'Community', icon: Users },
            { tab: 'manage-pages', label: 'Manage Pages', icon: Building2 }
          ]
        },
        {
          id: 'work',
          title: 'Work',
          items: [
            { tab: 'my-jobs', label: 'My Jobs', icon: BriefcaseBusiness },
            { tab: 'my-ads', label: 'My Ads', icon: Megaphone },
            { tab: 'proposals-offers', label: 'Proposals & Offers', icon: FileText },
            { tab: 'contracts', label: 'Contracts', icon: ClipboardList }
          ]
        },
        { id: 'finance', title: 'Finance', items: financeItems },
        {
          id: 'account',
          title: 'Account',
          items: [
            { tab: 'favorites', label: 'Favorites', icon: Heart },
            { tab: 'reviews', label: 'Reviews', icon: Star },
            { tab: 'messages', label: 'Messages', icon: MessageCircle, badgeCount: unreadCount || undefined },
            { tab: 'support', label: 'Support', icon: LifeBuoy, badgeCount: unreadSupportCount || undefined },
            { tab: 'uploaded-files', label: 'Uploaded Files', icon: FolderOpen },
            { tab: 'kyc', label: 'KYC Verification', icon: ShieldCheck }
          ]
        }
      ];
    }

    return [];
  };

  const roleSwitchLabel =
    user?.role === UserRole.ADMIN
      ? `View as ${effectiveRole === UserRole.FREELANCER ? 'Client' : 'Freelancer'}`
      : `Switch to ${effectiveRole === UserRole.FREELANCER ? 'Client' : 'Freelancer'}`;

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
          className={`fixed inset-y-0 left-0 z-40 w-72 max-w-[88vw] overflow-y-auto border-r border-gray-200 bg-white p-4 transition-transform duration-200 ease-out md:static md:z-auto md:w-72 md:max-w-none md:translate-x-0 ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <MobileDrawerNav
            userName={user?.name || 'User'}
            userAvatar={user?.avatar}
            roleLabel={String(effectiveRole)}
            sections={getSidebarSections()}
            activeTab={activeTab}
            onTabSelect={handleTabChange}
            onRoleSwitch={handleRoleSwitch}
            roleSwitchLabel={roleSwitchLabel}
            onClose={() => setIsSidebarOpen(false)}
            onBackToSite={() => {
              setIsSidebarOpen(false);
              navigate('/');
            }}
          />
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
                <p className="truncate text-xs capitalize text-gray-500">{effectiveRole}</p>
              </div>

              <div className="flex items-center gap-1.5">
                {unreadCount > 0 && (
                  <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
                <button
                  onClick={handleRoleSwitch}
                  className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700"
                >
                  Switch
                </button>
              </div>
            </div>
          </header>

          <main className="min-w-0 flex-1 p-3 sm:p-4 md:p-6">
            <div className="mx-auto w-full max-w-7xl min-w-0">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default DashboardLayout;
