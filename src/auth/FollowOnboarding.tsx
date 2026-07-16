import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
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

const MAX_ONBOARDING_USERS = 3;
const MAX_ONBOARDING_PAGES = 3;
const MAX_ONBOARDING_TOTAL = 6;

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
  const canContinue = followedCount >= Math.max(1, Number(status.minimumRequired || 1));

  const progressPercent = Math.max(
    8,
    Math.min(100, Math.round((followedCount / Math.max(1, MAX_ONBOARDING_TOTAL)) * 100))
  );

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

  const summaryCopy = useMemo(() => {
    const role = String(user?.role || '').trim().toLowerCase();
    if (role === UserRole.EMPLOYER) {
      return 'Follow standout freelancers and high-signal pages so your feed starts with hiring insight, creator updates, and fresh talent.';
    }
    return 'Follow clients, freelancers, and pages so your feed opens with real opportunities, useful posts, and trusted voices.';
  }, [user?.role]);

  const handleFollow = async (card: RecommendationCard) => {
    if (card.isFollowing || busyIds[card.key] || submitting) return;
    if (followedCount >= MAX_ONBOARDING_TOTAL) {
      setError(`You can follow up to ${MAX_ONBOARDING_TOTAL} total recommendations in this step.`);
      return;
    }
    if (card.targetType === 'page' && selectedPageCount >= MAX_ONBOARDING_PAGES) {
      setError(`You can follow up to ${MAX_ONBOARDING_PAGES} pages during onboarding.`);
      return;
    }
    if (card.targetType === 'user' && selectedUserCount >= MAX_ONBOARDING_USERS) {
      setError(`You can follow up to ${MAX_ONBOARDING_USERS} user accounts during onboarding.`);
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
    if (submitting || !status.canContinue) return;
    setSubmitting(true);
    setError('');
    try {
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
  const progressLabel = `${followedCount} of ${MAX_ONBOARDING_TOTAL} selected`;
  const selectedCards = useMemo(() => cards.filter((item) => item.isFollowing), [cards]);
  const feedPreviewNames = selectedCards.slice(0, 4).map((item) => item.name);

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

  return (
    <div className="follow-onboarding-shell min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_34%),linear-gradient(180deg,#f8fbff_0%,#eef5ff_46%,#f8fafc_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col justify-center">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
          <section
            aria-labelledby="follow-onboarding-title"
            className="follow-onboarding-panel rounded-[32px] border border-white/60 bg-white/85 p-6 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur sm:p-8"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Shape your professional identity
            </div>

            <h1 id="follow-onboarding-title" className="mt-5 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Choose the people and brands that will define your first Scrolith feed.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">{summaryCopy}</p>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">
              This is not a checklist — it is how you seed reputation, opportunity, and community signals for day one.
            </p>

            <div
              className="mt-8 rounded-[28px] border border-slate-200 bg-slate-50/90 p-5"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Progress</p>
                  <p className="mt-2 text-2xl font-semibold tabular-nums text-slate-950">
                    {followedCount}
                    <span className="ml-2 text-sm font-medium text-slate-500">of {MAX_ONBOARDING_TOTAL} selected</span>
                  </p>
                </div>
                <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
                  Follow at least <span className="font-semibold text-slate-950">{status.minimumRequired}</span> to continue
                </div>
              </div>
              <div
                className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={MAX_ONBOARDING_TOTAL}
                aria-valuenow={followedCount}
                aria-label={progressLabel}
              >
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 transition-all duration-300 motion-reduce:transition-none"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
                  <span className="font-semibold tabular-nums text-slate-950">{selectedUserCount}</span> of{' '}
                  {MAX_ONBOARDING_USERS} user accounts selected
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
                  <span className="font-semibold tabular-nums text-slate-950">{selectedPageCount}</span> of{' '}
                  {MAX_ONBOARDING_PAGES} pages selected
                </div>
              </div>
              {activationReady ? (
                <div className="mt-4 flex items-start gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>
                    Identity ready. Continue to open your personalized member feed with these accounts already
                    followed.
                  </span>
                </div>
              ) : null}
            </div>

            {selectedCards.length > 0 ? (
              <div className="mt-6 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Your feed preview</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  After you continue, posts and opportunities from{' '}
                  <span className="font-semibold text-slate-900">
                    {feedPreviewNames.join(', ')}
                    {selectedCards.length > feedPreviewNames.length
                      ? ` +${selectedCards.length - feedPreviewNames.length} more`
                      : ''}
                  </span>{' '}
                  will seed your home feed — not an empty timeline.
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Selected accounts">
                  {selectedCards.map((card) => {
                    const initials = card.name
                      .split(' ')
                      .map((part) => part[0] || '')
                      .join('')
                      .slice(0, 2)
                      .toUpperCase();
                    const showImg = Boolean(card.avatarUrl) && !avatarFailures[card.key];
                    return (
                      <div
                        key={`preview-${card.key}`}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-1 pl-1 pr-3"
                      >
                        {showImg ? (
                          <img
                            src={card.avatarUrl || undefined}
                            alt=""
                            className="h-7 w-7 rounded-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600">
                            {initials || 'SC'}
                          </span>
                        )}
                        <span className="max-w-[7rem] truncate text-xs font-semibold text-slate-700">{card.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="mt-8 grid gap-3 text-sm text-slate-600">
              <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
                <span>
                  Mixed freelancers, clients, and pages keep your first session rich with opportunity and conversation.
                </span>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                <span>
                  Follows apply immediately and unlock your signed-in member feed the moment you continue.
                </span>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" aria-hidden="true" />
                <span>
                  Pages surface brand and community signals; people surface hiring, creator, and mutual-interest
                  activity.
                </span>
              </div>
            </div>
          </section>

          <section
            aria-labelledby="follow-recommendations-heading"
            className="follow-onboarding-panel rounded-[32px] border border-slate-200 bg-white/92 p-4 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.28)] backdrop-blur sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <p id="follow-recommendations-heading" className="text-sm font-semibold text-slate-950">
                  Recommended for your professional graph
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Follow up to {MAX_ONBOARDING_USERS} people and {MAX_ONBOARDING_PAGES} pages. Signals show industry,
                  verification, hiring, and trend relevance.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleContinue()}
                disabled={!canContinue || submitting}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                {submitting ? 'Opening feed…' : 'Continue to feed'}
              </button>
            </div>

            {error ? (
              <div
                className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
                role="alert"
              >
                {error}
              </div>
            ) : null}

            {loading ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading recommendations">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div
                    key={`onboarding-skeleton-${index}`}
                    className="follow-reco-skeleton flex h-full min-h-[17rem] flex-col rounded-[26px] border border-slate-200 bg-white p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-14 w-14 animate-pulse rounded-2xl bg-slate-200 motion-reduce:animate-none" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="h-4 w-16 animate-pulse rounded-full bg-slate-200 motion-reduce:animate-none" />
                        <div className="h-4 w-2/3 animate-pulse rounded bg-slate-200 motion-reduce:animate-none" />
                        <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
                      </div>
                    </div>
                    <div className="mt-4 space-y-2">
                      <div className="h-3 w-full animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
                      <div className="h-3 w-5/6 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <div className="h-6 w-16 animate-pulse rounded-full bg-slate-100 motion-reduce:animate-none" />
                      <div className="h-6 w-20 animate-pulse rounded-full bg-slate-100 motion-reduce:animate-none" />
                    </div>
                    <div className="mt-auto flex items-center justify-between pt-5">
                      <div className="h-4 w-14 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
                      <div className="h-9 w-20 animate-pulse rounded-full bg-slate-200 motion-reduce:animate-none" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {cards.map((card) => {
                  const initials = card.name
                    .split(' ')
                    .map((part) => part[0] || '')
                    .join('')
                    .slice(0, 2)
                    .toUpperCase();
                  const showAvatarImage = Boolean(card.avatarUrl) && !avatarFailures[card.key];
                  const reasonChips = Array.isArray(card.reasons) ? card.reasons : [];

                  return (
                    <article
                      key={card.key}
                      className={`follow-reco-card group flex h-full flex-col rounded-[26px] border p-4 transition duration-200 motion-reduce:transition-none ${
                        card.isFollowing
                          ? 'border-emerald-300 bg-emerald-50/70 shadow-[0_16px_30px_-22px_rgba(22,163,74,0.55)]'
                          : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_18px_40px_-24px_rgba(37,99,235,0.22)] motion-reduce:hover:translate-y-0'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <Link
                          to={card.route}
                          className="flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                        >
                          {showAvatarImage ? (
                            <img
                              src={card.avatarUrl || undefined}
                              alt=""
                              className="h-14 w-14 rounded-2xl object-cover ring-1 ring-slate-200"
                              loading="lazy"
                              decoding="async"
                              onError={(event) => {
                                if (!avatarFailures[card.key]) {
                                  setAvatarFailures((prev) => ({ ...prev, [card.key]: true }));
                                }
                                event.currentTarget.onerror = null;
                              }}
                            />
                          ) : (
                            <div
                              className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-sm font-semibold text-slate-600 ring-1 ring-slate-200"
                              aria-hidden="true"
                            >
                              {initials || 'SC'}
                            </div>
                          )}
                          <div className="min-w-0">
                            <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                              {card.badge}
                            </span>
                            <h2 className="mt-2 truncate text-base font-semibold text-slate-950">{card.name}</h2>
                            <p className="truncate text-sm text-slate-500">
                              {card.username ? `@${card.username}` : card.location || 'Scrolith member'}
                            </p>
                          </div>
                        </Link>
                        {card.isFollowing ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Following
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-4 min-h-[2.75rem] text-sm leading-6 text-slate-600">
                        {card.headline || 'Recommended to help shape your feed from the first session.'}
                      </p>

                      <p className="mt-3 text-xs leading-5 text-slate-500">
                        <span className="font-semibold text-slate-600">Why recommended: </span>
                        {card.whyRecommended || 'Strong match for your first-session feed quality.'}
                      </p>

                      {reasonChips.length ? (
                        <div className="mt-3 flex flex-wrap gap-1.5" aria-label={`Signals for ${card.name}`}>
                          {reasonChips.map((reason) => (
                            <span
                              key={`${card.key}-${reason}`}
                              className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${reasonChipClass(reason)}`}
                            >
                              {reason}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                        <Link
                          to={card.route}
                          className="min-h-[44px] inline-flex items-center text-sm font-medium text-slate-500 transition hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                        >
                          Preview
                        </Link>
                        <button
                          type="button"
                          disabled={card.isFollowing || busyIds[card.key] || submitting}
                          onClick={() => void handleFollow(card)}
                          aria-label={
                            card.isFollowing
                              ? `Already following ${card.name}`
                              : `Follow ${card.name}`
                          }
                          className={`inline-flex min-h-[44px] min-w-[5.5rem] items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                            card.isFollowing
                              ? 'bg-emerald-600 text-white'
                              : 'bg-blue-600 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300'
                          }`}
                        >
                          {busyIds[card.key] ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                          {card.isFollowing ? 'Added' : 'Follow'}
                        </button>
                      </div>
                    </article>
                  );
                })}

                {!cards.length ? (
                  <div className="sm:col-span-2 xl:col-span-3">
                    <div className="rounded-[26px] border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center text-sm text-slate-600">
                      Recommendations are still warming up. Reload this page in a moment to continue.
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {!loading && cards.length > 0 ? (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50/60 px-4 py-4 text-sm text-slate-600">
                <p className="font-semibold text-slate-800">What happens next</p>
                <ol className="mt-2 list-decimal space-y-1.5 pl-4 leading-6">
                  <li>Your follows are saved to your professional graph.</li>
                  <li>Member home opens with a feed seeded by those accounts.</li>
                  <li>You can refine follows anytime from recommendations and search.</li>
                </ol>
                {selectedCards.length > 0 ? (
                  <p className="mt-3 text-xs font-medium text-slate-500">
                    {selectedCards.length} selected · feed quality improves with each relevant follow
                  </p>
                ) : (
                  <p className="mt-3 text-xs font-medium text-slate-500">
                    Follow at least {status.minimumRequired} to unlock continue
                  </p>
                )}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
};

export default FollowOnboarding;
