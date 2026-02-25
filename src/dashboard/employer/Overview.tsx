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
import KpiGrid, { KpiItem } from '../../components/dashboard/KpiGrid';
import QuickActions from '../../components/dashboard/QuickActions';
import ActivityPanel, { ActivityItem } from '../../components/dashboard/ActivityPanel';
import RightRail, { RightRailAction } from '../../components/dashboard/RightRail';
import { useMessages } from '../../context/MessageContext';
import { useNotification } from '../../context/NotificationContext';
import { useSocket } from '../../context/SocketContext';
import { useUser } from '../../context/UserContext';

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
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState('');

  const loadOverview = React.useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);

    const [overviewResult, jobsResult, proposalsResult, contractsResult] = await Promise.allSettled([
      employerApi.getOverview(),
      jobsApi.getJobs({ ownerId: 'me', page: 1, limit: 5 }),
      proposalsApi.getProposals({ page: 1, limit: 5 }),
      ContractService.getContracts(user.id, 'client')
    ]);

    if (overviewResult.status === 'fulfilled') {
      setOverview(overviewResult.value);
    }

    const mergedActivity: ActivityItem[] = [];

    if (jobsResult.status === 'fulfilled') {
      jobsResult.value.jobs.slice(0, 4).forEach((job) => {
        mergedActivity.push({
          id: `job-${job.id}`,
          title: `Job ${job.status}: ${job.title || 'Untitled job'}`,
          description: `${job.proposalsCount || 0} proposals • ${typeof job.budget === 'string' ? job.budget : 'Budget configured'}`,
          timestamp: formatTimestamp(job.updatedAt || job.createdAt),
          status: job.status || 'open',
          href: '/client/dashboard?tab=my-jobs'
        });
      });
    }

    if (proposalsResult.status === 'fulfilled') {
      proposalsResult.value.proposals.slice(0, 4).forEach((proposal) => {
        mergedActivity.push({
          id: `proposal-${proposal.id}`,
          title: `Proposal ${proposal.status}: ${proposal.jobTitle || 'Job'}`,
          description: `${proposal.freelancerName || 'Freelancer'} • ${formatPrice(proposal.proposedAmount || 0)}`,
          timestamp: formatTimestamp(proposal.updatedAt || proposal.createdAt),
          status: proposal.status,
          href: '/client/dashboard?tab=proposals-offers'
        });
      });
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
          status: contract.status,
          href: `/client/dashboard?tab=contracts&contract_id=${contract.id}`
        });
      });
    }

    mergedActivity.sort((a, b) => parseDateValue(b.timestamp) - parseDateValue(a.timestamp));
    setActivity(mergedActivity.slice(0, 8));
    setLoading(false);
  }, [formatPrice, user?.id]);

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
      }
    ];
  }, []);

  const quickActions = [
    { id: 'post-job', label: 'Post a Job', icon: BriefcaseBusiness, href: '/create-job', variant: 'primary' as const },
    { id: 'browse-talent', label: 'Browse Talent', icon: Search, href: '/browse' },
    { id: 'create-brief', label: 'Create Brief (AI)', icon: Sparkles, href: '/create-job' },
    { id: 'invite-freelancer', label: 'Invite Freelancer', icon: UserPlus, href: '/browse' },
    { id: 'boost-job', label: 'Boost Job', icon: BadgeDollarSign, href: '/client/dashboard?tab=my-ads' }
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
      kpiContent={<KpiGrid items={kpiItems} loading={loading && !overview} />}
      quickActionsContent={<QuickActions items={quickActions} subtitle="Common hiring actions, one click away." />}
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
          nextActions={nextActions}
          recommendations={recommendations}
        />
      }
    />
  );
}

export { EmployerOverview as Overview };
