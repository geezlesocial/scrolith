import prisma from '../utils/prismaClient';

type ContentPolicyFilters = {
  contentType?: string;
  query?: string;
  activeOnly?: boolean;
};

type SaveContentPolicyInput = {
  id?: string;
  key?: string;
  label?: string;
  description?: string | null;
  contentType?: string;
  severity?: string;
  action?: string;
  thresholds?: unknown;
  metadata?: unknown;
  isActive?: boolean;
  isSystemPolicy?: boolean;
};

type ModerationCaseFilters = {
  status?: string;
  contentType?: string;
  query?: string;
  limit?: number;
};

type ModerationAppealFilters = {
  status?: string;
  query?: string;
  limit?: number;
};

type TrustProfileFilters = {
  riskLevel?: string;
  query?: string;
  limit?: number;
};

type RiskSignalFilters = {
  status?: string;
  severity?: string;
  query?: string;
  userId?: string;
  limit?: number;
};

type SaveRiskSignalInput = {
  identifier?: string;
  signalType?: string;
  severity?: string;
  source?: string;
  status?: string;
  reason?: string;
  metadata?: unknown;
  expiresAt?: string | null;
};

type ResolveAppealInput = {
  status?: string;
  resolutionNotes?: string | null;
};

const DEFAULT_CONTENT_POLICIES = [
  {
    key: 'community_post_spam_review',
    label: 'Community Post Spam Review',
    description: 'Review suspicious post velocity and repeated promotional copy before public distribution.',
    contentType: 'community_post',
    severity: 'HIGH',
    action: 'REVIEW',
    thresholds: { spamScoreGte: 0.7, repeatedLinkCountGte: 3 }
  },
  {
    key: 'community_comment_abuse_escalation',
    label: 'Comment Abuse Escalation',
    description: 'Escalate abusive comment patterns for moderator review.',
    contentType: 'community_comment',
    severity: 'HIGH',
    action: 'ESCALATE',
    thresholds: { toxicityScoreGte: 0.8, repeatOffenderCountGte: 2 }
  },
  {
    key: 'media_sensitive_content_review',
    label: 'Sensitive Media Review',
    description: 'Queue uploaded media with elevated risk markers for manual review.',
    contentType: 'media_upload',
    severity: 'MEDIUM',
    action: 'REVIEW',
    thresholds: { sensitiveMediaScoreGte: 0.65 }
  },
  {
    key: 'live_chat_offplatform_warning',
    label: 'Live Chat Off-platform Warning',
    description: 'Flag live chat attempts to move payments or negotiations off platform.',
    contentType: 'live_chat',
    severity: 'MEDIUM',
    action: 'WARN',
    thresholds: { offPlatformIntentScoreGte: 0.6 }
  }
];

const OPEN_CASE_STATUSES = ['open', 'pending', 'review', 'under_review', 'flagged'];
const RESOLVED_CASE_STATUSES = ['resolved', 'closed', 'dismissed', 'rejected', 'approved'];
const OPEN_APPEAL_STATUSES = ['open', 'pending', 'under_review'];

let contentPoliciesSeeded = false;

const cleanString = (value: unknown) => String(value || '').trim();
const optionalString = (value: unknown) => {
  const next = cleanString(value);
  return next.length ? next : null;
};
const normalizeUpper = (value: unknown, fallback: string) => {
  const next = cleanString(value).toUpperCase();
  return next || fallback;
};
const clampLimit = (value: unknown, fallback = 50) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(100, Math.round(parsed)));
};
const isExpired = (value?: Date | null) => Boolean(value && value.getTime() <= Date.now());

const mapContentPolicy = (policy: any) => ({
  id: policy.id,
  key: policy.key,
  label: policy.label,
  description: policy.description || '',
  contentType: policy.contentType,
  severity: policy.severity,
  action: policy.action,
  thresholds: policy.thresholds || null,
  metadata: policy.metadata || null,
  isSystemPolicy: Boolean(policy.isSystemPolicy),
  isActive: Boolean(policy.isActive),
  createdByStaffId: policy.createdByStaffId || null,
  updatedByStaffId: policy.updatedByStaffId || null,
  createdAt: policy.createdAt,
  updatedAt: policy.updatedAt
});

