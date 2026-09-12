import api from './api';

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

const normalizeSkillGapPayload = (payload: any) => {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.report && typeof payload.report === 'object') {
    return {
      ...payload.report,
      reportId: payload.id || payload.reportId || null,
      createdAt: payload.createdAt || payload.report?.createdAt || null,
      generatedBy: payload.generatedBy || payload.report?.generatedBy || null
    };
  }
  return payload;
};

export type FeedMode = 'growth' | 'opportunity' | 'network' | 'learning';

export type ProfessionalScore = {
  userId: string;
  score: number;
  breakdown: Record<string, any>;
  riskFlags: Record<string, any>;
  updatedAt: string;
};

export type CareerDailyActionState = {
  type: 'post' | 'reply' | 'apply' | 'learn' | string;
  label: string;
  completed: boolean;
  completedAt?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
};

export type CareerDailySummary = {
  userId: string;
  actionDate: string;
  goalCount: number;
  completedCount: number;
  allCompleted: boolean;
  actions: CareerDailyActionState[];
};

export type FriendStreakUserSummary = {
  id: string;
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  role?: string | null;
  reason?: string | null;
};

export type FriendStreakInviteSummary = {
  id: string;
  status: 'PENDING' | string;
  invitedAt: string;
  initiatedByUserId: string;
  partner: FriendStreakUserSummary;
};

export type FriendStreakActiveSummary = {
  id: string;
  status: 'ACTIVE' | string;
  acceptedAt?: string | null;
  initiatedByUserId: string;
  partner: FriendStreakUserSummary;
  sharedCurrentStreakDays: number;
  today: {
    actionDate: string;
    goalCount: number;
    viewerCompletedCount: number;
    partnerCompletedCount: number;
    viewerCompletedActions: string[];
    partnerCompletedActions: string[];
    viewerAllCompleted: boolean;
    partnerAllCompleted: boolean;
    bothCompleted: boolean;
  };
};

export type FriendStreakDashboard = {
  userId: string;
  actionDate: string;
  maxActive: number;
  activeCount: number;
  pendingIncomingCount: number;
  pendingOutgoingCount: number;
  canInvite: boolean;
  active: FriendStreakActiveSummary[];
  incomingInvites: FriendStreakInviteSummary[];
  outgoingInvites: FriendStreakInviteSummary[];
  candidates: FriendStreakUserSummary[];
};

export type DailyMission = {
  key: string;
  badge: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  progressLabel: string;
  completed: boolean;
  helperText?: string | null;
  remainingActionTypes?: string[];
  remainingActionLabels?: string[];
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  category?: string | null;
};

export type DailyMissionSummary = {
  userId: string;
  actionDate: string;
  completedCount: number;
  totalCount: number;
  allCompleted: boolean;
  missions: DailyMission[];
};

export type LeagueTierSummary = {
  userId: string;
  monthKey: string;
  rank: number | null;
  totalRanked: number;
  percentile: number;
  score: number;
  tier: {
    key: string;
    label: string;
    badge: string;
    accent: string;
  };
  nextTier?: {
    key: string;
    label: string;
    minPercentile: number;
    remainingPercentile: number;
  } | null;
  leaders: Array<{
    userId: string;
    name: string;
    username?: string | null;
    avatarUrl?: string | null;
    score: number;
    rank: number;
  }>;
};

export type ReferralSquadInvite = {
  id: string;
  squadId: string;
  squadName: string;
  sentAt: string;
  from?: FriendStreakUserSummary;
  to?: FriendStreakUserSummary;
};

export type ReferralSquadSummary = {
  userId: string;
  canInvite: boolean;
  currentSquad: null | {
    id: string;
    name: string;
    code: string;
    memberCount: number;
    maxMembers: number;
    referralCount: number;
    earnings: number;
    rank: number | null;
    totalSquads: number;
    members: Array<FriendStreakUserSummary & { role: 'captain' | 'member'; joinedAt: string; referrals: number; earnings: number }>;
  };
  incomingInvites: ReferralSquadInvite[];
  outgoingInvites: ReferralSquadInvite[];
  candidates: FriendStreakUserSummary[];
};

