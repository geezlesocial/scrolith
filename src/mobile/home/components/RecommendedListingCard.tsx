import React from 'react';
import { Briefcase, ChevronRight, Sparkles, Tag } from 'lucide-react';
import { Link } from 'react-router-dom';

type JobLike = {
  id: string;
  title?: string | null;
  category?: string | null;
  subcategory?: string | null;
  budget?: any;
  createdAt?: string | null;
  clientName?: string | null;
  clientAvatar?: string | null;
};

type GigLike = {
  id: string;
  title?: string | null;
  category?: string | null;
  subcategory?: string | null;
  price?: any;
  createdAt?: string | null;
  freelancerName?: string | null;
  freelancerAvatar?: string | null;
};

const formatMoney = (value: any) => {
  const amount =
    typeof value === 'number'
      ? value
      : typeof value?.amount === 'number'
        ? value.amount
        : typeof value?.minAmount === 'number'
          ? value.minAmount
          : typeof value?.maxAmount === 'number'
            ? value.maxAmount
            : null;
  if (amount === null) return null;
  try {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(amount);
  } catch {
    return String(amount);
  }
};

export default function RecommendedListingCard({
  kind,
  title,
  items,
  seeAllHref
}: {
  kind: 'jobs' | 'gigs';
  title: string;
  items: Array<JobLike | GigLike>;
  seeAllHref?: string;
}) {
  const icon = kind === 'jobs' ? <Briefcase className="h-4 w-4" /> : <Tag className="h-4 w-4" />;

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
            <span className="rounded-xl bg-slate-100 p-2 text-slate-700">{icon}</span>
            <span className="truncate">{title}</span>
            <Sparkles className="h-4 w-4 text-amber-500" aria-label="Recommended" />
          </div>
          <div className="mt-1 text-xs text-slate-500">Picked for you based on your current mode.</div>
        </div>
        {seeAllHref ? (
          <Link
            to={seeAllHref}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            See all <ChevronRight className="h-4 w-4" />
          </Link>
        ) : null}
      </div>

      <div className="mt-3 space-y-3">
        {items.slice(0, 2).map((row) => {
          const id = String((row as any)?.id || '').trim();
          if (!id) return null;
          if (kind === 'jobs') {
            const job = row as JobLike;
            const budget = formatMoney(job.budget);
            const href = `/jobs/${encodeURIComponent(id)}`;
            return (
              <Link key={id} to={href} className="block rounded-2xl border border-slate-200 bg-white p-3 hover:bg-slate-50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">{job.title || 'Job opportunity'}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      {job.category ? <span className="rounded-full bg-slate-100 px-2 py-0.5">{job.category}</span> : null}
                      {budget ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">${budget}</span> : null}
                      {job.clientName ? <span className="truncate">by {job.clientName}</span> : null}
                    </div>
                  </div>
                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                    {job.clientAvatar ? <img src={job.clientAvatar} alt="" className="h-full w-full object-cover" /> : null}
                  </div>
                </div>
              </Link>
            );
          }

          const gig = row as GigLike;
          const price = formatMoney(gig.price);
          const href = `/gigs/${encodeURIComponent(id)}`;
          return (
            <Link key={id} to={href} className="block rounded-2xl border border-slate-200 bg-white p-3 hover:bg-slate-50">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">{gig.title || 'Service offer'}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {gig.category ? <span className="rounded-full bg-slate-100 px-2 py-0.5">{gig.category}</span> : null}
                    {price ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">${price}</span> : null}
                    {gig.freelancerName ? <span className="truncate">by {gig.freelancerName}</span> : null}
                  </div>
                </div>
                <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                  {gig.freelancerAvatar ? <img src={gig.freelancerAvatar} alt="" className="h-full w-full object-cover" /> : null}
                </div>
              </div>
            </Link>
          );
        })}

        {!items.length ? <div className="text-sm text-slate-500">No recommendations right now.</div> : null}
      </div>
    </div>
  );
}

