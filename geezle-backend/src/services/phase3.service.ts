import prisma from '../utils/prismaClient';
import { getContentTranslationOverview } from './contentTranslation.service';

type Phase3WorkspaceInput = {
  name?: unknown;
  description?: unknown;
  visibility?: unknown;
  linkedContractId?: unknown;
  linkedOrderId?: unknown;
};

const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const clampInt = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
};
const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const toIso = (value: unknown) => {
  if (!value) return null;
  try {
    return new Date(value as any).toISOString();
  } catch {
    return null;
  }
};
const isPrivilegedRole = (role?: string | null) => {
  const normalized = clean(role).toLowerCase();
  return normalized.includes('admin') || normalized.includes('moderator') || normalized.includes('superadmin');
};
const sum = (items: Array<number | null | undefined>) => items.reduce((total, value) => total + toNumber(value), 0);

const normalizeWorkspace = (pod: any) => ({
  id: pod.id,
  type: 'enterprise_workspace',
  name: pod.name,
  description: pod.description || '',
  status: pod.status,
  visibility: pod.visibility,
  owner: pod.owner || null,
  linked: {
    contractId: pod.linkedContractId || null,
    orderId: pod.linkedOrderId || null
  },
  counts: {
    members: pod._count?.members || 0,
    milestones: pod._count?.milestones || 0,
    activities: pod._count?.activities || 0
  },
  members: Array.isArray(pod.members)
    ? pod.members.map((member: any) => ({
        id: member.id,
        role: member.role,
        status: member.status,
        joinedAt: toIso(member.joinedAt),
        user: member.user || null
      }))
    : [],
  milestones: Array.isArray(pod.milestones)
    ? pod.milestones.map((milestone: any) => ({
        id: milestone.id,
        title: milestone.title,
        status: milestone.status,
        dueAt: toIso(milestone.dueAt),
        completedAt: toIso(milestone.completedAt),
        assignedTo: milestone.assignedTo || null
      }))
    : [],
  latestActivity: Array.isArray(pod.activities) && pod.activities[0]
    ? {
        id: pod.activities[0].id,
        type: pod.activities[0].type,
        payload: pod.activities[0].payload || null,
        createdAt: toIso(pod.activities[0].createdAt),
        actor: pod.activities[0].actor || null
      }
    : null,
  createdAt: toIso(pod.createdAt),
  updatedAt: toIso(pod.updatedAt)
});

const selectWorkspace = {
  id: true,
  name: true,
  description: true,
  ownerUserId: true,
  status: true,
  visibility: true,
  linkedContractId: true,
  linkedOrderId: true,
  createdAt: true,
  updatedAt: true,
  owner: { select: { id: true, name: true, username: true, avatar: true, role: true, isVerified: true } },
  members: {
    orderBy: { joinedAt: 'desc' as const },
    take: 8,
    select: {
      id: true,
      role: true,
      status: true,
      joinedAt: true,
      user: { select: { id: true, name: true, username: true, avatar: true, role: true, isVerified: true } }
    }
  },
  milestones: {
    orderBy: [{ status: 'asc' as const }, { dueAt: 'asc' as const }, { updatedAt: 'desc' as const }],
    take: 8,
    select: {
      id: true,
      title: true,
      status: true,
      dueAt: true,
      completedAt: true,
      assignedTo: { select: { id: true, name: true, username: true, avatar: true } }
    }
  },
  activities: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: {
      id: true,
      type: true,
      payload: true,
      createdAt: true,
      actor: { select: { id: true, name: true, username: true, avatar: true } }
    }
  },
  _count: { select: { members: true, milestones: true, activities: true } }
};

