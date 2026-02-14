import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Shield, UserMinus, UserPlus } from 'lucide-react';
import { CommunityService } from '../../../services/community';
import { useUser } from '../../../context/UserContext';

type Tab = 'following' | 'followers';

const normalizeUser = (value: any) => ({
  id: String(value?.id || '').trim(),
  name: String(value?.name || value?.username || 'Member').trim(),
  username: String(value?.username || '').trim(),
  avatar: value?.avatar || value?.avatarUrl || value?.avatar_url || null
});

export default function MobileNetworkScreen() {
  const { user } = useUser();
  const [tab, setTab] = useState<Tab>('following');
  const [items, setItems] = useState<any[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const armedRef = useRef(false);

  const load = async (mode: 'initial' | 'more') => {
    if (!user?.id) return;
    try {
      setError(null);
      if (mode === 'initial') setLoading(true);
      else setLoadingMore(true);

      const resp =
        tab === 'following'
          ? await CommunityService.listMyFollowing({ cursor: mode === 'more' ? cursor || undefined : undefined, limit: 20 })
          : await CommunityService.listMyFollowers({ cursor: mode === 'more' ? cursor || undefined : undefined, limit: 20 });

      const nextItems = Array.isArray(resp?.items) ? resp.items : [];
      const nextCursor = resp?.nextCursor ? String(resp.nextCursor) : null;
      setCursor(nextCursor);
      setItems((prev) => (mode === 'more' ? [...prev, ...nextItems] : nextItems));
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Failed to load network.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    setCursor(null);
    setItems([]);
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
      <div className="mx-auto max-w-md px-3 py-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading {header}...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-3 py-4">
      <div className="mb-3 flex gap-2">
        <button
          type="button"
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

      <div className="space-y-3">
        {items.map((row) => {
          const followId = String(row?.followId || row?.id || '').trim();
          const isBlocked = Boolean(row?.isBlocked);
          const u = normalizeUser(row?.user || row?.followee || row?.follower || row);
          const canUnfollow = tab === 'following' && followId;
          const canBlock = tab === 'followers' && u.id;

          return (
            <div key={followId || u.id} className="flex items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
              <a href={`/u/${encodeURIComponent(u.username || u.id)}`} className="flex min-w-0 items-center gap-3">
                <div className="h-12 w-12 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                  {u.avatar ? <img src={u.avatar} alt={u.name} className="h-full w-full object-cover" /> : null}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">{u.name}</div>
                  {u.username ? <div className="truncate text-xs text-slate-500">@{u.username}</div> : null}
                </div>
              </a>

              <div className="flex items-center gap-2">
                {canUnfollow ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    onClick={() => void CommunityService.unfollowTarget(followId).then(() => load('initial')).catch(() => {})}
                  >
                    <UserMinus className="h-4 w-4" />
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
                    onClick={() => {
                      const op = isBlocked ? CommunityService.unblockUser(u.id) : CommunityService.blockUser(u.id);
                      void op.then(() => load('initial')).catch(() => {});
                    }}
                    aria-label={isBlocked ? 'Unblock user' : 'Block user'}
                  >
                    <Shield className="h-4 w-4" />
                    {isBlocked ? 'Unblock' : 'Block'}
                  </button>
                ) : null}

                {tab === 'followers' && u.id ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                    onClick={() => void CommunityService.followTarget({ targetType: 'user', targetId: u.id }).catch(() => {})}
                  >
                    <UserPlus className="h-4 w-4" />
                    Follow back
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}

        {loadingMore ? (
          <div className="py-3 text-center text-sm text-slate-600">Loading more...</div>
        ) : null}
        <div ref={sentinelRef} className="h-6" />
        {!cursor && items.length ? <div className="py-6 text-center text-xs text-slate-500">End of list.</div> : null}
      </div>
    </div>
  );
}