const mapModerationCase = (item: any) => ({
  id: item.id,
  contentType: item.contentType,
  contentId: item.contentId,
  score: Number(item.score || 0),
  status: item.status,
  policy: item.policy || null,
  reason: item.reason || '',
  createdByType: item.createdByType || '',
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
  author: item.author
    ? {
        id: item.author.id,
        email: item.author.email,
        username: item.author.username || '',
        name: item.author.name || '',
        role: item.author.role,
        isActive: Boolean(item.author.isActive)
      }
    : null,
  createdByUser: item.createdByUser
    ? {
        id: item.createdByUser.id,
        email: item.createdByUser.email,
        name: item.createdByUser.name || ''
      }
    : null,
  actions: Array.isArray(item.actions)
    ? item.actions.map((action: any) => ({
        id: action.id,
        action: action.action,
        reason: action.reason || '',
        payload: action.payload || null,
        createdAt: action.createdAt
      }))
    : []
});

const mapUserSummary = (user: any) =>
  user
    ? {
        id: user.id,
        email: user.email,
        username: user.username || '',
        name: user.name || '',
        role: user.role,
        isActive: Boolean(user.isActive),
        isVerified: Boolean(user.isVerified),
        kycStatus: user.kycStatus
      }
    : null;

const mapAppeal = (appeal: any, userMap: Map<string, any>, caseMap: Map<string, any>) => ({
  id: appeal.id,
  caseId: appeal.caseId,
  targetUserId: appeal.targetUserId || null,
  submittedByUserId: appeal.submittedByUserId || null,
  status: appeal.status,
  reason: appeal.reason,
  resolutionNotes: appeal.resolutionNotes || '',
  resolvedByStaffId: appeal.resolvedByStaffId || null,
  resolvedAt: appeal.resolvedAt,
  createdAt: appeal.createdAt,
  updatedAt: appeal.updatedAt,
  targetUser: mapUserSummary(appeal.targetUserId ? userMap.get(appeal.targetUserId) : null),
  submittedByUser: mapUserSummary(appeal.submittedByUserId ? userMap.get(appeal.submittedByUserId) : null),
  moderationCase: caseMap.get(appeal.caseId) || null
});

const mapRiskSignal = (signal: any, userMap: Map<string, any>) => ({
  id: signal.id,
  userId: signal.userId,
  signalType: signal.signalType,
  severity: signal.severity,
  source: signal.source,
  status: signal.status,
  reason: signal.reason,
  metadata: signal.metadata || null,
  expiresAt: signal.expiresAt,
  createdByStaffId: signal.createdByStaffId || null,
  resolvedByStaffId: signal.resolvedByStaffId || null,
  resolvedAt: signal.resolvedAt,
  createdAt: signal.createdAt,
  updatedAt: signal.updatedAt,
  user: mapUserSummary(userMap.get(signal.userId))
});

const fetchUsersMap = async (userIds: string[]): Promise<Map<string, any>> => {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (!unique.length) return new Map<string, any>();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      role: true,
      isActive: true,
      isVerified: true,
      kycStatus: true
    }
  });
  return new Map<string, any>(users.map((user) => [user.id, user]));
};

const resolveUserByIdentifier = async (identifier: string) => {
  const cleaned = cleanString(identifier);
  if (!cleaned) return null;
  return prisma.user.findFirst({
    where: {
      OR: [
        { id: cleaned },
        { email: { equals: cleaned, mode: 'insensitive' } },
        { username: { equals: cleaned, mode: 'insensitive' } },
        { name: { contains: cleaned, mode: 'insensitive' } }
      ]
    },
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      role: true,
      isActive: true,
      isVerified: true,
      kycStatus: true
    }
  });
};

const classifyCaseStatus = (status: unknown) => {
  const normalized = cleanString(status).toLowerCase();
  if (RESOLVED_CASE_STATUSES.includes(normalized)) return 'resolved';
  if (OPEN_CASE_STATUSES.includes(normalized)) return 'open';
  return normalized ? 'open' : 'open';
};

const computeRiskLevel = (input: {
  score: number;
  fraudScore: number;
  activeSignals: number;
  openCases: number;
  activeViolations: number;
}) => {
  if (input.fraudScore >= 90 || input.activeSignals >= 5 || input.openCases >= 4) return 'CRITICAL';
  if (input.score < 45 || input.fraudScore >= 60 || input.activeViolations >= 2 || input.openCases >= 2) return 'HIGH';
  if (input.score < 75 || input.activeSignals > 0 || input.openCases > 0 || input.fraudScore > 0) return 'MEDIUM';
  return 'LOW';
};