export const listEnterpriseWorkspaces = async (
  userId: string,
  options?: { role?: string | null; limit?: unknown }
) => {
  const viewerId = clean(userId);
  if (!viewerId) throw new Error('Authenticated user is required');
  const limit = clampInt(options?.limit, 20, 1, 60);
  const privileged = isPrivilegedRole(options?.role);

  const where = privileged
    ? { status: { not: 'deleted' } }
    : {
        status: { not: 'deleted' },
        OR: [{ ownerUserId: viewerId }, { members: { some: { userId: viewerId, status: 'active' } } }]
      };

  const pods = await prisma.projectPod.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }],
    take: limit,
    select: selectWorkspace
  });

  return {
    generatedAt: new Date().toISOString(),
    scope: privileged ? 'operator' : 'member',
    items: pods.map(normalizeWorkspace),
    counts: {
      total: pods.length,
      active: pods.filter((pod) => pod.status === 'active').length,
      private: pods.filter((pod) => pod.visibility === 'private').length
    }
  };
};

export const createEnterpriseWorkspace = async (
  userId: string,
  input: Phase3WorkspaceInput
) => {
  const ownerUserId = clean(userId);
  if (!ownerUserId) throw new Error('Authenticated user is required');
  const name = clean(input.name);
  if (!name || name.length < 2) throw new Error('Workspace name is required');
  const visibility = ['private', 'team', 'public'].includes(clean(input.visibility).toLowerCase())
    ? clean(input.visibility).toLowerCase()
    : 'private';
  const linkedContractId = clean(input.linkedContractId) || null;
  const linkedOrderId = clean(input.linkedOrderId) || null;

  const pod = await prisma.$transaction(async (tx) => {
    const created = await tx.projectPod.create({
      data: {
        name: name.slice(0, 120),
        description: clean(input.description).slice(0, 1000) || null,
        visibility,
        ownerUserId,
        linkedContractId,
        linkedOrderId
      }
    });
    await tx.podMember.create({
      data: {
        podId: created.id,
        userId: ownerUserId,
        role: 'owner',
        status: 'active',
        invitedByUserId: ownerUserId
      }
    });
    await tx.podActivity.create({
      data: {
        podId: created.id,
        actorUserId: ownerUserId,
        type: 'workspace.created',
        payload: { name: created.name, visibility: created.visibility }
      }
    });
    return tx.projectPod.findUniqueOrThrow({
      where: { id: created.id },
      select: selectWorkspace
    });
  });

  return normalizeWorkspace(pod);
};

