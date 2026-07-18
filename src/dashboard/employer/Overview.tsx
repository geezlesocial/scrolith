import React from 'react';
import {
  BadgeDollarSign,
  Bell,
  BriefcaseBusiness,
  FileText,
  FolderPlus,
  Search,
  Sparkles,
  UserPlus,
  Wallet
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '../../context/CurrencyContext';
import { employerApi, EmployerOverview as EmployerOverviewData } from '../../services/employer';
import { jobsApi } from '../../services/jobs';
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
import RightRail, { RightRailAction, RightRailMetric } from '../../components/dashboard/RightRail';
import GrowthPulseCard from '../../components/growth/GrowthPulseCard';
import {
  WorkspaceFocusPanel,
  WorkspaceStatusStrip,
  type WorkspaceFocusItem,
  type StatusChip
} from '../../components/workspace';
import { useMessages } from '../../context/MessageContext';
import { useNotification } from '../../context/NotificationContext';
import { useSocket } from '../../context/SocketContext';
import { useUser } from '../../context/UserContext';
import { buildScrolithaCareerPath } from '../../services/scrolithaCareer';
import { WalletService } from '../../services/wallet';

const parseDateValue = (value?: string) => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatTimestamp = (value?: string) => {
  if (!value) return 'Updated just now';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Updated just now';
  return date.toLocaleString();
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

export default function EmployerOverview() {
  const navigate = useNavigate();
  const { formatPrice } = useCurrency();
  const { user } = useUser();
  const { unreadCount } = useMessages();
  const { notifications } = useNotification();
  const { isConnected } = useSocket();

  const [overview, setOverview] = React.useState<EmployerOverviewData | null>(null);
  const [activity, setActivity] = React.useState<ActivityItem[]>([]);
  const [focusItems, setFocusItems] = React.useState<WorkspaceFocusItem[]>([]);
  const [proposalStats, setProposalStats] = React.useState({ pending: 0, shortlisted: 0, total: 0 });
  const [walletSnapshot, setWalletSnapshot] = React.useState<any>(null);
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

    const [overviewResult, jobsResult, proposalsResult, contractsResult, walletResult] =
      await Promise.allSettled([
        employerApi.getOverview(),
        jobsApi.getJobs({ ownerId: 'me', page: 1, limit: 5 }),
        proposalsApi.getProposals({ page: 1, limit: 12 }),
        ContractService.getContracts(user.id, 'client'),
        WalletService.getWallet()
      ]);

    if (overviewResult.status === 'fulfilled') {
      setOverview(overviewResult.value);
    }
    if (walletResult.status === 'fulfilled') {
      setWalletSnapshot(walletResult.value);
    }

    const mergedActivity: ActivityItem[] = [];
    const nextFocus: WorkspaceFocusItem[] = [];

    if (jobsResult.status === 'fulfilled') {
      jobsResult.value.jobs.slice(0, 4).forEach((job) => {
        mergedActivity.push({
          id: `job-${job.id}`,
          title: `Job ${job.status}: ${job.title || 'Untitled job'}`,
          description: `${job.proposalsCount || 0} proposals • ${typeof job.budget === 'string' ? job.budget : 'Budget configured'}`,
          timestamp: formatTimestamp(job.updatedAt || job.createdAt),
          sortValue: parseDateValue(job.updatedAt || job.createdAt),
          status: job.status || 'open',
          href: '/client/dashboard?tab=my-jobs'
        });
        if (Number(job.proposalsCount || 0) > 0) {
          nextFocus.push({
            id: `focus-job-${job.id}`,
            title: `Review applicants: ${job.title || 'Open job'}`,
            caption: `${job.proposalsCount} proposals waiting`,
            href: '/client/dashboard?tab=proposals-offers',
            urgency: Number(job.proposalsCount || 0) >= 3 ? 'high' : 'medium',
            status: job.status || 'open'
          });
        }
      });
    }

    if (proposalsResult.status === 'fulfilled') {
      const proposals = proposalsResult.value.proposals || [];
      let pending = 0;
      let shortlisted = 0;
      proposals.forEach((proposal) => {
        const status = String(proposal.status || '').toLowerCase();
        if (['pending', 'submitted', 'new', 'viewed'].includes(status)) pending += 1;
        if (['shortlisted', 'interview', 'offer'].includes(status)) shortlisted += 1;
        mergedActivity.push({
          id: `proposal-${proposal.id}`,
          title: `Proposal ${proposal.status}: ${proposal.jobTitle || 'Job'}`,
          description: `${proposal.freelancerName || 'Freelancer'} • ${formatPrice(proposal.proposedAmount || 0)}`,
          timestamp: formatTimestamp(proposal.updatedAt || proposal.createdAt),
          sortValue: parseDateValue(proposal.updatedAt || proposal.createdAt),
          status: proposal.status,
          href: '/client/dashboard?tab=proposals-offers'
        });
      });
      setProposalStats({ pending, shortlisted, total: proposals.length });
      if (pending > 0) {
        nextFocus.push({
          id: 'focus-proposals-pending',
          title: `${pending} proposals need review`,
          caption: shortlisted > 0 ? `${shortlisted} already shortlisted` : 'Triage applicants to keep hiring velocity high',
          href: '/client/dashboard?tab=proposals-offers',
          urgency: pending >= 3 ? 'high' : 'medium',
          status: 'review'
        });
      }
    } else {
      setProposalStats({ pending: 0, shortlisted: 0, total: 0 });
    }

    if (contractsResult.status === 'fulfilled') {
      contractsResult.value.slice(0, 4).forEach((contract) => {
        const hourlyRate = Number(contract.hourlyRate ?? contract.hourly_rate ?? 0);
        mergedActivity.push({
          id: `contract-${contract.id}`,
          title: `Contract ${contract.status}: ${contract.title || 'Hourly contract'}`,
          description: `${contract.freelancerName || contract.freelancer_name || 'Freelancer'} • ${
            hourlyRate > 0 ? `${formatPrice(hourlyRate)}/hr` : 'Rate set'
          }`,
          timestamp: formatTimestamp(contract.start_date),
          sortValue: parseDateValue(contract.start_date),
          status: contract.status,
          href: `/client/dashboard?tab=contracts&contract_id=${contract.id}`
        });
        if (String(contract.status || '').toLowerCase() === 'active') {
          nextFocus.push({
            id: `focus-contract-${contract.id}`,
            title: contract.title || 'Active contract',
            caption: contract.freelancerName || contract.freelancer_name || 'Freelancer engagement',
            href: `/client/dashboard?tab=contracts&contract_id=${contract.id}`,
            urgency: 'low',
            status: contract.status
          });
        }
      });
    }

    if (unreadCount + unreadNotifications > 0) {
      nextFocus.push({
        id: 'focus-inbox',
        title: 'Unread hiring updates',
        caption: `${unreadCount + unreadNotifications} messages / notifications`,
        href: '/client/dashboard?tab=messages',
        urgency: 'high',
        status: 'inbox'
      });
    }

    mergedActivity.sort((a, b) => (b.sortValue || 0) - (a.sortValue || 0));
    setActivity(mergedActivity.slice(0, 8));
    setFocusItems(nextFocus.slice(0, 6));
    setLoading(false);
    setLastRefreshedAt(new Date().toISOString());
  }, [formatPrice, user?.id, unreadCount, unreadNotifications]);

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
        id: 'active-contracts',
        title: 'Active Contracts',
        value: overview.activeContracts,
        icon: BriefcaseBusiness,
        delta: 'Ongoing managed engagements',
        href: '/client/dashboard?tab=contracts',
        accent: 'indigo'
      },
      {
        id: 'open-jobs',
        title: 'Open Jobs',
        value: overview.openJobs,
        icon: FolderPlus,
        delta: 'Active hiring pipeline',
        href: '/client/dashboard?tab=my-jobs',
        accent: 'blue'
      },
      {
        id: 'proposals',
        title: 'Proposals Received',
        value: overview.proposalsReceived,
        icon: FileText,
        delta: 'Review and shortlist candidates',
        href: '/client/dashboard?tab=proposals-offers',
        accent: 'amber'
      },
      {
        id: 'escrow',
        title: 'Escrow Balance',
        value: formatPrice(overview.escrowBalance),
        icon: Wallet,
        delta: 'Funds held for active work',
        href: '/client/dashboard?tab=contracts',
        accent: 'green'
      },
      {
        id: 'spend',
        title: 'Spend (Month)',
        value: formatPrice(overview.spendThisMonth),
        icon: BadgeDollarSign,
        delta: 'Current month spend trend',
        href: '/client/dashboard?tab=wallet',
        accent: 'slate'
      },
      {
        id: 'unread',
        title: 'Unread Updates',
        value: unreadCount + unreadNotifications,
        icon: Bell,
        delta: 'Messages and notifications',
        href: '/client/dashboard?tab=messages',
        accent: 'indigo'
      }
    ];
  }, [formatPrice, overview, unreadCount, unreadNotifications]);

  const heroMetrics: DashboardHeroMetric[] = React.useMemo(
    () => [
      {
        id: 'contracts',
        label: 'Active contracts',
        value: overview?.activeContracts ?? 0,
        helper: 'Managed delivery commitments in progress',
        tone: 'indigo'
      },
      {
        id: 'hiring-pipeline',
        label: 'Open jobs',
        value: overview?.openJobs ?? 0,
        helper: 'Roles currently collecting qualified applicants',
        tone: 'blue'
      },
      {
        id: 'proposal-load',
        label: 'Proposals',
        value: overview?.proposalsReceived ?? 0,
        helper: 'Applications waiting for review or shortlist',
        tone: 'amber'
      },
      {
        id: 'monthly-spend',
        label: 'Monthly spend',
        value: formatPrice(overview?.spendThisMonth ?? 0),
        helper: 'Current budget movement across live work',
        tone: 'green'
      }
    ],
    [formatPrice, overview]
  );

  const heroSignals: DashboardHeroSignal[] = React.useMemo(
    () => [
      {
        id: 'realtime',
        label: 'Hiring operations',
        value: isConnected ? 'Live' : 'Polling',
        description:
          unreadCount + unreadNotifications > 0
            ? `${unreadCount + unreadNotifications} updates need attention across inbox and alerts`
            : 'Queues are under control with no unread operational alerts',
        icon: Bell,
        tone: isConnected ? 'green' : 'amber'
      },
      {
        id: 'trust',
        label: 'Account readiness',
        value: isVerifiedUser(user) ? 'Verified' : 'Pending',
        description:
          (overview?.escrowBalance ?? 0) > 0
            ? `${formatPrice(overview?.escrowBalance ?? 0)} is available in escrow for active work`
            : 'Verify billing and escrow flows to streamline contract launch',
        icon: Wallet,
        tone: isVerifiedUser(user) ? 'blue' : 'amber'
      },
      {
        id: 'talent-flow',
        label: 'Talent flow',
        value: (overview?.proposalsReceived ?? 0) > 0 ? `${overview?.proposalsReceived ?? 0} incoming` : 'Ready to source',
        description:
          (overview?.openJobs ?? 0) > 0
            ? `${overview?.openJobs ?? 0} jobs are actively building pipeline depth`
            : 'Post a targeted job or invite talent directly to begin sourcing',
        icon: Sparkles,
        tone: 'indigo'
      }
    ],
    [formatPrice, isConnected, overview, unreadCount, unreadNotifications, user]
  );

  const heroActions: DashboardHeroAction[] = React.useMemo(
    () => [
      {
        id: 'hero-post-job',
        label: 'Post a job',
        description: 'Launch a new hiring workflow with structured requirements.',
        href: '/create-job',
        icon: BriefcaseBusiness,
        variant: 'primary'
      },
      {
        id: 'hero-browse-talent',
        label: 'Browse talent',
        description: 'Search and invite verified freelancers directly.',
        href: '/browse',
        icon: Search
      },
      {
        id: 'hero-proposals',
        label: 'Open proposals',
        description: 'Review shortlisted candidates and move faster.',
        href: '/client/dashboard?tab=proposals-offers',
        icon: FileText
      }
    ],
    []
  );

  const nextActions: RightRailAction[] = React.useMemo(() => {
    if (!overview) return [];
    const actions: RightRailAction[] = [];
    if (overview.openJobs > 0) {
      actions.push({
        id: 'review-open-jobs',
        label: 'Review open job performance',
        description: 'Check proposal quality and response speed.',
        href: '/client/dashboard?tab=my-jobs'
      });
    }
    if (overview.proposalsReceived > 0) {
      actions.push({
        id: 'shortlist-candidates',
        label: 'Shortlist top candidates',
        description: 'Move best-fit applicants to interview stage.',
        href: '/client/dashboard?tab=proposals-offers'
      });
    }
    if (overview.activeContracts > 0) {
      actions.push({
        id: 'review-contracts',
        label: 'Review active contracts',
        description: 'Track due amounts and progress updates.',
        href: '/client/dashboard?tab=contracts'
      });
    }
    return actions.slice(0, 3);
  }, [overview]);

  const recommendations: RightRailAction[] = React.useMemo(() => {
    return [
      {
        id: 'recommend-post-job',
        label: 'Post a targeted job',
        description: 'Use detailed requirements for better match quality.',
        href: '/create-job'
      },
      {
        id: 'recommend-browse',
        label: 'Invite verified freelancers',
        description: 'Speed up hiring by inviting top performers directly.',
        href: '/browse'
      },
      {
        id: 'recommend-ads',
        label: 'Boost hiring visibility',
        description: 'Use ad campaigns to increase qualified applicants.',
        href: '/client/dashboard?tab=my-ads'
      },
      {
        id: 'recommend-scrolitha-hire',
        label: 'AI hiring coach',
        description: 'Ask Scrolitha to refine job posts and shortlist criteria.',
        href: buildScrolithaCareerPath('profile-optimize')
      }
    ];
  }, []);

  const statusChips: StatusChip[] = React.useMemo(() => {
    const available = Number(
      walletSnapshot?.availableBalance ??
        walletSnapshot?.available_balance ??
        overview?.walletBalance ??
        0
    );
    const escrow = Number(
      walletSnapshot?.escrowBalance ?? walletSnapshot?.escrow_balance ?? overview?.escrowBalance ?? 0
    );
    return [
      {
        id: 'chip-open-jobs',
        label: 'Open jobs',
        value: overview?.openJobs ?? 0,
        href: '/client/dashboard?tab=my-jobs',
        tone: 'indigo'
      },
      {
        id: 'chip-proposals',
        label: 'To review',
        value: proposalStats.pending || overview?.proposalsReceived || 0,
        href: '/client/dashboard?tab=proposals-offers',
        tone: (proposalStats.pending || 0) > 0 ? 'amber' : 'green'
      },
      {
        id: 'chip-shortlist',
        label: 'Shortlisted',
        value: proposalStats.shortlisted,
        href: '/client/dashboard?tab=proposals-offers',
        tone: 'blue'
      },
      {
        id: 'chip-escrow',
        label: 'Escrow',
        value: formatPrice(escrow || available),
        href: '/client/dashboard?tab=wallet',
        tone: 'slate'
      }
    ];
  }, [formatPrice, overview, proposalStats, walletSnapshot]);

  const railHighlights: RightRailMetric[] = React.useMemo(
    () => [
      {
        id: 'rail-open-jobs',
        label: 'Jobs',
        value: overview?.openJobs ?? 0,
        description: 'Active hiring lanes',
        tone: 'indigo'
      },
      {
        id: 'rail-proposals',
        label: 'Proposals',
        value: overview?.proposalsReceived ?? 0,
        description: 'Applicants to review',
        tone: 'amber'
      },
      {
        id: 'rail-contracts',
        label: 'Contracts',
        value: overview?.activeContracts ?? 0,
        description: 'Live engagements',
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
      id: 'post-job',
      label: 'Post a Job',
      description: 'Launch a structured hiring workflow with scope and budget.',
      badge: 'Primary',
      icon: BriefcaseBusiness,
      href: '/create-job',
      variant: 'primary' as const
    },
    {
      id: 'browse-talent',
      label: 'Browse Talent',
      description: 'Search verified specialists and invite directly.',
      icon: Search,
      href: '/browse'
    },
    {
      id: 'create-brief',
      label: 'Create Brief (AI)',
      description: 'Draft clearer project requirements with guided prompts.',
      badge: 'AI',
      icon: Sparkles,
      href: '/create-job'
    },
    {
      id: 'invite-freelancer',
      label: 'Invite Freelancer',
      description: 'Move top-fit candidates into your pipeline immediately.',
      icon: UserPlus,
      href: '/browse'
    },
    {
      id: 'boost-job',
      label: 'Boost Job',
      description: 'Increase visibility for priority hiring campaigns.',
      icon: BadgeDollarSign,
      href: '/client/dashboard?tab=my-ads'
    }
  ];

  return (
    <DashboardShell
      title="Employer Dashboard"
      subtitle="Run hiring operations with live KPIs, actionable queues, and decision-ready signals."
      roleLabel="Employer"
      searchPlaceholder="Search jobs, proposals, or contracts..."
      searchValue={search}
      onSearchChange={setSearch}
      infoMessage="Keep response times low and prioritize contracts requiring payment or review to maintain delivery momentum."
      bannerStorageKey="employer-overview-banner-dismissed"
      verificationStatus={isVerifiedUser(user) ? 'verified' : 'pending'}
      profileCompleteness={Number(user?.profileCompleteness ?? user?.profile_completion ?? 0)}
      lastLoginLabel={user?.lastLoginAt ? formatTimestamp(user.lastLoginAt) : undefined}
      heroContent={
        <DashboardHero
          title="Employer Command Center"
          subtitle="Run hiring, contract execution, escrow visibility, and response management from a single live workspace."
          roleLabel="Employer"
          verificationStatus={isVerifiedUser(user) ? 'verified' : 'pending'}
          profileCompleteness={Number(user?.profileCompleteness ?? user?.profile_completion ?? 0)}
          lastLoginLabel={user?.lastLoginAt ? formatTimestamp(user.lastLoginAt) : undefined}
          lastSyncedLabel={formatRelativeSync(lastRefreshedAt)}
          socketConnected={Boolean(isConnected)}
          searchPlaceholder="Search jobs, proposals, or contracts..."
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
      quickActionsContent={<QuickActions items={quickActions} subtitle="Common hiring actions, one click away." />}
      supplementaryContent={
        <div className="space-y-3">
          <WorkspaceFocusPanel
            title="Hiring priorities"
            subtitle="Candidates, jobs, and contracts that need action today"
            items={focusItems}
            loading={loading && focusItems.length === 0}
            scrolithaHref={buildScrolithaCareerPath('weekly-growth')}
            emptyLabel="No urgent hiring items. Post a job or invite talent to build pipeline."
          />
          <GrowthPulseCard />
          <OpportunityStudioPanel
            audience="employer"
            title="Hiring Opportunity Studio"
            subtitle="Structure demand faster, test package alternatives, and move directly from brief to job, gig, or page discovery."
          />
        </div>
      }
      activityContent={
        <ActivityPanel
          title="Work Queue"
          subtitle="Latest jobs, proposals, and contracts requiring attention."
          items={filteredActivity}
          loading={loading && !overview}
          emptyTitle="No work items yet"
          emptyDescription="As soon as jobs receive proposals or contracts change status, updates will appear here."
          emptyCtaLabel="Post a Job"
          onEmptyCtaClick={() => navigate('/create-job')}
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
}

export { EmployerOverview as Overview };
