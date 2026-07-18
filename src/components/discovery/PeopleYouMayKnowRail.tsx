import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, Users } from 'lucide-react';
import { RecoService } from '../../services/reco';
import { CommunityService } from '../../services/community';
import { resolveUserAvatarUrl } from '../../utils/userAvatar';

type PeopleYouMayKnowRailProps = {
  className?: string;
  limit?: number;
  title?: string;
};

type Suggestion = {
  id: string;
  name: string;
  username?: string | null;
  avatarUrl?: string | null;
  reason?: string | null;
};

const normalizeSuggestion = (raw: any): Suggestion | null => {
  const entity = raw?.entity || raw?.user || raw?.account || raw;
  const id = String(entity?.id || raw?.entityId || raw?.id || '').trim();
  if (!id) return null;
  const name = String(entity?.name || entity?.displayName || entity?.username || 'Member').trim();
  const username = entity?.username ? String(entity.username) : null;
  const avatarUrl =
    resolveUserAvatarUrl(entity) ||
    entity?.avatarUrl ||
    entity?.avatar_url ||
    entity?.avatar ||
    null;
  const reason =
    (Array.isArray(raw?.reasons) && raw.reasons[0]) ||
    raw?.reason ||
    raw?.subtitle ||
    'Suggested for you';
  return { id, name, username, avatarUrl, reason: String(reason) };
};

/**
 * LinkedIn-style People You May Know using existing reco accounts API (no schema change).
 */
export default function PeopleYouMayKnowRail({
  className = '',
  limit = 6,
  title = 'People you may know'
}: PeopleYouMayKnowRailProps) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const [followingIds, setFollowingIds] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    void RecoService.getAccounts({ surface: 'who_to_follow', type: 'freelancer', limit })
      .then((rows) => {
        if (cancelled) return;
        const next = (Array.isArray(rows) ? rows : [])
          .map(normalizeSuggestion)
          .filter((row): row is Suggestion => Boolean(row));
        setItems(next);
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
          setLoadError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [limit, retryToken]);

  const handleFollow = async (person: Suggestion) => {
    if (followingIds[person.id] || busyId) return;
    setBusyId(person.id);
    try {
      await CommunityService.followTarget({ targetType: 'user', targetId: person.id });
      setFollowingIds((prev) => ({ ...prev, [person.id]: true }));
      void RecoService.submitFeedback({
        surface: 'who_to_follow',
        entityType: 'freelancer',
        entityId: person.id,
        action: 'follow'
      }).catch(() => {});
    } catch {
      // Keep card interactive on failure
    } finally {
      setBusyId(null);
    }
  };

  if (!loading && !loadError && items.length === 0) return null;

  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`.trim()}
      aria-label={title}
      data-testid="people-you-may-know-rail"
    >
      <div className="mb-3 flex items-center gap-2">
        <Users className="h-4 w-4 text-indigo-600" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      </div>
      {loading ? (
        <div className="space-y-2" aria-busy="true">
          <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 text-sm text-slate-600" role="status">
          <p>Suggestions are temporarily unavailable.</p>
          <button
            type="button"
            onClick={() => setRetryToken((n) => n + 1)}
            className="mt-2 text-xs font-semibold text-indigo-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Retry
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((person) => {
            const href = person.username ? `/u/${encodeURIComponent(person.username)}` : `/profile/${person.id}`;
            const isFollowing = Boolean(followingIds[person.id]);
            return (
              <li
                key={person.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2"
              >
                <Link to={href} className="flex min-w-0 items-center gap-2.5">
                  <div className="h-9 w-9 overflow-hidden rounded-full border border-slate-200 bg-slate-200">
                    {person.avatarUrl ? (
                      <img src={person.avatarUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-slate-500">
                        {person.name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">{person.name}</div>
                    <div className="truncate text-[11px] text-slate-500">{person.reason}</div>
                  </div>
                </Link>
                <button
                  type="button"
                  disabled={isFollowing || busyId === person.id}
                  onClick={() => void handleFollow(person)}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                    isFollowing
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60'
                  }`}
                  aria-label={isFollowing ? `Following ${person.name}` : `Follow ${person.name}`}
                >
                  <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                  {isFollowing ? 'Following' : 'Follow'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
