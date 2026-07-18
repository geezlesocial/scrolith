import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, FileText, Sparkles, Users } from 'lucide-react';
import { ProfessionalDiscoveryService, type ProfessionalDiscoveryItem } from '../../services/professionalDiscovery';
import { careerQuickActions } from '../../services/scrolithaCareer';

type ProfessionalIntegrationStripProps = {
  surface?: 'community' | 'marketplace' | 'mobile' | 'profile' | 'blog' | 'search';
  className?: string;
  compact?: boolean;
};

/**
 * Cross-surface professional ecosystem strip (non-isolated modules).
 * Reuses professional-discovery API with local career fallbacks.
 */
export default function ProfessionalIntegrationStrip({
  surface = 'community',
  className = '',
  compact = false
}: ProfessionalIntegrationStripProps) {
  const [items, setItems] = useState<ProfessionalDiscoveryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void ProfessionalDiscoveryService.getHome(6)
      .then((bundle) => {
        if (cancelled) return;
        const merged = [
          ...(bundle.career || []).slice(0, 2),
          ...(bundle.marketplace || []).slice(0, 2),
          ...(bundle.groups || []).slice(0, 1),
          ...(bundle.blogs || []).slice(0, 1),
          ...(bundle.resumeTemplates || []).slice(0, 1)
        ];
        setItems(
          merged.length
            ? merged
            : careerQuickActions().map((a) => ({
                id: a.id,
                type: 'career_action',
                title: a.title,
                subtitle: a.caption,
                description: a.caption,
                url: a.path,
                reasons: [a.caption]
              }))
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [surface]);

  const title =
    surface === 'marketplace'
      ? 'Professional opportunities'
      : surface === 'blog'
        ? 'Continue learning'
        : surface === 'profile'
          ? 'Professional toolkit'
          : surface === 'mobile'
            ? 'Career & discovery'
            : 'Professional discovery';

  return (
    <section
      className={`rounded-2xl border border-emerald-100 bg-gradient-to-br from-white via-emerald-50/40 to-slate-50 p-4 shadow-sm ${className}`.trim()}
      data-testid={`professional-strip-${surface}`}
      aria-label={title}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        </div>
        <Link to="/scrolitha?intent=career" className="text-[11px] font-semibold text-emerald-700 hover:underline">
          Ask Scrolitha
        </Link>
      </div>
      {loading ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="h-12 animate-pulse rounded-xl bg-white/80" />
          <div className="h-12 animate-pulse rounded-xl bg-white/80" />
        </div>
      ) : (
        <div className={compact ? 'flex gap-2 overflow-x-auto pb-1' : 'grid gap-2 sm:grid-cols-2'}>
          {items.slice(0, compact ? 6 : 4).map((item) => {
            const Icon =
              item.type === 'group' ? Users : item.type === 'blog' ? FileText : item.type === 'marketplace_listing' ? Briefcase : Sparkles;
            return (
              <Link
                key={`${item.type}-${item.id}`}
                to={item.url || '/'}
                className={`rounded-xl border border-white/80 bg-white/90 px-3 py-2 text-left shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/60 ${
                  compact ? 'min-w-[10.5rem] shrink-0' : ''
                }`}
              >
                <div className="flex items-start gap-2">
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  <div className="min-w-0">
                    <div className="truncate text-xs font-semibold text-slate-900">{item.title}</div>
                    <div className="mt-0.5 truncate text-[10px] text-slate-500">
                      {(item.reasons && item.reasons[0]) || item.subtitle || item.type}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
