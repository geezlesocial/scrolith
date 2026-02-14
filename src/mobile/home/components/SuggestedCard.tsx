import React, { useMemo, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { CommunityService } from '../../../services/community';

type SuggestedData =
  | { kind: 'tags'; title?: string; items: Array<{ slug: string; label: string; count?: number }> }
  | {
      kind: 'people' | 'pages';
      title?: string;
      items: Array<{ id: string; name: string; username?: string | null; avatarUrl?: string | null; targetType: 'user' | 'page' }>;
    };

export default function SuggestedCard({ data }: { data: SuggestedData }) {
  const title = data.title || (data.kind === 'tags' ? 'Trending tags' : data.kind === 'people' ? 'Suggested people' : 'Suggested pages');

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-3">
        {data.kind === 'tags' ? <Tags items={data.items} /> : <FollowList items={data.items} />}
      </div>
    </div>
  );
}

function Tags({ items }: { items: Array<{ slug: string; label: string; count?: number }> }) {
  const visible = useMemo(() => items.slice(0, 12), [items]);
  return (
    <div className="flex flex-wrap gap-2">
      {visible.map((tag) => (
        <a
          key={tag.slug}
          href={`/community/tags/${encodeURIComponent(tag.slug)}`}
          className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
          title={typeof tag.count === 'number' ? `${tag.count} posts` : undefined}
        >
          #{tag.label}
        </a>
      ))}
      {!visible.length ? <div className="text-sm text-slate-500">No suggestions right now.</div> : null}
    </div>
  );
}

function FollowList({
  items
}: {
  items: Array<{ id: string; name: string; username?: string | null; avatarUrl?: string | null; targetType: 'user' | 'page' }>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {items.slice(0, 4).map((item) => (
        <div key={item.id} className="flex items-center justify-between gap-3">
          <a
            href={item.targetType === 'page' ? `/company/${encodeURIComponent(item.username || item.id)}` : `/u/${encodeURIComponent(item.username || item.id)}`}
            className="flex min-w-0 items-center gap-3"
          >
            <div className="h-10 w-10 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
              {item.avatarUrl ? (
                <img src={item.avatarUrl} alt={item.name} className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">{item.name}</div>
              {item.username ? <div className="truncate text-xs text-slate-500">@{item.username}</div> : null}
            </div>
          </a>

          <button
            type="button"
            disabled={busyId === item.id}
            onClick={async () => {
              if (busyId) return;
              setBusyId(item.id);
              try {
                await CommunityService.followTarget({ targetType: item.targetType, targetId: item.id });
              } finally {
                setBusyId(null);
              }
            }}
            className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <UserPlus className="h-4 w-4" />
            {busyId === item.id ? '...' : 'Follow'}
          </button>
        </div>
      ))}

      {!items.length ? <div className="text-sm text-slate-500">No suggestions right now.</div> : null}
    </div>
  );
}

