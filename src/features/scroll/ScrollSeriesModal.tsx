import React from 'react';
import { ListVideo, PlayCircle, X } from 'lucide-react';
import type { ScrollSeriesDetail } from '../../services/scroll';

type ScrollSeriesModalProps = {
  open: boolean;
  loading?: boolean;
  series: ScrollSeriesDetail | null;
  error?: string | null;
  activeScrollId?: string | null;
  onClose: () => void;
  onSelectScroll: (scrollId: string) => void;
};

const ScrollSeriesModal: React.FC<ScrollSeriesModalProps> = ({
  open,
  loading = false,
  series,
  error,
  activeScrollId,
  onClose,
  onSelectScroll
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm p-4">
      <div className="mx-auto mt-8 w-full max-w-2xl overflow-hidden rounded-3xl border border-white/10 bg-slate-950 text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <ListVideo className="h-4 w-4 text-fuchsia-200" />
              {series?.title || 'Series'}
            </div>
            <div className="mt-1 text-xs text-white/55">
              {series?.creator?.name || 'Community member'}
              {series ? ` · ${series.itemCount} item${series.itemCount === 1 ? '' : 's'}` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 hover:bg-white/10"
            aria-label="Close series"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[72vh] overflow-y-auto px-5 py-4">
          {series?.description ? (
            <p className="mb-4 text-sm leading-relaxed text-white/70">{series.description}</p>
          ) : null}
          {loading ? (
            <div className="py-12 text-center text-sm text-white/60">Loading series...</div>
          ) : error ? (
            <div className="rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">{error}</div>
          ) : !series || !series.items.length ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-6 text-center text-sm text-white/55">
              No Scrolls in this series yet.
            </div>
          ) : (
            <div className="space-y-3">
              {series.items.map((item) => {
                const isActive = String(item.scroll.id || '') === String(activeScrollId || '');
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectScroll(item.scroll.id)}
                    className={`flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                      isActive
                        ? 'border-cyan-300/35 bg-cyan-400/10'
                        : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/30">
                      {item.scroll.media?.thumbnailUrl || item.scroll.media?.url ? (
                        <img
                          src={item.scroll.media?.thumbnailUrl || item.scroll.media?.url || ''}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <PlayCircle className="h-5 w-5 text-white/55" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="truncate text-sm font-semibold text-white">
                          {item.position}. {item.scroll.title || item.scroll.description || 'Scroll video'}
                        </div>
                        {isActive ? (
                          <span className="shrink-0 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-100">
                            Watching
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-white/55">
                        {item.scroll.author?.name || 'Community member'}
                        {item.scroll.author?.username ? ` · @${item.scroll.author.username}` : ''}
                      </div>
                      {item.scroll.description && item.scroll.title ? (
                        <div className="mt-1 line-clamp-2 text-xs text-white/45">{item.scroll.description}</div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ScrollSeriesModal;
