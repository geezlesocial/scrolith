import React from 'react';
import { Link } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

export interface QuickActionItem {
  id: string;
  label: string;
  icon: LucideIcon;
  href: string;
  variant?: 'primary' | 'secondary';
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
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition ${
              item.variant === 'primary'
                ? 'border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
};

export default QuickActions;
