import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  BadgeDollarSign,
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
import type { UserRole } from '../../types';
import { useMessages } from '../../context/MessageContext';
import { useSocket } from '../../context/SocketContext';
import { SupportService } from '../../services/support';
import { MarketingService } from '../../services/marketing';
import MobileDrawerNav, { DrawerSection } from '../../components/dashboard/MobileDrawerNav';
import { USER_ROLES } from '../../utils/userRoles';

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

  if (role === USER_ROLES.EMPLOYER) {
    const employerMap: Record<string, string> = {
      jobs: 'my-jobs',
      job: 'my-jobs',
      order: 'orders',
      orders: 'orders',
      proposals: 'proposals-offers',
      proposal: 'proposals-offers',
      offers: 'proposals-offers'
    };
    return employerMap[tab] || tab;
  }

  if (role === USER_ROLES.FREELANCER) {
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
  const { user } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { unreadCount } = useMessages();
  const { isConnected } = useSocket();
  const [unreadSupportCount, setUnreadSupportCount] = useState(0);
  const [showAffiliateModule, setShowAffiliateModule] = useState(false);

  const urlParams = new URLSearchParams(location.search);
  const asParam = (urlParams.get('as') || urlParams.get('view') || '').toString().toLowerCase();

  const effectiveRole = React.useMemo(() => {
    if (asParam) {
      if (asParam.startsWith('f')) return USER_ROLES.FREELANCER;
      if (asParam.startsWith('e') || asParam.startsWith('c')) return USER_ROLES.EMPLOYER;
    }

    const path = location.pathname || '';
    if (path.startsWith('/freelancer')) return USER_ROLES.FREELANCER;
    if (path.startsWith('/client')) return USER_ROLES.EMPLOYER;

    return (user?.role as UserRole) || USER_ROLES.GUEST;
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

    const canViewAffiliate = effectiveRole === USER_ROLES.FREELANCER || effectiveRole === USER_ROLES.EMPLOYER;
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
    const params = new URLSearchParams(location.search);
    params.set('tab', tab);
    const nextSearch = params.toString();
    navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ''}`, { replace: true });
    setIsSidebarOpen(false);
    window.dispatchEvent(new CustomEvent('dashboard-navigation', { detail: { tab } }));
  };

  const handleRoleSwitch = () => {
    if (!user) return;

    if (user.role === USER_ROLES.ADMIN) {
      const params = new URLSearchParams(location.search);
      const newAs = effectiveRole === USER_ROLES.FREELANCER ? 'employer' : 'freelancer';
      params.set('as', newAs);
      const newSearch = params.toString();
      navigate(`${location.pathname}${newSearch ? `?${newSearch}` : ''}`, { replace: true });
      window.dispatchEvent(new CustomEvent('dashboard-navigation', { detail: { tab: 'overview' } }));
      return;
    }

    const targetRole = effectiveRole === USER_ROLES.FREELANCER ? USER_ROLES.EMPLOYER : USER_ROLES.FREELANCER;
    const targetPath = targetRole === USER_ROLES.FREELANCER ? '/freelancer/dashboard' : '/client/dashboard';
    try {
      sessionStorage.setItem('activeRole', String(targetRole));
    } catch {
      // ignore storage failures
    }
    navigate(`${targetPath}?as=${targetRole}`, { replace: true });
    window.dispatchEvent(new CustomEvent('dashboard-navigation', { detail: { tab: 'overview' } }));
  };

  const getSidebarSections = (): DrawerSection[] => {
    if (effectiveRole === USER_ROLES.FREELANCER) {
      const financeItems = [
        { tab: 'wallet', label: 'Wallet', icon: Wallet, description: 'Balance, payouts, and cash flow controls' },
        { tab: 'membership', label: 'Membership', icon: Crown, description: 'Plan access and subscription benefits' },
        ...(showAffiliateModule
          ? [{ tab: 'affiliate-program', label: 'Affiliate Program', icon: BadgeDollarSign, description: 'Referral earnings and campaign performance' }]
          : []),
        { tab: 'gcoin', label: 'Gcoin', icon: Coins, description: 'Rewards, utility balance, and engagement credits' }
      ];

      return [
        {
          id: 'dashboard',
          title: 'Dashboard',
          description: 'Top-level control, community access, and page operations.',
          items: [
            { tab: 'overview', label: 'Overview', icon: LayoutDashboard, description: 'Live KPIs, command center, and work priorities' },
            { tab: 'community', label: 'Community', icon: Users, description: 'Posts, network momentum, and audience activity' },
            { tab: 'manage-pages', label: 'Manage Pages', icon: Building2, description: 'Business-page command center, governance, and publishing operations' }
          ]
        },
        {
          id: 'work',
          title: 'Work',
          description: 'Active revenue lines, delivery, and proposals.',
          items: [
            { tab: 'my-gigs', label: 'My Gigs', icon: BriefcaseBusiness, description: 'Offers, pricing, and marketplace positioning' },
            { tab: 'my-ads', label: 'My Ads', icon: Megaphone, description: 'Campaign visibility and promotion controls' },
            { tab: 'orders', label: 'Orders', icon: ShoppingBag, description: 'Delivery queue, milestones, and deadlines' },
            { tab: 'contracts', label: 'Contracts', icon: ClipboardList, description: 'Running engagements and commercial terms' },
            { tab: 'my-proposals', label: 'My Proposals', icon: FileText, description: 'Pipeline follow-up and proposal outcomes' }
          ]
        },
        { id: 'finance', title: 'Finance', description: 'Payments, rewards, and monetization readiness.', items: financeItems },
        {
          id: 'account',
          title: 'Account',
          description: 'Reputation, communication, and trust operations.',
          items: [
            { tab: 'favorites', label: 'Favorites', icon: Heart, description: 'Saved items and shortlist history' },
            { tab: 'reviews', label: 'Reviews', icon: Star, description: 'Client feedback and quality signals' },
            { tab: 'likes', label: 'Likes', icon: ThumbsUp, description: 'Content engagement and reactions' },
            { tab: 'messages', label: 'Messages', icon: MessageCircle, badgeCount: unreadCount || undefined, description: 'Realtime conversations and delivery communication' },
            { tab: 'support', label: 'Support', icon: LifeBuoy, badgeCount: unreadSupportCount || undefined, description: 'Tickets, service issues, and help history' },
            { tab: 'uploaded-files', label: 'Uploaded Files', icon: FolderOpen, description: 'Assets, documents, and reusable uploads' },
            { tab: 'kyc', label: 'KYC Verification', icon: ShieldCheck, description: 'Identity, compliance, and payout readiness' }
          ]
        }
      ];
    }

    if (effectiveRole === USER_ROLES.EMPLOYER) {
      const financeItems = [
        { tab: 'wallet', label: 'Wallet', icon: Wallet, description: 'Balance, billing, and payment execution' },
        { tab: 'membership', label: 'Membership', icon: Crown, description: 'Plan access and premium hiring capabilities' },
        ...(showAffiliateModule
          ? [{ tab: 'affiliate-program', label: 'Affiliate Program', icon: BadgeDollarSign, description: 'Referral earnings and partner growth' }]
          : []),
        { tab: 'gcoin', label: 'Gcoin', icon: Coins, description: 'Rewards and platform utility balance' }
      ];

      return [
        {
          id: 'dashboard',
          title: 'Dashboard',
          description: 'Command center for hiring, community, and page operations.',
          items: [
            { tab: 'overview', label: 'Overview', icon: LayoutDashboard, description: 'Live hiring command center and queue health' },
            { tab: 'community', label: 'Community', icon: Users, description: 'Audience engagement and publishing surfaces' },
            { tab: 'manage-pages', label: 'Manage Pages', icon: Building2, description: 'Business-page command center, governance, and brand operations' }
          ]
        },
        {
          id: 'work',
          title: 'Work',
          description: 'Hiring workflows, candidate review, and delivery management.',
          items: [
            { tab: 'my-jobs', label: 'My Jobs', icon: BriefcaseBusiness, description: 'Open roles, pipeline depth, and response rates' },
            { tab: 'my-ads', label: 'My Ads', icon: Megaphone, description: 'Promotion campaigns for hiring visibility' },
            { tab: 'orders', label: 'Orders', icon: ShoppingBag, description: 'Purchased services, delivery progress, and order status' },
            { tab: 'proposals-offers', label: 'Proposals & Offers', icon: FileText, description: 'Applicant review, shortlist, and offers' },
            { tab: 'contracts', label: 'Contracts', icon: ClipboardList, description: 'Active engagements, milestones, and escrow' }
          ]
        },
        { id: 'finance', title: 'Finance', description: 'Budget control, membership, and rewards.', items: financeItems },
        {
          id: 'account',
          title: 'Account',
          description: 'Communication, trust, and operational support.',
          items: [
            { tab: 'favorites', label: 'Favorites', icon: Heart, description: 'Saved talent, jobs, and working lists' },
            { tab: 'reviews', label: 'Reviews', icon: Star, description: 'Feedback quality and trust signals' },
            { tab: 'messages', label: 'Messages', icon: MessageCircle, badgeCount: unreadCount || undefined, description: 'Realtime candidate and contractor communication' },
            { tab: 'support', label: 'Support', icon: LifeBuoy, badgeCount: unreadSupportCount || undefined, description: 'Tickets, escalations, and service requests' },
            { tab: 'uploaded-files', label: 'Uploaded Files', icon: FolderOpen, description: 'Job assets, briefs, and reference files' },
            { tab: 'kyc', label: 'KYC Verification', icon: ShieldCheck, description: 'Compliance and account trust readiness' }
          ]
        }
      ];
    }

    return [];
  };

  const roleSwitchLabel =
    user?.role === USER_ROLES.ADMIN
      ? `View as ${effectiveRole === USER_ROLES.FREELANCER ? 'Client' : 'Freelancer'}`
      : `Switch to ${effectiveRole === USER_ROLES.FREELANCER ? 'Client' : 'Freelancer'}`;

  const sidebarSections = getSidebarSections();
  const activeItem = sidebarSections.flatMap((section) => section.items).find((item) => item.tab === activeTab);

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
          className={`fixed inset-y-0 left-0 z-40 w-[84vw] max-w-[320px] overflow-y-auto border-r border-gray-200 bg-white p-3 transition-transform duration-200 ease-out md:static md:z-auto md:w-64 md:max-w-none md:p-3 md:translate-x-0 lg:w-[268px] xl:w-[280px] xl:p-4 ${
            isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <MobileDrawerNav
            userName={user?.name || 'User'}
            userAvatar={user?.avatar}
            roleLabel={String(effectiveRole)}
            sections={sidebarSections}
            activeTab={activeTab}
            onTabSelect={handleTabChange}
            onRoleSwitch={handleRoleSwitch}
            roleSwitchLabel={roleSwitchLabel}
            socketConnected={Boolean(isConnected)}
            unreadMessages={unreadCount}
            unreadSupport={unreadSupportCount}
            onClose={() => setIsSidebarOpen(false)}
            onBackToSite={() => {
              setIsSidebarOpen(false);
              navigate('/');
            }}
          />
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 px-3 py-3 backdrop-blur md:hidden">
            <div className="flex items-start justify-between gap-2">
              <button
                type="button"
                onClick={() => setIsSidebarOpen(true)}
                className="rounded-2xl border border-gray-200 bg-white p-2 text-gray-700 shadow-sm"
                aria-label="Open dashboard menu"
              >
                <Menu className="h-5 w-5" />
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-semibold text-gray-900">{activeItem?.label || 'Dashboard'}</p>
                  <span
                    className={[
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                      isConnected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                    ].join(' ')}
                  >
                    {isConnected ? 'Live' : 'Sync'}
                  </span>
                </div>
                <p className="truncate text-xs capitalize text-gray-500">
                  {activeItem?.description || `${String(effectiveRole).toLowerCase()} workspace`}
                </p>
              </div>

              <div className="flex items-center gap-1.5 pt-0.5">
                {unreadCount > 0 && (
                  <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
                <button
                  onClick={handleRoleSwitch}
                  className="rounded-2xl border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700"
                >
                  Switch
                </button>
              </div>
            </div>
          </header>

          <main className="min-w-0 flex-1 p-3 sm:p-4 md:p-6 xl:px-8 2xl:px-10">
            <div className="mx-auto w-full max-w-[1700px] min-w-0">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default DashboardLayout;
