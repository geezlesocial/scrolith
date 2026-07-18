import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Clock3, Sparkles } from 'lucide-react';
import WorkspaceWidget from './WorkspaceWidget';

export type WorkspaceFocusItem = {
  id: string;
  title: string;
  caption?: string;
  href?: string;
  urgency?: 'high' | 'medium' | 'low';
  status?: string;
};

export type WorkspaceFocusPanelProps = {
  title?: string;
  subtitle?: string;
  items: WorkspaceFocusItem[];
  loading?: boolean;
  emptyLabel?: string;
  scrolithaHref?: string;
  dense?: boolean;
  className?: string;
};

const urgencyTone = (urgency?: WorkspaceFocusItem['urgency']) => {
  if (urgency === 'high') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (urgency === 'medium') return 'border-indigo-100 bg-indigo-50 text-indigo-800';
  return 'border-slate-100 bg-slate-50 text-slate-700';
};

/**
 * Phase 20.4 — Today's Focus / My Priorities queue for enterprise workspaces.
 */
export default function WorkspaceFocusPanel({
  title = "Today's Focus",
  subtitle = 'Highest-priority work without leaving the workspace',
  items,
  loading = false,
  emptyLabel = 'You are clear. No urgent items right now.',
  scrolithaHref = '/scrolitha?intent=growth',
  dense = false,
  className = ''
}: WorkspaceFocusPanelProps) {
  return (
    <WorkspaceWidget
      id="todays-focus"
      title={title}
      subtitle={subtitle}
      dense={dense}
      className={className}
      actions={
        <Link
          to={scrolithaHref}
          className="inline-flex items-center gap-1 rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          AI brief
        </Link>
      }
    >
      {loading ? (
        <div className="space-y-2" aria-busy="true">
          <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
          <div className="h-12 animate-pulse rounded-xl bg-slate-100" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-3 text-sm text-emerald-800" role="status">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{emptyLabel}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const Icon = item.urgency === 'high' ? AlertTriangle : Clock3;
            const body = (
              <div
                className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 ${urgencyTone(item.urgency)}`}
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{item.title}</p>
                  {item.caption ? <p className="truncate text-[11px] opacity-80">{item.caption}</p> : null}
                </div>
                {item.status ? (
                  <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                    {item.status}
                  </span>
                ) : null}
              </div>
            );
            return (
              <li key={item.id}>
                {item.href ? (
                  <Link to={item.href} className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      )}
    </WorkspaceWidget>
  );
}
