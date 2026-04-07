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
};

const DEFAULT_STATUS: FollowOnboardingStatus = {
  required: true,
  completedAt: null,
  followedCount: 0,
  minimumRequired: 1,
  maximumSelectable: 6,
  canContinue: false,
  redirectPath: '/'
};

const normalizeUserReco = (item: any): RecommendationCard | null => {
  const account = item?.account || {};
  const id = String(item?.entityId || account?.id || '').trim();
  if (!id) return null;
  const entityType = String(item?.entityType || account?.entityType || '').trim().toLowerCase();
  const userType = entityType === 'client' ? 'client' : 'freelancer';
  const username = String(account?.username || '').trim() || null;
  return {
    key: `user:${id}`,
    id,
    targetType: 'user',
    entityType: userType,
    name: String(account?.name || 'Recommended account').trim(),
    username,
    headline: String(account?.headline || '').trim() || null,
    location: String(account?.location || '').trim() || null,
    avatarUrl: account?.avatar ? resolveAssetUrl(String(account.avatar)) : null,
    badge: userType === 'client' ? 'Client' : 'Freelancer',
    route: `/u/${encodeURIComponent(username || id)}`,
    isFollowing: false
  };
};

const normalizePageReco = (page: any): RecommendationCard | null => {
  const id = String(page?.id || '').trim();
  if (!id) return null;
  const handle = String(page?.handle || page?.slug || '').trim();
  return {
    key: `page:${id}`,
    id,
    targetType: 'page',
    entityType: 'page',
    name: String(page?.name || 'Recommended page').trim(),
    username: handle || null,
    headline: String(page?.tagline || page?.description || '').trim() || null,
    location: String(page?.location || '').trim() || null,
    avatarUrl: page?.logo ? resolveAssetUrl(String(page.logo)) : null,
    badge: 'Page',
    route: `/company/${encodeURIComponent(handle || id)}`,
    isFollowing: Boolean(page?.isFollowing)
  };
};

const interleaveRecommendations = (
  userRole: UserRole | string | undefined,
  users: RecommendationCard[],
  clients: RecommendationCard[],
  pages: RecommendationCard[]
) => {
  const normalizedRole = String(userRole || '').trim().toLowerCase();
  const primaryUsers = normalizedRole === UserRole.EMPLOYER ? users : clients;
  const secondaryUsers = normalizedRole === UserRole.EMPLOYER ? clients : users;
  const lanes = [primaryUsers, pages, secondaryUsers];
  const output: RecommendationCard[] = [];
  const seen = new Set<string>();
  let cursor = 0;

  while (lanes.some((lane) => lane.length > cursor) && output.length < 12) {
    lanes.forEach((lane) => {
      const item = lane[cursor];
      if (!item || seen.has(item.key)) return;
      seen.add(item.key);
      output.push(item);
    });
    cursor += 1;
  }

  return output.slice(0, 12);
};

