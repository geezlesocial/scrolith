import React from 'react';
import { Link } from 'react-router-dom';

export type StatusChip = {
  id: string;
  label: string;
  value: string | number;
  href?: string;
  tone?: 'slate' | 'indigo' | 'green' | 'amber' | 'red';
};

const toneClass: Record<NonNullable<StatusChip['tone']>, string> = {
  slate: 'border-slate-200 bg-slate-50 text-slate-800',
  indigo: 'border-indigo-100 bg-indigo-50 text-indigo-800',
  green: 'border-emerald-100 bg-emerald-50 text-emerald-800',
  amber: 'border-amber-100 bg-amber-50 text-amber-900',
  red: 'border-rose-100 bg-rose-50 text-rose-800'
};

/**
 * Compact KPI/status strip for mobile-first workspace overviews.
 */
export default function WorkspaceStatusStrip({
  chips,
  loading = false,
  className = ''
}: {
  chips: StatusChip[];
  loading?: boolean;
  className?: string;
}) {
  if (loading) {
    return (
      <div className={`grid grid-cols-2 gap-2 sm:grid-cols-4 ${className}`.trim()} aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`grid grid-cols-2 gap-2 sm:grid-cols-4 ${className}`.trim()}
      data-testid="workspace-status-strip"
      role="list"
      aria-label="Workspace status"
    >
      {chips.map((chip) => {
        const content = (
          <div
            className={`rounded-2xl border px-3 py-2.5 shadow-sm ${toneClass[chip.tone || 'slate']}`}
            role="listitem"
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{chip.label}</p>
            <p className="mt-1 text-lg font-bold tabular-nums">{chip.value}</p>
          </div>
        );
        return chip.href ? (
          <Link
            key={chip.id}
            to={chip.href}
            className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            {content}
          </Link>
        ) : (
          <div key={chip.id}>{content}</div>
        );
      })}
    </div>
  );
}
