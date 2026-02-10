import React, { useEffect, useMemo, useState } from 'react';
import { useUser } from '../../context/UserContext';
import { useNotification } from '../../context/NotificationContext';
import { proposalsApi, Proposal } from '../../services/proposals';
import Skeleton from '../shared/Skeleton';
import StatusBadge from '../shared/StatusBadge';
import { Search, RefreshCw, FileText, DollarSign, Clock, Calendar, MessageSquare, XCircle } from 'lucide-react';
import ConfirmModal from '../shared/ConfirmModal';
import { Link } from 'react-router-dom';
import ProBadge from '../../components/ProBadge';

type Filter = 'all' | 'pending' | 'shortlisted' | 'accepted' | 'rejected' | 'withdrawn';

export default function MyProposals() {
  const { user } = useUser();
  const { showNotification } = useNotification();

  const [loading, setLoading] = useState(true);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const limit = 20;

  const [withdrawId, setWithdrawId] = useState<string | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);

  const load = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const response = await proposalsApi.getMyProposals({
        status: filter === 'all' ? undefined : filter,
        search: searchTerm || undefined,
        page,
        limit
      });

      setProposals(response.proposals || []);
    } catch (e: any) {
      console.error('Failed to load my proposals:', e);
      showNotification('error', 'Load Error', e.message || 'Failed to load proposals');
      setProposals([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, filter, searchTerm, page]);

  const filtered = useMemo(() => proposals, [proposals]);

  const withdraw = async () => {
    if (!withdrawId) return;
    setWithdrawing(true);
    try {
      await proposalsApi.withdrawProposal(withdrawId);
      showNotification('success', 'Withdrawn', 'Proposal withdrawn successfully.');
      setWithdrawId(null);
      await load();
    } catch (e: any) {
      showNotification('error', 'Error', e.message || 'Failed to withdraw proposal');
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">My Proposals</h2>
          <p className="text-sm text-gray-500">Track your submitted proposals, shortlist status, and accepted offers.</p>
        </div>

        <button
          onClick={load}
          className="px-4 py-2 rounded-xl border bg-white text-sm font-bold hover:bg-gray-50 inline-flex items-center"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </button>
      </div>

      <div className="bg-white border rounded-2xl p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="flex items-center bg-gray-50 border rounded-xl px-3 py-2 w-full max-w-xl">
            <Search className="w-4 h-4 text-gray-400 mr-2" />
            <input
              className="bg-transparent outline-none w-full text-sm"
              placeholder="Search by job title..."
              value={searchTerm}
              onChange={(e) => {
                setPage(1);
                setSearchTerm(e.target.value);
              }}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {(['all', 'pending', 'shortlisted', 'accepted', 'rejected', 'withdrawn'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => {
                  setPage(1);
                  setFilter(f);
                }}
                className={`px-3 py-2 rounded-xl text-sm font-bold border ${
                  filter === f
                    ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                    : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {f === 'all' ? 'All' : f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <Skeleton rows={8} />
      ) : filtered.length === 0 ? (
        <div className="bg-white border rounded-2xl p-10 text-center text-gray-500">
          <p className="font-bold text-gray-900 mb-1">No proposals found</p>
          <p className="text-sm">When you submit proposals to jobs, they will appear here.</p>
          <Link
            to="/browse-jobs"
            className="mt-4 inline-block px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700"
          >
            Browse Jobs
          </Link>
        </div>
      ) : (
        <div className="bg-white border rounded-2xl overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                <th className="px-6 py-4">Job</th>
                <th className="px-6 py-4">Amount</th>
                <th className="px-6 py-4">Timeline</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Progress</th>
                <th className="px-6 py-4">Submitted</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-400" />
                      <span className="font-bold text-gray-900 truncate max-w-[420px]">{p.jobTitle}</span>
                    </div>
                    {p.clientName && (
                      <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                        <span>{p.clientName}</span>
                        <ProBadge role="employer" isPro={(p as any)?.clientIsPro} />
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mt-1">Job ID: {p.jobId}</div>
                  </td>

                  <td className="px-6 py-4">
                    <div className="inline-flex items-center gap-1 font-bold text-green-600">
                      <DollarSign className="w-4 h-4" />
                      {p.proposedAmount.toFixed(2)}
                    </div>
                  </td>

                  <td className="px-6 py-4">
                    <div className="inline-flex items-center gap-1 text-blue-600 font-bold">
                      <Clock className="w-4 h-4" />
                      {p.proposedTimeline} days
                    </div>
                  </td>

                  <td className="px-6 py-4">
                    <StatusBadge status={p.status} type="proposal" />
                  </td>

                  <td className="px-6 py-4">
                    <div className="space-y-1 text-xs">
                      <div className={`${p.clientViewedAt ? 'text-emerald-700' : 'text-gray-500'}`}>
                        {p.clientViewedAt
                          ? `Opened by employer (${p.clientViewCount || 1})`
                          : 'Awaiting first review'}
                      </div>
                      {p.topApplicantAt && <div className="text-indigo-700">Top applicant</div>}
                      {p.interviewScheduledAt && (
                        <div className="text-purple-700">
                          Interview: {new Date(p.interviewScheduledAt).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </td>

                  <td className="px-6 py-4">
                    <div className="inline-flex items-center gap-1 text-gray-500">
                      <Calendar className="w-4 h-4" />
                      {new Date(p.createdAt).toLocaleDateString()}
                    </div>
                  </td>

                  <td className="px-6 py-4 text-right space-x-2">
                    <Link
                      to={`/jobs/${p.jobId}`}
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border text-xs font-bold text-gray-700 hover:bg-gray-50"
                      title="View job"
                    >
                      View Job
                    </Link>

                    {p.status === 'accepted' && p.contractId && (
                      <Link
                        to={`/freelancer/dashboard/contracts?contract=${p.contractId}`}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700"
                        title="View contract"
                      >
                        View Contract
                      </Link>
                    )}

                    <Link
                      to="/messages"
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border text-xs font-bold text-gray-700 hover:bg-gray-50"
                      title="Open messages"
                    >
                      <MessageSquare className="w-4 h-4" />
                      Message
                    </Link>

                    {(p.status === 'pending' || p.status === 'shortlisted') && (
                      <button
                        onClick={() => setWithdrawId(p.id)}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border text-xs font-bold text-red-600 hover:bg-red-50"
                        title="Withdraw proposal"
                      >
                        <XCircle className="w-4 h-4" />
                        Withdraw
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="px-6 py-4 border-t flex justify-between items-center">
            <div className="text-xs text-gray-500">Page {page}</div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-2 rounded-lg border text-xs font-bold hover:bg-gray-50"
                disabled={page === 1}
              >
                Prev
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-2 rounded-lg border text-xs font-bold hover:bg-gray-50"
                disabled={proposals.length < limit}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!withdrawId}
        title="Withdraw this proposal?"
        message="This will cancel your proposal so the employer can no longer accept it."
        confirmLabel="Withdraw"
        cancelLabel="Cancel"
        variant="danger"
        loading={withdrawing}
        onCancel={() => setWithdrawId(null)}
        onConfirm={withdraw}
      />
    </div>
  );
}
