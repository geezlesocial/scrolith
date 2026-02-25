import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { CircleSlash } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  ctaLabel?: string;
  onCtaClick?: () => void;
  icon?: LucideIcon;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  ctaLabel,
  onCtaClick,
  icon: Icon = CircleSlash,
  className = ''
}) => {
  return (
    <div className={`rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center ${className}`}>
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      <p className="mx-auto mt-1 max-w-lg text-sm text-slate-600">{description}</p>
      {ctaLabel && onCtaClick && (
        <button
          type="button"
          onClick={onCtaClick}
          className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
        >
          {ctaLabel}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
