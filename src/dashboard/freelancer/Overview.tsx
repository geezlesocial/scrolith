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
import DashboardHero, {
  DashboardHeroAction,
  DashboardHeroMetric,
  DashboardHeroSignal
} from '../../components/dashboard/DashboardHero';
import KpiGrid, { KpiItem } from '../../components/dashboard/KpiGrid';
import QuickActions from '../../components/dashboard/QuickActions';
import ActivityPanel, { ActivityItem } from '../../components/dashboard/ActivityPanel';
import OpportunityStudioPanel from '../../components/dashboard/OpportunityStudioPanel';
import CreatorCommercePanel from '../../components/dashboard/CreatorCommercePanel';
import PayoutOrchestrationPanel from '../../components/dashboard/PayoutOrchestrationPanel';
import RightRail, { RightRailAction, RightRailMetric } from '../../components/dashboard/RightRail';
import GrowthPulseCard from '../../components/growth/GrowthPulseCard';
import {
  WorkspaceFocusPanel,
  WorkspaceStatusStrip,
  EnterpriseWorkspacePanel,
  type WorkspaceFocusItem,
  type StatusChip
} from '../../components/workspace';
import { useMessages } from '../../context/MessageContext';
import { useNotification } from '../../context/NotificationContext';
import { useSocket } from '../../context/SocketContext';
import { useUser } from '../../context/UserContext';
import { buildScrolithaCareerPath } from '../../services/scrolithaCareer';

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

