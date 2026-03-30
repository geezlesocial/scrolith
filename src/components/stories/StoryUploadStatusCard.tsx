import React from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

type StoryUploadStatusCardProps = {
  label: string;
  progress?: number | null;
  busy?: boolean;
  hint?: string;
  className?: string;
};

const clampProgress = (value?: number | null) => {
  if (!Number.isFinite(Number(value))) return null;
  return Math.max(0, Math.min(100, Math.round(Number(value))));
};

export default function StoryUploadStatusCard({
  label,
  progress,
  busy = false,
  hint,
  className = ''
}: StoryUploadStatusCardProps) {
  const normalizedProgress = clampProgress(progress);
  if (!String(label || '').trim()) return null;

  return (
    <div className={`rounded-2xl border border-blue-200 bg-blue-50/90 p-3 text-blue-900 ${className}`.trim()}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-blue-600 shadow-sm">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold leading-5">{label}</p>
            {normalizedProgress !== null ? (
              <span className="rounded-full bg-white px-2 py-1 text-[11px] font-semibold text-blue-700 shadow-sm">
                {busy ? `${normalizedProgress}%` : normalizedProgress >= 100 ? 'Ready' : `${normalizedProgress}%`}
              </span>
            ) : null}
          </div>
          {hint ? <p className="mt-1 text-xs leading-5 text-blue-700/80">{hint}</p> : null}
          {normalizedProgress !== null ? (
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/80">
              <div
                className={`h-full rounded-full transition-all duration-300 ${busy ? 'bg-blue-600' : 'bg-emerald-500'}`}
                style={{ width: `${normalizedProgress}%` }}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
