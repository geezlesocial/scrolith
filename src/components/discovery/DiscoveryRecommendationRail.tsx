/**
 * Phase 8 — recommendation rail with fail-closed rollout, impression visibility,
 * hide feedback, and socket-driven soft refresh (no scroll jump / reorder of reading).
 */
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import DiscoveryEngineService, {
  type DiscoverySurface,
  type RankedRecommendation
} from '../../services/discoveryEngine';
import { useUser } from '../../context/UserContext';
import { useSocket } from '../../context/SocketContext';

type Props = {
  surface?: DiscoverySurface;
  title?: string;
  limit?: number;
  className?: string;
};

const IMPRESSION_RATIO = 0.45;
const REFRESH_DEBOUNCE_MS = 1_200;
const DISCOVERY_CHANNEL = 'scrolith-discovery';

const DiscoveryRecommendationRail: React.FC<Props> = ({
  surface = 'sidebar',
  title = 'Recommended for you',
  limit = 6,
  className = ''
}) => {
  const { user } = useUser();
  const { socket, isConnected } = useSocket();
  const listId = useId();
  const [items, setItems] = useState<RankedRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [refreshAvailable, setRefreshAvailable] = useState(false);
  const impressed = useRef<Set<string>>(new Set());
  const itemRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const refreshTimer = useRef<number | null>(null);
  const seenEventIds = useRef<Set<string>>(new Set());
  const channelRef = useRef<BroadcastChannel | null>(null);

  const load = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!user?.id || dismissed) return;
      if (!opts?.soft) setLoading(true);
      try {
        const data = await DiscoveryEngineService.recommend({ surface, limit });
        const next = Array.isArray(data?.items) ? data.items : [];
        setItems(next);
        impressed.current = new Set();
        setRefreshAvailable(false);
      } catch {
        if (!opts?.soft) setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [user?.id, surface, limit, dismissed]
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Visibility-based impressions
  useEffect(() => {
    if (!items.length || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting || entry.intersectionRatio < IMPRESSION_RATIO) continue;
          const token = (entry.target as HTMLElement).dataset.trackingToken;
          if (!token || impressed.current.has(token)) continue;
          impressed.current.add(token);
          const item = items.find((i) => i.trackingToken === token);
          if (!item) continue;
          void DiscoveryEngineService.feedback({
            surface,
            entityType: item.entityType,
            entityId: item.entityId,
            action: 'impression',
            trackingToken: item.trackingToken
          }).catch(() => undefined);
        }
      },
      { threshold: [IMPRESSION_RATIO] }
    );
    for (const el of itemRefs.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [items, surface]);

  // Socket invalidation — soft refresh only (no mid-read reorder)
  useEffect(() => {
    if (!socket || !user?.id) return;
    const onInvalidate = (payload: any) => {
      const eventId = String(payload?.eventId || '');
      if (eventId && seenEventIds.current.has(eventId)) return;
      if (eventId) {
        seenEventIds.current.add(eventId);
        if (seenEventIds.current.size > 80) {
          seenEventIds.current = new Set(Array.from(seenEventIds.current).slice(-40));
        }
      }
      if (payload?.entityType && payload?.entityId) {
        setItems((prev) =>
          prev.filter(
            (i) => !(i.entityType === payload.entityType && i.entityId === payload.entityId)
          )
        );
      }
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
      refreshTimer.current = window.setTimeout(() => {
        setItems((current) => {
          if (current.length > 0) {
            setRefreshAvailable(true);
            return current;
          }
          void load({ soft: true });
          return current;
        });
      }, REFRESH_DEBOUNCE_MS);
    };
    socket.on('discovery:recommendations_invalidated', onInvalidate);
    socket.on('discovery:entity_unavailable', onInvalidate);
    socket.on('discovery:refresh_available', onInvalidate);
    return () => {
      socket.off('discovery:recommendations_invalidated', onInvalidate);
      socket.off('discovery:entity_unavailable', onInvalidate);
      socket.off('discovery:refresh_available', onInvalidate);
      if (refreshTimer.current) window.clearTimeout(refreshTimer.current);
    };
  }, [socket, user?.id, load]);

  // Multi-tab: single long-lived BroadcastChannel
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const bc = new BroadcastChannel(DISCOVERY_CHANNEL);
    channelRef.current = bc;
    bc.onmessage = (ev) => {
      if (ev?.data?.type === 'invalidate') setRefreshAvailable(true);
    };
    return () => {
      bc.close();
      channelRef.current = null;
    };
  }, []);

  const onHide = async (item: RankedRecommendation) => {
    setItems((prev) => prev.filter((x) => x.trackingToken !== item.trackingToken));
    try {
      await DiscoveryEngineService.feedback({
        surface,
        entityType: item.entityType,
        entityId: item.entityId,
        action: 'not_interested',
        trackingToken: item.trackingToken,
        metadata: { hadImpression: impressed.current.has(item.trackingToken) }
      });
      channelRef.current?.postMessage({ type: 'invalidate' });
    } catch {
      // ignore
    }
  };

  const onClick = async (item: RankedRecommendation) => {
    const started = Date.now();
    try {
      await DiscoveryEngineService.feedback({
        surface,
        entityType: item.entityType,
        entityId: item.entityId,
        action: 'click',
        trackingToken: item.trackingToken,
        metadata: {
          hadImpression: impressed.current.has(item.trackingToken),
          openStartedAt: started
        }
      });
    } catch {
      // ignore
    }
    if (item.hrefHint) window.location.assign(item.hrefHint);
  };

  if (!user?.id || dismissed) return null;
  if (!loading && items.length === 0 && !refreshAvailable) return null;

  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}
      aria-labelledby={listId}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id={listId} className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Sparkles className="h-4 w-4 text-cyan-700" aria-hidden />
          {title}
          {!isConnected ? (
            <span className="text-[10px] font-normal text-slate-400">(offline refresh)</span>
          ) : null}
        </h2>
        <button
          type="button"
          className="rounded-full p-1 text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600"
          aria-label="Dismiss recommendations"
          onClick={() => setDismissed(true)}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {refreshAvailable ? (
        <button
          type="button"
          className="mb-2 w-full rounded-lg border border-cyan-200 bg-cyan-50 px-2 py-1.5 text-xs font-medium text-cyan-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-600"
          onClick={() => void load({ soft: true })}
        >
          New recommendations available — refresh rail
        </button>
      ) : null}

      {loading && items.length === 0 ? (
        <p className="text-xs text-slate-500" role="status">
          Loading recommendations…
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.trackingToken}
              ref={(el) => {
                if (el) itemRefs.current.set(item.trackingToken, el);
                else itemRefs.current.delete(item.trackingToken);
              }}
              data-tracking-token={item.trackingToken}
              className="rounded-xl border border-slate-100 bg-slate-50/80 p-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => void onClick(item)}
                  className="min-w-0 flex-1 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600"
                >
                  <div className="truncate text-sm font-medium text-slate-900">{item.label}</div>
                  {item.summary ? (
                    <div className="mt-0.5 line-clamp-2 text-xs text-slate-600">{item.summary}</div>
                  ) : null}
                  <div
                    className="mt-1 text-[11px] text-slate-500"
                    aria-label={`Reason: ${item.explanation}`}
                  >
                    {item.explanation}
                  </div>
                </button>
                <button
                  type="button"
                  className="shrink-0 rounded-full px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-600"
                  onClick={() => void onHide(item)}
                  aria-label={`Hide ${item.label}`}
                >
                  Hide
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default DiscoveryRecommendationRail;