export type RewardDropCard = {
  id: string;
  key: string;
  title: string;
  description: string;
  amount: number;
  cadence: 'daily' | 'monthly' | 'once' | string;
  eligible: boolean;
  claimed: boolean;
  statusLabel: string;
  helperText: string;
  claimRef: string;
};

export type RewardDropSummary = {
  userId: string;
  totalActive: number;
  claimableCount: number;
  drops: RewardDropCard[];
};

export type FanClubCard = {
  id: string;
  title: string;
  description: string;
  visibility?: 'public' | 'private' | string;
  memberCount: number;
  owner: {
    id: string;
    name: string;
    username?: string | null;
    avatarUrl?: string | null;
    href?: string | null;
  };
  coverImage?: string | null;
  isJoined?: boolean;
  isFollowing?: boolean;
  sourceType?: 'creator' | 'page' | string;
  updateCount?: number;
  pricing?: {
    isPaid: boolean;
    price: number;
    currency: string;
    trialDays: number;
    headline?: string | null;
    perks: string[];
    subscribed: boolean;
  };
  latestUpdate?: {
    content: string;
    createdAt?: string | null;
  } | null;
};

export type SkillMiniGameChoice = {
  id: string;
  label: string;
};

export type SkillMiniGameSummary = {
  id: string;
  title: string;
  prompt: string;
  category: string;
  rewardAmount: number;
  helperText?: string | null;
  explanation: string;
  choices: SkillMiniGameChoice[];
  playedToday: boolean;
  correctToday: boolean;
  selectedChoiceId?: string | null;
  rewardGranted: boolean;
};

export type EventSeasonPassSummary = {
  id: string;
  label: string;
  description?: string | null;
  price: number;
  currency: string;
  active: boolean;
  activated: boolean;
};

export type EventSeasonSummary = {
  id: string;
  key: string;
  title: string;
  description: string;
  badge: string;
  startsAt: string;
  endsAt: string;
  progress: {
    completedGoals: number;
    totalGoals: number;
    registeredEvents: number;
    joinedClubs: number;
    miniGamesCompleted: number;
  };
  nextEvents: Array<{
    id: string;
    title: string;
    type: string;
    startTime: string;
    isRegistered: boolean;
  }>;
  passes: EventSeasonPassSummary[];
};

export type PremiumSeriesCard = {
  id: string;
  title: string;
  description?: string | null;
  creator: {
    id: string;
    name: string;
    username?: string | null;
    avatarUrl?: string | null;
  };
  itemCount: number;
  href: string;
  unlock: {
    available: boolean;
    unlocked: boolean;
    price: number;
    currency: string;
    teaser: string;
    bonusLabel: string;
  };
};

export type ExpertBountyAnswerSummary = {
  id: string;
  body: string;
  isAccepted: boolean;
  createdAt: string;
  author: {
    id: string;
    name: string;
    username?: string | null;
    avatarUrl?: string | null;
  };
};

export type ExpertBountyQuestionSummary = {
  id: string;
  title: string;
  body: string;
  category?: string | null;
  tags: string[];
  status: string;
  bountyAmount: number;
  bountyCurrency: string;
  answerCount: number;
  acceptedAnswerId?: string | null;
  author: {
    id: string;
    name: string;
    username?: string | null;
    avatarUrl?: string | null;
  };
  canAnswer: boolean;
  canAward: boolean;
  answers: ExpertBountyAnswerSummary[];
};

export type EngagementExpansionSummary = {
  fanClubs: {
    freeClubs: FanClubCard[];
    fanChannels: FanClubCard[];
  };
  miniGames: {
    dayKey: string;
    playedCount: number;
    totalCount: number;
    games: SkillMiniGameSummary[];
  };
  seasons: {
    items: EventSeasonSummary[];
  };
  premiumSeries: {
    items: PremiumSeriesCard[];
  };
  expertBounties: {
    openCount: number;
    totalBountyAmount: number;
    questions: ExpertBountyQuestionSummary[];
  };
};

