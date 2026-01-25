import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { jobsApi, Job, JobStatus } from "../../services/jobs";
import { StatusBadge } from "../shared/StatusBadge";
import { Table } from "../shared/Table";
import ConfirmModal from "../shared/ConfirmModal";
import { useNotification } from "../../context/NotificationContext";

const MyJobs: React.FC = () => {
  const { showNotification } = useNotification();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<JobStatus | 'all'>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadJobs = async () => {
    setLoading(true);
    try {
      const params: any = { ownerId: 'me' };
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }
      const response = await jobsApi.getJobs(params);
      setJobs(response.jobs);
    } catch (error: any) {
      showNotification('error', 'Load Error', 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs();
  }, [statusFilter]);

  const handleSubmitJob = async (jobId: string) => {
    try {
      await jobsApi.submitJob(jobId);
      showNotification('success', 'Job Submitted', 'Your job has been submitted for review');
      await loadJobs();
    } catch (error: any) {
      showNotification('error', 'Submit Failed', error.message || 'Failed to submit job');
    }
  };

  const handlePauseJob = async (jobId: string) => {
    try {
      await jobsApi.pauseJob(jobId);
      showNotification('success', 'Job Paused', 'Your job has been paused');
      await loadJobs();
    } catch (error: any) {
      showNotification('error', 'Pause Failed', error.message || 'Failed to pause job');
    }
  };

  const handleActivateJob = async (jobId: string) => {
    try {
      await jobsApi.activateJob(jobId);
      showNotification('success', 'Job Activated', 'Your job is now active');
      await loadJobs();
    } catch (error: any) {
      showNotification('error', 'Activate Failed', error.message || 'Failed to activate job');
    }
  };

  const handleCloseJob = async (jobId: string) => {
    try {
      await jobsApi.closeJob(jobId);
      showNotification('success', 'Job Closed', 'Your job has been closed');
      await loadJobs();
    } catch (error: any) {
      showNotification('error', 'Close Failed', error.message || 'Failed to close job');
    }
  };

  const handleDeleteJob = async () => {
    if (!deleteId) return;

    setDeleting(true);
    try {
      await jobsApi.deleteJob(deleteId);
      showNotification('success', 'Job Deleted', 'Your job has been deleted');
      setDeleteId(null);
      await loadJobs();
    } catch (error: any) {
      showNotification('error', 'Delete Failed', error.message || 'Failed to delete job');
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    {
      key: 'title',
      header: 'Title',
      render: (value: string, job: Job) => (
        <div>
          <div className="font-medium text-gray-900">{value}</div>
          <div className="text-sm text-gray-500">{job.category} • {job.subcategory}</div>
        </div>
      ),
    },
    {
      key: 'budget',
      header: 'Budget',
      render: (budget: Job['budget']) => (
        <div>
          <div className="font-medium">
            {budget.type === 'fixed'
              ? `$${budget.minAmount || 0}`
              : `$${budget.minAmount || 0} - $${budget.maxAmount || 0}`
            }
          </div>
          <div className="text-sm text-gray-500 capitalize">{budget.type}</div>
        </div>
      ),
    },
    {
      key: 'proposalsCount',
      header: 'Proposals',
      render: (count: number) => (
        <div className="font-medium">{count}</div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (status: JobStatus) => <StatusBadge status={status} type="job" />,
    },
    {
      key: 'createdAt',
      header: 'Posted',
      render: (value: string) => (
        <div className="text-sm text-gray-500">
          {new Date(value).toLocaleDateString()}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (_: any, job: Job) => (
        <div className="flex gap-2 flex-wrap">
          <Link
            to={`/client/dashboard/jobs/edit/${job.id}`}
            className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Edit
          </Link>

          {job.status === 'draft' && (
            <button
              onClick={() => handleSubmitJob(job.id)}
              className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
            >
              Submit
            </button>
          )}

          {job.status === 'active' && (
            <button
              onClick={() => handlePauseJob(job.id)}
              className="px-3 py-1 text-xs bg-orange-600 text-white rounded hover:bg-orange-700"
            >
              Pause
            </button>
          )}

          {job.status === 'paused' && (
            <button
              onClick={() => handleActivateJob(job.id)}
              className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
            >
              Activate
            </button>
          )}

          {['active', 'paused'].includes(job.status) && (
            <button
              onClick={() => handleCloseJob(job.id)}
              className="px-3 py-1 text-xs bg-gray-600 text-white rounded hover:bg-gray-700"
            >
              Close
            </button>
          )}

          {['draft', 'rejected'].includes(job.status) && (
            <button
              onClick={() => setDeleteId(job.id)}
              className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
            >
              Delete
            </button>
          )}
        </div>
      ),
    },
  ];

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

      {/* Status Filter */}
      <div className="flex gap-2 items-center flex-wrap">
        <span className="text-xs text-gray-500 font-bold">Filter:</span>
        {(['all', 'draft', 'submitted', 'under_review', 'active', 'paused', 'closed', 'rejected'] as const).map((status) => (
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

      {/* Jobs Table */}
      <Table
        columns={columns}
        data={jobs}
        loading={loading}
        emptyMessage="No job posts yet. Create your first job to start hiring talent."
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={!!deleteId}
        title="Delete Job Post?"
        message="This will permanently remove the job post. This action cannot be undone."
        confirmLabel="Delete"
        danger
        loading={deleting}
        onCancel={() => setDeleteId(null)}
        onConfirm={handleDeleteJob}
      />
    </div>
  );
};

export default MyJobs;