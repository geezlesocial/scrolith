import React, { useState, useEffect, useMemo } from 'react';
import { proposalsApi, Proposal } from '../../services/proposals';
import { useNotification } from '../../context/NotificationContext';
import { useUser } from '../../context/UserContext';
import { Table } from '../shared/Table';
import { StatusBadge } from '../shared/StatusBadge';
import { Skeleton } from '../shared/Skeleton';
import EmptyState from '../shared/EmptyState';
import { ConfirmModal } from '../shared/ConfirmModal';
import {
  FileText,
  User,
  MessageSquare,
  CheckCircle,
  X,
  Star,
  StarOff,
  DollarSign,
  Clock,
  Calendar,
  Eye,
  Filter,
  Search,
  Loader2
} from 'lucide-react';

interface ProposalWithActions extends Proposal {
  actions: React.ReactNode;
}

export const ProposalsOffers: React.FC = () => {
  const { user } = useUser();
  const { showNotification } = useNotification();

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'shortlisted' | 'accepted' | 'rejected'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal states
  const [showConfirm, setShowConfirm] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [actionType, setActionType] = useState<'accept' | 'reject' | 'shortlist' | 'unshortlist' | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  const loadProposals = async () => {
    if (!user) return;

    setLoading(true);
    setError(null);
    try {
      const params: any = {};
      if (filter !== 'all') {
        params.status = filter;
      }
      if (searchTerm) {
        params.search = searchTerm;
      }

      const response = await proposalsApi.getProposals(params);
      setProposals(response.proposals || []);
    } catch (error: any) {
      console.error('Failed to load proposals:', error);
      setError(error.message || 'Failed to load proposals');
      showNotification('error', 'Load Error', error.message || 'Failed to load proposals');
      setProposals([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProposals();
  }, [user, filter, searchTerm]);

  const handleAction = async (proposalId: string, action: string, data?: any) => {
    setModalLoading(true);
    try {
      switch (action) {
        case 'accept':
          await proposalsApi.acceptProposal(proposalId, data);
          showNotification('success', 'Success', 'Proposal accepted successfully');
          break;
        case 'reject':
          await proposalsApi.rejectProposal(proposalId, data?.reason);
          showNotification('success', 'Success', 'Proposal rejected');
          break;
        case 'shortlist':
          await proposalsApi.shortlistProposal(proposalId);
          showNotification('success', 'Success', 'Proposal shortlisted');
          break;
        case 'unshortlist':
          await proposalsApi.unshortlistProposal(proposalId);
          showNotification('success', 'Success', 'Proposal removed from shortlist');
          break;
        case 'message':
          await proposalsApi.messageFreelancer(proposalId, data?.message);
          showNotification('success', 'Success', 'Message sent to freelancer');
          break;
        default:
          throw new Error('Unknown action');
      }
      loadProposals(); // Refresh proposals
      setShowConfirm(false);
      setShowMessageModal(false);
      setSelectedProposal(null);
      setActionType(null);
      setMessageText('');
      setRejectionReason('');
    } catch (error: any) {
      showNotification('error', 'Error', error.message || `Failed to ${action} proposal`);
    } finally {
      setModalLoading(false);
    }
  };

  const handleActionClick = (proposal: Proposal, action: 'accept' | 'reject' | 'shortlist' | 'unshortlist') => {
    setSelectedProposal(proposal);
    setActionType(action);
    setShowConfirm(true);
  };

  const handleMessageClick = (proposal: Proposal) => {
    setSelectedProposal(proposal);
    setShowMessageModal(true);
  };

  const proposalsWithActions: ProposalWithActions[] = useMemo(() =>
    proposals.map(proposal => ({
      ...proposal,
      actions: (
        <div className="flex items-center space-x-2">
          <button
            onClick={() => console.log('View proposal details:', proposal.id)}
            className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
            title="View Details"
          >
            <Eye className="w-4 h-4" />
          </button>

          <button
            onClick={() => handleMessageClick(proposal)}
            className="p-1 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded"
            title="Message Freelancer"
          >
            <MessageSquare className="w-4 h-4" />
          </button>

          {proposal.status === 'pending' && (
            <>
              <button
                onClick={() => handleActionClick(proposal, 'shortlist')}
                className="p-1 text-gray-500 hover:text-yellow-600 hover:bg-yellow-50 rounded"
                title="Shortlist"
              >
                <Star className="w-4 h-4" />
              </button>

              <button
                onClick={() => handleActionClick(proposal, 'accept')}
                className="p-1 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded"
                title="Accept Proposal"
              >
                <CheckCircle className="w-4 h-4" />
              </button>

              <button
                onClick={() => handleActionClick(proposal, 'reject')}
                className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                title="Reject Proposal"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          )}

          {proposal.status === 'shortlisted' && (
            <button
              onClick={() => handleActionClick(proposal, 'unshortlist')}
              className="p-1 text-gray-500 hover:text-gray-600 hover:bg-gray-50 rounded"
              title="Remove from Shortlist"
            >
              <StarOff className="w-4 h-4" />
            </button>
          )}
        </div>
      )
    })), [proposals]
  );

  const columns = [
    {
      key: 'jobTitle',
      header: 'Job',
      render: (value: string) => (
        <div className="flex items-center space-x-2">
          <FileText className="w-4 h-4 text-gray-400" />
          <span className="font-medium text-gray-900 truncate max-w-xs">{value}</span>
        </div>
      ),
    },
    {
      key: 'freelancerName',
      header: 'Freelancer',
      render: (value: string) => (
        <div className="flex items-center space-x-2">
          <User className="w-4 h-4 text-gray-400" />
          <span className="text-gray-700">{value}</span>
        </div>
      ),
    },
    {
      key: 'proposedAmount',
      header: 'Proposed Amount',
      render: (value: number) => (
        <div className="flex items-center space-x-1">
          <DollarSign className="w-4 h-4 text-green-500" />
          <span className="font-semibold text-green-600">${value.toFixed(2)}</span>
        </div>
      ),
    },
    {
      key: 'proposedTimeline',
      header: 'Timeline',
      render: (value: number) => (
        <div className="flex items-center space-x-1">
          <Clock className="w-4 h-4 text-blue-500" />
          <span className="text-blue-600">{value} days</span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (value: string) => <StatusBadge status={value} type="proposal" />,
    },
    {
      key: 'createdAt',
      header: 'Submitted',
      render: (value: string) => (
        <div className="flex items-center space-x-1 text-sm text-gray-500">
          <Calendar className="w-4 h-4" />
          <span>{new Date(value).toLocaleDateString()}</span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (value: React.ReactNode) => value,
    },
  ];

  const getModalConfig = () => {
    if (!actionType || !selectedProposal) return {};

    switch (actionType) {
      case 'accept':
        return {
          title: 'Accept Proposal',
          message: `Are you sure you want to accept the proposal from ${selectedProposal.freelancerName}? This will create a contract.`,
          confirmLabel: 'Accept Proposal',
          variant: 'info' as const,
        };
      case 'reject':
        return {
          title: 'Reject Proposal',
          message: `Are you sure you want to reject the proposal from ${selectedProposal.freelancerName}?`,
          confirmLabel: 'Reject Proposal',
          variant: 'danger' as const,
        };
      case 'shortlist':
        return {
          title: 'Shortlist Proposal',
          message: `Add ${selectedProposal.freelancerName}'s proposal to your shortlist?`,
          confirmLabel: 'Shortlist',
          variant: 'warning' as const,
        };
      case 'unshortlist':
        return {
          title: 'Remove from Shortlist',
          message: `Remove ${selectedProposal.freelancerName}'s proposal from your shortlist?`,
          confirmLabel: 'Remove',
          variant: 'warning' as const,
        };
      default:
        return {};
    }
  };

  const modalConfig = getModalConfig();

  if (error && !proposals.length) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
        <p className="text-red-700">{error}</p>
        <button
          onClick={loadProposals}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Proposals & Offers</h1>
          <p className="mt-1 text-gray-600">Review and manage proposals from freelancers</p>
        </div>
        <div className="mt-4 sm:mt-0">
          <button
            onClick={loadProposals}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            <Clock className="w-4 h-4 mr-2" />
            Refresh
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search proposals..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: 'All Proposals', count: proposals.length },
              { key: 'pending', label: 'Pending', count: proposals.filter(p => p.status === 'pending').length },
              { key: 'shortlisted', label: 'Shortlisted', count: proposals.filter(p => p.status === 'shortlisted').length },
              { key: 'accepted', label: 'Accepted', count: proposals.filter(p => p.status === 'accepted').length },
              { key: 'rejected', label: 'Rejected', count: proposals.filter(p => p.status === 'rejected').length },
            ].map(({ key, label, count }) => (
              <button
                key={key}
                onClick={() => setFilter(key as any)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  filter === key
                    ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                    : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                }`}
              >
                {label} ({count})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Proposals Table */}
      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-6">
            <Skeleton type="table" />
          </div>
        </div>
      ) : proposalsWithActions.length === 0 ? (
        <EmptyState
          title="No proposals found"
          description={filter === 'all' ? "You haven't received any proposals yet." : `No ${filter} proposals found.`}
          icon={<FileText className="w-12 h-12 text-gray-400" />}
        />
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <Table
            columns={columns}
            data={proposalsWithActions}
            className="min-w-full divide-y divide-gray-200"
          />
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={showConfirm}
        title={modalConfig.title || ''}
        message={modalConfig.message || ''}
        onConfirm={() => {
          if (selectedProposal && actionType) {
            if (actionType === 'reject') {
              handleAction(selectedProposal.id, actionType, { reason: rejectionReason });
            } else {
              handleAction(selectedProposal.id, actionType);
            }
          }
        }}
        onCancel={() => {
          setShowConfirm(false);
          setSelectedProposal(null);
          setActionType(null);
          setRejectionReason('');
        }}
        confirmLabel={modalConfig.confirmLabel || 'Confirm'}
        cancelLabel="Cancel"
        variant={modalConfig.variant || 'danger'}
        loading={modalLoading}
      >
        {actionType === 'reject' && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Reason for rejection (optional)
            </label>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-red-500 focus:border-red-500"
              placeholder="Provide feedback to help the freelancer improve..."
            />
          </div>
        )}
      </ConfirmModal>

      {/* Message Modal */}
      <ConfirmModal
        isOpen={showMessageModal}
        title="Message Freelancer"
        message={`Send a message to ${selectedProposal?.freelancerName}`}
        onConfirm={() => {
          if (selectedProposal && messageText.trim()) {
            handleAction(selectedProposal.id, 'message', { message: messageText });
          }
        }}
        onCancel={() => {
          setShowMessageModal(false);
          setSelectedProposal(null);
          setMessageText('');
        }}
        confirmLabel="Send Message"
        cancelLabel="Cancel"
        variant="info"
        loading={modalLoading}
      >
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Message
          </label>
          <textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Type your message here..."
            required
          />
        </div>
      </ConfirmModal>
    </div>
  );
};

export default ProposalsOffers;