export type InsightAchievement = {
  id: string;
  key: string;
  title: string;
  description?: string | null;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum' | string;
  earned: boolean;
  earnedAt?: string | null;
  rules?: Record<string, any>;
};

export type CreatorChallengeSubmissionOption = {
  contentType: 'community_post' | 'scroll_video' | string;
  contentId: string;
  title: string;
  description?: string | null;
  coverUrl?: string | null;
  destinationUrl?: string | null;
  createdAt?: string | null;
};

export type CreatorChallengeEntry = {
  id: string;
  userId: string;
  contentType: 'community_post' | 'scroll_video' | string;
  contentId: string;
  title: string;
  description?: string | null;
  coverUrl?: string | null;
  destinationUrl?: string | null;
  voteCount: number;
  isWinner: boolean;
  position?: number | null;
  status: string;
  createdAt?: string | null;
  viewerCanVote: boolean;
  viewerHasVoted: boolean;
  author: {
    id: string;
    name: string;
    username?: string | null;
    avatarUrl?: string | null;
    role?: string | null;
  };
};

export type CreatorChallenge = {
  id: string;
  key: string;
  weekKey: string;
  title: string;
  description?: string | null;
  category?: string | null;
  contentTypes: string[];
  status: 'draft' | 'active' | 'finalized' | 'archived' | string;
  isActive: boolean;
  entryLimitPerUser: number;
  maxWinners: number;
  startAt?: string | null;
  endAt?: string | null;
  finalizedAt?: string | null;
  reward?: Record<string, any>;
  stats: {
    totalEntries: number;
    totalVotes: number;
  };
  viewerVoteEntryId?: string | null;
  viewerEntry?: CreatorChallengeEntry | null;
  canSubmit: boolean;
  submissionOptions: CreatorChallengeSubmissionOption[];
  topEntries: CreatorChallengeEntry[];
  winners?: CreatorChallengeEntry[];
};

export type CreatorChallengeDashboard = {
  userId: string;
  weekKey: string;
  activeCount: number;
  totalWins: number;
  challenges: CreatorChallenge[];
};

export type UserStreak = {
  userId: string;
  currentStreakDays: number;
  bestStreakDays: number;
  lastActiveDate?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  careerDaily?: CareerDailySummary | null;
  friendStreaks?: FriendStreakDashboard | null;
  dailyMissions?: DailyMissionSummary | null;
  leagueTier?: LeagueTierSummary | null;
  referralSquads?: ReferralSquadSummary | null;
  rewardDrops?: RewardDropSummary | null;
};

export type OpportunityHubData = {
  identity: {
    userId: string;
    name: string;
    username?: string | null;
    role: string;
    title?: string;
    location?: string;
    skills?: string[];
    profileCompleteness: number;
    verificationState?: string;
    verified?: boolean;
    kycStatus?: string;
    followersCount: number;
    postsCount: number;
    commentsCount: number;
    portfolioProofs: number;
    verifiedProofs: number;
    activePages: number;
  };
  trust: {
    score: number;
    trustTier: string;
    breakdown: Record<string, any>;
    riskFlags: Record<string, any>;
    averageRating: number;
    ratingsCount: number;
    completedOrders: number;
    cancelledOrders: number;
    proposalWinRate: number;
    responseRate: number;
    responseTimeHours: number;
    updatedAt: string;
  };
  delivery: {
    activeContracts: number;
    activeTrackingSessions: number;
    activeOrders: number;
    openProposals: number;
    pendingDue: number;
    totalEarned: number;
    totalSpent: number;
    walletBalance: number;
    trackedHours: number;
  };
  packaging: {
    activeGigs: number;
    featuredGigs: number;
    activeJobs: number;
    activePages: number;
    pages: Array<{
      id: string;
      name: string;
      slug: string;
      tagline?: string | null;
      industry?: string | null;
      followersCount: number;
      postsCount: number;
      status: string;
    }>;
  };
  matching: {
    total: number;
    matches: any[];
  };
  workroom?: {
    totalWorkstreams: number;
    needsAttention: number;
    activeContracts: number;
    activeOrders: number;
    openProposals: number;
    items: Array<{
      id: string;
      source: 'contract' | 'order' | 'proposal';
      sourceId: string;
      title: string;
      subtitle?: string;
      status: string;
      priority: 'high' | 'medium' | 'low';
      updatedAt: string;
      dueAt?: string | null;
      amount?: number;
      actionLabel: string;
      actionUrl: string;
    }>;
  };
  actions: string[];
};

