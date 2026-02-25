import React from 'react';
import {
  BadgeDollarSign,
  BriefcaseBusiness,
  FileText,
  MessageCircle,
  PlusCircle,
  Search,
  TrendingUp,
  UserRound,
  Wallet
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { freelancerApi, FreelancerOverview as FreelancerOverviewData } from '../../services/freelancer';
import { OrdersService } from '../../services/orders';
import { proposalsApi } from '../../services/proposals';
import { ContractService } from '../../services/contract';
import DashboardShell from '../../components/dashboard/DashboardShell';
import KpiGrid, { KpiItem } from '../../components/dashboard/KpiGrid';
import QuickActions from '../../components/dashboard/QuickActions';
import ActivityPanel, { ActivityItem } from '../../components/dashboard/ActivityPanel';
import RightRail, { RightRailAction } from '../../components/dashboard/RightRail';
import { useMessages } from '../../context/MessageContext';
import { useNotification } from '../../context/NotificationContext';
import { useSocket } from '../../context/SocketContext';
import { useUser } from '../../context/UserContext';

const formatMoney = (value: number) => `$${Number(value || 0).toFixed(2)}`;

const formatTime = (value?: string) => {
  if (!value) return 'Updated just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Updated just now';
  return date.toLocaleString();
};

const dateValue = (value?: string) => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const isVerifiedUser = (user: any): boolean => {
  return Boolean(
    user?.isVerified ||
      user?.is_verified ||
      user?.verified ||
      (typeof user?.verificationStatus === 'string' && user.verificationStatus.toLowerCase() === 'verified')
  );
};

export const Overview: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const { unreadCount } = useMessages();
  const { notifications } = useNotification();
  const { isConnected } = useSocket();

  const [overview, setOverview] = React.useState<FreelancerOverviewData | null>(null);
  const [activity, setActivity] = React.useState<ActivityItem[]>([]);
  const [proposalCount, setProposalCount] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');

  const loadOverview = React.useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);

    const [overviewResult, ordersResult, proposalsResult, contractsResult] = await Promise.allSettled([
      freelancerApi.getOverview(),
      OrdersService.list({ role: 'freelancer', status: 'active' }),
      proposalsApi.getMyProposals({ limit: 5, page: 1 }),
      ContractService.getContracts(user.id, 'freelancer')
    ]);

    if (overviewResult.status === 'fulfilled') {
      setOverview(overviewResult.value);
    }

    const mergedActivity: ActivityItem[] = [];

    if (ordersResult.status === 'fulfilled') {
      ordersResult.value.slice(0, 4).forEach((order) => {
        mergedActivity.push({
          id: `order-${order.id}`,
          title: `Order ${order.status || 'active'}: ${order.gigTitle || 'Gig'}`,
          description: `${order.buyerName || 'Client'} • ${formatMoney(order.amount)}`,
          timestamp: formatTime(order.updatedAt || order.createdAt),
          status: order.status || 'active',
          href: '/freelancer/dashboard?tab=orders'
        });
      });
    }

    if (proposalsResult.status === 'fulfilled') {
      const proposalItems = proposalsResult.value.proposals || [];
      setProposalCount(Number(proposalsResult.value.pagination?.total || proposalItems.length || 0));
      proposalItems.slice(0, 4).forEach((proposal) => {
        mergedActivity.push({
          id: `proposal-${proposal.id}`,
          title: `Proposal ${proposal.status}: ${proposal.jobTitle || 'Job'}`,
          description: `${formatMoney(proposal.proposedAmount)} • ${proposal.proposedTimeline} day timeline`,
          timestamp: formatTime(proposal.updatedAt || proposal.createdAt),
          status: proposal.status,
          href: proposal.contractId
            ? `/freelancer/dashboard?tab=contracts&contract_id=${proposal.contractId}`
            : '/freelancer/dashboard?tab=my-proposals'
        });
      });
    } else {
      setProposalCount(0);
    }

    if (contractsResult.status === 'fulfilled') {
      contractsResult.value
        .filter((contract) => contract.status === 'active' || contract.status === 'paused')
        .slice(0, 3)
        .forEach((contract) => {
          const hourlyRate = Number(contract.hourlyRate ?? contract.hourly_rate ?? 0);
          mergedActivity.push({
            id: `contract-${contract.id}`,
            title: `Contract ${contract.status}: ${contract.title || 'Hourly engagement'}`,
            description: `${hourlyRate > 0 ? `${formatMoney(hourlyRate)}/hr` : 'Hourly rate set'} • Client ${
              contract.clientName || contract.client_name || 'Client'
            }`,
            timestamp: formatTime(contract.start_date),
            status: contract.status,
            href: `/freelancer/dashboard?tab=contracts&contract_id=${contract.id}`
          });
        });
    }

    mergedActivity.sort((a, b) => dateValue(b.timestamp) - dateValue(a.timestamp));
    setActivity(mergedActivity.slice(0, 8));
    setLoading(false);
  }, [user?.id]);

  React.useEffect(() => {
    void loadOverview();
    const interval = window.setInterval(() => {
      void loadOverview();
    }, 30000);

    const refresh = () => {
      void loadOverview();
    };
    window.addEventListener('messages:new', refresh as EventListener);
    window.addEventListener('notifications:new', refresh as EventListener);
    window.addEventListener('orders:updated', refresh as EventListener);
    window.addEventListener('contracts:updated', refresh as EventListener);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('messages:new', refresh as EventListener);
      window.removeEventListener('notifications:new', refresh as EventListener);
      window.removeEventListener('orders:updated', refresh as EventListener);
      window.removeEventListener('contracts:updated', refresh as EventListener);
    };
  }, [loadOverview]);

  const unreadNotifications = React.useMemo(() => {
    return notifications.reduce((total, item) => total + (item.isRead ? 0 : 1), 0);
  }, [notifications]);

  const filteredActivity = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return activity;
    return activity.filter(
      (entry) =>
        entry.title.toLowerCase().includes(query) ||
        entry.description.toLowerCase().includes(query) ||
        String(entry.status || '')
          .toLowerCase()
          .includes(query)
    );
  }, [activity, search]);

  const kpiItems: KpiItem[] = React.useMemo(() => {
    if (!overview) return [];
    return [
      {
        id: 'active-orders',
        title: 'Active Orders',
        value: overview.activeOrders,
        icon: BriefcaseBusiness,
        delta: overview.revisionOrders > 0 ? `${overview.revisionOrders} in revision` : 'No revisions pending',
        href: '/freelancer/dashboard?tab=orders',
        accent: 'indigo'
      },
      {
        id: 'earnings-month',
        title: 'Earnings (Month)',
        value: formatMoney(overview.earningsThisMonth),
        icon: BadgeDollarSign,
        delta: 'Tracked in real time',
        href: '/freelancer/dashboard?tab=wallet',
        accent: 'green'
      },
      {
        id: 'wallet-balance',
        title: 'Wallet Balance',
        value: formatMoney(overview.walletBalance),
        icon: Wallet,
        delta: 'Available for payout',
        href: '/freelancer/dashboard?tab=wallet',
        accent: 'blue'
      },
      {
        id: 'pending-proposals',
        title: 'Pending Proposals',
        value: proposalCount,
        icon: FileText,
        delta: 'Follow-up opportunities',
        href: '/freelancer/dashboard?tab=my-proposals',
        accent: 'amber'
      },
      {
        id: 'profile-views',
        title: 'Profile Views',
        value: overview.gigViews.toLocaleString(),
        icon: TrendingUp,
        delta: 'Gig funnel visibility',
        href: '/freelancer/dashboard?tab=my-gigs',
        accent: 'slate'
      },
      {
        id: 'unread-updates',
        title: 'Unread Updates',
        value: unreadCount + unreadNotifications,
        icon: MessageCircle,
        delta: 'Messages and notifications',
        href: '/freelancer/dashboard?tab=messages',
        accent: 'indigo'
      }
    ];
  }, [overview, proposalCount, unreadCount, unreadNotifications]);

  const nextActions: RightRailAction[] = React.useMemo(() => {
    if (!overview) return [];
    const actions: RightRailAction[] = [];

    if (overview.activeOrders > 0) {
      actions.push({
        id: 'deliver-orders',
        label: 'Deliver active orders',
        description: 'Review timelines and send milestones to clients.',
        href: '/freelancer/dashboard?tab=orders'
      });
    }

    if (proposalCount > 0) {
      actions.push({
        id: 'follow-proposals',
        label: 'Check proposal outcomes',
        description: 'Track shortlisted and accepted opportunities.',
        href: '/freelancer/dashboard?tab=my-proposals'
      });
    }

    if (overview.walletBalance > 0) {
      actions.push({
        id: 'review-wallet',
        label: 'Review wallet and payouts',
        description: 'Verify available balance and payment schedule.',
        href: '/freelancer/dashboard?tab=wallet'
      });
    }

    return actions.slice(0, 3);
  }, [overview, proposalCount]);

  const recommendations: RightRailAction[] = React.useMemo(() => {
    if (!overview) return [];
    const base: RightRailAction[] = [
      {
        id: 'recommend-jobs',
        label: 'Browse matched jobs',
        description: 'Expand pipeline with high-intent opportunities.',
        href: '/jobs'
      },
      {
        id: 'recommend-gig-optimization',
        label: 'Optimize gig conversion',
        description: 'Improve thumbnails and packages to increase click-through.',
        href: '/freelancer/dashboard?tab=my-gigs'
      }
    ];

    if (overview.rating < 4.8) {
      base.unshift({
        id: 'recommend-reviews',
        label: 'Request client reviews',
        description: 'Improve rating visibility for better ranking.',
        href: '/freelancer/dashboard?tab=orders'
      });
    }

    return base.slice(0, 3);
  }, [overview]);

  const quickActions = [
    { id: 'create-gig', label: 'Create Gig', icon: PlusCircle, href: '/create-gig', variant: 'primary' as const },
    { id: 'browse-jobs', label: 'Browse Jobs', icon: Search, href: '/jobs' },
    { id: 'my-orders', label: 'My Orders', icon: BriefcaseBusiness, href: '/freelancer/dashboard?tab=orders' },
    { id: 'withdraw', label: 'Withdraw', icon: Wallet, href: '/freelancer/dashboard?tab=wallet' },
    { id: 'improve-profile', label: 'Improve Profile (AI)', icon: UserRound, href: '/freelancer/dashboard?tab=profile' }
  ];

  return (
    <DashboardShell
      title="Freelancer Dashboard"
      subtitle="Track delivery, earnings, proposals, and growth signals in one workspace."
      roleLabel="Freelancer"
      searchPlaceholder="Search orders, contracts, or proposals..."
      searchValue={search}
      onSearchChange={setSearch}
      infoMessage="Use this overview to prioritize active work, monitor earnings, and act on opportunities without leaving the dashboard."
      bannerStorageKey="freelancer-overview-banner-dismissed"
      verificationStatus={isVerifiedUser(user) ? 'verified' : 'pending'}
      profileCompleteness={Number(user?.profileCompleteness ?? user?.profile_completion ?? 0)}
      lastLoginLabel={user?.lastLoginAt ? formatTime(user.lastLoginAt) : undefined}
      kpiContent={<KpiGrid items={kpiItems} loading={loading && !overview} />}
      quickActionsContent={<QuickActions items={quickActions} subtitle="Fast access to your highest-impact workflows." />}
      activityContent={
        <ActivityPanel
          title="Recent Activity"
          subtitle="Live updates from orders, contracts, and proposal outcomes."
          items={filteredActivity}
          loading={loading && !overview}
          emptyTitle="No activity yet"
          emptyDescription="Activity will appear when you receive orders, proposals, or contract updates."
          emptyCtaLabel="Browse Jobs"
          onEmptyCtaClick={() => navigate('/jobs')}
        />
      }
      rightRailContent={
        <RightRail
          unreadMessages={unreadCount}
          unreadNotifications={unreadNotifications}
          socketConnected={Boolean(isConnected)}
          nextActions={nextActions}
          recommendations={recommendations}
        />
      }
    />
  );
};

export default Overview;
