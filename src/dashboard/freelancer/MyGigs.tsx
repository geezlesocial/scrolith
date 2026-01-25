import React, { useEffect, useState } from "react";
import { gigsApi, Gig, GigStatus } from "../../services/gigs";
import { StatusBadge } from "../shared/StatusBadge";
import { Table } from "../shared/Table";
import ConfirmModal from "../shared/ConfirmModal";
import { useNotification } from "../../context/NotificationContext";

const MyGigs: React.FC = () => {
  const { showNotification } = useNotification();

  const [gigs, setGigs] = useState<Gig[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<GigStatus | 'all'>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadGigs = async () => {
    setLoading(true);
    try {
      const params: any = { ownerId: 'me', role: 'freelancer' };
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }
      const response = await gigsApi.getGigs(params);
      setGigs(response.gigs);
    } catch (error: any) {
      showNotification('error', 'Load Error', 'Failed to load gigs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGigs();
  }, [statusFilter]);

  const handleSubmitGig = async (gigId: string) => {
    try {
      await gigsApi.submitGig(gigId);
      showNotification('success', 'Gig Submitted', 'Your gig has been submitted for review');
      await loadGigs();
    } catch (error: any) {
      showNotification('error', 'Submit Failed', error.message || 'Failed to submit gig');
    }
  };

  const handlePauseGig = async (gigId: string) => {
    try {
      await gigsApi.pauseGig(gigId);
      showNotification('success', 'Gig Paused', 'Your gig has been paused');
      await loadGigs();
    } catch (error: any) {
      showNotification('error', 'Pause Failed', error.message || 'Failed to pause gig');
    }
  };

  const handleActivateGig = async (gigId: string) => {
    try {
      await gigsApi.activateGig(gigId);
      showNotification('success', 'Gig Activated', 'Your gig is now active');
      await loadGigs();
    } catch (error: any) {
      showNotification('error', 'Activate Failed', error.message || 'Failed to activate gig');
    }
  };

  const handleDeleteGig = async () => {
    if (!deleteId) return;

    setDeleting(true);
    try {
      await gigsApi.deleteGig(deleteId);
      showNotification('success', 'Gig Deleted', 'Your gig has been deleted');
      setDeleteId(null);
      await loadGigs();
    } catch (error: any) {
      showNotification('error', 'Delete Failed', error.message || 'Failed to delete gig');
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    {
      key: 'title',
      header: 'Title',
      render: (value: string, gig: Gig) => (
        <div>
          <div className="font-medium text-gray-900">{value}</div>
          <div className="text-sm text-gray-500">{gig.category} • {gig.subcategory}</div>
        </div>
      ),
    },
    {
      key: 'pricing',
      header: 'Pricing',
      render: (pricing: Gig['pricing']) => (
        <div>
          <div className="font-medium">${pricing.amount}</div>
          <div className="text-sm text-gray-500 capitalize">{pricing.type}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (status: GigStatus) => <StatusBadge status={status} type="gig" />,
    },
    {
      key: 'performance',
      header: 'Performance',
      render: (_: any, gig: Gig) => (
        <div className="text-sm">
          <div>{gig.views} views</div>
          <div>{gig.clicks} clicks</div>
          <div>{gig.orders} orders</div>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (_: any, gig: Gig) => (
        <div className="flex gap-2">
          {gig.status === 'draft' && (
            <button
              onClick={() => handleSubmitGig(gig.id)}
              className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Submit
            </button>
          )}
          {gig.status === 'active' && (
            <button
              onClick={() => handlePauseGig(gig.id)}
              className="px-3 py-1 text-xs bg-orange-600 text-white rounded hover:bg-orange-700"
            >
              Pause
            </button>
          )}
          {gig.status === 'paused' && (
            <button
              onClick={() => handleActivateGig(gig.id)}
              className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
            >
              Activate
            </button>
          )}
          {(gig.status === 'draft' || gig.status === 'rejected') && (
            <button
              onClick={() => setDeleteId(gig.id)}
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
          <h2 className="text-2xl font-bold text-gray-900">My Gigs</h2>
          <p className="text-sm text-gray-500">Manage your gig listings and track performance</p>
        </div>

        <button
          onClick={() => window.location.href = '/create-gig'}
          className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-green-700"
        >
          Create Gig
        </button>
      </div>

      {/* Status Filter */}
      <div className="flex gap-2 items-center">
        <span className="text-xs text-gray-500 font-bold">Filter:</span>
        {(['all', 'draft', 'submitted', 'under_review', 'approved', 'active', 'paused', 'rejected'] as const).map((status) => (
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

      {/* Gigs Table */}
      <Table
        columns={columns}
        data={gigs}
        loading={loading}
        emptyMessage="No gigs found. Create your first gig to get started."
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={!!deleteId}
        title="Delete Gig?"
        message="This will permanently remove this gig. This action cannot be undone."
        confirmLabel="Delete"
        danger
        loading={deleting}
        onCancel={() => setDeleteId(null)}
        onConfirm={handleDeleteGig}
      />
    </div>
  );
};

export default MyGigs;