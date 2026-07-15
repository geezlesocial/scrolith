import React from 'react';

export function EnterpriseSearchSuggestionSkeleton() {
  return (
    <div className="space-y-2 p-2" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 rounded-xl px-2 py-2">
          <div className="h-10 w-10 rounded-2xl bg-slate-200" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-2/3 rounded bg-slate-200" />
            <div className="h-2.5 w-1/2 rounded bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EnterpriseSearchResultSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-live="polite">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex gap-3">
            <div className="h-12 w-12 rounded-2xl bg-slate-200" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3 w-16 rounded-full bg-slate-200" />
              <div className="h-4 w-3/4 rounded bg-slate-200" />
              <div className="h-3 w-full rounded bg-slate-100" />
              <div className="h-3 w-2/3 rounded bg-slate-100" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
