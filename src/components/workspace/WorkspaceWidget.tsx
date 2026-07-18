import React from 'react';
import { ChevronDown, Pin, PinOff } from 'lucide-react';

export type WorkspaceWidgetProps = {
  id: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
  pinned?: boolean;
  onTogglePin?: (id: string) => void;
  actions?: React.ReactNode;
  dense?: boolean;
};

/**
 * Phase 20.4 — reusable enterprise workspace widget shell.
 * Supports collapse + pin for layout personalization (client-side prefs).
 */
export default function WorkspaceWidget({
  id,
  title,
  subtitle,
  children,
  className = '',
  collapsible = true,
  defaultOpen = true,
  pinned,
  onTogglePin,
  actions,
  dense = false
}: WorkspaceWidgetProps) {
  const [open, setOpen] = React.useState(defaultOpen);

  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`.trim()}
      data-testid={`workspace-widget-${id}`}
      data-widget-id={id}
      aria-labelledby={`workspace-widget-title-${id}`}
    >
      <header
        className={`flex items-start justify-between gap-2 border-b border-slate-100 ${
          dense ? 'px-3 py-2.5' : 'px-4 py-3'
        }`}
      >
        <div className="min-w-0">
          <h3 id={`workspace-widget-title-${id}`} className="text-sm font-semibold text-slate-900">
            {title}
          </h3>
          {subtitle ? <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          {onTogglePin ? (
            <button
              type="button"
              onClick={() => onTogglePin(id)}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              aria-label={pinned ? `Unpin ${title}` : `Pin ${title}`}
              aria-pressed={Boolean(pinned)}
            >
              {pinned ? <Pin className="h-4 w-4 text-indigo-600" /> : <PinOff className="h-4 w-4" />}
            </button>
          ) : null}
          {collapsible ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
              aria-expanded={open}
              aria-controls={`workspace-widget-body-${id}`}
            >
              <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-0' : '-rotate-90'}`} aria-hidden="true" />
              <span className="sr-only">{open ? 'Collapse' : 'Expand'} {title}</span>
            </button>
          ) : null}
        </div>
      </header>
      {open ? (
        <div id={`workspace-widget-body-${id}`} className={dense ? 'p-3' : 'p-4'}>
          {children}
        </div>
      ) : null}
    </section>
  );
}
