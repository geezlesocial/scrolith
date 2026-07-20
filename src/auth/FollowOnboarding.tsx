import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Sparkles,
  Users
} from 'lucide-react';
import { useUser } from '../context/UserContext';
import { FollowOnboardingStatus, UserRole } from '../types';
import { AuthService } from '../services/authService';
import { RecoService } from '../services/reco';
import { CommunityService } from '../services/community';
import { resolveAssetUrl } from '../utils/assetUrl';
import { resolvePostAttachmentMediaUrl } from '../utils/postAttachmentMedia';
import { resolveUserAvatarUrl } from '../utils/userAvatar';
import EnterpriseAvatar from '../components/common/EnterpriseAvatar';
import LanguageMultiSelect from '../components/language/LanguageMultiSelect';
import { LanguagePreferencesService } from '../services/languagePreferences';
import {
  buildOnboardingMissingHint,
  canContinueOnboarding,
  checkFollowCaps,
  computeOnboardingProgressPercent,
  FOLLOW_ONBOARDING_MAX_PAGES,
  FOLLOW_ONBOARDING_MAX_TOTAL,
  FOLLOW_ONBOARDING_MAX_USERS,
  resolveFollowMinimum
} from './followOnboardingLogic';

type RecommendationCard = {
  key: string;
  id: string;
  targetType: 'user' | 'page';
  entityType: 'freelancer' | 'client' | 'page';
  name: string;
  username?: string | null;
  headline?: string | null;
  location?: string | null;
  avatarUrl?: string | null;
  badge: string;
  route: string;
  isFollowing: boolean;
  /** Presentation-only reasons derived from existing reco fields (no new APIs). */
  reasons: string[];
  whyRecommended: string;
};

const MAX_ONBOARDING_USERS = FOLLOW_ONBOARDING_MAX_USERS;
const MAX_ONBOARDING_PAGES = FOLLOW_ONBOARDING_MAX_PAGES;
const MAX_ONBOARDING_TOTAL = FOLLOW_ONBOARDING_MAX_TOTAL;

const DEFAULT_STATUS: FollowOnboardingStatus = {
  required: true,
  completedAt: null,
  followedCount: 0,
  minimumRequired: 1,
  maximumSelectable: MAX_ONBOARDING_TOTAL,
  canContinue: false,
  redirectPath: '/'
};

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return '';
};

const normalizeUserEntityType = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'client' || normalized === 'employer') return 'client';
  return 'freelancer';
};

const resolveRecommendationAvatarUrl = (value: any): string | null => {
  if (!value) return null;

  if (typeof value === 'string') {
    const normalized = String(value).trim();
    return normalized ? resolveAssetUrl(normalized) : null;
  }

  const mediaUrl = resolvePostAttachmentMediaUrl(value);
  if (mediaUrl) return mediaUrl;

  const nestedUrl = firstText(
    value?.url,
    value?.avatarUrl,
    value?.avatar,
    value?.logoUrl,
    value?.logo,
    value?.downloadUrl,
    value?.fileUrl
  );
  return nestedUrl ? resolveAssetUrl(nestedUrl) : null;
};

const buildUserReasons = (item: any, account: any, userType: 'freelancer' | 'client') => {
  const reasons: string[] = [];
  const industry = firstText(account?.industry, item?.industry, account?.category, item?.category);
  const location = firstText(account?.location, item?.location, item?.country);
  if (userType === 'client') reasons.push('Hiring');
  else reasons.push('Creator');
  if (industry) reasons.push(industry);
  if (location) reasons.push(location);
  if (item?.score != null || item?.confidence != null) reasons.push('High match');
  if (account?.verified || item?.verified || account?.isVerified) reasons.push('Verified');
  if (item?.trending || account?.trending) reasons.push('Trending');
  const unique = Array.from(new Set(reasons.map((entry) => entry.trim()).filter(Boolean))).slice(0, 4);
  return unique.length ? unique : ['Recommended for you'];
};

