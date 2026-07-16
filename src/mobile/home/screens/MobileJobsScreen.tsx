import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BriefcaseIcon as Briefcase, SearchIcon as Search } from '../../../components/icons/ShellIcons';
import { jobsApi, Job } from '../../../services/jobs';
import { MOBILE_PAGE_SECTION_CLASS } from '../mobileShellLayout';

const formatBudget = (budget: Job['budget']) => {
  if (!budget) return '';
  if (typeof budget === 'string') return budget;
  const type = budget.type === 'hourly' ? 'Hourly' : 'Fixed';
  if (budget.minAmount && budget.maxAmount) return `${type}: $${budget.minAmount}-$${budget.maxAmount}`;
  if (typeof budget.amount === 'number') return `${type}: $${budget.amount}`;
  return type;
};

export default function MobileJobsScreen() {
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await jobsApi.getJobs({ status: 'active', limit: 20, search: search.trim() || undefined });
        if (!active) return;
        setJobs(Array.isArray(data?.jobs) ? data.jobs : []);
      } catch (e: any) {
        if (!active) return;
        setError(e?.message || 'Failed to load jobs.');
        setJobs([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [search]);

  const header = useMemo(() => (search.trim() ? `Jobs for “${search.trim()}”` : 'Jobs'), [search]);

  return (
    <div className={MOBILE_PAGE_SECTION_CLASS}>
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Briefcase className="h-4 w-4" />
        {header}
      </div>

      <div className="mb-3 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2">
        <Search className="h-4 w-4 text-slate-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search jobs..."
          className="w-full bg-transparent text-sm outline-none"
        />
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading jobs...</div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-white p-4">
          <div className="text-sm font-semibold text-red-700">Jobs error</div>
          <div className="mt-1 text-sm text-slate-700">{error}</div>
        </div>
      ) : jobs.length ? (
        <div className="space-y-3">
          {jobs.map((job) => (
            <Link
              key={job.id}
              to={`/jobs/${encodeURIComponent(job.id)}`}
              className="block rounded-3xl border border-slate-200 bg-white p-4 shadow-sm hover:bg-slate-50 touch-manipulation"
            >
              <div className="text-sm font-semibold text-slate-900 line-clamp-2">{job.title}</div>
              <div className="mt-1 text-sm text-slate-600 line-clamp-2">{job.description}</div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                {job.category ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{job.category}</span>
                ) : null}
                {job.subcategory ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-700">{job.subcategory}</span>
                ) : null}
                {job.budget ? (
                  <span className="rounded-full bg-slate-900 px-3 py-1 font-semibold text-white">{formatBudget(job.budget)}</span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">No jobs found.</div>
      )}
    </div>
  );
}
