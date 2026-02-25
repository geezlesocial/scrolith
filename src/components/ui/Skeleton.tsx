import React from 'react';

type SkeletonVariant = 'line' | 'card' | 'kpi' | 'list';

interface SkeletonProps {
  className?: string;
  lines?: number;
  variant?: SkeletonVariant;
}

const baseClassName = 'animate-pulse rounded-md bg-slate-200/80';

export const Skeleton: React.FC<SkeletonProps> = ({ className = '', lines = 3, variant = 'line' }) => {
  if (variant === 'kpi') {
    return (
      <div className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
        <div className={`${baseClassName} mb-3 h-4 w-24`} />
        <div className={`${baseClassName} h-8 w-20`} />
        <div className={`${baseClassName} mt-3 h-3 w-28`} />
      </div>
    );
  }

  if (variant === 'card') {
    return (
      <div className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>
        <div className={`${baseClassName} mb-3 h-5 w-40`} />
        <div className={`${baseClassName} mb-2 h-3 w-full`} />
        <div className={`${baseClassName} mb-2 h-3 w-11/12`} />
        <div className={`${baseClassName} h-3 w-8/12`} />
      </div>
    );
  }

  if (variant === 'list') {
    return (
      <div className={`space-y-3 ${className}`}>
        {Array.from({ length: lines }).map((_, index) => (
          <div key={index} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className={`${baseClassName} mb-2 h-4 w-9/12`} />
            <div className={`${baseClassName} mb-2 h-3 w-full`} />
            <div className={`${baseClassName} h-3 w-7/12`} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <div key={index} className={`${baseClassName} h-4 w-full`} />
      ))}
    </div>
  );
};

export default Skeleton;
