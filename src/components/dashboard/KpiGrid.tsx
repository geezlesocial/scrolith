import React from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import Skeleton from '../ui/Skeleton';

export interface KpiItem {
  id: string;
  title: string;
  value: string | number;
  icon: LucideIcon;
  subtitle?: string;
  delta?: string;
  href?: string;
  accent?: 'indigo' | 'green' | 'amber' | 'blue' | 'slate';
}

interface KpiGridProps {
  items: KpiItem[];
  loading?: boolean;
  className?: string;
}

const accentMap: Record<NonNullable<KpiItem['accent']>, { icon: string; value: string }> = {
  indigo: { icon: 'text-indigo-600 bg-indigo-50', value: 'text-indigo-700' },
  green: { icon: 'text-emerald-600 bg-emerald-50', value: 'text-emerald-700' },
  amber: { icon: 'text-amber-600 bg-amber-50', value: 'text-amber-700' },
  blue: { icon: 'text-blue-600 bg-blue-50', value: 'text-blue-700' },
  slate: { icon: 'text-slate-600 bg-slate-100', value: 'text-slate-900' }
};

export const KpiGrid: React.FC<KpiGridProps> = ({ items, loading = false, className = '' }) => {
  if (loading) {
    return (
      <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 ${className}`}>
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} variant="kpi" />
        ))}
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 ${className}`}>
      {items.map((item) => {
        const tone = accentMap[item.accent || 'slate'];
        const Card = (
          <div className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{item.title}</p>
                <p className={`mt-1 text-2xl font-bold ${tone.value}`}>{item.value}</p>
              </div>
              <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${tone.icon}`}>
                <item.icon className="h-4 w-4" />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <p className="min-h-[20px] text-xs text-slate-500">{item.delta || item.subtitle || '—'}</p>
              {item.href && (
                <span className="inline-flex items-center text-xs font-semibold text-indigo-600">
                  Open
                  <ChevronRight className="ml-1 h-3.5 w-3.5" />
                </span>
              )}
            </div>
          </div>
        );

        if (!item.href) {
          return <div key={item.id}>{Card}</div>;
        }

        return (
          <Link key={item.id} to={item.href} className="block">
            {Card}
          </Link>
        );
      })}
    </div>
  );
};

export default KpiGrid;