export const getCreatorCommerceCampaigns = async (
  userId: string,
  options?: { role?: string | null; limit?: unknown }
) => {
  const viewerId = clean(userId);
  if (!viewerId) throw new Error('Authenticated user is required');
  const limit = clampInt(options?.limit, 20, 1, 80);
  const privileged = isPrivilegedRole(options?.role);
  const adWhere = privileged ? {} : { creatorId: viewerId };

  const [ads, adAggregate, activeChallenges, userChallengeEntries, monetizationProfile, monetizationApplications] =
    await Promise.all([
      prisma.communityAd.findMany({
        where: adWhere as any,
        orderBy: [{ updatedAt: 'desc' }],
        take: limit,
        select: {
          id: true,
          creatorId: true,
          title: true,
          objective: true,
          destinationType: true,
          placement: true,
          status: true,
          currency: true,
          budget: true,
          remainingBudget: true,
          impressions: true,
          clicks: true,
          likes: true,
          messagesStarted: true,
          startAt: true,
          endAt: true,
          createdAt: true,
          updatedAt: true,
          creator: { select: { id: true, name: true, username: true, avatar: true, isVerified: true } },
          _count: { select: { metrics: true, payments: true } }
        }
      }),
      prisma.communityAd.aggregate({
        where: adWhere as any,
        _sum: { budget: true, remainingBudget: true, impressions: true, clicks: true, likes: true, messagesStarted: true },
        _count: { _all: true }
      }),
      prisma.creatorChallenge.findMany({
        where: { isActive: true, status: { in: ['active', 'finalized'] } },
        orderBy: [{ endAt: 'asc' }],
        take: 8,
        select: {
          id: true,
          key: true,
          weekKey: true,
          title: true,
          description: true,
          category: true,
          contentTypes: true,
          reward: true,
          status: true,
          startAt: true,
          endAt: true,
          maxWinners: true,
          _count: { select: { entries: true, votes: true } }
        }
      }),
      prisma.creatorChallengeEntry.findMany({
        where: { userId: viewerId },
        orderBy: [{ updatedAt: 'desc' }],
        take: 12,
        select: {
          id: true,
          challengeId: true,
          contentType: true,
          contentId: true,
          titleSnapshot: true,
          status: true,
          voteCount: true,
          isWinner: true,
          createdAt: true,
          challenge: { select: { id: true, title: true, weekKey: true, status: true, endAt: true } }
        }
      }),
      prisma.monetizationProfile.findUnique({ where: { userId: viewerId } }).catch(() => null),
      prisma.monetizationApplication.findMany({
        where: { userId: viewerId },
        orderBy: [{ createdAt: 'desc' }],
        take: 3,
        select: { id: true, status: true, country: true, reviewedAt: true, reapplyAllowedAt: true, createdAt: true, updatedAt: true }
      }).catch(() => [])
    ]);

  const campaignItems = ads.map((ad) => {
    const spend = Math.max(0, toNumber(ad.budget) - toNumber(ad.remainingBudget));
    const ctr = toNumber(ad.impressions) > 0 ? toNumber(ad.clicks) / toNumber(ad.impressions) : 0;
    return {
      id: ad.id,
      type: 'creator_campaign',
      title: ad.title,
      objective: ad.objective,
      placement: ad.placement,
      status: ad.status,
      currency: ad.currency,
      budget: ad.budget,
      remainingBudget: ad.remainingBudget,
      spend,
      metrics: {
        impressions: ad.impressions,
        clicks: ad.clicks,
        likes: ad.likes,
        messagesStarted: ad.messagesStarted,
        ctr,
        dailyMetricRows: ad._count.metrics,
        paymentRows: ad._count.payments
      },
      creator: ad.creator,
      startsAt: toIso(ad.startAt),
      endsAt: toIso(ad.endAt),
      updatedAt: toIso(ad.updatedAt)
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    scope: privileged ? 'operator' : 'creator',
    monetization: {
      enabled: Boolean(monetizationProfile?.isEnabled),
      status: monetizationProfile?.isEnabled ? 'enabled' : monetizationApplications[0]?.status || 'not_started',
      profile: monetizationProfile || null,
      recentApplications: monetizationApplications
    },
    campaigns: {
      items: campaignItems,
      totals: {
        count: adAggregate._count._all,
        budget: toNumber(adAggregate._sum.budget),
        remainingBudget: toNumber(adAggregate._sum.remainingBudget),
        impressions: toNumber(adAggregate._sum.impressions),
        clicks: toNumber(adAggregate._sum.clicks),
        likes: toNumber(adAggregate._sum.likes),
        messagesStarted: toNumber(adAggregate._sum.messagesStarted)
      }
    },
    challenges: {
      active: activeChallenges.map((challenge) => ({
        ...challenge,
        startsAt: toIso(challenge.startAt),
        endsAt: toIso(challenge.endAt),
        counts: {
          entries: challenge._count.entries,
          votes: challenge._count.votes
        },
        _count: undefined
      })),
      myEntries: userChallengeEntries.map((entry) => ({
        id: entry.id,
        challengeId: entry.challengeId,
        contentType: entry.contentType,
        contentId: entry.contentId,
        title: entry.titleSnapshot,
        status: entry.status,
        voteCount: entry.voteCount,
        isWinner: entry.isWinner,
        createdAt: toIso(entry.createdAt),
        challenge: entry.challenge
          ? { ...entry.challenge, endsAt: toIso(entry.challenge.endAt), endAt: undefined }
          : null
      }))
    },
    recommendations: [
      {
        key: 'campaign_budget_guardrails',
        label: 'Keep campaign budget, payout eligibility, and audience targeting visible in one creator-commerce console.',
        priority: 1
      },
      {
        key: 'challenge_to_campaign',
        label: 'Promote winning challenge entries into paid campaigns with reusable creative metadata.',
        priority: 2
      }
    ]
  };
};

export const getPayoutOrchestration = async (
  userId: string,
  options?: { role?: string | null; limit?: unknown }
) => {
  const viewerId = clean(userId);
  if (!viewerId) throw new Error('Authenticated user is required');
  const limit = clampInt(options?.limit, 20, 1, 80);
  const privileged = isPrivilegedRole(options?.role);
  const userScoped = privileged ? {} : { userId: viewerId };

  const [
    providerAccounts,
    withdrawals,
    withdrawalCounts,
    gcoinWallet,
    gcoinTransactions,
    fundingIntents,
    orderPaymentIntents
  ] = await Promise.all([
    prisma.payoutProviderAccount.findMany({
      where: userScoped as any,
      orderBy: [{ updatedAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        userId: true,
        provider: true,
        accountType: true,
        chargesEnabled: true,
        payoutsEnabled: true,
        country: true,
        currency: true,
        status: true,
        isDisabledByAdmin: true,
        disabledReason: true,
        lastSyncedAt: true,
        updatedAt: true,
        user: { select: { id: true, name: true, username: true, email: true, role: true } }
      }
    }).catch(() => []),
    prisma.withdrawalRequest.findMany({
      where: userScoped as any,
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
      include: {
        fxLock: {
          select: {
            id: true,
            fromCurrency: true,
            toCurrency: true,
            sourceAmount: true,
            convertedAmount: true,
            rate: true,
            rateSource: true,
            stale: true,
            isFrozenSnapshot: true,
            createdAt: true
          }
        }
      }
    }),
    prisma.withdrawalRequest.groupBy({
      by: ['status'],
      where: userScoped as any,
      _count: { _all: true },
      _sum: { amount: true }
    }),
    prisma.gcoinWallet.findUnique({ where: { userId: viewerId } }).catch(() => null),
    prisma.gcoinTransaction.findMany({
      where: { userId: viewerId },
      orderBy: [{ createdAt: 'desc' }],
      take: 10,
      select: { id: true, amount: true, type: true, source: true, reason: true, status: true, feeAmount: true, netAmount: true, createdAt: true }
    }).catch(() => []),
    prisma.walletFundingIntent.findMany({
      where: userScoped as any,
      orderBy: [{ createdAt: 'desc' }],
      take: Math.min(limit, 20),
      select: { id: true, provider: true, amount: true, currency: true, country: true, status: true, fxLockId: true, createdAt: true, updatedAt: true }
    }).catch(() => []),
    prisma.orderPaymentIntent.findMany({
      where: privileged ? {} as any : { clientId: viewerId } as any,
      orderBy: [{ createdAt: 'desc' }],
      take: Math.min(limit, 20),
      select: { id: true, orderId: true, provider: true, amount: true, currency: true, country: true, status: true, fxLockId: true, createdAt: true, updatedAt: true }
    }).catch(() => [])
  ]);

  const recentFxLocks = await prisma.fxLock.findMany({
    where: privileged
      ? {}
      : withdrawals.length
        ? { OR: withdrawals.map((withdrawal) => ({ entityId: withdrawal.id })) }
        : { id: '__no_fx_lock__' },
    orderBy: [{ createdAt: 'desc' }],
    take: 12,
    select: {
      id: true,
      entityType: true,
      entityId: true,
      fromCurrency: true,
      toCurrency: true,
      sourceAmount: true,
      convertedAmount: true,
      rate: true,
      rateSource: true,
      stale: true,
      isFrozenSnapshot: true,
      markupBps: true,
      createdAt: true
    }
  }).catch(() => []);

  const withdrawalsByStatus = (withdrawalCounts as Array<any>).reduce((acc: Record<string, { count: number; amount: number }>, row: any) => {
    acc[String(row.status)] = {
      count: row._count._all,
      amount: toNumber(row._sum.amount)
    };
    return acc;
  }, {});

  return {
    generatedAt: new Date().toISOString(),
    scope: privileged ? 'operator' : 'member',
    readiness: {
      payoutAccounts: providerAccounts.length,
      readyAccounts: providerAccounts.filter((account) => account.payoutsEnabled && !account.isDisabledByAdmin).length,
      blockedAccounts: providerAccounts.filter((account) => account.isDisabledByAdmin || account.status !== 'active').length,
      pendingWithdrawals: withdrawalsByStatus.PENDING?.count || 0,
      processingWithdrawals: withdrawalsByStatus.PROCESSING?.count || 0,
      staleFxLocks: recentFxLocks.filter((lock) => lock.stale).length
    },
    rails: providerAccounts.map((account) => ({
      id: account.id,
      userId: account.userId,
      provider: account.provider,
      accountType: account.accountType,
      status: account.status,
      country: account.country,
      currency: account.currency,
      chargesEnabled: account.chargesEnabled,
      payoutsEnabled: account.payoutsEnabled,
      disabled: account.isDisabledByAdmin,
      disabledReason: account.disabledReason,
      lastSyncedAt: toIso(account.lastSyncedAt),
      user: account.user
    })),
    wallet: gcoinWallet
      ? {
          id: gcoinWallet.id,
          balance: gcoinWallet.balance,
          lifetimeEarned: gcoinWallet.lifetimeEarned,
          status: gcoinWallet.status,
          fraudScore: gcoinWallet.fraudScore,
          updatedAt: toIso(gcoinWallet.updatedAt)
        }
      : null,
    withdrawals: withdrawals.map((withdrawal) => ({
      id: withdrawal.id,
      userId: withdrawal.userId,
      amount: withdrawal.amount,
      method: withdrawal.method,
      status: withdrawal.status,
      createdAt: toIso(withdrawal.createdAt),
      processedAt: toIso(withdrawal.processedAt),
      fxLock: withdrawal.fxLock
        ? {
            ...withdrawal.fxLock,
            sourceAmount: toNumber(withdrawal.fxLock.sourceAmount),
            convertedAmount: toNumber(withdrawal.fxLock.convertedAmount),
            rate: toNumber(withdrawal.fxLock.rate),
            createdAt: toIso(withdrawal.fxLock.createdAt)
          }
        : null
    })),
    intents: {
      walletFunding: fundingIntents,
      orderPayments: orderPaymentIntents
    },
    fxLocks: recentFxLocks.map((lock) => ({
      ...lock,
      sourceAmount: toNumber(lock.sourceAmount),
      convertedAmount: toNumber(lock.convertedAmount),
      rate: toNumber(lock.rate),
      createdAt: toIso(lock.createdAt)
    })),
    gcoinTransactions: gcoinTransactions.map((transaction) => ({
      ...transaction,
      amount: toNumber(transaction.amount),
      feeAmount: toNumber(transaction.feeAmount),
      netAmount: toNumber(transaction.netAmount),
      createdAt: toIso(transaction.createdAt)
    })),
    totals: {
      withdrawalsByStatus,
      requestedWithdrawalAmount: sum((Object.values(withdrawalsByStatus) as Array<{ amount: number }>).map((entry) => entry.amount))
    },
    recommendations: [
      {
        key: 'fx_lock_all_money_movements',
        label: 'Keep every withdrawal, top-up, and order payment attached to an immutable FX lock before settlement.',
        priority: 1
      },
      {
        key: 'rail_health_gate',
        label: 'Block payouts automatically when provider requirements, fraud score, or stale-rate checks fail.',
        priority: 2
      }
    ]
  };
};

export const getGlobalLocalizationHub = async () => {
  const [languageConfig, translationOverview, keyCount, valueStats, overrideCount, latestFxSnapshot, activeFxProviders, systemSetting] =
    await Promise.all([
      prisma.languageConfig.findUnique({ where: { scope: 'default' } }).catch(() => null),
      getContentTranslationOverview().catch(() => null),
      prisma.translationKey.count({ where: { isActive: true } }).catch(() => 0),
      prisma.translationValue.groupBy({
        by: ['locale'],
        _count: { _all: true },
        orderBy: { _count: { locale: 'desc' } }
      }).catch(() => []),
      prisma.textOverride.count({ where: { enabled: true } }).catch(() => 0),
      prisma.fxSnapshot.findFirst({
        where: { status: 'APPROVED' },
        orderBy: [{ approvedAt: 'desc' }, { fetchedAt: 'desc' }],
        select: {
          id: true,
          providerCode: true,
          baseCurrency: true,
          sourceTimestamp: true,
          fetchedAt: true,
          approvedAt: true,
          isFrozen: true,
          _count: { select: { rates: true } }
        }
      }).catch(() => null),
      prisma.fxProvider.findMany({
        where: { enabled: true },
        orderBy: [{ priority: 'asc' }],
        take: 8,
        select: { code: true, name: true, kind: true, priority: true, updatedAt: true }
      }).catch(() => []),
      prisma.appSetting.findUnique({ where: { scope: 'system' } }).catch(() => null)
    ]);

  const system = (systemSetting?.data || {}) as any;
  const currencyConfig = system?.currency || system?.currencies || {};
  const enabledLocales = languageConfig?.enabledLocales?.length ? languageConfig.enabledLocales : ['en'];
  const rtlLocales = languageConfig?.rtlLocales || [];

  return {
    generatedAt: new Date().toISOString(),
    languages: {
      defaultLocale: languageConfig?.defaultLocale || 'en',
      enabledLocales,
      rtlLocales,
      dictionaryCacheSeconds: languageConfig?.dictionaryCacheSeconds || 300,
      overridesCacheSeconds: languageConfig?.overridesCacheSeconds || 300,
      updatedAt: toIso(languageConfig?.updatedAt)
    },
    interfaceCopy: {
      activeKeys: keyCount,
      valuesByLocale: valueStats.map((row: any) => ({
        locale: row.locale,
        values: row._count._all,
        coverageRatio: keyCount > 0 ? Math.min(1, row._count._all / keyCount) : 0
      })),
      activeTextOverrides: overrideCount
    },
    contentTranslation: translationOverview || null,
    currencies: {
      defaultCurrency: currencyConfig?.defaultCurrency || currencyConfig?.baseCurrency || system?.defaultCurrency || 'USD',
      enabledCurrencies: currencyConfig?.enabledCurrencies || currencyConfig?.supportedCurrencies || [],
      latestSnapshot: latestFxSnapshot
        ? {
            id: latestFxSnapshot.id,
            providerCode: latestFxSnapshot.providerCode,
            baseCurrency: latestFxSnapshot.baseCurrency,
            sourceTimestamp: toIso(latestFxSnapshot.sourceTimestamp),
            fetchedAt: toIso(latestFxSnapshot.fetchedAt),
            approvedAt: toIso(latestFxSnapshot.approvedAt),
            frozen: latestFxSnapshot.isFrozen,
            rates: latestFxSnapshot._count.rates
          }
        : null,
      providers: activeFxProviders.map((provider) => ({ ...provider, updatedAt: toIso(provider.updatedAt) }))
    },
    recommendations: [
      {
        key: 'locale_currency_pairs',
        label: 'Tie language, currency, payout rail, and content-translation policy into a single market launch profile.',
        priority: 1
      },
      {
        key: 'translation_coverage_gate',
        label: 'Block public launch for a locale until interface copy, content translation, and FX coverage pass operator thresholds.',
        priority: 2
      }
    ]
  };
};

export const getPhase3Briefing = async (
  userId: string,
  options?: { role?: string | null }
) => {
  const [workspaces, creatorCommerce, payouts, localization] = await Promise.all([
    listEnterpriseWorkspaces(userId, { role: options?.role, limit: 8 }),
    getCreatorCommerceCampaigns(userId, { role: options?.role, limit: 8 }),
    getPayoutOrchestration(userId, { role: options?.role, limit: 8 }),
    getGlobalLocalizationHub()
  ]);

  return {
    generatedAt: new Date().toISOString(),
    phase: 3,
    capabilities: {
      enterpriseWorkspaces: true,
      creatorCommerceCampaigns: true,
      payoutOrchestration: true,
      globalLocalization: true
    },
    workspaces,
    creatorCommerce,
    payouts,
    localization,
    operatingPriorities: [
      'Unify project pods, contract delivery, milestones, and realtime collaboration into enterprise workspaces.',
      'Connect creator campaigns, ads, challenges, monetization, and analytics into a creator-commerce command center.',
      'Enforce payout rail readiness, immutable FX locks, and operator approval checks before money movement.',
      'Ship market-level localization profiles that combine language, content translation, RTL, and currency policy.'
    ]
  };
};