const computeTrustPayload = async (userId: string) => {
  const [user, wallet, cases, violations, signals] = await prisma.$transaction([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        role: true,
        isActive: true,
        isVerified: true,
        kycStatus: true
      }
    }),
    prisma.gcoinWallet.findFirst({
      where: { userId },
      select: {
        fraudScore: true,
        balance: true
      }
    }),
    prisma.moderationCase.findMany({
      where: { authorId: userId },
      select: { id: true, status: true, score: true, contentType: true, createdAt: true }
    }),
    prisma.accountViolation.findMany({
      where: { userId },
      select: { id: true, type: true, severity: true, resolvedAt: true, createdAt: true }
    }),
    prisma.riskSignal.findMany({
      where: {
        userId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
      },
      select: { id: true, signalType: true, severity: true, status: true, expiresAt: true, createdAt: true }
    })
  ]);

  if (!user?.id) {
    throw new Error('User not found');
  }

  const openCases = cases.filter((item) => classifyCaseStatus(item.status) === 'open');
  const resolvedCases = cases.filter((item) => classifyCaseStatus(item.status) === 'resolved');
  const activeViolations = violations.filter((item) => !item.resolvedAt);
  const activeSignals = signals.filter((item) => cleanString(item.status).toUpperCase() === 'ACTIVE' && !isExpired(item.expiresAt));
  const fraudScore = Number(wallet?.fraudScore || 0);

  let score = 100;
  score -= Math.min(40, openCases.length * 12);
  score -= Math.min(25, activeSignals.length * 8);
  score -= Math.min(20, activeViolations.length * 10);
  score -= Math.min(20, Math.floor(fraudScore / 5));
  if (!user.isVerified) score -= 5;
  if (cleanString(user.kycStatus).toUpperCase() !== 'APPROVED') score -= 10;
  score = Math.max(0, Math.min(100, score));

  const riskLevel = computeRiskLevel({
    score,
    fraudScore,
    activeSignals: activeSignals.length,
    openCases: openCases.length,
    activeViolations: activeViolations.length
  });

  return {
    user,
    payload: {
      userId: user.id,
      score,
      riskLevel,
      kycStatusSnapshot: user.kycStatus,
      isVerifiedSnapshot: Boolean(user.isVerified),
      activeViolationCount: activeViolations.length,
      moderationCaseCount: openCases.length,
      resolvedCaseCount: resolvedCases.length,
      fraudScoreSnapshot: fraudScore,
      signalCount: activeSignals.length,
      lastComputedAt: new Date(),
      metadata: {
        openCases: openCases.slice(0, 10),
        resolvedCases: resolvedCases.slice(0, 10),
        activeViolations: activeViolations.slice(0, 10),
        activeSignals: activeSignals.slice(0, 10),
        walletBalance: Number(wallet?.balance || 0)
      }
    }
  };
};

const ensureContentPoliciesSeeded = async () => {
  if (contentPoliciesSeeded) return;
  for (const policy of DEFAULT_CONTENT_POLICIES) {
    await prisma.contentPolicy.upsert({
      where: { key: policy.key },
      create: {
        key: policy.key,
        label: policy.label,
        description: policy.description,
        contentType: policy.contentType,
        severity: policy.severity,
        action: policy.action,
        thresholds: policy.thresholds as any,
        isSystemPolicy: true,
        isActive: true
      },
      update: {
        label: policy.label,
        description: policy.description,
        contentType: policy.contentType,
        severity: policy.severity,
        action: policy.action,
        thresholds: policy.thresholds as any,
        isSystemPolicy: true,
        isActive: true
      }
    });
  }
  contentPoliciesSeeded = true;
};

