import React, { useEffect, useMemo, useState } from 'react';
import { CMSService } from '../../services/cms';
import { useNotification } from '../../context/NotificationContext';
import type { KYCSubmission, KYCStatus, KYCDocument } from '../../services/kyc';
import { ConfirmModal } from '../shared/ConfirmModal';
import { Eye, RefreshCw } from 'lucide-react';

type KYCRequest = KYCSubmission & {
  user?: { id?: string; name?: string; email?: string };
};

const normalizeDocument = (doc: any): KYCDocument => ({
  id: doc.id,
  type: doc.type,
  fileId: doc.fileId ?? doc.file_id,
  fileUrl: doc.fileUrl ?? doc.file_url,
  status: doc.status,
  rejectionReason: doc.rejectionReason ?? doc.rejection_reason,
  uploadedAt: doc.uploadedAt ?? doc.uploaded_at
});

const normalizeSubmission = (raw: any): KYCRequest => ({
  id: raw.id,
  userId: raw.userId ?? raw.user_id,
  status: raw.status,
  submittedAt: raw.submittedAt ?? raw.submitted_at,
  reviewedAt: raw.reviewedAt ?? raw.reviewed_at,
  reviewedBy: raw.reviewedBy ?? raw.reviewed_by,
  rejectionReason: raw.rejectionReason ?? raw.rejection_reason,
  documents: Array.isArray(raw.documents) ? raw.documents.map(normalizeDocument) : [],
  personalInfo: raw.personalInfo ?? raw.personal_info,
  createdAt: raw.createdAt ?? raw.created_at,
  updatedAt: raw.updatedAt ?? raw.updated_at,
  user: raw.user
});

const normalizeStatus = (status?: string): KYCStatus => {
  const value = (status || '').toLowerCase();
  if (value === 'approved') return 'approved';
  if (value === 'rejected') return 'rejected';
  if (value === 'under_review') return 'under_review';
  if (value === 'requires_updates') return 'requires_updates';
  if (value === 'pending') return 'pending';
  return 'pending';
};