export type OpportunityBriefResult = {
  brief: {
    title: string;
    intent: string;
    summary: string;
    budgetRange: string;
    timeline: string;
    skills: string[];
    deliverables: string[];
  };
  packageBlueprint: Array<{
    tier: string;
    name: string;
    positioning: string;
    turnaround: string;
    deliverables: string[];
    pricingGuidance: string;
  }>;
  matches: {
    jobs: Array<{
      id: string;
      title: string;
      budget?: string | null;
      type?: string | null;
      clientName?: string;
      score: number;
      reasons: string[];
      destinationUrl: string;
    }>;
    gigs: Array<{
      id: string;
      title: string;
      price?: number | null;
      deliveryTime?: number | null;
      sellerName?: string;
      score: number;
      reasons: string[];
      destinationUrl: string;
    }>;
    pages: Array<{
      id: string;
      name: string;
      slug: string;
      tagline?: string | null;
      industry?: string | null;
      followersCount: number;
      score: number;
      reasons: string[];
      destinationUrl: string;
    }>;
  };
  suggestedActions: string[];
};

export type UserQuest = {
  id: string;
  userId: string;
  questId: string;
  status: 'assigned' | 'in_progress' | 'completed' | 'expired' | string;
  progress: number;
  target: number;
  assignedAt?: string;
  startedAt?: string | null;
  completedAt?: string | null;
  expiresAt?: string | null;
  rewardGranted?: boolean;
  meta?: Record<string, any>;
  quest?: {
    id: string;
    key: string;
    title: string;
    description?: string | null;
    roleScope?: string[];
    difficulty?: string;
    verificationRules?: Record<string, any>;
    reward?: Record<string, any>;
    isWeekly?: boolean;
    rotationWeight?: number;
    isActive?: boolean;
  } | null;
};

class InsightsService {
  static async getMyPgs(): Promise<ProfessionalScore | null> {
    const response = await api.get('/insights/pgs/me');
    return extractData<ProfessionalScore | null>(response);
  }

  static async getMyAchievements(): Promise<InsightAchievement[]> {
    const response = await api.get('/insights/achievements/me');
    const data = extractData<any>(response);
    return Array.isArray(data) ? (data as InsightAchievement[]) : [];
  }

  static async getMyStreak(): Promise<UserStreak | null> {
    const response = await api.get('/insights/streak/me');
    return extractData<UserStreak | null>(response);
  }

  static async inviteFriendStreak(partnerUserId: string): Promise<UserStreak | null> {
    const response = await api.post('/insights/streak/friends/invite', { partnerUserId });
    const data = extractData<any>(response);
    if (data && typeof data === 'object' && 'userId' in data) {
      return { friendStreaks: data } as UserStreak;
    }
    return data as UserStreak | null;
  }

  static async respondFriendStreak(friendStreakId: string, responseValue: 'accept' | 'decline'): Promise<UserStreak | null> {
    const response = await api.post(`/insights/streak/friends/${encodeURIComponent(friendStreakId)}/respond`, {
      response: responseValue
    });
    const data = extractData<any>(response);
    if (data && typeof data === 'object' && 'userId' in data) {
      return { friendStreaks: data } as UserStreak;
    }
    return data as UserStreak | null;
  }

  static async endFriendStreak(friendStreakId: string): Promise<UserStreak | null> {
    const response = await api.post(`/insights/streak/friends/${encodeURIComponent(friendStreakId)}/end`, {});
    const data = extractData<any>(response);
    if (data && typeof data === 'object' && 'userId' in data) {
      return { friendStreaks: data } as UserStreak;
    }
    return data as UserStreak | null;
  }