const seedTrustProfilesFromExistingSignals = async () => {
  const existingProfiles = await prisma.trustProfile.count();
  if (existingProfiles > 0) return;

  const [cases, wallets, violations] = await prisma.$transaction([
    prisma.moderationCase.findMany({
      where: { authorId: { not: null } },
      orderBy: [{ updatedAt: 'desc' }],
      take: 20,
      select: { authorId: true }
    }),
    prisma.gcoinWallet.findMany({
      where: { fraudScore: { gt: 0 } },
      orderBy: [{ fraudScore: 'desc' }],
      take: 20,
      select: { userId: true }
    }),
    prisma.accountViolation.findMany({
      where: { resolvedAt: null },
      orderBy: [{ createdAt: 'desc' }],
      take: 20,
      select: { userId: true }
    })
  ]);

  const candidates = Array.from(
    new Set(
      [...cases.map((item) => item.authorId), ...wallets.map((item) => item.userId), ...violations.map((item) => item.userId)].filter(
        Boolean
      ) as string[]
    )
  ).slice(0, 20);

  for (const userId of candidates) {
    try {
      await recomputeTrustProfile(userId, null);
    } catch (_error) {
      // ignore isolated recompute failures during seed
    }
  }
};

export const getModerationTrustSummary = async () => {
  await ensureContentPoliciesSeeded();
  await seedTrustProfilesFromExistingSignals();

  const [policies, activePolicies, openCases, appeals, openAppeals, trustProfiles, activeSignals] =
    await prisma.$transaction([
      prisma.contentPolicy.count(),
      prisma.contentPolicy.count({ where: { isActive: true } }),
      prisma.moderationCase.count({
        where: {
          status: { in: OPEN_CASE_STATUSES }
        }
      }),
      prisma.moderationAppeal.count(),
      prisma.moderationAppeal.count({
        where: {
          status: { in: OPEN_APPEAL_STATUSES.map((entry) => entry.toUpperCase()) }
        }
      }),
      prisma.trustProfile.count(),
      prisma.riskSignal.count({
        where: {
          status: 'ACTIVE',
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
        }
      })
    ]);

  return {
    policies,
    activePolicies,
    openCases,
    appeals,
    openAppeals,
    trustProfiles,
    activeSignals
  };
};

export const listContentPolicies = async (filters: ContentPolicyFilters = {}) => {
  await ensureContentPoliciesSeeded();
  const query = cleanString(filters.query);
  const rows = await prisma.contentPolicy.findMany({
    where: {
      ...(cleanString(filters.contentType) ? { contentType: cleanString(filters.contentType) } : {}),
      ...(filters.activeOnly !== undefined ? { isActive: Boolean(filters.activeOnly) } : {}),
      ...(query
        ? {
            OR: [
              { key: { contains: query, mode: 'insensitive' } },
              { label: { contains: query, mode: 'insensitive' } },
              { description: { contains: query, mode: 'insensitive' } },
              { contentType: { contains: query, mode: 'insensitive' } }
            ]
          }
        : {})
    },
    orderBy: [{ isSystemPolicy: 'desc' }, { updatedAt: 'desc' }]
  });
  return rows.map(mapContentPolicy);
};

export const saveContentPolicy = async (input: SaveContentPolicyInput, staffId?: string | null) => {
  await ensureContentPoliciesSeeded();
  const key = cleanString(input.key);
  const label = cleanString(input.label);
  const contentType = cleanString(input.contentType);
  if (!key) throw new Error('Policy key is required');
  if (!label) throw new Error('Policy label is required');
  if (!contentType) throw new Error('Content type is required');

  const payload = {
    key,
    label,
    description: optionalString(input.description),
    contentType,
    severity: normalizeUpper(input.severity, 'MEDIUM'),
    action: normalizeUpper(input.action, 'REVIEW'),
    thresholds: (input.thresholds as any) || null,
    metadata: (input.metadata as any) || null,
    isActive: input.isActive !== false,
    isSystemPolicy: Boolean(input.isSystemPolicy),
    updatedByStaffId: staffId || null
  };

  const policy = input.id
    ? await prisma.contentPolicy.update({
        where: { id: input.id },
        data: payload
      })
    : await prisma.contentPolicy.create({
        data: {
          ...payload,
          createdByStaffId: staffId || null
        }
      });

  return mapContentPolicy(policy);
};

