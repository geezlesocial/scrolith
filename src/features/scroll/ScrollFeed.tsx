import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, PlusCircle, Volume2, VolumeX } from 'lucide-react';
import ScrollCard from './ScrollCard';
import ScrollCreateModal from './ScrollCreateModal';
import { ScrollService, type ScrollConfig, type ScrollVideo, type ScrollEngagementType } from '../../services/scroll';
import { useNotification } from '../../context/NotificationContext';
import { CommunityService } from '../../services/community';

const LAST_SCROLL_INDEX_KEY = 'scroll:lastIndex';
const GLOBAL_SCROLL_MUTED_KEY = 'scroll:muted';

const readStoredIndex = () => {
  const value = Number(localStorage.getItem(LAST_SCROLL_INDEX_KEY) || 0);
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.floor(value);
};

const readMutedPreference = () => {
  const raw = String(localStorage.getItem(GLOBAL_SCROLL_MUTED_KEY) || 'true').toLowerCase();
  return !(raw === 'false' || raw === '0' || raw === 'off');
};

const ScrollFeed: React.FC = () => {
  const navigate = useNavigate();
  const { showNotification } = useNotification();
  const [items, setItems] = useState<ScrollVideo[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => readStoredIndex());
  const [muted, setMuted] = useState(() => readMutedPreference());
  const [createOpen, setCreateOpen] = useState(false);
  const [config, setConfig] = useState<ScrollConfig | null>(null);
  const [reportBusyId, setReportBusyId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const observerRef = useRef<IntersectionObserver | null>(null);

  const lowDataMode = useMemo(() => {
    try {
      const nav = navigator as any;
      const connection = nav?.connection || nav?.mozConnection || nav?.webkitConnection;
      return Boolean(connection?.saveData) || /2g/i.test(String(connection?.effectiveType || ''));
    } catch {
      return false;
    }
  }, []);

  const patchMetrics = useCallback((scrollId: string, metrics: Partial<ScrollVideo['metrics']>) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === scrollId
          ? {
              ...item,
              metrics: {
                ...item.metrics,
                ...metrics
              }
            }
          : item
      )
    );
  }, []);

  const loadFeed = useCallback(
    async (cursor?: string | null) => {
      try {
        if (cursor) {
          setLoadingMore(true);
        } else {
          setLoading(true);
        }
        const data = await ScrollService.getFeed({
          cursor: cursor || undefined,
          limit: lowDataMode ? 10 : 20
        });
        const nextItems = Array.isArray(data?.items) ? data.items : [];
        setConfig((data?.config as ScrollConfig) || null);
        setNextCursor(data?.nextCursor || null);
        setItems((prev) => {
          if (!cursor) return nextItems;
          const existing = new Set(prev.map((entry) => entry.id));
          const merged = [...prev];
          for (const entry of nextItems) {
            if (!existing.has(entry.id)) merged.push(entry);
          }
          return merged;
        });
      } catch (error: any) {
        const message =
          error?.response?.data?.error ||
          error?.response?.data?.message ||
          error?.message ||
          'Failed to load scroll feed.';
        showNotification('error', 'Scroll', message);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [lowDataMode, showNotification]
  );

  useEffect(() => {
    void loadFeed(null);
  }, [loadFeed]);

  useEffect(() => {
    localStorage.setItem(LAST_SCROLL_INDEX_KEY, String(Math.max(0, activeIndex)));
  }, [activeIndex]);

  useEffect(() => {
    localStorage.setItem(GLOBAL_SCROLL_MUTED_KEY, muted ? 'true' : 'false');
  }, [muted]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        let best: { idx: number; ratio: number } | null = null;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = Number((entry.target as HTMLElement).dataset.index || -1);
          if (idx < 0) continue;
          if (!best || entry.intersectionRatio > best.ratio) {
            best = { idx, ratio: entry.intersectionRatio };
          }
        }
        if (best) setActiveIndex(best.idx);
      },
      {
        root: container,
        threshold: [0.55, 0.7, 0.9]
      }
    );

    Object.entries(itemRefs.current).forEach(([idx, node]) => {
      if (!node) return;
      node.dataset.index = String(idx);
      observerRef.current?.observe(node);
    });

    return () => observerRef.current?.disconnect();
  }, [items]);

  useEffect(() => {
    if (loading) return;
    const idx = Math.max(0, Math.min(activeIndex, items.length - 1));
    const node = itemRefs.current[idx];
    if (node) {
      node.scrollIntoView({ block: 'start', behavior: 'auto' });
    }
    // restore once after initial load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    const shouldPrefetch = activeIndex >= items.length - 3;
    if (!shouldPrefetch || !nextCursor || loadingMore) return;
    void loadFeed(nextCursor);
  }, [activeIndex, items.length, nextCursor, loadingMore, loadFeed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      const next = event.key === 'ArrowDown' ? activeIndex + 1 : activeIndex - 1;
      const clamped = Math.max(0, Math.min(next, items.length - 1));
      const node = itemRefs.current[clamped];
      if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeIndex, items.length]);

  useEffect(() => {
    const onNew = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail;
      const scroll = detail?.scroll;
      if (!scroll?.id) return;
      setItems((prev) => [scroll, ...prev.filter((entry) => entry.id !== scroll.id)]);
    };
    const onEngagement = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail;
      if (!detail?.scrollId || !detail?.metrics) return;
      patchMetrics(detail.scrollId, detail.metrics);
    };
    const onRemoved = (event: Event) => {
      const detail = (event as CustomEvent<any>).detail;
      const scrollId = String(detail?.scrollId || '');
      if (!scrollId) return;
      setItems((prev) => prev.filter((entry) => entry.id !== scrollId));
    };
    window.addEventListener('scroll:new', onNew);
    window.addEventListener('scroll:engagement_update', onEngagement);
    window.addEventListener('scroll:impression_update', onEngagement);
    window.addEventListener('scroll:removed', onRemoved);
    return () => {
      window.removeEventListener('scroll:new', onNew);
      window.removeEventListener('scroll:engagement_update', onEngagement);
      window.removeEventListener('scroll:impression_update', onEngagement);
      window.removeEventListener('scroll:removed', onRemoved);
    };
  }, [patchMetrics]);

  const handleEngage = useCallback(
    async (scrollId: string, type: ScrollEngagementType, payload?: { watchedSeconds?: number }) => {
      try {
        const response = await ScrollService.engage(scrollId, {
          type,
          watchedSeconds: payload?.watchedSeconds
        });
        if (response?.metrics) {
          patchMetrics(scrollId, response.metrics);
        }
      } catch {
        // non-blocking by design
      }
    },
    [patchMetrics]
  );

  const handleShareToStory = useCallback(
    async (scroll: ScrollVideo) => {
      if (!scroll?.media?.id) {
        showNotification('error', 'Scroll', 'Scroll media is not available.');
        return;
      }
      try {
        await CommunityService.createStory({
          type: 'video',
          mediaFileId: scroll.media.id,
          content: scroll.title || scroll.description || 'Shared from Scroll'
        });
        showNotification('success', 'Scroll', 'Shared to Story.');
      } catch (error: any) {
        const message = error?.response?.data?.error || error?.message || 'Failed to share to Story.';
        showNotification('error', 'Scroll', message);
      }
    },
    [showNotification]
  );

  const handleRepost = useCallback(
    async (scroll: ScrollVideo) => {
      try {
        await CommunityService.createPost({
          title: scroll.title || 'Scroll repost',
          content: `${scroll.description || ''}\n\nhttps://scrolith.com/scroll?scroll=${encodeURIComponent(scroll.id)}`
        });
        await handleEngage(scroll.id, 'repost');
        showNotification('success', 'Scroll', 'Shared as post.');
      } catch (error: any) {
        const message = error?.response?.data?.error || error?.message || 'Failed to repost.';
        showNotification('error', 'Scroll', message);
      }
    },
    [handleEngage, showNotification]
  );

  const handleSend = useCallback(
    async (scroll: ScrollVideo) => {
      const url = `https://scrolith.com/scroll?scroll=${encodeURIComponent(scroll.id)}`;
      try {
        const nav = navigator as any;
        if (nav?.share) {
          await nav.share({
            title: scroll.title || 'Scrolith Scroll',
            text: scroll.description || 'Check this Scroll on Scrolith',
            url
          });
        } else {
          await navigator.clipboard.writeText(url);
          showNotification('success', 'Scroll', 'Link copied. Open a chat to send.');
        }
        await handleEngage(scroll.id, 'send');
      } catch {
        // ignore aborted share
      }
    },
    [handleEngage, showNotification]
  );

  const handleReport = useCallback(
    async (scroll: ScrollVideo) => {
      const reason = window.prompt('Report reason');
      if (!reason || !reason.trim()) return;
      try {
        setReportBusyId(scroll.id);
        await ScrollService.report(scroll.id, { reason: reason.trim() });
        showNotification('success', 'Scroll', 'Report submitted.');
      } catch (error: any) {
        const message = error?.response?.data?.error || error?.message || 'Failed to submit report.';
        showNotification('error', 'Scroll', message);
      } finally {
        setReportBusyId(null);
      }
    },
    [showNotification]
  );

  return (
    <div className="relative h-screen bg-black text-white">
      <header className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-center justify-between px-4 py-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/65 transition"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMuted((prev) => !prev)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-white hover:bg-black/65 transition"
            aria-label={muted ? 'Unmute all' : 'Mute all'}
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-2 rounded-full bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-200 transition"
          >
            <PlusCircle className="h-4 w-4" />
            Create
          </button>
        </div>
      </header>

      <div ref={containerRef} className="h-screen snap-y snap-mandatory overflow-y-auto">
        {loading ? (
          <div className="flex h-screen items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-300" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-screen flex-col items-center justify-center px-6 text-center">
            <p className="text-xl font-semibold">No Scroll videos yet.</p>
            <p className="mt-2 text-sm text-white/70">Create the first one and start your vertical feed.</p>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-cyan-300 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-200 transition"
            >
              <PlusCircle className="h-4 w-4" />
              Create Scroll
            </button>
          </div>
        ) : (
          <>
            {items.map((scroll, index) => (
              <div
                key={scroll.id}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                className="h-screen w-full"
                data-index={index}
              >
                <ScrollCard
                  scroll={scroll}
                  isActive={index === activeIndex}
                  muted={muted}
                  onToggleMute={() => setMuted((prev) => !prev)}
                  onEngage={handleEngage}
                  onShareToStory={handleShareToStory}
                  onRepost={handleRepost}
                  onSend={handleSend}
                  onReport={handleReport}
                />
              </div>
            ))}
            {loadingMore ? (
              <div className="flex h-16 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
              </div>
            ) : null}
          </>
        )}
      </div>

      {reportBusyId ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-40 flex justify-center">
          <div className="rounded-full bg-white/15 px-3 py-1 text-xs text-white/90 backdrop-blur">Submitting report...</div>
        </div>
      ) : null}

      <ScrollCreateModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(scroll) => {
          setItems((prev) => [scroll, ...prev.filter((entry) => entry.id !== scroll.id)]);
          setActiveIndex(0);
        }}
        config={config}
      />
    </div>
  );
};

export default ScrollFeed;