  static async inviteReferralSquad(partnerUserId: string, squadName?: string): Promise<UserStreak | null> {
    const response = await api.post('/insights/streak/referral-squads/invite', { partnerUserId, squadName });
    const data = extractData<any>(response);
    if (data && typeof data === 'object' && 'userId' in data) {
      return { referralSquads: data } as UserStreak;
    }
    return data as UserStreak | null;
  }

  static async respondReferralSquadInvite(inviteId: string, responseValue: 'accept' | 'decline'): Promise<UserStreak | null> {
    const response = await api.post(`/insights/streak/referral-squads/invites/${encodeURIComponent(inviteId)}/respond`, {
      response: responseValue
    });
    const data = extractData<any>(response);
    if (data && typeof data === 'object' && 'userId' in data) {
      return { referralSquads: data } as UserStreak;
    }
    return data as UserStreak | null;
  }

  static async leaveReferralSquad(squadId: string): Promise<UserStreak | null> {
    const response = await api.post(`/insights/streak/referral-squads/${encodeURIComponent(squadId)}/leave`, {});
    const data = extractData<any>(response);
    if (data && typeof data === 'object' && 'userId' in data) {
      return { referralSquads: data } as UserStreak;
    }
    return data as UserStreak | null;
  }

  static async claimRewardDrop(dropId: string): Promise<UserStreak | null> {
    const response = await api.post(`/insights/streak/reward-drops/${encodeURIComponent(dropId)}/claim`, {});
    const data = extractData<any>(response);
    if (data && typeof data === 'object' && 'userId' in data) {
      return { rewardDrops: data } as UserStreak;
    }
    return data as UserStreak | null;
  }

  static async getEngagementExpansion(): Promise<EngagementExpansionSummary | null> {
    const response = await api.get('/insights/engagement-phase/me');
    return extractData<EngagementExpansionSummary | null>(response);
  }

  static async subscribeFanChannel(channelId: string): Promise<EngagementExpansionSummary | null> {
    const response = await api.post(`/insights/engagement-phase/fan-channels/${encodeURIComponent(channelId)}/subscribe`, {});
    return extractData<EngagementExpansionSummary | null>(response);
  }

  static async submitSkillMiniGame(gameId: string, choiceId: string): Promise<EngagementExpansionSummary | null> {
    const response = await api.post(`/insights/engagement-phase/mini-games/${encodeURIComponent(gameId)}/submit`, { choiceId });
    return extractData<EngagementExpansionSummary | null>(response);
  }

  static async activateEventSeasonPass(seasonId: string, passId: string): Promise<EngagementExpansionSummary | null> {
    const response = await api.post(
      `/insights/engagement-phase/seasons/${encodeURIComponent(seasonId)}/passes/${encodeURIComponent(passId)}/activate`,
      {}
    );
    return extractData<EngagementExpansionSummary | null>(response);
  }

  static async unlockPremiumSeries(seriesId: string): Promise<EngagementExpansionSummary | null> {
    const response = await api.post(`/insights/engagement-phase/premium-series/${encodeURIComponent(seriesId)}/unlock`, {});
    return extractData<EngagementExpansionSummary | null>(response);
  }

  static async createExpertBountyQuestion(payload: {
    title: string;
    body: string;
    category?: string | null;
    tags?: string[];
    bountyAmount?: number;
  }): Promise<EngagementExpansionSummary | null> {
    const response = await api.post('/insights/engagement-phase/bounties/questions', payload);
    return extractData<EngagementExpansionSummary | null>(response);
  }

  static async answerExpertBountyQuestion(questionId: string, body: string): Promise<EngagementExpansionSummary | null> {
    const response = await api.post(
      `/insights/engagement-phase/bounties/questions/${encodeURIComponent(questionId)}/answers`,
      { body }
    );
    return extractData<EngagementExpansionSummary | null>(response);
  }

  static async awardExpertBounty(questionId: string, answerId: string): Promise<EngagementExpansionSummary | null> {
    const response = await api.post(
      `/insights/engagement-phase/bounties/questions/${encodeURIComponent(questionId)}/award`,
      { answerId }
    );
    return extractData<EngagementExpansionSummary | null>(response);
  }