const buildWhyRecommended = (item: any, account: any, userType: 'freelancer' | 'client', name: string) => {
  const reason =
    firstText(item?.reason, item?.why, item?.explanation, item?.subtitle, account?.headline) ||
    (userType === 'client'
      ? `Relevant clients and employers help shape opportunity signals in your feed.`
      : `Follow ${name.split(' ')[0] || 'this member'} to seed your feed with trusted creator activity.`);
  return reason;
};

const normalizeUserReco = (item: any): RecommendationCard | null => {
  const account = item?.account || {};
  const id = firstText(item?.entityId, account?.id, item?.id, item?.user_id, item?.userId);
  if (!id) return null;
  const userType = normalizeUserEntityType(item?.entityType || account?.entityType || item?.role || account?.role);
  const username = firstText(account?.username, item?.username, item?.userName, item?.user_name) || null;
  const name = firstText(account?.name, item?.name, item?.userName, item?.user_name, username, 'Recommended account');
  const avatarUrl =
    resolveUserAvatarUrl({ ...item, ...account }) ||
    resolveRecommendationAvatarUrl(
      account?.avatar ||
        item?.avatar ||
        item?.userAvatar ||
        item?.avatarUrl ||
        item?.profilePhotoFileId ||
        account?.profilePhotoFileId
    );
  const reasons = buildUserReasons(item, account, userType);
  return {
    key: `user:${id}`,
    id,
    targetType: 'user',
    entityType: userType,
    name,
    username,
    headline:
      firstText(
        account?.headline,
        account?.title,
        account?.bio,
        item?.headline,
        item?.title,
        item?.bio,
        item?.subtitle
      ) || null,
    location: firstText(account?.location, item?.location, item?.country) || null,
    avatarUrl: avatarUrl || null,
    badge: userType === 'client' ? 'Client' : 'Freelancer',
    route: `/u/${encodeURIComponent(username || id)}`,
    isFollowing: false,
    reasons,
    whyRecommended: buildWhyRecommended(item, account, userType, name)
  };
};

const normalizePageReco = (page: any): RecommendationCard | null => {
  const account = page?.account || {};
  const id = firstText(page?.entityId, page?.id, account?.id);
  if (!id) return null;
  const handle = firstText(page?.handle, page?.slug, account?.handle, account?.slug, page?.username);
  const avatarUrl =
    resolveRecommendationAvatarUrl(
      page?.logo ||
        page?.logoUrl ||
        page?.avatarUrl ||
        page?.avatar ||
        page?.logoFileId ||
        page?.cover ||
        account?.logo ||
        account?.logoUrl ||
        account?.avatarUrl ||
        account?.avatar ||
        account?.logoFileId ||
        account?.cover
    ) || null;
  const industry = firstText(page?.industry, account?.industry, page?.category, account?.category);
  const location = firstText(page?.location, page?.city, page?.country, account?.location, account?.city, account?.country);
  const reasons = Array.from(
    new Set(
      [
        'Page',
        industry,
        page?.verified || account?.verified || page?.isVerified ? 'Verified' : '',
        page?.trending || account?.trending ? 'Trending' : '',
        location,
        page?.hiring || account?.hiring ? 'Hiring' : '',
        'Popular'
      ]
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
    )
  ).slice(0, 4);
  const name = firstText(page?.name, account?.name, page?.title, handle, 'Recommended page');
  const whyRecommended =
    firstText(page?.reason, page?.why, page?.explanation, page?.tagline, account?.tagline) ||
    (industry
      ? `Relevant ${industry} page to keep brand and community updates in your first feed.`
      : `Follow ${name} for trusted brand updates and community signals.`);
  return {
    key: `page:${id}`,
    id,
    targetType: 'page',
    entityType: 'page',
    name,
    username: handle || null,
    headline:
      firstText(page?.tagline, page?.description, page?.industry, account?.tagline, account?.description, account?.industry) ||
      null,
    location: location || null,
    avatarUrl,
    badge: 'Page',
    route: `/company/${encodeURIComponent(handle || id)}`,
    isFollowing: Boolean(page?.isFollowing ?? account?.isFollowing),
    reasons: reasons.length ? reasons : ['Recommended for you'],
    whyRecommended
  };
};

