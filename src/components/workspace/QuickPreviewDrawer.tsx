import React from 'react';
import { ExternalLink, X } from 'lucide-react';
import { Link } from 'react-router-dom';

export type QuickPreviewDrawerProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  primaryHref?: string;
  primaryLabel?: string;
};

/**
 * Phase 20.4 — enterprise side panel / mobile bottom sheet for quick previews.
 * Avoids full-page navigation for common inspection workflows.
 */
export default function QuickPreviewDrawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  primaryHref,
  primaryLabel = 'Open full page'
}: QuickPreviewDrawerProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-label={title} data-testid="quick-preview-drawer">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40"
        aria-label="Close preview"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-full sm:max-w-md sm:rounded-none sm:rounded-l-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-slate-900">{title}</h2>
            {subtitle ? <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(88vh-7rem)] overflow-y-auto px-4 py-4 sm:max-h-[calc(100vh-7rem)]">{children}</div>
        {primaryHref ? (
          <div className="border-t border-slate-100 px-4 py-3">
            <Link
              to={primaryHref}
              onClick={onClose}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
            >
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              {primaryLabel}
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