  static async getMyCreatorChallenges(): Promise<CreatorChallengeDashboard | null> {
    const response = await api.get('/insights/challenges/me');
    return extractData<CreatorChallengeDashboard | null>(response);
  }

  static async submitCreatorChallengeEntry(
    challengeId: string,
    payload: { contentType: string; contentId: string }
  ): Promise<CreatorChallengeDashboard | null> {
    const response = await api.post(`/insights/challenges/${encodeURIComponent(challengeId)}/entries`, payload);
    return extractData<CreatorChallengeDashboard | null>(response);
  }

  static async voteCreatorChallengeEntry(challengeId: string, entryId: string): Promise<CreatorChallengeDashboard | null> {
    const response = await api.post(`/insights/challenges/${encodeURIComponent(challengeId)}/vote`, { entryId });
    return extractData<CreatorChallengeDashboard | null>(response);
  }

  static async getMyQuests(): Promise<UserQuest[]> {
    const response = await api.get('/insights/quests/me');
    const data = extractData<any>(response);
    return Array.isArray(data) ? data : [];
  }

  static async completeMyQuest(userQuestId: string): Promise<UserQuest> {
    const response = await api.post(`/insights/quests/${encodeURIComponent(userQuestId)}/complete`, {});
    return extractData<UserQuest>(response);
  }

  static async getLeaderboard(scope: 'global' | 'freelancer' | 'employer' = 'global'): Promise<any> {
    const response = await api.get(`/insights/leaderboard?scope=${encodeURIComponent(scope)}`);
    return extractData<any>(response);
  }

  static async getMatches(type: 'job' | 'gig' | 'all' = 'all'): Promise<any[]> {
    const query = type === 'all' ? '' : `?type=${encodeURIComponent(type)}`;
    const response = await api.get(`/insights/matches/me${query}`);
    const data = extractData<any>(response);
    return Array.isArray(data) ? data : [];
  }

  static async getRevenue(): Promise<any> {
    const response = await api.get('/insights/revenue/me');
    return extractData<any>(response);
  }

  static async getOpportunityHub(): Promise<OpportunityHubData | null> {
    const response = await api.get('/insights/opportunity-hub/me');
    return extractData<OpportunityHubData | null>(response);
  }

  static async generateOpportunityBrief(prompt: string): Promise<OpportunityBriefResult> {
    const response = await api.post('/insights/opportunity-brief', { prompt }, { timeout: 45_000 });
    return extractData<OpportunityBriefResult>(response);
  }

  static async recordOpportunityFeedback(input: {
    entityType: 'job' | 'gig' | 'page' | string;
    entityId: string;
    action: 'click' | 'dismiss';
    metadata?: Record<string, any>;
  }): Promise<void> {
    await api.post('/reco/feedback', {
      surface: 'opportunity_studio',
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      metadata: input.metadata || {}
    });
  }

  static async getPostPrediction(postId: string, force = false): Promise<any> {
    const query = force ? '?force=true' : '';
    const response = await api.get(`/insights/post/${encodeURIComponent(postId)}/prediction${query}`);
    return extractData<any>(response);
  }

  static async generateSkillGap(): Promise<any> {
    const response = await api.post('/insights/skill-gap/generate', {});
    return normalizeSkillGapPayload(extractData<any>(response));
  }

  static async getSkillGap(): Promise<any> {
    const response = await api.get('/insights/skill-gap/me');
    return normalizeSkillGapPayload(extractData<any>(response));
  }

  static async setFeedMode(mode: FeedMode): Promise<any> {
    const response = await api.post('/insights/feed-mode', { mode });
    return extractData<any>(response);
  }

  static async getFeedMode(): Promise<{
    mode: FeedMode;
    feedIntent?: string;
    source?: string;
    personalizationEnabled?: boolean;
    version?: string;
    mapped?: { insightsMode?: string; memberFeedIntent?: string };
  }> {
    const response = await api.get('/insights/feed-mode');
    return extractData<{ mode: FeedMode }>(response);
  }

