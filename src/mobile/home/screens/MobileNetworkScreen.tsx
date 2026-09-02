import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShieldIcon as Shield,
  UserMinusIcon as UserMinus,
  UserPlusIcon as UserPlus
} from '../../../components/icons/ShellIcons';
import { CommunityService } from '../../../services/community';
import { useUser } from '../../../context/UserContext';
import { MOBILE_PAGE_SECTION_CLASS } from '../mobileShellLayout';
import ProfessionalIntegrationStrip from '../../../components/discovery/ProfessionalIntegrationStrip';
import PeopleYouMayKnowRail from '../../../components/discovery/PeopleYouMayKnowRail';
import EmptyState from '../../../components/ui/EmptyState';

type Tab = 'following' | 'followers';

const normalizeUser = (value: any) => ({
  id: String(value?.id || '').trim(),
  name: String(value?.name || value?.username || 'Member').trim(),
  username: String(value?.username || '').trim(),
  avatar: value?.avatar || value?.avatarUrl || value?.avatar_url || null
});

const networkUserId = (row: any) =>
  String(
    row?.user?.id ||
      row?.followee?.id ||
      row?.follower?.id ||
      row?.userId ||
      row?.user_id ||
      row?.id ||
      ''
  ).trim();

const uniqueNetworkItems = (rows: any[]) => {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const id = networkUserId(row);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

export default function MobileNetworkScreen() {
  const { user } = useUser();
  const [tab, setTab] = useState<Tab>('following');
  const [items, setItems] = useState<any[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionBusyById, setActionBusyById] = useState<Record<string, boolean>>({});
  const [actionErrorById, setActionErrorById] = useState<Record<string, string>>({});
  const [followedBackIds, setFollowedBackIds] = useState<Set<string>>(new Set());
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const armedRef = useRef(false);
  const requestIdRef = useRef(0);
  const loadingRef = useRef(false);

  const load = async (mode: 'initial' | 'more') => {
    if (!user?.id) return;
    if (mode === 'more' && loadingRef.current) return;
    loadingRef.current = true;
    const requestId = ++requestIdRef.current;
    try {
      setError(null);
      if (mode === 'initial') setLoading(true);
      else setLoadingMore(true);

      const resp =
        tab === 'following'
          ? await CommunityService.listMyFollowing({ cursor: mode === 'more' ? cursor || undefined : undefined, limit: 20 })
          : await CommunityService.listMyFollowers({ cursor: mode === 'more' ? cursor || undefined : undefined, limit: 20 });

      if (requestId !== requestIdRef.current) return;
      const nextItems = uniqueNetworkItems(Array.isArray(resp?.items) ? resp.items : []);
      const nextCursor = resp?.nextCursor ? String(resp.nextCursor) : null;
      setCursor(nextCursor);
      setItems((prev) => uniqueNetworkItems(mode === 'more' ? [...prev, ...nextItems] : nextItems));
    } catch (e: any) {
      if (requestId === requestIdRef.current) {
        setError(e?.response?.data?.error ?? e?.message ?? 'Failed to load network.');
      }
    } finally {
      if (requestId === requestIdRef.current) {
        loadingRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  const setActionBusy = (id: string, busy: boolean) => {
    setActionBusyById((prev) => {
      const next = { ...prev };
      if (busy) next[id] = true;
      else delete next[id];
      return next;
    });
  };

  const handleUnfollow = async (followId: string, userId: string) => {
    if (!followId || !userId || actionBusyById[userId]) return;
    const previous = items;
    setActionBusy(userId, true);
    setActionErrorById((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    setItems((current) => current.filter((row) => networkUserId(row) !== userId));
    try {
      await CommunityService.unfollowTarget(followId);
    } catch (e: any) {
      setItems(previous);
      setActionErrorById((prev) => ({
        ...prev,
        [userId]: e?.response?.data?.error ?? e?.message ?? 'Unable to update following.'
      }));
    } finally {
      setActionBusy(userId, false);
    }
  };

  const handleBlockToggle = async (userId: string, isBlocked: boolean, row: any) => {
    if (!userId || actionBusyById[userId]) return;
    setActionBusy(userId, true);
    setActionErrorById((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    if (!isBlocked) {
      setItems((current) => current.filter((entry) => networkUserId(entry) !== userId));
    } else {
      setItems((current) => current.map((entry) => (networkUserId(entry) === userId ? { ...entry, isBlocked: false } : entry)));
    }
    try {
      if (isBlocked) await CommunityService.unblockUser(userId);
      else await CommunityService.blockUser(userId);
    } catch (e: any) {
      setItems((current) => {
        if (isBlocked) return current.map((entry) => (networkUserId(entry) === userId ? row : entry));
        return uniqueNetworkItems([...current, row]);
      });
      setActionErrorById((prev) => ({
        ...prev,
        [userId]: e?.response?.data?.error ?? e?.message ?? 'Unable to update block status.'
      }));
    } finally {
      setActionBusy(userId, false);
    }
  };

  const handleFollowBack = async (userId: string) => {
    if (!userId || actionBusyById[userId] || followedBackIds.has(userId)) return;
    setActionBusy(userId, true);
    setActionErrorById((prev) => {
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    try {
      await CommunityService.followTarget({ targetType: 'user', targetId: userId });
      setFollowedBackIds((prev) => new Set(prev).add(userId));
      window.dispatchEvent(new CustomEvent('community:follow_updated', {
        detail: { actorUserId: user.id, targetUserId: userId, targetType: 'user', targetId: userId, isFollowing: true, action: 'follow' }
      }));
    } catch (e: any) {
      setActionErrorById((prev) => ({
        ...prev,
        [userId]: e?.response?.data?.error ?? e?.message ?? 'Unable to follow back.'
      }));
    } finally {
      setActionBusy(userId, false);
    }
  };

  useEffect(() => {
    setCursor(null);
    setItems([]);
    setFollowedBackIds(new Set());
    requestIdRef.current += 1;
    void load('initial');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, user?.id]);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const node = sentinelRef.current;
    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (!cursor) return;
        if (loading || loadingMore) return;
        if (armedRef.current) return;
        armedRef.current = true;
        void load('more').finally(() => {
          armedRef.current = false;
        });
      },
      { rootMargin: '500px 0px', threshold: 0.01 }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [cursor, loading, loadingMore]);

  const header = useMemo(() => (tab === 'following' ? 'Following' : 'Followers'), [tab]);

  if (loading) {
    return (
      <div className={MOBILE_PAGE_SECTION_CLASS}>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading {header}...</div>
      </div>
    );
  }

  return (
    <div className={MOBILE_PAGE_SECTION_CLASS}>
      <div className="mb-3">
        <ProfessionalIntegrationStrip surface="mobile" compact />
      </div>
      <div className="mb-3">
        <PeopleYouMayKnowRail limit={5} title="People you may know" />
      </div>
      <div className="mb-3 flex gap-2" role="tablist" aria-label="Network lists">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'following'}
          onClick={() => setTab('following')}
          className={[
            'flex-1 rounded-full px-4 py-2 text-sm font-semibold',
            tab === 'following' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200'
          ].join(' ')}
        >
          Following
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'followers'}
          onClick={() => setTab('followers')}
          className={[
            'flex-1 rounded-full px-4 py-2 text-sm font-semibold',
            tab === 'followers' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 border border-slate-200'
          ].join(' ')}
        >
          Followers
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-white p-4">
          <div className="text-sm font-semibold text-red-700">Network error</div>
          <div className="mt-1 text-sm text-slate-700">{error}</div>
          <button
            type="button"
            onClick={() => void load('initial')}
            className="mt-3 w-full rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="space-y-3" role="tabpanel" aria-label={header}>
        {!error && items.length === 0 ? (
          <EmptyState
            title={tab === 'following' ? 'You are not following anyone yet' : 'No followers yet'}
            description={
              tab === 'following'
                ? 'Discover people from the suggestions above to grow your professional network.'
                : 'Share your profile and posts so the right people can follow you.'
            }
            ctaLabel="Explore community"
            onCtaClick={() => {
              window.location.assign('/community');
            }}
          />
        ) : null}

        {items.map((row) => {
          const followId = String(row?.followId || row?.id || '').trim();
          const isBlocked = Boolean(row?.isBlocked);
          const u = normalizeUser(row?.user || row?.followee || row?.follower || row);
          const canUnfollow = tab === 'following' && followId;
          const canBlock = tab === 'followers' && u.id;
          const busy = Boolean(actionBusyById[u.id]);
          const followBackDone = followedBackIds.has(u.id);

          return (
            <React.Fragment key={followId || u.id}>
            <div className="flex items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <Link to={`/u/${encodeURIComponent(u.username || u.id)}`} className="flex min-w-0 items-center gap-3 touch-manipulation">
                <div className="h-12 w-12 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                  {u.avatar ? <img src={u.avatar} alt="" className="h-full w-full object-cover" /> : null}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">{u.name}</div>
                  {u.username ? <div className="truncate text-xs text-slate-500">@{u.username}</div> : null}
                </div>
              </Link>

              <div className="flex items-center gap-2">
                {canUnfollow ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={() => void handleUnfollow(followId, u.id)}
                    disabled={busy}
                    aria-label={`Unfollow ${u.name}`}
                  >
                    <UserMinus className="h-4 w-4" aria-hidden="true" />
                    Unfollow
                  </button>
                ) : null}

                {canBlock ? (
                  <button
                    type="button"
                    className={[
                      'inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold',
                      isBlocked ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    ].join(' ')}
                    onClick={() => void handleBlockToggle(u.id, isBlocked, row)}
                    disabled={busy}
                    aria-label={isBlocked ? `Unblock ${u.name}` : `Block ${u.name}`}
                  >
                    <Shield className="h-4 w-4" aria-hidden="true" />
                    {isBlocked ? 'Unblock' : 'Block'}
                  </button>
                ) : null}

                {tab === 'followers' && u.id ? (
                  <button
                    type="button"
                    className={[
                      'inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold',
                      followBackDone ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : 'bg-slate-900 text-white'
                    ].join(' ')}
                    onClick={() => void handleFollowBack(u.id)}
                    disabled={busy || followBackDone}
                    aria-label={followBackDone ? `${u.name} followed` : `Follow ${u.name} back`}
                  >
                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                    {followBackDone ? 'Following' : 'Follow back'}
                  </button>
                ) : null}
              </div>
            </div>
            {actionErrorById[u.id] ? (
              <div className="mt-2 text-right text-xs font-medium text-red-600" role="alert">
                {actionErrorById[u.id]}
              </div>
            ) : null}
            </React.Fragment>
          );
        })}

        {loadingMore ? (
          <div className="py-3 text-center text-sm text-slate-600" role="status">Loading more...</div>
        ) : null}
        <div ref={sentinelRef} className="h-6" />
        {!cursor && items.length ? <div className="py-6 text-center text-xs text-slate-500">End of list.</div> : null}
      </div>
    </div>
  );
}