export const listModerationCases = async (filters: ModerationCaseFilters = {}) => {
  const query = cleanString(filters.query);
  const rows = await prisma.moderationCase.findMany({
    where: {
      ...(cleanString(filters.status) ? { status: cleanString(filters.status) } : {}),
      ...(cleanString(filters.contentType) ? { contentType: cleanString(filters.contentType) } : {}),
      ...(query
        ? {
            OR: [
              { contentId: { contains: query, mode: 'insensitive' } },
              { reason: { contains: query, mode: 'insensitive' } },
              { author: { email: { contains: query, mode: 'insensitive' } } },
              { author: { username: { contains: query, mode: 'insensitive' } } },
              { author: { name: { contains: query, mode: 'insensitive' } } }
            ]
          }
        : {})
    },
    include: {
      author: {
        select: { id: true, email: true, username: true, name: true, role: true, isActive: true }
      },
      createdByUser: {
        select: { id: true, email: true, name: true }
      },
      actions: {
        orderBy: { createdAt: 'desc' },
        take: 5
      }
    },
    orderBy: [{ updatedAt: 'desc' }],
    take: clampLimit(filters.limit, 50)
  });
  return rows.map(mapModerationCase);
};

export const listModerationAppeals = async (filters: ModerationAppealFilters = {}) => {
  const query = cleanString(filters.query);
  const appeals = await prisma.moderationAppeal.findMany({
    where: {
      ...(cleanString(filters.status) ? { status: normalizeUpper(filters.status, 'OPEN') } : {}),
      ...(query
        ? {
            OR: [
              { reason: { contains: query, mode: 'insensitive' } },
              { resolutionNotes: { contains: query, mode: 'insensitive' } },
              { targetUserId: { contains: query, mode: 'insensitive' } },
              { submittedByUserId: { contains: query, mode: 'insensitive' } },
              { caseId: { contains: query, mode: 'insensitive' } }
            ]
          }
        : {})
    },
    orderBy: [{ updatedAt: 'desc' }],
    take: clampLimit(filters.limit, 50)
  });

  const userMap = await fetchUsersMap(
    appeals.flatMap((appeal) => [appeal.targetUserId || '', appeal.submittedByUserId || ''])
  );
  const caseIds = Array.from(new Set(appeals.map((appeal) => appeal.caseId).filter(Boolean)));
  const cases = caseIds.length
    ? await prisma.moderationCase.findMany({
        where: { id: { in: caseIds } },
        include: {
          author: {
            select: { id: true, email: true, username: true, name: true, role: true, isActive: true }
          }
        }
      })
    : [];
  const caseMap: Map<string, any> = new Map(
    cases.map((item) => [item.id, mapModerationCase({ ...item, actions: [], createdByUser: null })])
  );

  return appeals.map((appeal) => mapAppeal(appeal, userMap, caseMap));
};

export const resolveModerationAppeal = async (
  id: string,
  input: ResolveAppealInput,
  staffId?: string | null,
  actorUserId?: string | null
) => {
  const nextStatus = normalizeUpper(input.status, 'RESOLVED');
  if (!['RESOLVED', 'REJECTED', 'APPROVED'].includes(nextStatus)) {
    throw new Error('Appeal status must be RESOLVED, REJECTED, or APPROVED');
  }

  const appeal = await prisma.moderationAppeal.update({
    where: { id },
    data: {
      status: nextStatus,
      resolutionNotes: optionalString(input.resolutionNotes),
      resolvedByStaffId: staffId || null,
      resolvedAt: new Date()
    }
  });

  const moderationCase = await prisma.moderationCase.findUnique({ where: { id: appeal.caseId } });
  if (moderationCase?.id) {
    const caseStatus = nextStatus === 'APPROVED' ? 'open' : moderationCase.status;
    if (caseStatus !== moderationCase.status) {
      await prisma.moderationCase.update({
        where: { id: moderationCase.id },
        data: { status: caseStatus }
      });
    }
    await prisma.moderationAction.create({
      data: {
        caseId: moderationCase.id,
        actorUserId: actorUserId || null,
        action: nextStatus === 'APPROVED' ? 'appeal_approved' : 'appeal_resolved',
        reason: optionalString(input.resolutionNotes),
        payload: {
          appealId: appeal.id,
          resolvedByStaffId: staffId || null,
          outcome: nextStatus
        }
      }
    });
  }

  const recomputeTargetUserId = appeal.targetUserId || moderationCase?.authorId || null;
  if (recomputeTargetUserId) {
    await recomputeTrustProfile(recomputeTargetUserId, staffId || null);
  }

  return appeal;
};

export const recomputeTrustProfile = async (userId: string, staffId?: string | null) => {
  const { payload } = await computeTrustPayload(userId);
  return prisma.trustProfile.upsert({
    where: { userId },
    update: {
      ...payload,
      updatedByStaffId: staffId || null
    },
    create: {
      ...payload,
      updatedByStaffId: staffId || null
    }
  });
};

