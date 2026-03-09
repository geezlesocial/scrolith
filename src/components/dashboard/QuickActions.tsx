import React from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

export interface QuickActionItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  variant?: 'primary' | 'secondary';
  description?: string;
  badge?: string;
}

interface QuickActionsProps {
  title?: string;
  subtitle?: string;
  items: QuickActionItem[];
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  title = 'Quick Actions',
  subtitle = 'Jump to your most-used actions.',
  items
}) => {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <Link
            key={item.id}
            to={item.href}
            className={`group rounded-2xl border px-4 py-3 text-sm transition ${
              item.variant === 'primary'
                ? 'border-indigo-600 bg-gradient-to-r from-indigo-600 to-blue-600 text-white hover:from-indigo-700 hover:to-blue-700'
                : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-200 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 gap-3">
                <div
                  className={`rounded-2xl p-2.5 ${
                    item.variant === 'primary' ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold">{item.label}</p>
                  {item.description ? (
                    <p className={`mt-1 text-xs leading-5 ${item.variant === 'primary' ? 'text-indigo-100' : 'text-slate-500'}`}>
                      {item.description}
                    </p>
                  ) : null}
                </div>
              </div>

              {item.badge ? (
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    item.variant === 'primary' ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {item.badge}
                </span>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
};

export default QuickActions;