const prettifyType = (value?: string) =>
  (value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

const KYCTab = () => {
  const { showNotification } = useNotification();
  const [requests, setRequests] = useState<KYCRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<KYCRequest | null>(null);
  const [rejecting, setRejecting] = useState<KYCRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const list = await CMSService.getKYCRequests();
      const normalized = Array.isArray(list) ? list.map(normalizeSubmission) : [];
      setRequests(normalized);
    } catch (error: any) {
      showNotification('error', 'Load Failed', error?.message || 'Failed to load KYC requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  useEffect(() => {
    const handler = () => {
      loadRequests();
    };
    window.addEventListener('kyc.submitted', handler as EventListener);
    window.addEventListener('kyc.updated', handler as EventListener);
    return () => {
      window.removeEventListener('kyc.submitted', handler as EventListener);
      window.removeEventListener('kyc.updated', handler as EventListener);
    };
  }, []);

  const handleApprove = async (submission: KYCRequest) => {
    setActionLoading(true);
    try {
      await CMSService.updateKYCStatus(submission.id, 'approved');
      setRequests((prev) =>
        prev.map((item) =>
          item.id === submission.id
            ? { ...item, status: 'approved', rejectionReason: null }
            : item
        )
      );
      showNotification('success', 'Approved', 'KYC submission approved.');
    } catch (error: any) {
      showNotification('error', 'Action Failed', error?.message || 'Unable to approve submission.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejecting) return;
    setActionLoading(true);
    try {
      await CMSService.updateKYCStatus(rejecting.id, 'rejected', rejectReason || undefined);
      setRequests((prev) =>
        prev.map((item) =>
          item.id === rejecting.id
            ? { ...item, status: 'rejected', rejectionReason: rejectReason || item.rejectionReason }
            : item
        )
      );
      showNotification('success', 'Rejected', 'KYC submission rejected.');
      setRejecting(null);
      setRejectReason('');
    } catch (error: any) {
      showNotification('error', 'Action Failed', error?.message || 'Unable to reject submission.');
    } finally {
      setActionLoading(false);
    }
  };

  const rows = useMemo(() => requests || [], [requests]);

  const renderStatusBadge = (status?: string) => {
    const normalized = normalizeStatus(status);
    const styles =
      normalized === 'approved'
        ? 'bg-green-100 text-green-700'
        : normalized === 'rejected'
        ? 'bg-red-100 text-red-700'
        : normalized === 'requires_updates'
        ? 'bg-orange-100 text-orange-700'
        : normalized === 'under_review'
        ? 'bg-yellow-100 text-yellow-700'
        : 'bg-gray-100 text-gray-700';
    return (
      <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${styles}`}>
        {normalized.replace(/_/g, ' ')}
      </span>
    );
  };

  const documentCount = (documents?: KYCDocument[]) => (Array.isArray(documents) ? documents.length : 0);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">KYC Management</h2>
          <p className="text-xs text-gray-500">Review KYC submissions and approve or reject them.</p>
        </div>
        <button
          onClick={loadRequests}
          className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </button>
      </div>

      <table className="w-full text-sm text-left">
        <thead className="bg-gray-50 text-gray-500">
          <tr>
            <th className="px-6 py-3">User</th>
            <th className="px-6 py-3">Status</th>
            <th className="px-6 py-3">Submitted</th>
            <th className="px-6 py-3">Documents</th>
            <th className="px-6 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {loading ? (
            <tr>
              <td className="px-6 py-6 text-gray-500" colSpan={5}>
                Loading submissions...
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td className="px-6 py-6 text-gray-500" colSpan={5}>
                No KYC submissions yet.
              </td>
            </tr>
          ) : (
            rows.map((submission) => {
              const status = normalizeStatus(submission.status);
              const userName = submission.user?.name || submission.user?.email || submission.userId;
              const submittedAt = submission.submittedAt || submission.createdAt;
              return (
                <tr key={submission.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{userName || 'Unknown User'}</div>
                    {submission.user?.email && (
                      <div className="text-xs text-gray-500">{submission.user.email}</div>
                    )}
                  </td>
                  <td className="px-6 py-4">{renderStatusBadge(status)}</td>
                  <td className="px-6 py-4 text-gray-500">
                    {submittedAt ? new Date(submittedAt).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-6 py-4 text-gray-500">
                    {documentCount(submission.documents)} file(s)
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      className="inline-flex items-center text-blue-600 hover:bg-blue-50 px-2 py-1 rounded"
                      onClick={() => setSelected(submission)}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      View
                    </button>
                    {status === 'pending' || status === 'under_review' || status === 'requires_updates' ? (
                      <>
                        <button
                          onClick={() => handleApprove(submission)}
                          disabled={actionLoading}
                          className="text-green-600 hover:bg-green-50 px-2 py-1 rounded disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => {
                            setRejecting(submission);
                            setRejectReason('');
                          }}
                          disabled={actionLoading}
                          className="text-red-600 hover:bg-red-50 px-2 py-1 rounded disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">KYC Submission</h3>
                <p className="text-xs text-gray-500">{selected.user?.email || selected.userId}</p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-gray-400 hover:text-gray-600"
                type="button"
              >
                Close
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-xs text-gray-500">Full Name</div>
                  <div className="font-medium text-gray-900">
                    {selected.personalInfo?.firstName} {selected.personalInfo?.lastName}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Date of Birth</div>
                  <div className="font-medium text-gray-900">{selected.personalInfo?.dateOfBirth || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Nationality</div>
                  <div className="font-medium text-gray-900">{selected.personalInfo?.nationality || '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Phone</div>
                  <div className="font-medium text-gray-900">{selected.personalInfo?.phoneNumber || '—'}</div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-xs text-gray-500">Address</div>
                  <div className="font-medium text-gray-900">
                    {[selected.personalInfo?.address?.street, selected.personalInfo?.address?.city, selected.personalInfo?.address?.state, selected.personalInfo?.address?.postalCode, selected.personalInfo?.address?.country]
                      .filter(Boolean)
                      .join(', ') || '—'}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-2">Documents</h4>
                <div className="space-y-2">
                  {(selected.documents || []).map((doc) => (
                    <div
                      key={doc.id}
                      className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    >
                      <div>
                        <div className="font-medium text-gray-900">{prettifyType(doc.type)}</div>
                        <div className="text-xs text-gray-500">{doc.status}</div>
                      </div>
                      {doc.fileUrl ? (
                        <a
                          href={doc.fileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline text-xs"
                        >
                          View file
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400">No file</span>
                      )}
                    </div>
                  ))}
                  {(!selected.documents || selected.documents.length === 0) && (
                    <div className="text-sm text-gray-500">No documents uploaded.</div>
                  )}
                </div>
              </div>

              {selected.rejectionReason && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  Rejection Reason: {selected.rejectionReason}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={Boolean(rejecting)}
        title="Reject KYC Submission"
        message="Provide a reason for rejection (optional). The user will see this feedback."
        confirmLabel="Reject"
        cancelLabel="Cancel"
        variant="danger"
        loading={actionLoading}
        onConfirm={handleReject}
        onCancel={() => {
          setRejecting(null);
          setRejectReason('');
        }}
      >
        <textarea
          value={rejectReason}
          onChange={(event) => setRejectReason(event.target.value)}
          placeholder="Reason for rejection..."
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:ring-red-500 focus:border-red-500"
          rows={3}
        />
      </ConfirmModal>
    </div>
  );
};

export default KYCTab;
