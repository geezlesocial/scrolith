import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { proposalsApi, Proposal, AcceptProposalData } from '../../services/proposals';
import { MessagingService } from '../../services/messaging';
import { useNotification } from '../../context/NotificationContext';
import { useUser } from '../../context/UserContext';
import { Table } from '../shared/Table';
import { StatusBadge } from '../shared/StatusBadge';
import { Skeleton } from '../shared/Skeleton';
import EmptyState from '../shared/EmptyState';
import { ConfirmModal } from '../shared/ConfirmModal';
import { BriefsService } from '../../services/briefs';
import type { DealFlowSettings } from '../../types';
import AcceptProposalContractModal from '../../components/contracts/AcceptProposalContractModal';
import ProBadge from '../../components/ProBadge';
import { buildContractDashboardPath } from '../../utils/workflowNavigation';
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
  Search,
  Loader2
} from 'lucide-react';

interface ProposalWithActions extends Proposal {
  actions: React.ReactNode;
}

export const ProposalsOffers: React.FC = () => {
  const { user } = useUser();
  const { showNotification } = useNotification();
  const navigate = useNavigate();

  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'shortlisted' | 'accepted' | 'rejected'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modal states
  const [showConfirm, setShowConfirm] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [showInterviewModal, setShowInterviewModal] = useState(false);
  const [viewingProposal, setViewingProposal] = useState<Proposal | null>(null);
  const [openingProposalId, setOpeningProposalId] = useState<string | null>(null);
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [actionType, setActionType] = useState<'accept' | 'reject' | 'shortlist' | 'unshortlist' | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [dealFlowConfig, setDealFlowConfig] = useState<DealFlowSettings | null>(null);
  const [messageText, setMessageText] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [interviewDateTime, setInterviewDateTime] = useState('');
  const [interviewMode, setInterviewMode] = useState<'virtual' | 'onsite' | 'phone'>('virtual');
  const [interviewLocation, setInterviewLocation] = useState('');
  const [interviewNotes, setInterviewNotes] = useState('');

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

  useEffect(() => {
    let cancelled = false;
    const loadConfig = async () => {
      try {
        const config = await BriefsService.getConfig();
        if (!cancelled) setDealFlowConfig(config);
      } catch {
        if (!cancelled) setDealFlowConfig(null);
      }
    };
    void loadConfig();
    return () => {
      cancelled = true;
    };
  }, []);

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
          if (!user?.id) throw new Error('You must be signed in to message a freelancer.');
          if (!selectedProposal?.freelancerId) throw new Error('Freelancer details are unavailable for this proposal.');
          {
            const conversations = await MessagingService.getAllConversations(user.id, user.role as any, {
              force: true,
              limit: 200
            });
            const existing = conversations.find(
              (conversation) =>
                conversation.type === 'direct' &&
                conversation.participants.some((participant) => participant.id === selectedProposal.freelancerId)
            );
            const conversationId =
              existing?.id ||
              (await MessagingService.createConversation([user.id, selectedProposal.freelancerId], {
                type: 'direct'
              }));
            const message = `Regarding "${selectedProposal.jobTitle || 'your proposal'}": ${String(data?.message || '').trim()}`;
            await MessagingService.sendMessage(
              conversationId,
              user.id,
              message,
              String(user.role || 'employer'),
              [],
              null,
              { clientMessageId: `proposal-message:${proposalId}:${Date.now()}` }
            );
            showNotification('success', 'Message sent', 'The freelancer has been notified in Messages.');
            navigate(`/messages/${encodeURIComponent(conversationId)}`);
          }
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
    if (action === 'accept') {
      setShowAcceptModal(true);
      return;
    }
    setActionType(action);
    setShowConfirm(true);
  };

  const handleAcceptProposalSubmit = async (payload: AcceptProposalData) => {
    if (!selectedProposal) return;
    setModalLoading(true);
    try {
      const result = await proposalsApi.acceptProposal(selectedProposal.id, payload);
      showNotification('success', 'Contract Created', 'Proposal accepted and converted into an active contract.');
      setShowAcceptModal(false);
      setSelectedProposal(null);
      await loadProposals();
      if (result.contractId) {
        navigate(buildContractDashboardPath(result.contractId));
      }
    } catch (error: any) {
      showNotification('error', 'Contract Error', error?.message || 'Failed to create contract from proposal.');
    } finally {
      setModalLoading(false);
    }
  };

  const handleMessageClick = (proposal: Proposal) => {
    setSelectedProposal(proposal);
    setShowMessageModal(true);
  };

  const handleOpenProposal = async (proposal: Proposal) => {
    setOpeningProposalId(proposal.id);
    try {
      const fullProposal = await proposalsApi.getProposal(proposal.id);
      setViewingProposal(fullProposal);
      setProposals((current) =>
        current.map((item) => (item.id === fullProposal.id ? { ...item, ...fullProposal } : item))
      );
    } catch (error: any) {
      showNotification('error', 'Open Failed', error?.message || 'Unable to open application details.');
    } finally {
      setOpeningProposalId(null);
    }
  };

  const handleInterviewClick = (proposal: Proposal) => {
    setSelectedProposal(proposal);
    const existingAt = proposal.interviewScheduledAt ? new Date(proposal.interviewScheduledAt) : null;
    setInterviewDateTime(
      existingAt && !Number.isNaN(existingAt.getTime())
        ? new Date(existingAt.getTime() - existingAt.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
        : ''
    );
    setInterviewMode((proposal.interviewMode as any) || 'virtual');
    setInterviewLocation(proposal.interviewLocation || '');
    setInterviewNotes(proposal.interviewNotes || '');
    setShowInterviewModal(true);
  };

  const handleScheduleInterview = async () => {
    if (!selectedProposal) return;
    if (!interviewDateTime) {
      showNotification('error', 'Validation Error', 'Please choose an interview date and time.');
      return;
    }

    setModalLoading(true);
    try {
      const updated = await proposalsApi.scheduleInterview(selectedProposal.id, {
        scheduledAt: new Date(interviewDateTime).toISOString(),
        mode: interviewMode,
        location: interviewLocation || undefined,
        notes: interviewNotes || undefined
      });
      setProposals((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      setShowInterviewModal(false);
      setSelectedProposal(null);
      setInterviewDateTime('');
      setInterviewMode('virtual');
      setInterviewLocation('');
      setInterviewNotes('');
      showNotification('success', 'Interview Scheduled', 'The applicant has been notified in real time.');
    } catch (error: any) {
      showNotification('error', 'Schedule Failed', error?.message || 'Unable to schedule interview.');
    } finally {
      setModalLoading(false);
    }
  };

  const proposalsWithActions: ProposalWithActions[] = useMemo(() =>
    proposals.map(proposal => ({
      ...proposal,
      actions: (
        <div className="flex items-center space-x-2">
          <button
            onClick={() => handleOpenProposal(proposal)}
            className="p-1 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded inline-flex"
            title="Open Application"
          >
            {openingProposalId === proposal.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
          </button>

          <Link
            to={`/profile/${proposal.freelancerId}`}
            className="p-1 text-gray-500 hover:text-sky-600 hover:bg-sky-50 rounded inline-flex"
            title="View Profile"
          >
            <User className="w-4 h-4" />
          </Link>

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
            <>
              <button
                onClick={() => handleActionClick(proposal, 'unshortlist')}
                className="p-1 text-gray-500 hover:text-gray-600 hover:bg-gray-50 rounded"
                title="Remove from Shortlist"
              >
                <StarOff className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleInterviewClick(proposal)}
                className="p-1 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded"
                title="Schedule Interview"
              >
                <Calendar className="w-4 h-4" />
              </button>
            </>
          )}

          {proposal.status === 'pending' && (
            <button
              onClick={() => handleInterviewClick(proposal)}
              className="p-1 text-gray-500 hover:text-purple-600 hover:bg-purple-50 rounded"
              title="Schedule Interview"
            >
              <Calendar className="w-4 h-4" />
            </button>
          )}
        </div>
      )
    })), [proposals, openingProposalId, handleOpenProposal, handleMessageClick, handleActionClick, handleInterviewClick]
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
      render: (value: string, item: Proposal) => (
        <div className="flex items-center space-x-2">
          <User className="w-4 h-4 text-gray-400" />
          <span className="text-gray-700">{value}</span>
          <ProBadge role="freelancer" isPro={(item as any)?.freelancerIsPro} />
        </div>
      ),
    },
    {
      key: 'proposedAmount',
      header: 'Proposed Amount',
      render: (value: number) => (
        <div className="flex items-center space-x-1">
          <DollarSign className="w-4 h-4 text-green-500" />
          <span className="font-semibold text-green-600">{value > 0 ? `$${value.toFixed(2)}` : 'Not provided'}</span>
        </div>
      ),
    },
    {
      key: 'proposedTimeline',
      header: 'Timeline',
      render: (value: number) => (
        <div className="flex items-center space-x-1">
          <Clock className="w-4 h-4 text-blue-500" />
          <span className="text-blue-600">{value > 0 ? `${value} days` : 'Not provided'}</span>
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

      {viewingProposal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Application Details</h3>
                <p className="text-sm text-gray-500">{viewingProposal.jobTitle}</p>
              </div>
              <button
                onClick={() => setViewingProposal(null)}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close details"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[75vh] space-y-4 overflow-y-auto px-6 py-5">
              <div className="grid gap-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700 md:grid-cols-3">
                <div>
                  <div className="text-xs uppercase text-slate-500">Freelancer</div>
                  <div className="font-semibold text-slate-900">{viewingProposal.freelancerName}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-slate-500">Amount</div>
                  <div className="font-semibold text-slate-900">{viewingProposal.proposedAmount > 0 ? `$${viewingProposal.proposedAmount.toFixed(2)}` : 'Not provided'}</div>
                </div>
                <div>
                  <div className="text-xs uppercase text-slate-500">Timeline</div>
                  <div className="font-semibold text-slate-900">{viewingProposal.proposedTimeline > 0 ? `${viewingProposal.proposedTimeline} days` : 'Not provided'}</div>
                </div>
              </div>

              <div>
                <h4 className="mb-1 text-sm font-semibold text-gray-900">Cover Letter</h4>
                <p className="whitespace-pre-wrap rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-700">
                  {viewingProposal.coverLetter || 'No cover letter provided.'}
                </p>
              </div>

              {Array.isArray(viewingProposal.attachments) && viewingProposal.attachments.length > 0 && (
                <div>
                  <h4 className="mb-1 text-sm font-semibold text-gray-900">Attachments</h4>
                  <div className="space-y-2">
                    {viewingProposal.attachments.map((attachment, index) => (
                      <a
                        key={`${attachment}-${index}`}
                        href={attachment}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate rounded border border-slate-200 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50"
                      >
                        {attachment}
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                View count: <span className="font-semibold">{viewingProposal.clientViewCount || 0}</span>
                {viewingProposal.clientViewedAt ? (
                  <span> | Last opened: {new Date(viewingProposal.clientViewedAt).toLocaleString()}</span>
                ) : null}
              </div>
            </div>

            <div className="flex justify-end border-t border-gray-200 px-6 py-4">
              <button
                onClick={() => setViewingProposal(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showInterviewModal && selectedProposal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Schedule Interview</h3>
                <p className="text-sm text-gray-500">{selectedProposal.freelancerName}</p>
              </div>
              <button
                onClick={() => {
                  setShowInterviewModal(false);
                  setSelectedProposal(null);
                }}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close interview modal"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 px-6 py-5">
              <label className="block text-sm">
                <span className="mb-1 block font-medium text-gray-700">Date & Time</span>
                <input
                  type="datetime-local"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={interviewDateTime}
                  onChange={(e) => setInterviewDateTime(e.target.value)}
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block font-medium text-gray-700">Mode</span>
                <select
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={interviewMode}
                  onChange={(e) => setInterviewMode(e.target.value as any)}
                >
                  <option value="virtual">Virtual</option>
                  <option value="onsite">On-site</option>
                  <option value="phone">Phone</option>
                </select>
              </label>

              <label className="block text-sm">
                <span className="mb-1 block font-medium text-gray-700">Location / Link</span>
                <input
                  type="text"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="Meet link or address"
                  value={interviewLocation}
                  onChange={(e) => setInterviewLocation(e.target.value)}
                />
              </label>

              <label className="block text-sm">
                <span className="mb-1 block font-medium text-gray-700">Notes</span>
                <textarea
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  placeholder="Agenda, preparation instructions, or required documents."
                  value={interviewNotes}
                  onChange={(e) => setInterviewNotes(e.target.value)}
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4">
              <button
                onClick={() => {
                  setShowInterviewModal(false);
                  setSelectedProposal(null);
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                disabled={modalLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleScheduleInterview}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-70"
                disabled={modalLoading}
              >
                {modalLoading ? 'Scheduling...' : 'Schedule & Notify'}
              </button>
            </div>
          </div>
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

      <AcceptProposalContractModal
        open={showAcceptModal}
        proposal={selectedProposal}
        dealFlowConfig={dealFlowConfig}
        loading={modalLoading}
        onClose={() => {
          if (modalLoading) return;
          setShowAcceptModal(false);
          setSelectedProposal(null);
        }}
        onSubmit={handleAcceptProposalSubmit}
      />

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