const formatRelativeSync = (value?: string) => {
  if (!value) return 'Synced just now';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'Synced just now';
  const diff = Math.max(0, Date.now() - time);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Synced just now';
  if (minutes < 60) return `Synced ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Synced ${hours}h ago`;
  return `Synced ${Math.floor(hours / 24)}d ago`;
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
  const [focusItems, setFocusItems] = React.useState<WorkspaceFocusItem[]>([]);
  const [orderSummary, setOrderSummary] = React.useState<any>(null);
  const [proposalCount, setProposalCount] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');
  const [lastRefreshedAt, setLastRefreshedAt] = React.useState<string | undefined>(undefined);

  // Must be declared before loadOverview — dependency arrays evaluate at hook call time (TDZ).
  const unreadNotifications = React.useMemo(() => {
    return notifications.reduce((total, item) => total + (item.isRead ? 0 : 1), 0);
  }, [notifications]);

  const loadOverview = React.useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);

    const [overviewResult, ordersResult, proposalsResult, contractsResult, summaryResult] =
      await Promise.allSettled([
        freelancerApi.getOverview(),
        OrdersService.list({ role: 'freelancer', status: 'active' }),
        proposalsApi.getMyProposals({ limit: 5, page: 1 }),
        ContractService.getContracts(user.id, 'freelancer'),
        OrdersService.getMyOrderSummary()
      ]);

    if (overviewResult.status === 'fulfilled') {
      setOverview(overviewResult.value);
    }
    if (summaryResult.status === 'fulfilled') {
      setOrderSummary(summaryResult.value);
    }

    const mergedActivity: ActivityItem[] = [];
    const nextFocus: WorkspaceFocusItem[] = [];

    if (ordersResult.status === 'fulfilled') {
      ordersResult.value.slice(0, 6).forEach((order) => {
        const status = String(order.status || 'active').toLowerCase();
        const isUrgent = status.includes('revision') || status.includes('late') || status.includes('due');
        mergedActivity.push({
          id: `order-${order.id}`,
          title: `Order ${order.status || 'active'}: ${order.gigTitle || 'Gig'}`,
          description: `${order.buyerName || 'Client'} • ${formatMoney(order.amount)}`,
          timestamp: formatTime(order.updatedAt || order.createdAt),
          sortValue: dateValue(order.updatedAt || order.createdAt),
          status: order.status || 'active',
          href: '/freelancer/dashboard?tab=orders'
        });
        if (isUrgent || nextFocus.length < 4) {
          nextFocus.push({
            id: `focus-order-${order.id}`,
            title: order.gigTitle || 'Active order',
            caption: `${order.buyerName || 'Client'} · ${order.status || 'active'}`,
            href: '/freelancer/dashboard?tab=orders',
            urgency: isUrgent ? 'high' : 'medium',
            status: order.status || 'active'
          });
        }
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
          sortValue: dateValue(proposal.updatedAt || proposal.createdAt),
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
            sortValue: dateValue(contract.start_date),
            status: contract.status,
            href: `/freelancer/dashboard?tab=contracts&contract_id=${contract.id}`
          });
        });
    }

    if (proposalsResult.status === 'fulfilled') {
      const openProposals = (proposalsResult.value.proposals || []).filter((p) =>
        ['pending', 'submitted', 'shortlisted', 'viewed'].includes(String(p.status || '').toLowerCase())
      );
      openProposals.slice(0, 2).forEach((proposal) => {
        nextFocus.push({
          id: `focus-proposal-${proposal.id}`,
          title: `Follow up: ${proposal.jobTitle || 'Proposal'}`,
          caption: `${proposal.status} · ${formatMoney(proposal.proposedAmount)}`,
          href: '/freelancer/dashboard?tab=my-proposals',
          urgency: 'medium',
          status: proposal.status
        });
      });
    }

    if (unreadCount + unreadNotifications > 0) {
      nextFocus.push({
        id: 'focus-inbox',
        title: 'Clear unread updates',
        caption: `${unreadCount + unreadNotifications} messages / notifications waiting`,
        href: '/freelancer/dashboard?tab=messages',
        urgency: 'high',
        status: 'inbox'
      });
    }

    mergedActivity.sort((a, b) => (b.sortValue || 0) - (a.sortValue || 0));
    setActivity(mergedActivity.slice(0, 8));
    setFocusItems(nextFocus.slice(0, 6));
    setLoading(false);
    setLastRefreshedAt(new Date().toISOString());
  }, [user?.id, unreadCount, unreadNotifications]);

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

  const heroMetrics: DashboardHeroMetric[] = React.useMemo(
    () => [
      {
        id: 'active-delivery',
        label: 'Active delivery',
        value: overview?.activeOrders ?? 0,
        helper:
          overview && overview.revisionOrders > 0 ? `${overview.revisionOrders} revisions need attention` : 'No revisions queued',
        tone: 'indigo'
      },
      {
        id: 'wallet-ready',
        label: 'Wallet ready',
        value: formatMoney(overview?.walletBalance ?? 0),
        helper: 'Available balance for payout planning',
        tone: 'green'
      },
      {
        id: 'pipeline',
        label: 'Pipeline',
        value: proposalCount,
        helper: 'Open proposals requiring follow-up',
        tone: 'amber'
      },
      {
        id: 'visibility',
        label: 'Marketplace visibility',
        value: Number(overview?.gigViews ?? 0).toLocaleString(),
        helper: 'Recent profile and gig demand signals',
        tone: 'blue'
      }
    ],
    [overview, proposalCount]
  );

  const heroSignals: DashboardHeroSignal[] = React.useMemo(
    () => [
      {
        id: 'sync-status',
        label: 'Realtime coverage',
        value: isConnected ? 'Live' : 'Polling',
        description:
          unreadCount + unreadNotifications > 0
            ? `${unreadCount + unreadNotifications} updates are waiting in your inbox`
            : 'Inbox is clear and dashboard events are stable',
        icon: MessageCircle,
        tone: isConnected ? 'green' : 'amber'
      },
      {
        id: 'quality',
        label: 'Trust posture',
        value: isVerifiedUser(user) ? 'Verified' : 'Pending',
        description:
          Number(overview?.rating ?? 0) > 0
            ? `Current seller rating is ${Number(overview?.rating ?? 0).toFixed(1)}`
            : 'Complete verification and collect reviews to improve ranking',
        icon: UserRound,
        tone: isVerifiedUser(user) ? 'blue' : 'amber'
      },
      {
        id: 'growth-lane',
        label: 'Growth lane',
        value: proposalCount > 0 ? `${proposalCount} open pursuits` : 'Ready to expand',
        description:
          Number(overview?.gigViews ?? 0) > 0
            ? `${Number(overview?.gigViews ?? 0).toLocaleString()} visibility events are feeding your funnel`
            : 'Create or refine your gigs to increase discovery',
        icon: TrendingUp,
        tone: 'indigo'
      }
    ],
    [isConnected, overview, proposalCount, unreadCount, unreadNotifications, user]
  );

  const heroActions: DashboardHeroAction[] = React.useMemo(
    () => [
      {
        id: 'hero-create-gig',
        label: 'Launch new gig',
        description: 'Open a fresh revenue lane with a new service offer.',
        href: '/create-gig',
        icon: PlusCircle,
        variant: 'primary'
      },
      {
        id: 'hero-browse-jobs',
        label: 'Review matched jobs',
        description: 'Find qualified opportunities and respond quickly.',
        href: '/jobs',
        icon: Search
      },
      {
        id: 'hero-wallet',
        label: 'Open wallet',
        description: 'Check payouts, balance, and withdrawal readiness.',
        href: '/freelancer/dashboard?tab=wallet',
        icon: Wallet
      }
    ],
    []
  );

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
      },
      {
        id: 'recommend-scrolitha-growth',
        label: 'Weekly growth plan (AI)',
        description: 'Ask Scrolitha for a 7-day posting and pipeline plan.',
        href: buildScrolithaCareerPath('weekly-growth')
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

    return base.slice(0, 4);
  }, [overview]);

  const statusChips: StatusChip[] = React.useMemo(() => {
    const summary = orderSummary || {};
    const active = Number(summary.active ?? summary.activeOrders ?? overview?.activeOrders ?? 0);
    const revision = Number(summary.revision ?? summary.revisionOrders ?? overview?.revisionOrders ?? 0);
    const delivered = Number(summary.delivered ?? summary.completed ?? 0);
    return [
      {
        id: 'chip-active',
        label: 'Active orders',
        value: active,
        href: '/freelancer/dashboard?tab=orders',
        tone: 'indigo'
      },
      {
        id: 'chip-revision',
        label: 'In revision',
        value: revision,
        href: '/freelancer/dashboard?tab=orders',
        tone: revision > 0 ? 'amber' : 'green'
      },
      {
        id: 'chip-delivered',
        label: 'Delivered',
        value: delivered,
        href: '/freelancer/dashboard?tab=orders',
        tone: 'green'
      },
      {
        id: 'chip-wallet',
        label: 'Wallet',
        value: formatMoney(overview?.walletBalance ?? 0),
        href: '/freelancer/dashboard?tab=wallet',
        tone: 'slate'
      }
    ];
  }, [orderSummary, overview]);

  const railHighlights: RightRailMetric[] = React.useMemo(
    () => [
      {
        id: 'rail-delivery',
        label: 'Delivery',
        value: overview?.activeOrders ?? 0,
        description: 'Active orders',
        tone: 'indigo'
      },
      {
        id: 'rail-revisions',
        label: 'Revisions',
        value: overview?.revisionOrders ?? 0,
        description: 'Pending updates',
        tone: (overview?.revisionOrders ?? 0) > 0 ? 'amber' : 'green'
      },
      {
        id: 'rail-rating',
        label: 'Rating',
        value: Number(overview?.rating ?? 0) > 0 ? Number(overview?.rating ?? 0).toFixed(1) : '—',
        description: 'Trust signal',
        tone: 'blue'
      },
      {
        id: 'rail-inbox',
        label: 'Inbox',
        value: unreadCount + unreadNotifications,
        description: 'Unread updates',
        tone: 'slate'
      }
    ],
    [overview, unreadCount, unreadNotifications]
  );

  const quickActions = [
    {
      id: 'create-gig',
      label: 'Create Gig',
      description: 'Launch a new service package and pricing model.',
      badge: 'Primary',
      icon: PlusCircle,
      href: '/create-gig',
      variant: 'primary' as const
    },
    {
      id: 'browse-jobs',
      label: 'Browse Jobs',
      description: 'Review relevant demand and submit offers quickly.',
      icon: Search,
      href: '/jobs'
    },
    {
      id: 'my-orders',
      label: 'My Orders',
      description: 'Track delivery, milestones, and client deadlines.',
      icon: BriefcaseBusiness,
      href: '/freelancer/dashboard?tab=orders'
    },
    {
      id: 'withdraw',
      label: 'Withdraw',
      description: 'Review payout readiness and available balance.',
      icon: Wallet,
      href: '/freelancer/dashboard?tab=wallet'
    },
    {
      id: 'improve-profile',
      label: 'Improve Profile (AI)',
      description: 'Tighten positioning and conversion using guided edits.',
      badge: 'AI',
      icon: UserRound,
      href: '/freelancer/dashboard?tab=profile'
    }
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
      heroContent={
        <DashboardHero
          title="Freelancer Command Center"
          subtitle="Manage delivery, cash flow, pipeline quality, and responsiveness from one live operating view."
          roleLabel="Freelancer"
          verificationStatus={isVerifiedUser(user) ? 'verified' : 'pending'}
          profileCompleteness={Number(user?.profileCompleteness ?? user?.profile_completion ?? 0)}
          lastLoginLabel={user?.lastLoginAt ? formatTime(user.lastLoginAt) : undefined}
          lastSyncedLabel={formatRelativeSync(lastRefreshedAt)}
          socketConnected={Boolean(isConnected)}
          searchPlaceholder="Search orders, contracts, or proposals..."
          searchValue={search}
          onSearchChange={setSearch}
          metrics={heroMetrics}
          signals={heroSignals}
          actions={heroActions}
        />
      }
      kpiContent={
        <div className="space-y-3">
          <WorkspaceStatusStrip chips={statusChips} loading={loading && !overview} />
          <KpiGrid items={kpiItems} loading={loading && !overview} />
        </div>
      }
      quickActionsContent={<QuickActions items={quickActions} subtitle="Fast access to your highest-impact workflows." />}
      supplementaryContent={
        <div className="space-y-3">
          <WorkspaceFocusPanel
            items={focusItems}
            loading={loading && focusItems.length === 0}
            scrolithaHref={buildScrolithaCareerPath('weekly-growth')}
            emptyLabel="No urgent delivery items. Browse jobs or polish a gig to keep pipeline warm."
          />
          <GrowthPulseCard />
          <EnterpriseWorkspacePanel />
          <CreatorCommercePanel />
          <PayoutOrchestrationPanel />
          <OpportunityStudioPanel
            audience="freelancer"
            title="Freelancer Opportunity Studio"
            subtitle="Use Scrolitha to reposition your offer, package services, and route toward stronger-fit work without leaving the dashboard."
          />
        </div>
      }
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
          highlights={railHighlights}
          nextActions={nextActions}
          recommendations={recommendations}
        />
      }
    />
  );
};

export default Overview;
