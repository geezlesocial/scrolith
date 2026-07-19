import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import OptimizedImage from '../../../components/media/OptimizedImage';
import { RecoSignalChips } from '../../../components/feed/FeedIntelligenceSignals';
import FollowButton from '../../../community/components/FollowButton';
import { useAuth } from '../../../context/AuthContext';
import { resolveUserAvatarUrl } from '../../../utils/userAvatar';

type SuggestedPersonOrPage = {
  id: string;
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  targetType: 'user' | 'page';
  reasons?: string[];
  whyRecommended?: string | null;
  badge?: string;
  isFollowing?: boolean;
};

type SuggestedData =
  | { kind: 'tags'; title?: string; items: Array<{ slug: string; label: string; count?: number }> }
  | {
      kind: 'people' | 'pages';
      title?: string;
      items: SuggestedPersonOrPage[];
    };

export default function SuggestedCard({ data }: { data: SuggestedData }) {
  const title =
    data.title ||
    (data.kind === 'tags' ? 'Trending tags' : data.kind === 'people' ? 'Suggested people' : 'Suggested pages');

  return (
    <div
      className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm"
      aria-label={title}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        {data.kind !== 'tags' ? (
          <span className="rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
            Graph intelligence
          </span>
        ) : null}
      </div>
      <div className="mt-3">
        {data.kind === 'tags' ? <Tags items={data.items} /> : <FollowList items={data.items} kind={data.kind} />}
      </div>
    </div>
  );
}

function Tags({ items }: { items: Array<{ slug: string; label: string; count?: number }> }) {
  const visible = useMemo(() => items.slice(0, 12), [items]);
  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((tag) => (
        <Link
          key={tag.slug}
          to={`/community/tags/${encodeURIComponent(tag.slug)}`}
          className="min-h-[36px] inline-flex items-center rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
          title={typeof tag.count === 'number' ? `${tag.count} posts` : undefined}
        >
          #{tag.label}
        </Link>
      ))}
      {!visible.length ? <div className="text-sm text-slate-500">No suggestions right now.</div> : null}
    </div>
  );
}

function FollowList({
  items,
  kind
}: {
  items: SuggestedPersonOrPage[];
  kind: 'people' | 'pages';
}) {
  const { user } = useAuth();
  const [statusById, setStatusById] = useState<Record<string, 'idle' | 'ok' | 'error'>>({});
  const [errorById, setErrorById] = useState<Record<string, string>>({});

  return (
    <div className="space-y-3">
      {items.slice(0, 4).map((item) => {
        const avatarUrl =
          resolveUserAvatarUrl({
            id: item.id,
            name: item.name,
            username: item.username,
            avatarUrl: item.avatarUrl,
            avatar: item.avatarUrl
          }) || '';
        const status = statusById[item.id] || 'idle';
        return (
          <div key={item.id} className="rounded-2xl border border-slate-200/90 p-3">
            <div className="flex items-center justify-between gap-3">
              <Link
                to={
                  item.targetType === 'page'
                    ? `/company/${encodeURIComponent(item.username || item.id)}`
                    : `/u/${encodeURIComponent(item.username || item.id)}`
                }
                className="flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-xs font-semibold text-slate-500">
                  {avatarUrl ? (
                    <OptimizedImage
                      src={avatarUrl}
                      width={40}
                      height={40}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={(event) => {
                        (event.currentTarget as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <span aria-hidden>{String(item.name || '?').slice(0, 1).toUpperCase()}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <div className="truncate text-sm font-semibold text-slate-900">{item.name}</div>
                    {item.badge ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {item.badge}
                      </span>
                    ) : null}
                  </div>
                  {item.username ? <div className="truncate text-xs text-slate-500">@{item.username}</div> : null}
                </div>
              </Link>

              <FollowButton
                targetUserId={item.id}
                targetType={item.targetType}
                currentUserId={user?.id}
                initialIsFollowing={Boolean(item.isFollowing)}
                onRequireLogin={() => {
                  window.location.href = '/auth/login';
                }}
                onSuccess={(isFollowing) => {
                  setStatusById((prev) => ({ ...prev, [item.id]: isFollowing ? 'ok' : 'idle' }));
                  setErrorById((prev) => {
                    const next = { ...prev };
                    delete next[item.id];
                    return next;
                  });
                }}
                onError={(message) => {
                  setStatusById((prev) => ({ ...prev, [item.id]: 'error' }));
                  setErrorById((prev) => ({ ...prev, [item.id]: message }));
                }}
                className="shrink-0"
              />
            </div>
            {status === 'error' && errorById[item.id] ? (
              <p className="mt-2 text-[11px] font-medium text-red-600" role="alert">
                {errorById[item.id]}
              </p>
            ) : null}
            <RecoSignalChips
              reasons={item.reasons}
              whyRecommended={
                item.whyRecommended ||
                (kind === 'pages'
                  ? 'Recommended page for your professional graph.'
                  : 'Recommended creator or client for feed quality.')
              }
            />
          </div>
        );
      })}

      {!items.length ? <div className="text-sm text-slate-500">No suggestions right now.</div> : null}
    </div>
  );
}