  static async getAdminConfig(): Promise<any> {
    const response = await api.get('/admin/insights/config');
    return extractData<any>(response);
  }

  static async updateAdminConfig(payload: any): Promise<any> {
    const response = await api.put('/admin/insights/config', payload);
    return extractData<any>(response);
  }

  static async recomputeUser(userId: string): Promise<any> {
    const response = await api.post(`/admin/insights/recompute/${encodeURIComponent(userId)}`, {});
    return extractData<any>(response);
  }

  static async recomputeAll(limit = 300): Promise<any> {
    const response = await api.post('/admin/insights/recompute-all', { limit });
    return extractData<any>(response);
  }

  static async getAdminAchievements(): Promise<any[]> {
    const response = await api.get('/admin/insights/achievements');
    const data = extractData<any>(response);
    return Array.isArray(data) ? data : [];
  }

  static async createAdminAchievement(payload: any): Promise<any> {
    const response = await api.post('/admin/insights/achievements', payload);
    return extractData<any>(response);
  }

  static async updateAdminAchievement(id: string, payload: any): Promise<any> {
    const response = await api.put(`/admin/insights/achievements/${encodeURIComponent(id)}`, payload);
    return extractData<any>(response);
  }

  static async toggleAdminAchievement(id: string): Promise<any> {
    const response = await api.post(`/admin/insights/achievements/${encodeURIComponent(id)}/toggle`, {});
    return extractData<any>(response);
  }

  static async getAdminCreatorChallenges(weekKey?: string): Promise<any[]> {
    const query = weekKey ? `?weekKey=${encodeURIComponent(weekKey)}` : '';
    const response = await api.get(`/admin/insights/challenges${query}`);
    const data = extractData<any>(response);
    return Array.isArray(data) ? data : [];
  }

  static async createAdminCreatorChallenge(payload: any): Promise<any> {
    const response = await api.post('/admin/insights/challenges', payload);
    return extractData<any>(response);
  }

  static async updateAdminCreatorChallenge(id: string, payload: any): Promise<any> {
    const response = await api.put(`/admin/insights/challenges/${encodeURIComponent(id)}`, payload);
    return extractData<any>(response);
  }

  static async toggleAdminCreatorChallenge(id: string): Promise<any> {
    const response = await api.post(`/admin/insights/challenges/${encodeURIComponent(id)}/toggle`, {});
    return extractData<any>(response);
  }

  static async finalizeAdminCreatorChallenge(id: string): Promise<any> {
    const response = await api.post(`/admin/insights/challenges/${encodeURIComponent(id)}/finalize`, {});
    return extractData<any>(response);
  }

  static async getAdminQuests(): Promise<any[]> {
    const response = await api.get('/admin/insights/quests');
    const data = extractData<any>(response);
    return Array.isArray(data) ? data : [];
  }

  static async createAdminQuest(payload: any): Promise<any> {
    const response = await api.post('/admin/insights/quests', payload);
    return extractData<any>(response);
  }

  static async updateAdminQuest(id: string, payload: any): Promise<any> {
    const response = await api.put(`/admin/insights/quests/${encodeURIComponent(id)}`, payload);
    return extractData<any>(response);
  }

  static async toggleAdminQuest(id: string): Promise<any> {
    const response = await api.post(`/admin/insights/quests/${encodeURIComponent(id)}/toggle`, {});
    return extractData<any>(response);
  }

  static async getAdminLeaderboard(weekKey: string, scope: 'global' | 'freelancer' | 'employer' = 'global'): Promise<any> {
    const response = await api.get(
      `/admin/insights/leaderboard/${encodeURIComponent(weekKey)}?scope=${encodeURIComponent(scope)}`
    );
    return extractData<any>(response);
  }

  static async rebuildAdminLeaderboard(scopes: Array<'global' | 'freelancer' | 'employer'>): Promise<any> {
    const response = await api.post('/admin/insights/leaderboard/rebuild', { scopes });
    return extractData<any>(response);
  }
}

export { InsightsService };
