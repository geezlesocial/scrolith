import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { fetchMyGigs, updateGig, deleteGig, submitGig, pauseGig, activateGig } from '../../services/gigs';
import { categoriesApi } from '../../services/categories';
import { useUser } from '../../context/UserContext';
import { useNotification } from '../../context/NotificationContext';
import { Table, StatusBadge, ConfirmModal } from '../shared';

type GigStatusFilter = 'all' | 'active' | 'draft' | 'pending' | 'paused' | 'under_review';

const MyGigs = () => {
    const { user } = useUser();
    const navigate = useNavigate();
    const { showNotification } = useNotification();

    const [gigs, setGigs] = useState<Gig[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [filter, setFilter] = useState<GigStatusFilter>('all');
    const [loading, setLoading] = useState(true);
    const [deleteGigId, setDeleteGigId] = useState<string | null>(null);
    const [processingAction, setProcessingAction] = useState<string | null>(null);

    useEffect(() => {
        loadData();
    }, [user]);

    useEffect(() => {
        loadGigs();
    }, [filter]);

    const loadData = async () => {
        try {
            const [categoriesData] = await Promise.all([
                categoriesApi.getGigCategories()
            ]);
            setCategories(categoriesData.categories || []);
        } catch (error) {
            console.error('Failed to load categories:', error);
        }
    };

    const loadGigs = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const gigsData = await fetchMyGigs();
            // Apply client-side filtering if needed
            let filteredGigs = gigsData;
            if (filter !== 'all') {
                if (filter === 'pending') {
                    filteredGigs = gigsData.filter((gig: any) => gig.status === 'submitted');
                } else if (filter === 'under_review') {
                    filteredGigs = gigsData.filter((gig: any) => gig.status === 'under_review');
                } else {
                    filteredGigs = gigsData.filter((gig: any) => gig.status === filter);
                }
            }
            setGigs(filteredGigs);
        } catch (error: any) {
            console.error('Failed to load gigs:', error);
            showNotification('error', 'Load Error', error.message || 'Failed to load gigs');
            setGigs([]);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmitGig = async (gigId: string) => {
        setProcessingAction(gigId);
        try {
            await submitGig(gigId);
            showNotification('success', 'Submitted', 'Gig submitted for review');
            loadGigs();
        } catch (error: any) {
            showNotification('error', 'Submit Failed', error.message || 'Failed to submit gig');
        } finally {
            setProcessingAction(null);
        }
    };

    const handlePauseGig = async (gigId: string) => {
        setProcessingAction(gigId);
        try {
            await pauseGig(gigId);
            showNotification('success', 'Paused', 'Gig paused successfully');
            loadGigs();
        } catch (error: any) {
            showNotification('error', 'Pause Failed', error.message || 'Failed to pause gig');
        } finally {
            setProcessingAction(null);
        }
    };

    const handleActivateGig = async (gigId: string) => {
        setProcessingAction(gigId);
        try {
            await activateGig(gigId);
            showNotification('success', 'Activated', 'Gig activated successfully');
            loadGigs();
        } catch (error: any) {
            showNotification('error', 'Activate Failed', error.message || 'Failed to activate gig');
        } finally {
            setProcessingAction(null);
        }
    };

    const handleDeleteGig = async (gigId: string) => {
        setProcessingAction(gigId);
        try {
            await deleteGig(gigId);
            showNotification('success', 'Deleted', 'Gig deleted successfully');
            loadGigs();
            setDeleteGigId(null);
        } catch (error: any) {
            showNotification('error', 'Delete Failed', error.message || 'Failed to delete gig');
        } finally {
            setProcessingAction(null);
        }
    };

    const columns = [
        {
            key: 'title',
            header: 'Title',
            render: (value: string, gig: Gig) => (
                <div>
                    <div className="font-medium text-gray-900">{value}</div>
                    <div className="text-sm text-gray-500">{gig.category} - {gig.subcategory}</div>
                </div>
            )
        },
        {
            key: 'status',
            header: 'Status',
            render: (value: string) => <StatusBadge status={value} type="gig" />
        },
            {
                key: 'performance',
                header: 'Performance',
                render: (value: any, gig: Gig) => (
                    <div className="text-sm">
                        <div>Views: <span className="font-medium">{gig.performance?.views || 0}</span></div>
                        <div>Clicks: <span className="font-medium">{gig.performance?.clicks || 0}</span></div>
                        <div>Orders: <span className="font-medium">{gig.performance?.orders || 0}</span></div>
                    </div>
                )
            },
        {
            key: 'price',
            header: 'Price',
            render: (value: any, gig: Gig) => (
                <span className="font-medium">
                    ${gig.price.amount} {gig.price.type === 'hourly' ? '/hr' : ''}
                </span>
            )
        },
        {
            key: 'actions',
            header: 'Actions',
            render: (value: any, gig: Gig) => (
                <div className="flex items-center space-x-2">
                    {gig.status === 'active' && (
                        <button
                            onClick={() => navigate(`/gigs/${gig.id}`)}
                            className="text-emerald-600 hover:text-emerald-900 text-sm font-medium"
                            disabled={processingAction === gig.id}
                        >
                            View Listing
                        </button>
                    )}
                    <button
                        onClick={() => navigate(`/create-gig?edit=${gig.id}`)}
                        className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
                        disabled={processingAction === gig.id}
                    >
                        Edit
                    </button>

                    {gig.status === 'draft' && (
                        <button
                            onClick={() => handleSubmitGig(gig.id)}
                            className="text-green-600 hover:text-green-900 text-sm font-medium"
                            disabled={processingAction === gig.id}
                        >
                            {processingAction === gig.id ? 'Submitting...' : 'Submit'}
                        </button>
                    )}

                    {gig.status === 'rejected' && (
                        <button
                            onClick={() => handleSubmitGig(gig.id)}
                            className="text-amber-600 hover:text-amber-900 text-sm font-medium"
                            disabled={processingAction === gig.id}
                        >
                            {processingAction === gig.id ? 'Submitting...' : 'Resubmit'}
                        </button>
                    )}

                    {gig.status === 'active' && (
                        <button
                            onClick={() => handlePauseGig(gig.id)}
                            className="text-orange-600 hover:text-orange-900 text-sm font-medium"
                            disabled={processingAction === gig.id}
                        >
                            {processingAction === gig.id ? 'Pausing...' : 'Pause'}
                        </button>
                    )}

                    {gig.status === 'paused' && (
                        <button
                            onClick={() => handleActivateGig(gig.id)}
                            className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                            disabled={processingAction === gig.id}
                        >
                            {processingAction === gig.id ? 'Activating...' : 'Activate'}
                        </button>
                    )}

                    <button
                        onClick={() => setDeleteGigId(gig.id)}
                        className="text-red-600 hover:text-red-900 text-sm font-medium"
                        disabled={processingAction === gig.id}
                    >
                        Delete
                    </button>
                </div>
            )
        }
    ];

    if (loading) {
        return <div className="p-12 text-center text-gray-500">Loading your gigs...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <h1 className="text-2xl font-bold text-gray-900">My Gigs</h1>
                <button
                    onClick={() => navigate('/create-gig')}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold flex items-center hover:bg-indigo-700 transition shadow-sm"
                >
                    <Plus className="w-4 h-4 mr-2" /> Create New Gig
                </button>
            </div>

            {/* Status Filter */}
            <div className="bg-white p-4 rounded-xl border border-gray-200">
                <div className="flex flex-wrap gap-2">
                    {[
                        { key: 'all', label: 'All Gigs' },
                        { key: 'active', label: 'Active' },
                        { key: 'under_review', label: 'Under Review' },
                        { key: 'draft', label: 'Draft' },
                        { key: 'paused', label: 'Paused' },
                        { key: 'rejected', label: 'Rejected' }
                    ].map(({ key, label }) => (
                        <button
                            key={key}
                            onClick={() => setFilter(key as GigStatusFilter)}
                            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                                filter === key
                                ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                            {label} ({gigs.filter(g => {
                                if (key === 'all') return true;
                                if (key === 'under_review') return g.status === 'under_review';
                                if (key === 'pending') return g.status === 'submitted';
                                return g.status === key;
                            }).length})
                        </button>
                    ))}
                </div>
            </div>

            <div data-cy="mygigs-list">
                <Table
                    data={gigs}
                    columns={columns}
                    loading={loading}
                    emptyMessage="No gigs found. Create your first gig to get started."
                />
            </div>

            <ConfirmModal
                isOpen={!!deleteGigId}
                title="Delete Gig"
                message="Are you sure you want to delete this gig? This action cannot be undone."
                onConfirm={() => deleteGigId && handleDeleteGig(deleteGigId)}
                onCancel={() => setDeleteGigId(null)}
                loading={processingAction === deleteGigId}
                variant="danger"
            />
        </div>
    );
};

export default MyGigs;