const FollowOnboarding = () => {
  const navigate = useNavigate();
  const { user, updateUser } = useUser();
  const [status, setStatus] = useState<FollowOnboardingStatus>(DEFAULT_STATUS);
  const [cards, setCards] = useState<RecommendationCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const followedCount = Math.min(
    status.maximumSelectable,
    Math.max(0, Number(status.followedCount || 0))
  );
  const progressPercent = Math.max(
    8,
    Math.min(100, Math.round((followedCount / Math.max(1, status.maximumSelectable)) * 100))
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

        const [freelancersResult, clientsResult, pagesResult] = await Promise.allSettled([
          RecoService.getAccounts({ surface: 'who_to_follow', type: 'freelancer', limit: 6 }),
          RecoService.getAccounts({ surface: 'who_to_follow', type: 'client', limit: 6 }),
          CommunityService.getRecommendedBusinessPages(6)
        ]);

        const freelancers =
          freelancersResult.status === 'fulfilled'
            ? freelancersResult.value.map(normalizeUserReco).filter(Boolean) as RecommendationCard[]
            : [];
        const clients =
          clientsResult.status === 'fulfilled'
            ? clientsResult.value.map(normalizeUserReco).filter(Boolean) as RecommendationCard[]
            : [];
        const pages =
          pagesResult.status === 'fulfilled'
            ? pagesResult.value.map(normalizePageReco).filter(Boolean) as RecommendationCard[]
            : [];

        const userIds = [...freelancers, ...clients].map((item) => item.id);
        const followStatus = userIds.length ? await CommunityService.getFollowStatus(userIds) : {};

        const nextCards = interleaveRecommendations(
          statusResponse?.user?.role || user?.role,
          freelancers.map((item) => ({ ...item, isFollowing: Boolean((followStatus as any)?.[item.id]) })),
          clients.map((item) => ({ ...item, isFollowing: Boolean((followStatus as any)?.[item.id]) })),
          pages
        );

        const totalFollowed = Math.max(
          Number(onboarding.followedCount || 0),
          nextCards.filter((item) => item.isFollowing).length
        );

        setStatus({
          ...onboarding,
          followedCount: totalFollowed,
          canContinue: totalFollowed >= onboarding.minimumRequired
        });
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
  }, [navigate, user?.role]);

  const summaryCopy = useMemo(() => {
    const role = String(user?.role || '').trim().toLowerCase();
    if (role === UserRole.EMPLOYER) {
      return 'Follow standout freelancers and high-signal pages so your feed starts with hiring insight, creator updates, and fresh talent.';
    }
    return 'Follow clients, freelancers, and pages so your feed opens with real opportunities, useful posts, and trusted voices.';
  }, [user?.role]);

  const handleFollow = async (card: RecommendationCard) => {
    if (card.isFollowing || busyIds[card.key] || submitting) return;
    if (followedCount >= status.maximumSelectable) {
      setError(`You can follow up to ${status.maximumSelectable} accounts or pages in this step.`);
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

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_34%),linear-gradient(180deg,#f8fbff_0%,#eef5ff_46%,#f8fafc_100%)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col justify-center">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.35fr)]">
          <section className="rounded-[32px] border border-white/60 bg-white/85 p-6 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.35)] backdrop-blur sm:p-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
              <Sparkles className="h-3.5 w-3.5" />
              Build your feed
            </div>

            <h1 className="mt-5 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              Follow a few strong accounts before you enter Scrolith.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-600 sm:text-base">
              {summaryCopy}
            </p>

            <div className="mt-8 rounded-[28px] border border-slate-200 bg-slate-50/90 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Progress</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">
                    {followedCount}
                    <span className="ml-2 text-sm font-medium text-slate-500">of {status.maximumSelectable} selected</span>
                  </p>
                </div>
                <div className="rounded-2xl bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
                  Follow at least <span className="font-semibold text-slate-950">{status.minimumRequired}</span> to continue
                </div>
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-600 via-cyan-500 to-emerald-500 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            <div className="mt-8 grid gap-3 text-sm text-slate-600">
              <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <Users className="mt-0.5 h-4 w-4 text-blue-600" />
                <span>We mix recommended freelancers, clients, and pages so your first session is not empty.</span>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                <span>Your follows update in real time and unlock your signed-in member feed immediately after completion.</span>
              </div>
              <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <Building2 className="mt-0.5 h-4 w-4 text-violet-600" />
                <span>Choose pages for brand updates and communities, or accounts for direct opportunity and conversation.</span>
              </div>
            </div>
          </section>

          <section className="rounded-[32px] border border-slate-200 bg-white/92 p-4 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.28)] backdrop-blur sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
              <div>
                <p className="text-sm font-semibold text-slate-950">Recommended for your first feed</p>
                <p className="mt-1 text-sm text-slate-500">Follow up to {status.maximumSelectable}. You can keep customizing later.</p>
              </div>
              <button
                type="button"
                onClick={() => void handleContinue()}
                disabled={!status.canContinue || submitting}
                className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Continue to feed
              </button>
            </div>

            {error ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {error}
              </div>
            ) : null}

            {loading ? (
              <div className="flex min-h-[28rem] items-center justify-center">
                <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading recommendations...
                </div>
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

                  return (
                    <article
                      key={card.key}
                      className={`group flex h-full flex-col rounded-[26px] border p-4 transition ${
                        card.isFollowing
                          ? 'border-emerald-300 bg-emerald-50/70 shadow-[0_16px_30px_-22px_rgba(22,163,74,0.55)]'
                          : 'border-slate-200 bg-white hover:border-blue-200 hover:shadow-[0_18px_40px_-24px_rgba(37,99,235,0.22)]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <Link to={card.route} className="flex min-w-0 items-center gap-3">
                          {card.avatarUrl ? (
                            <img
                              src={card.avatarUrl}
                              alt={card.name}
                              className="h-14 w-14 rounded-2xl object-cover ring-1 ring-slate-200"
                            />
                          ) : (
                            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-sm font-semibold text-slate-600 ring-1 ring-slate-200">
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
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Following
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-4 min-h-[3.25rem] text-sm leading-6 text-slate-600">
                        {card.headline || 'Recommended to help shape your feed from the first session.'}
                      </p>

                      <div className="mt-auto flex items-center justify-between gap-3 pt-5">
                        <Link to={card.route} className="text-sm font-medium text-slate-500 transition hover:text-slate-700">
                          Preview
                        </Link>
                        <button
                          type="button"
                          disabled={card.isFollowing || busyIds[card.key] || submitting}
                          onClick={() => void handleFollow(card)}
                          className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                            card.isFollowing
                              ? 'bg-emerald-600 text-white'
                              : 'bg-blue-600 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300'
                          }`}
                        >
                          {busyIds[card.key] ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
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
          </section>
        </div>
      </div>
    </div>
  );
};

export default FollowOnboarding;