export const listTrustProfiles = async (filters: TrustProfileFilters = {}) => {
  await seedTrustProfilesFromExistingSignals();
  const query = cleanString(filters.query);

  let userIdsForQuery: string[] | undefined;
  if (query) {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { id: query },
          { email: { contains: query, mode: 'insensitive' } },
          { username: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } }
        ]
      },
      select: { id: true },
      take: 20
    });
    userIdsForQuery = users.map((user) => user.id);
    for (const userId of userIdsForQuery) {
      const existing = await prisma.trustProfile.findUnique({ where: { userId }, select: { id: true } });
      if (!existing?.id) {
        await recomputeTrustProfile(userId, null);
      }
    }
  }

  const rows = await prisma.trustProfile.findMany({
    where: {
      ...(cleanString(filters.riskLevel) ? { riskLevel: normalizeUpper(filters.riskLevel, 'LOW') } : {}),
      ...(userIdsForQuery ? { userId: { in: userIdsForQuery } } : {})
    },
    orderBy: [{ score: 'asc' }, { updatedAt: 'desc' }],
    take: clampLimit(filters.limit, 50)
  });

  const userMap = await fetchUsersMap(rows.map((row) => row.userId));
  return rows.map((profile) => ({
    id: profile.id,
    userId: profile.userId,
    score: profile.score,
    riskLevel: profile.riskLevel,
    kycStatusSnapshot: profile.kycStatusSnapshot || null,
    isVerifiedSnapshot: Boolean(profile.isVerifiedSnapshot),
    activeViolationCount: profile.activeViolationCount,
    moderationCaseCount: profile.moderationCaseCount,
    resolvedCaseCount: profile.resolvedCaseCount,
    fraudScoreSnapshot: profile.fraudScoreSnapshot,
    signalCount: profile.signalCount,
    lastComputedAt: profile.lastComputedAt,
    metadata: profile.metadata || null,
    updatedByStaffId: profile.updatedByStaffId || null,
    updatedAt: profile.updatedAt,
    user: mapUserSummary(userMap.get(profile.userId))
  }));
};

export const getTrustProfileDetails = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      username: true,
      name: true,
      role: true,
      isActive: true,
      isVerified: true,
      kycStatus: true
    }
  });
  if (!user?.id) throw new Error('User not found');

  let profile = await prisma.trustProfile.findUnique({ where: { userId } });
  if (!profile?.id) {
    profile = await recomputeTrustProfile(userId, null);
  }

  const [signals, cases, violations, wallet] = await prisma.$transaction([
    prisma.riskSignal.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }],
      take: 25
    }),
    prisma.moderationCase.findMany({
      where: { authorId: userId },
      include: {
        actions: { orderBy: { createdAt: 'desc' }, take: 5 },
        author: {
          select: { id: true, email: true, username: true, name: true, role: true, isActive: true }
        },
        createdByUser: {
          select: { id: true, email: true, name: true }
        }
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 25
    }),
    prisma.accountViolation.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'desc' }],
      take: 25
    }),
    prisma.gcoinWallet.findFirst({
      where: { userId },
      select: { fraudScore: true, balance: true, level: true }
    })
  ]);

  const userMap: Map<string, any> = new Map([[user.id, user]]);
  return {
    user: mapUserSummary(user),
    profile: {
      id: profile.id,
      userId: profile.userId,
      score: profile.score,
      riskLevel: profile.riskLevel,
      kycStatusSnapshot: profile.kycStatusSnapshot || null,
      isVerifiedSnapshot: Boolean(profile.isVerifiedSnapshot),
      activeViolationCount: profile.activeViolationCount,
      moderationCaseCount: profile.moderationCaseCount,
      resolvedCaseCount: profile.resolvedCaseCount,
      fraudScoreSnapshot: profile.fraudScoreSnapshot,
      signalCount: profile.signalCount,
      lastComputedAt: profile.lastComputedAt,
      metadata: profile.metadata || null,
      updatedByStaffId: profile.updatedByStaffId || null,
      updatedAt: profile.updatedAt
    },
    signals: signals.map((signal) => mapRiskSignal(signal, userMap)),
    moderationCases: cases.map(mapModerationCase),
    accountViolations: violations.map((item) => ({
      id: item.id,
      type: item.type,
      severity: item.severity || '',
      reason: item.reason || '',
      metadata: item.metadata || null,
      createdAt: item.createdAt,
      resolvedAt: item.resolvedAt
    })),
    wallet: wallet
      ? {
          fraudScore: Number(wallet.fraudScore || 0),
          balance: Number(wallet.balance || 0),
          level: wallet.level || null
        }
      : null
  };
};