const normalizeContributorReco = (item: any): RecommendationCard | null =>
  normalizeUserReco({
    ...item,
    id: item?.id || item?.user_id,
    entityType: normalizeUserEntityType(item?.role),
    username: item?.username || item?.userName,
    avatar: item?.avatar || item?.userAvatar,
    headline: item?.title || item?.bio
  });

const mergeUniqueCards = (...groups: RecommendationCard[][]) => {
  const seen = new Set<string>();
  const merged: RecommendationCard[] = [];
  groups.flat().forEach((card) => {
    if (!card || seen.has(card.key)) return;
    seen.add(card.key);
    merged.push(card);
  });
  return merged;
};

const hashSeed = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
};

const createRotationSeed = () => {
  if (typeof window !== 'undefined' && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}:${Math.random().toString(36).slice(2)}`;
};

const shuffleCards = (cards: RecommendationCard[], seed: string) =>
  [...cards]
    .map((card, index) => ({
      card,
      score: hashSeed(`${seed}:${card.key}:${index}`)
    }))
    .sort((left, right) => left.score - right.score)
    .map((entry) => entry.card);

const interleaveRecommendations = (
  userRole: UserRole | string | undefined,
  viewerId: string | undefined,
  rotationSeed: string,
  users: RecommendationCard[],
  clients: RecommendationCard[],
  pages: RecommendationCard[]
) => {
  const normalizedRole = String(userRole || '').trim().toLowerCase();
  const primaryUsers = normalizedRole === UserRole.EMPLOYER ? users : clients;
  const secondaryUsers = normalizedRole === UserRole.EMPLOYER ? clients : users;
  const baseSeed = `${viewerId || 'viewer'}:${normalizedRole || 'member'}:${rotationSeed}`;
  const shuffledUsers = shuffleCards(mergeUniqueCards(primaryUsers, secondaryUsers), `${baseSeed}:users`);
  const shuffledPages = shuffleCards(mergeUniqueCards(pages), `${baseSeed}:pages`);
  const selectedUsers = shuffledUsers.slice(0, MAX_ONBOARDING_USERS);
  const selectedPages = shuffledPages.slice(0, MAX_ONBOARDING_PAGES);
  const lanes = [selectedUsers, selectedPages];
  const output: RecommendationCard[] = [];
  const seen = new Set<string>();
  let cursor = 0;

  while (lanes.some((lane) => lane.length > cursor) && output.length < MAX_ONBOARDING_TOTAL) {
    lanes.forEach((lane) => {
      const item = lane[cursor];
      if (!item || seen.has(item.key)) return;
      seen.add(item.key);
      output.push(item);
    });
    cursor += 1;
  }

  return output.slice(0, MAX_ONBOARDING_TOTAL);
};

const FollowOnboarding = () => {
  const navigate = useNavigate();
  const { user, updateUser } = useUser();
  const [status, setStatus] = useState<FollowOnboardingStatus>(DEFAULT_STATUS);
  const [cards, setCards] = useState<RecommendationCard[]>([]);
  const [avatarFailures, setAvatarFailures] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [understoodLanguages, setUnderstoodLanguages] = useState<string[]>([]);
  const [languageReady, setLanguageReady] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const [recoFilter, setRecoFilter] = useState<'all' | 'people' | 'pages'>('all');
  const rotationSeed = useMemo(() => createRotationSeed(), [user?.id]);

  const selectedPageCount = useMemo(
    () => cards.filter((item) => item.targetType === 'page' && item.isFollowing).length,
    [cards]
  );
  const selectedUserCount = useMemo(
    () => cards.filter((item) => item.targetType === 'user' && item.isFollowing).length,
    [cards]
  );
  const followedCount = Math.min(MAX_ONBOARDING_TOTAL, selectedPageCount + selectedUserCount);
  const languagesOk = understoodLanguages.length >= 1;
  const progressInput = {
    languageCount: understoodLanguages.length,
    followedCount,
    minimumRequired: status.minimumRequired
  };
  const canContinue = canContinueOnboarding(progressInput);
  // Progress reflects required minimum (not the recommended maximum of 6).
  const followMin = resolveFollowMinimum(status.minimumRequired);
  const progressPercent = computeOnboardingProgressPercent(progressInput);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const statusResponse = await AuthService.getFollowOnboarding();
        const onboarding = statusResponse?.onboarding || DEFAULT_STATUS;
        if (!active) return;

        if (!onboarding.required) {
          navigate(onboarding.redirectPath || '/', { replace: true });
          return;
        }

        try {
          const prefs = await LanguagePreferencesService.getMine();
          if (active) {
            setUnderstoodLanguages(prefs?.understoodLanguages || []);
            setLanguageReady(Boolean(prefs?.languagePreferencesConfirmed && prefs.understoodLanguages?.length));
          }
        } catch {
          if (active) setLanguageReady(false);
        }

        const [
          freelancersFollowResult,
          freelancersMemberHomeResult,
          clientsFollowResult,
          clientsMemberHomeResult,
          pagesRecoResult,
          pagesMemberHomeResult,
          contributorsResult
        ] = await Promise.allSettled([
          RecoService.getAccounts({ surface: 'who_to_follow', type: 'freelancer', limit: 18 }),
          RecoService.getAccounts({ surface: 'member_home', type: 'freelancer', limit: 18 }),
          RecoService.getAccounts({ surface: 'who_to_follow', type: 'client', limit: 18 }),
          RecoService.getAccounts({ surface: 'member_home', type: 'client', limit: 18 }),
          CommunityService.getRecommendedBusinessPages(12),
          RecoService.getAccounts({ surface: 'member_home', type: 'page', limit: 12 }),
          CommunityService.getTopContributors(24)
        ]);

        const contributorCards =
          contributorsResult.status === 'fulfilled'
            ? contributorsResult.value.map(normalizeContributorReco).filter(Boolean) as RecommendationCard[]
            : [];
        const contributorFreelancers = contributorCards.filter((item) => item.entityType === 'freelancer');
        const contributorClients = contributorCards.filter((item) => item.entityType === 'client');

        const freelancers =
          freelancersFollowResult.status === 'fulfilled' || freelancersMemberHomeResult.status === 'fulfilled'
            ? mergeUniqueCards(
                freelancersFollowResult.status === 'fulfilled'
                  ? freelancersFollowResult.value.map(normalizeUserReco).filter(Boolean) as RecommendationCard[]
                  : [],
                freelancersMemberHomeResult.status === 'fulfilled'
                  ? freelancersMemberHomeResult.value.map(normalizeUserReco).filter(Boolean) as RecommendationCard[]
                  : [],
                contributorFreelancers
              )
            : contributorFreelancers;
        const clients =
          clientsFollowResult.status === 'fulfilled' || clientsMemberHomeResult.status === 'fulfilled'
            ? mergeUniqueCards(
                clientsFollowResult.status === 'fulfilled'
                  ? clientsFollowResult.value.map(normalizeUserReco).filter(Boolean) as RecommendationCard[]
                  : [],
                clientsMemberHomeResult.status === 'fulfilled'
                  ? clientsMemberHomeResult.value.map(normalizeUserReco).filter(Boolean) as RecommendationCard[]
                  : [],
                contributorClients
              )
            : contributorClients;
        const pages =
          pagesRecoResult.status === 'fulfilled' || pagesMemberHomeResult.status === 'fulfilled'
            ? mergeUniqueCards(
                pagesRecoResult.status === 'fulfilled'
                  ? pagesRecoResult.value.map(normalizePageReco).filter(Boolean) as RecommendationCard[]
                  : [],
                pagesMemberHomeResult.status === 'fulfilled'
                  ? pagesMemberHomeResult.value.map(normalizePageReco).filter(Boolean) as RecommendationCard[]
                  : []
              )
            : [];

        const userIds = [...freelancers, ...clients].map((item) => item.id);
        const followStatus = userIds.length ? await CommunityService.getFollowStatus(userIds) : {};

        const nextCards = interleaveRecommendations(
          statusResponse?.user?.role || user?.role,
          statusResponse?.user?.id || user?.id,
          rotationSeed,
          freelancers.map((item) => ({ ...item, isFollowing: Boolean((followStatus as any)?.[item.id]) })),
          clients.map((item) => ({ ...item, isFollowing: Boolean((followStatus as any)?.[item.id]) })),
          pages
        );

        const totalFollowed = nextCards.filter((item) => item.isFollowing).length;

        setStatus({
          ...onboarding,
          followedCount: totalFollowed,
          canContinue: totalFollowed >= onboarding.minimumRequired
        });
        setAvatarFailures({});
        setCards(nextCards);
      } catch (loadError: any) {
        if (!active) return;
        setError(loadError?.message || 'Unable to load recommended accounts right now.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [navigate, rotationSeed, user?.id, user?.role]);

  const handleFollow = async (card: RecommendationCard) => {
    if (card.isFollowing || busyIds[card.key] || submitting) return;
    const cap = checkFollowCaps({
      targetType: card.targetType,
      followedTotal: followedCount,
      selectedUsers: selectedUserCount,
      selectedPages: selectedPageCount
    });
    if (!cap.ok) {
      setError(cap.error || 'Follow limit reached for this step.');
      return;
    }

    setError('');
    setBusyIds((prev) => ({ ...prev, [card.key]: true }));
    setCards((prev) => prev.map((item) => (item.key === card.key ? { ...item, isFollowing: true } : item)));
    setStatus((prev) => {
      const nextCount = Math.min(prev.maximumSelectable, prev.followedCount + 1);
      return {
        ...prev,
        followedCount: nextCount,
        canContinue: nextCount >= prev.minimumRequired
      };
    });

    try {
      await CommunityService.followTarget({ targetType: card.targetType, targetId: card.id });
      void RecoService.submitFeedback({
        surface: 'who_to_follow',
        entityType: card.entityType,
        entityId: card.id,
        action: 'follow',
        metadata: { source: 'follow_onboarding' }
      }).catch(() => null);
    } catch (followError: any) {
      setCards((prev) => prev.map((item) => (item.key === card.key ? { ...item, isFollowing: false } : item)));
      setStatus((prev) => {
        const nextCount = Math.max(0, prev.followedCount - 1);
        return {
          ...prev,
          followedCount: nextCount,
          canContinue: nextCount >= prev.minimumRequired
        };
      });
      setError(followError?.message || `Unable to follow ${card.name} right now.`);
    } finally {
      setBusyIds((prev) => ({ ...prev, [card.key]: false }));
    }
  };

  const handleContinue = async () => {
    if (submitting || !canContinue) return;
    setSubmitting(true);
    setError('');
    try {
      // Phase 26 — persist understood languages before completing onboarding.
      await LanguagePreferencesService.updateMine({
        understoodLanguages,
        confirm: true
      });
      setLanguageReady(true);

      const response = await AuthService.completeFollowOnboarding();
      if (response?.user) {
        updateUser(response.user);
      } else {
        updateUser({
          followOnboardingRequired: false,
          follow_onboarding_required: false,
          followOnboardingCompletedAt: new Date().toISOString(),
          follow_onboarding_completed_at: new Date().toISOString()
        } as any);
      }
      navigate(response?.onboarding?.redirectPath || '/', { replace: true });
    } catch (completeError: any) {
      setError(completeError?.response?.data?.error || completeError?.message || 'Unable to continue yet.');
    } finally {
      setSubmitting(false);
    }
  };

  const activationReady = canContinue && !loading;
  const selectedCards = useMemo(() => cards.filter((item) => item.isFollowing), [cards]);
  const visibleCards = useMemo(() => {
    if (recoFilter === 'people') return cards.filter((c) => c.targetType === 'user');
    if (recoFilter === 'pages') return cards.filter((c) => c.targetType === 'page');
    return cards;
  }, [cards, recoFilter]);

  const missingHint = buildOnboardingMissingHint(progressInput);

  const reasonChipClass = (reason: string) => {
    const key = reason.toLowerCase();
    if (key.includes('verified')) return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    if (key.includes('trending')) return 'border-amber-200 bg-amber-50 text-amber-800';
    if (key.includes('hiring')) return 'border-blue-200 bg-blue-50 text-blue-800';
    if (key.includes('creator')) return 'border-violet-200 bg-violet-50 text-violet-800';
    if (key.includes('page') || key.includes('company') || key.includes('community'))
      return 'border-indigo-200 bg-indigo-50 text-indigo-800';
    if (key.includes('match') || key.includes('popular')) return 'border-cyan-200 bg-cyan-50 text-cyan-800';
    return 'border-slate-200 bg-slate-50 text-slate-600';
  };

  const renderRecoCard = (card: RecommendationCard) => {
    const reasonChips = Array.isArray(card.reasons) ? card.reasons.slice(0, 3) : [];
    return (
      <article
        key={card.key}
        className={`follow-reco-card flex flex-col rounded-2xl border p-3.5 transition duration-200 motion-reduce:transition-none sm:p-4 ${
          card.isFollowing
            ? 'border-emerald-300 bg-emerald-50/70'
            : 'border-slate-200 bg-white hover:border-blue-200'
        }`}
      >
        <div className="flex items-start gap-3">
          <Link
            to={card.route}
            className="flex min-w-0 flex-1 items-center gap-3 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <EnterpriseAvatar
              src={card.avatarUrl}
              name={card.name}
              user={{ id: card.id, username: card.username }}
              size="lg"
              rounded="2xl"
              className="!h-12 !w-12 shrink-0 ring-1 ring-slate-200 sm:!h-14 sm:!w-14"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  {card.badge}
                </span>
                {card.isFollowing ? (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    <CheckCircle2 className="h-3 w-3" aria-hidden />
                    Following
                  </span>
                ) : null}
              </div>
              <h2 className="mt-1 truncate text-sm font-semibold text-slate-950 sm:text-base">{card.name}</h2>
              <p className="truncate text-xs text-slate-500 sm:text-sm">
                {card.username ? `@${card.username}` : card.location || 'Scrolith member'}
              </p>
            </div>
          </Link>
        </div>

        <p className="mt-3 line-clamp-2 text-sm leading-5 text-slate-600">
          {card.headline || card.whyRecommended || 'Recommended for your first feed.'}
        </p>

        {reasonChips.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5" aria-label={`Signals for ${card.name}`}>
            {reasonChips.map((reason) => (
              <span
                key={`${card.key}-${reason}`}
                className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold sm:text-[11px] ${reasonChipClass(reason)}`}
              >
                {reason}
              </span>
            ))}
          </div>
        ) : null}

        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <Link
            to={card.route}
            className="inline-flex min-h-[44px] items-center text-sm font-medium text-slate-500 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            Preview
          </Link>
          <button
            type="button"
            disabled={card.isFollowing || busyIds[card.key] || submitting}
            onClick={() => void handleFollow(card)}
            aria-label={card.isFollowing ? `Already following ${card.name}` : `Follow ${card.name}`}
            className={`inline-flex min-h-[44px] min-w-[5.75rem] items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
              card.isFollowing
                ? 'bg-emerald-600 text-white'
                : 'bg-blue-600 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300'
            }`}
          >
            {busyIds[card.key] ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {card.isFollowing ? 'Added' : 'Follow'}
          </button>
        </div>
      </article>
    );
  };

  return (
    <div className="follow-onboarding-shell min-h-[100dvh] bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.14),_transparent_36%),linear-gradient(180deg,#f8fbff_0%,#eef5ff_48%,#f8fafc_100%)] pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] pt-[max(0.75rem,env(safe-area-inset-top,0px))] sm:pb-8">
      {/* Compact onboarding header (no full product nav) */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white shadow-sm">
            S
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Scrolith</p>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Set up your feed</p>
          </div>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Onboarding
        </div>
      </header>

      <div className="mx-auto mt-4 w-full max-w-6xl px-4 sm:mt-6 sm:px-6 lg:px-8">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.25fr)] lg:items-start lg:gap-6">
          {/* Left / top stack */}
          <div className="space-y-4">
            <section
              aria-labelledby="follow-onboarding-title"
              className="follow-onboarding-panel rounded-3xl border border-white/70 bg-white/90 p-4 shadow-[0_20px_48px_-28px_rgba(15,23,42,0.35)] backdrop-blur sm:p-6"
            >
              <h1
                id="follow-onboarding-title"
                className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl"
              >
                Build your first Scrolith feed
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                Choose languages you understand, then follow at least one person or page. We&apos;ll personalize
                your first feed from these choices.
              </p>

              {/* Progress — min required, not max 6 */}
              <div
                className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/90 p-3.5 sm:p-4"
                role="status"
                aria-live="polite"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Progress</p>
                  <p className="text-xs font-medium text-slate-600">
                    {activationReady ? 'Ready to continue' : missingHint}
                  </p>
                </div>
                <div
                  className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progressPercent}
                  aria-label={`Onboarding progress ${progressPercent} percent. Languages ${languagesOk ? 'done' : 'needed'}. Follows ${followedCount} of ${followMin} required.`}
                >
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 transition-all duration-300 motion-reduce:transition-none"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <ul className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                  <li className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                    {languagesOk ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                    ) : (
                      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold text-slate-400">
                        1
                      </span>
                    )}
                    <span>
                      Languages{' '}
                      <span className="font-semibold tabular-nums text-slate-950">
                        {understoodLanguages.length}
                      </span>
                      <span className="text-slate-500"> · min 1</span>
                    </span>
                  </li>
                  <li className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                    {followedCount >= followMin ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                    ) : (
                      <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold text-slate-400">
                        2
                      </span>
                    )}
                    <span>
                      Follows{' '}
                      <span className="font-semibold tabular-nums text-slate-950">{followedCount}</span>
                      <span className="text-slate-500">
                        {' '}
                        · min {followMin}
                        {MAX_ONBOARDING_TOTAL > followMin ? ` · up to ${MAX_ONBOARDING_TOTAL}` : ''}
                      </span>
                    </span>
                  </li>
                </ul>
              </div>

              {/* Languages */}
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3.5 sm:p-4">
                <LanguageMultiSelect
                  value={understoodLanguages}
                  onChange={setUnderstoodLanguages}
                  min={1}
                  max={24}
                  label="Languages I understand"
                  helpText="Select all that apply. Languages are not nationality or country."
                />
                {!languagesOk ? (
                  <p className="mt-2 text-xs font-medium text-amber-700">Select at least one language.</p>
                ) : null}
              </div>

              {/* Collapsible guidance */}
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setWhyOpen((v) => !v)}
                  className="inline-flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  aria-expanded={whyOpen}
                >
                  Why we ask this
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 text-slate-500 transition ${whyOpen ? 'rotate-180' : ''}`}
                    aria-hidden
                  />
                </button>
                {whyOpen ? (
                  <div className="mt-2 space-y-2 rounded-xl border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-600">
                    <p className="flex gap-2">
                      <Users className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden />
                      Follows seed your first feed with people and pages you care about.
                    </p>
                    <p className="flex gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                      Languages guide translation suggestions — never nationality or location.
                    </p>
                    <p className="flex gap-2">
                      <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" aria-hidden />
                      You can change follows and languages anytime after you continue.
                    </p>
                  </div>
                ) : null}
              </div>
            </section>
          </div>

          {/* Recommendations */}
          <section
            aria-labelledby="follow-recommendations-heading"
            className="follow-onboarding-panel rounded-3xl border border-slate-200 bg-white/95 p-3.5 shadow-[0_20px_48px_-28px_rgba(15,23,42,0.28)] backdrop-blur sm:p-5"
          >
            <div className="border-b border-slate-200 pb-3">
              <h2 id="follow-recommendations-heading" className="text-sm font-semibold text-slate-950 sm:text-base">
                Recommended people &amp; pages
              </h2>
              <p className="mt-1 text-xs text-slate-500 sm:text-sm">
                Required: follow at least {followMin}. Optional: up to {MAX_ONBOARDING_USERS} people and{' '}
                {MAX_ONBOARDING_PAGES} pages.
              </p>

              <div
                className="mt-3 flex gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                role="tablist"
                aria-label="Recommendation filter"
              >
                {(
                  [
                    ['all', 'All'],
                    ['people', 'People'],
                    ['pages', 'Pages']
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={recoFilter === key}
                    onClick={() => setRecoFilter(key)}
                    className={`inline-flex min-h-[40px] shrink-0 items-center rounded-full px-3.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                      recoFilter === key
                        ? 'bg-slate-900 text-white'
                        : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {error ? (
              <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800" role="alert">
                {error}
              </div>
            ) : null}

            {loading ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Loading recommendations">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={`onboarding-skeleton-${index}`}
                    className="flex min-h-[11rem] flex-col rounded-2xl border border-slate-200 bg-white p-3.5"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 animate-pulse rounded-2xl bg-slate-200 motion-reduce:animate-none" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="h-3 w-16 animate-pulse rounded bg-slate-200 motion-reduce:animate-none" />
                        <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200 motion-reduce:animate-none" />
                      </div>
                    </div>
                    <div className="mt-3 h-3 w-full animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
                    <div className="mt-auto flex justify-end pt-4">
                      <div className="h-9 w-20 animate-pulse rounded-full bg-slate-200 motion-reduce:animate-none" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {visibleCards.map((card) => renderRecoCard(card))}
                {!visibleCards.length ? (
                  <div className="sm:col-span-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                    {cards.length
                      ? 'No recommendations in this filter. Try All, People, or Pages.'
                      : 'We couldn’t load recommendations. Retry in a moment, or search after you continue if this persists.'}
                    {!cards.length ? (
                      <button
                        type="button"
                        className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800"
                        onClick={() => window.location.reload()}
                      >
                        Retry
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}

            {selectedCards.length > 0 ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected for your feed</p>
                <div className="mt-2 flex flex-wrap gap-2" aria-label="Selected accounts">
                  {selectedCards.map((card) => (
                    <div
                      key={`preview-${card.key}`}
                      className="inline-flex max-w-full items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2.5"
                    >
                      <EnterpriseAvatar
                        src={card.avatarUrl}
                        name={card.name}
                        user={{ id: card.id, username: card.username }}
                        size="xs"
                        className="!h-6 !w-6"
                      />
                      <span className="max-w-[7.5rem] truncate text-xs font-semibold text-slate-700">{card.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Desktop continue (mobile uses sticky) */}
            <div className="mt-5 hidden border-t border-slate-200 pt-4 sm:block">
              <button
                type="button"
                onClick={() => void handleContinue()}
                disabled={!canContinue || submitting}
                className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowRight className="h-4 w-4" aria-hidden />}
                {submitting ? 'Opening feed…' : activationReady ? 'Continue to feed' : 'Continue'}
              </button>
              {!canContinue ? (
                <p className="mt-2 text-center text-xs text-slate-500">{missingHint}</p>
              ) : null}
            </div>
          </section>
        </div>
      </div>

      {/* Mobile sticky continue */}
      <div className="follow-onboarding-sticky fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/90 bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-3 shadow-[0_-12px_32px_-20px_rgba(15,23,42,0.35)] backdrop-blur sm:hidden">
        <p className="mb-2 text-center text-xs font-medium text-slate-600" aria-live="polite">
          {missingHint}
          {selectedCards.length > 0 ? ` · ${selectedCards.length} followed` : ''}
        </p>
        <button
          type="button"
          onClick={() => void handleContinue()}
          disabled={!canContinue || submitting}
          className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowRight className="h-4 w-4" aria-hidden />}
          {submitting ? 'Opening feed…' : activationReady ? 'Continue to feed' : 'Continue'}
        </button>
      </div>
    </div>
  );
};

export default FollowOnboarding;
