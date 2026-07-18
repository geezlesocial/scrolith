import React from 'react';
import { useNavigate } from 'react-router-dom';
import type { ProfessionalDiscoveryItem } from '../../services/professionalDiscovery';

type ProfessionalDiscoveryRailProps = {
  title: string;
  caption?: string;
  items: ProfessionalDiscoveryItem[];
  loading?: boolean;
  emptyLabel?: string;
  className?: string;
};

/**
 * Compact recommendation rail for Member Home / Discovery side panels.
 * Extends existing visual language (cards, chips) without redesign.
 */
export default function ProfessionalDiscoveryRail({
  title,
  caption,
  items,
  loading = false,
  emptyLabel = 'No recommendations yet.',
  className = ''
}: ProfessionalDiscoveryRailProps) {
  const navigate = useNavigate();
  const list = Array.isArray(items) ? items : [];

  return (
    <section className={`rounded-3xl border border-slate-200 bg-white p-4 shadow-sm ${className}`.trim()}>
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {caption ? <p className="mt-0.5 text-xs text-slate-500">{caption}</p> : null}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : !list.length ? (
        <p className="text-xs text-slate-500">{emptyLabel}</p>
      ) : (
        <ul className="space-y-2">
          {list.map((item) => {
            const reason = Array.isArray(item.reasons) && item.reasons[0] ? item.reasons[0] : item.subtitle;
            return (
              <li key={`${item.type}-${item.id}`}>
                <button
                  type="button"
                  onClick={() => {
                    const url = String(item.url || '').trim();
                    if (!url) return;
                    if (/^https?:\/\//i.test(url)) {
                      window.open(url, '_blank', 'noopener,noreferrer');
                      return;
                    }
                    navigate(url);
                  }}
                  className="flex w-full items-start gap-3 rounded-2xl border border-transparent px-2 py-2 text-left transition hover:border-emerald-100 hover:bg-emerald-50/50"
                >
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-xl border border-slate-200 object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[10px] font-semibold uppercase text-slate-500">
                      {String(item.type || 'item').slice(0, 3)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-900">{item.title}</div>
                    {reason ? <div className="mt-0.5 truncate text-[11px] text-slate-500">{reason}</div> : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
