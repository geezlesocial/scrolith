import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { JobsService } from '../../services/jobs';
import StatusBadge from '../shared/StatusBadge';
import ConfirmModal from '../shared/ConfirmModal';
import Skeleton from '../shared/Skeleton';

const statusFilters = [
  'all',
  'draft',
  'submitted',
  'under_review',
  'active',
  'paused',
  'closed',
  'rejected'
] as const;

export default function MyJobs() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<typeof statusFilters[number]>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await JobsService.listMine();
      setJobs(data || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load jobs');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return jobs;
    return jobs.filter((job) => (job.status || '').toLowerCase() === statusFilter);
  }, [jobs, statusFilter]);

  const handleAction = async (jobId: string, action: 'submit' | 'pause' | 'activate' | 'close') => {
    try {
      if (action === 'submit') await JobsService.submit(jobId);
      if (action === 'pause') await JobsService.pause(jobId);
      if (action === 'activate') await JobsService.activate(jobId);
      if (action === 'close') await JobsService.close(jobId);
      await load();
    } catch (err: any) {
      setError(err?.message || 'Failed to update job');
    }
  };

  const renderJobActions = (job: any, status: string, compact = false) => (
    <div className={`flex flex-wrap gap-2 ${compact ? '' : 'justify-end'}`}>
      {status === 'active' && (
        <Link
          to={`/jobs/${job.id}`}
          className="inline-flex items-center justify-center px-3 py-2 rounded-lg border text-xs font-bold text-emerald-600 hover:bg-emerald-50"
        >
          View Listing
        </Link>
      )}
      <Link
        to={`/client/dashboard/jobs/edit/${job.id}`}
        className="inline-flex items-center justify-center px-3 py-2 rounded-lg border text-xs font-bold hover:bg-gray-50"
      >
        Edit
      </Link>

      {status === 'draft' && (
        <button
          onClick={() => handleAction(job.id, 'submit')}
          className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700"
        >
          Submit
        </button>
      )}

      {status === 'active' && (
        <button
          onClick={() => handleAction(job.id, 'pause')}
          className="inline-flex items-center justify-center px-3 py-2 rounded-lg border text-xs font-bold hover:bg-gray-50"
        >
          Pause
        </button>
      )}

      {status === 'paused' && (
        <button
          onClick={() => handleAction(job.id, 'activate')}
          className="inline-flex items-center justify-center px-3 py-2 rounded-lg border text-xs font-bold hover:bg-gray-50"
        >
          Activate
        </button>
      )}

      {['active', 'paused'].includes(status) && (
        <button
          onClick={() => handleAction(job.id, 'close')}
          className="inline-flex items-center justify-center px-3 py-2 rounded-lg border text-xs font-bold hover:bg-gray-50"
        >
          Close
        </button>
      )}

      <button
        onClick={() => setDeleteId(job.id)}
        className="inline-flex items-center justify-center px-3 py-2 rounded-lg border text-xs font-bold text-red-600 hover:bg-red-50"
      >
        Delete
      </button>
    </div>
  );

  if (loading) return <Skeleton rows={6} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">My Job Posts</h2>
          <p className="text-sm text-gray-500">Create, manage, and track applications in real time.</p>
        </div>
        <Link
          to="/create-job"
          className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-green-700"
        >
          New Job
        </Link>
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <span className="text-xs text-gray-500 font-bold">Filter:</span>
        {statusFilters.map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`px-3 py-2 rounded-xl text-sm font-bold border ${
              statusFilter === status
                ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {status === 'all' ? 'All' : status.replace('_', ' ')}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-gray-500">No jobs found for this filter.</div>
        ) : (
          <>
            <div className="min-[360px]:hidden space-y-3 p-3">
              {filtered.map((job) => {
                const status = (job.status || '').toLowerCase();
                return (
                  <article key={job.id} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="min-w-0 break-words text-sm font-semibold text-gray-900">{job.title}</h3>
                      <StatusBadge status={status} type="job" />
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-2 text-xs">
                      <div className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2">
                        <p className="font-semibold uppercase tracking-wide text-gray-500">Budget</p>
                        <p className="mt-1 text-sm font-medium text-gray-900 break-words">
                          {job.budget?.amount ?? job.budget?.minAmount ?? job.budget?.maxAmount ?? job.budget ?? job.price ?? '-'}
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2">
                        <p className="font-semibold uppercase tracking-wide text-gray-500">Proposals</p>
                        <p className="mt-1 text-sm font-medium text-gray-900">{job.proposalsCount ?? job.proposals ?? 0}</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      {renderJobActions(job, status, true)}
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="hidden min-[360px]:block overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm text-left">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-6 py-4">Title</th>
                    <th className="px-6 py-4">Budget</th>
                    <th className="px-6 py-4">Proposals</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((job) => {
                    const status = (job.status || '').toLowerCase();
                    return (
                      <tr key={job.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">{job.title}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {job.budget?.amount ?? job.budget?.minAmount ?? job.budget?.maxAmount ?? job.budget ?? job.price ?? '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">{job.proposalsCount ?? job.proposals ?? 0}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <StatusBadge status={status} type="job" />
                        </td>
                        <td className="px-6 py-4 align-top">
                          {renderJobActions(job, status)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <ConfirmModal
        isOpen={Boolean(deleteId)}
        title="Delete job post?"
        message="This will permanently remove the job post. This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onCancel={() => setDeleteId(null)}
        onConfirm={async () => {
          if (!deleteId) return;
          try {
            await JobsService.remove(deleteId);
            setDeleteId(null);
            await load();
          } catch (err: any) {
            setError(err?.message || 'Failed to delete job');
          }
        }}
      />
    </div>
  );
}
