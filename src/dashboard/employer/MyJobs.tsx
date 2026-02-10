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
        <table className="w-full text-sm text-left">
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
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-10 text-center text-gray-500">
                  No jobs found for this filter.
                </td>
              </tr>
            ) : (
              filtered.map((job) => {
                const status = (job.status || '').toLowerCase();
                return (
                  <tr key={job.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{job.title}</td>
                    <td className="px-6 py-4">
                      {job.budget?.amount ?? job.budget?.minAmount ?? job.budget?.maxAmount ?? job.budget ?? job.price ?? '-'}
                    </td>
                    <td className="px-6 py-4">{job.proposalsCount ?? job.proposals ?? 0}</td>
                    <td className="px-6 py-4">
                      <StatusBadge status={status} type="job" />
                    </td>
                    <td className="px-6 py-4 text-right space-x-2">
                      {status === 'active' && (
                        <Link
                          to={`/jobs/${job.id}`}
                          className="px-3 py-2 rounded-lg border text-xs font-bold text-emerald-600 hover:bg-emerald-50"
                        >
                          View Listing
                        </Link>
                      )}
                      <Link
                        to={`/client/dashboard/jobs/edit/${job.id}`}
                        className="px-3 py-2 rounded-lg border text-xs font-bold hover:bg-gray-50"
                      >
                        Edit
                      </Link>

                      {status === 'draft' && (
                        <button
                          onClick={() => handleAction(job.id, 'submit')}
                          className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700"
                        >
                          Submit
                        </button>
                      )}

                      {status === 'active' && (
                        <button
                          onClick={() => handleAction(job.id, 'pause')}
                          className="px-3 py-2 rounded-lg border text-xs font-bold hover:bg-gray-50"
                        >
                          Pause
                        </button>
                      )}

                      {status === 'paused' && (
                        <button
                          onClick={() => handleAction(job.id, 'activate')}
                          className="px-3 py-2 rounded-lg border text-xs font-bold hover:bg-gray-50"
                        >
                          Activate
                        </button>
                      )}

                      {['active', 'paused'].includes(status) && (
                        <button
                          onClick={() => handleAction(job.id, 'close')}
                          className="px-3 py-2 rounded-lg border text-xs font-bold hover:bg-gray-50"
                        >
                          Close
                        </button>
                      )}

                      <button
                        onClick={() => setDeleteId(job.id)}
                        className="px-3 py-2 rounded-lg border text-xs font-bold text-red-600 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
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
