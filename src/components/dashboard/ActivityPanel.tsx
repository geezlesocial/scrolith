import React from 'react';
import { Link } from 'react-router-dom';
import { Clock3, ExternalLink } from 'lucide-react';
import Skeleton from '../ui/Skeleton';
import EmptyState from '../ui/EmptyState';

export interface ActivityItem {
  id: string;
  title: string;
  description: string;
  timestamp?: string;
  status?: string;
  href?: string;
  sortValue?: number;
}

interface ActivityPanelProps {
  title: string;
  subtitle?: string;
  items: ActivityItem[];
  loading?: boolean;
  emptyTitle: string;
  emptyDescription: string;
  emptyCtaLabel?: string;
  onEmptyCtaClick?: () => void;
}

const statusColor = (status?: string) => {
  const normalized = String(status || '').toLowerCase();
  if (normalized.includes('active') || normalized.includes('open') || normalized.includes('accepted')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (normalized.includes('pending') || normalized.includes('review') || normalized.includes('shortlisted')) {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  if (normalized.includes('reject') || normalized.includes('cancel') || normalized.includes('error')) {
    return 'bg-rose-50 text-rose-700 border-rose-200';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

export const ActivityPanel: React.FC<ActivityPanelProps> = ({
  title,
  subtitle,
  items,
  loading = false,
  emptyTitle,
  emptyDescription,
  emptyCtaLabel,
  onEmptyCtaClick
}) => {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
      </div>

      {loading ? (
        <Skeleton variant="list" lines={4} />
      ) : items.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          description={emptyDescription}
          ctaLabel={emptyCtaLabel}
          onCtaClick={onEmptyCtaClick}
        />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const content = (
              <div className="rounded-xl border border-slate-200 bg-white p-3 transition hover:border-indigo-200 hover:shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                  {item.status && (
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${statusColor(item.status)}`}>
                      {item.status}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-600">{item.description}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="inline-flex items-center text-[11px] text-slate-500">
                    <Clock3 className="mr-1 h-3.5 w-3.5" />
                    {item.timestamp || 'Updated just now'}
                  </span>
                  {item.href && (
                    <span className="inline-flex items-center text-xs font-semibold text-indigo-600">
                      Open
                      <ExternalLink className="ml-1 h-3.5 w-3.5" />
                    </span>
                  )}
                </div>
              </div>
            );

            if (!item.href) return <li key={item.id}>{content}</li>;
            return (
              <li key={item.id}>
                <Link to={item.href}>{content}</Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default ActivityPanel;