export const listRiskSignals = async (filters: RiskSignalFilters = {}) => {
  const query = cleanString(filters.query);
  let userIdsForQuery: string[] | undefined;
  if (query) {
    const users = await prisma.user.findMany({
      where: {
        OR: [
          { id: query },
          { email: { contains: query, mode: 'insensitive' } },
          { username: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } }
        ]
      },
      select: { id: true },
      take: 20
    });
    userIdsForQuery = users.map((user) => user.id);
  }

  const rows = await prisma.riskSignal.findMany({
    where: {
      ...(cleanString(filters.status) ? { status: normalizeUpper(filters.status, 'ACTIVE') } : {}),
      ...(cleanString(filters.severity) ? { severity: normalizeUpper(filters.severity, 'MEDIUM') } : {}),
      ...(cleanString(filters.userId) ? { userId: cleanString(filters.userId) } : {}),
      ...(userIdsForQuery ? { userId: { in: userIdsForQuery } } : {}),
      ...(query && !userIdsForQuery?.length
        ? {
            OR: [
              { signalType: { contains: query, mode: 'insensitive' } },
              { reason: { contains: query, mode: 'insensitive' } }
            ]
          }
        : {})
    },
    orderBy: [{ createdAt: 'desc' }],
    take: clampLimit(filters.limit, 50)
  });
  const userMap = await fetchUsersMap(rows.map((row) => row.userId));
  return rows.map((row) => mapRiskSignal(row, userMap));
};

export const createRiskSignal = async (input: SaveRiskSignalInput, staffId?: string | null) => {
  const identifier = cleanString(input.identifier);
  if (!identifier) throw new Error('User email, username, or ID is required');
  const signalType = cleanString(input.signalType);
  if (!signalType) throw new Error('Signal type is required');
  const reason = cleanString(input.reason);
  if (!reason) throw new Error('Signal reason is required');

  const user = await resolveUserByIdentifier(identifier);
  if (!user?.id) throw new Error('User not found');

  const signal = await prisma.riskSignal.create({
    data: {
      userId: user.id,
      signalType,
      severity: normalizeUpper(input.severity, 'MEDIUM'),
      source: normalizeUpper(input.source, 'MANUAL'),
      status: normalizeUpper(input.status, 'ACTIVE'),
      reason,
      metadata: (input.metadata as any) || null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      createdByStaffId: staffId || null
    }
  });

  await recomputeTrustProfile(user.id, staffId || null);
  return mapRiskSignal(signal, new Map<string, any>([[user.id, user]]));
};

export const updateRiskSignal = async (
  id: string,
  input: Partial<SaveRiskSignalInput>,
  staffId?: string | null
) => {
  const existing = await prisma.riskSignal.findUnique({ where: { id } });
  if (!existing?.id) throw new Error('Risk signal not found');

  const status = input.status !== undefined ? normalizeUpper(input.status, existing.status) : existing.status;
  const updated = await prisma.riskSignal.update({
    where: { id },
    data: {
      signalType: input.signalType !== undefined ? cleanString(input.signalType) || existing.signalType : existing.signalType,
      severity: input.severity !== undefined ? normalizeUpper(input.severity, existing.severity) : existing.severity,
      source: input.source !== undefined ? normalizeUpper(input.source, existing.source) : existing.source,
      status,
      reason: input.reason !== undefined ? cleanString(input.reason) || existing.reason : existing.reason,
      metadata: input.metadata !== undefined ? ((input.metadata as any) || null) : existing.metadata,
      expiresAt: input.expiresAt !== undefined ? (input.expiresAt ? new Date(input.expiresAt) : null) : existing.expiresAt,
      resolvedByStaffId: status !== 'ACTIVE' ? staffId || null : null,
      resolvedAt: status !== 'ACTIVE' ? new Date() : null
    }
  });

  await recomputeTrustProfile(updated.userId, staffId || null);
  const userMap = await fetchUsersMap([updated.userId]);
  return mapRiskSignal(updated, userMap);
};
