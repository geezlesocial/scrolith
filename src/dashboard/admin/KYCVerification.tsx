import React, { useEffect, useMemo, useState } from 'react';
import { CMSService } from '../../services/cms';
import { useNotification } from '../../context/NotificationContext';
import { kycApi } from '../../services/kyc';
import type {
  KYCSubmission,
  KYCStatus,
  KYCDocument,
  KYCFormConfig,
  KYCPersonalFieldConfig,
  KYCDocumentGroupConfig,
  KYCDocumentOptionConfig
} from '../../services/kyc';
import { ConfirmModal } from '../shared/ConfirmModal';
import { Eye, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';

type KYCRequest = KYCSubmission & {
  user?: { id?: string; name?: string; email?: string };
};

const normalizeDocument = (doc: any): KYCDocument => ({
  id: doc.id,
  type: doc.type,
  fileId: doc.fileId ?? doc.file_id,
  fileUrl: null,
  status: doc.status,
  rejectionReason: doc.rejectionReason ?? doc.rejection_reason,
  uploadedAt: doc.uploadedAt ?? doc.uploaded_at,
  secureView: Boolean(doc.secureView ?? doc.secure_view),
  scanStatus: doc.scanStatus ?? doc.scan_status,
  quarantineStatus: doc.quarantineStatus ?? doc.quarantine_status
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

const createEmptyDocumentOption = (): KYCDocumentOptionConfig => ({
  key: `custom_doc_${Date.now()}`,
  label: 'Custom Document',
  description: '',
  required: false,
  cameraOnly: false,
  accept: 'image/*,application/pdf'
});

const createEmptyDocumentGroup = (): KYCDocumentGroupConfig => ({
  key: `custom_group_${Date.now()}`,
  label: 'Custom Group',
  description: '',
  required: false,
  minRequired: 0,
  options: [createEmptyDocumentOption()]
});

const KYCTab = () => {
  const { showNotification } = useNotification();
  const [requests, setRequests] = useState<KYCRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<KYCRequest | null>(null);
  const [rejecting, setRejecting] = useState<KYCRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [formConfig, setFormConfig] = useState<KYCFormConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);

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

  const loadFormConfig = async () => {
    setConfigLoading(true);
    try {
      const config = await kycApi.getKYCFormConfigAdmin();
      setFormConfig(config);
    } catch (error: any) {
      showNotification('error', 'Load Failed', error?.message || 'Failed to load KYC form config.');
    } finally {
      setConfigLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
    loadFormConfig();
  }, []);

  useEffect(() => {
    const handler = () => {
      loadRequests();
      loadFormConfig();
    };
    window.addEventListener('kyc.submitted', handler as EventListener);
    window.addEventListener('kyc.updated', handler as EventListener);
    return () => {
      window.removeEventListener('kyc.submitted', handler as EventListener);
      window.removeEventListener('kyc.updated', handler as EventListener);
    };
  }, []);

  const updateCopyField = (key: keyof KYCFormConfig['copy'], value: string) => {
    setFormConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        copy: {
          ...prev.copy,
          [key]: value
        }
      };
    });
  };

  const updatePersonalField = (index: number, patch: Partial<KYCPersonalFieldConfig>) => {
    setFormConfig((prev) => {
      if (!prev) return prev;
      const next = [...(prev.personalFields || [])];
      next[index] = { ...next[index], ...patch };
      return { ...prev, personalFields: next };
    });
  };

  const updateDocumentGroup = (index: number, patch: Partial<KYCDocumentGroupConfig>) => {
    setFormConfig((prev) => {
      if (!prev) return prev;
      const next = [...(prev.documentGroups || [])];
      next[index] = { ...next[index], ...patch };
      return { ...prev, documentGroups: next };
    });
  };

  const updateDocumentOption = (
    groupIndex: number,
    optionIndex: number,
    patch: Partial<KYCDocumentOptionConfig>
  ) => {
    setFormConfig((prev) => {
      if (!prev) return prev;
      const groups = [...(prev.documentGroups || [])];
      const group = groups[groupIndex];
      if (!group) return prev;
      const options = [...(group.options || [])];
      options[optionIndex] = { ...options[optionIndex], ...patch };
      groups[groupIndex] = { ...group, options };
      return { ...prev, documentGroups: groups };
    });
  };

  const addDocumentOption = (groupIndex: number) => {
    setFormConfig((prev) => {
      if (!prev) return prev;
      const groups = [...(prev.documentGroups || [])];
      const group = groups[groupIndex];
      if (!group) return prev;
      groups[groupIndex] = { ...group, options: [...(group.options || []), createEmptyDocumentOption()] };
      return { ...prev, documentGroups: groups };
    });
  };

  const removeDocumentOption = (groupIndex: number, optionIndex: number) => {
    setFormConfig((prev) => {
      if (!prev) return prev;
      const groups = [...(prev.documentGroups || [])];
      const group = groups[groupIndex];
      if (!group || !Array.isArray(group.options) || group.options.length <= 1) return prev;
      groups[groupIndex] = {
        ...group,
        options: group.options.filter((_, idx) => idx !== optionIndex)
      };
      return { ...prev, documentGroups: groups };
    });
  };

  const addDocumentGroup = () => {
    setFormConfig((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        documentGroups: [...(prev.documentGroups || []), createEmptyDocumentGroup()]
      };
    });
  };

  const removeDocumentGroup = (groupIndex: number) => {
    setFormConfig((prev) => {
      if (!prev) return prev;
      if ((prev.documentGroups || []).length <= 1) return prev;
      return {
        ...prev,
        documentGroups: (prev.documentGroups || []).filter((_, idx) => idx !== groupIndex)
      };
    });
  };

  const saveFormConfig = async () => {
    if (!formConfig) return;
    setConfigSaving(true);
    try {
      const saved = await kycApi.updateKYCFormConfigAdmin(formConfig);
      setFormConfig(saved);
      showNotification('success', 'Saved', 'KYC form configuration updated successfully.');
    } catch (error: any) {
      showNotification('error', 'Save Failed', error?.message || 'Failed to save KYC form configuration.');
    } finally {
      setConfigSaving(false);
    }
  };

  const [approving, setApproving] = useState<KYCRequest | null>(null);
  const [approveReason, setApproveReason] = useState('');
  const [resubmitting, setResubmitting] = useState<KYCRequest | null>(null);
  const [resubmitReason, setResubmitReason] = useState('');
  const [viewingDocId, setViewingDocId] = useState<string | null>(null);

  const runDecision = async (
    submission: KYCRequest,
    status: 'approved' | 'rejected' | 'requires_updates',
    reason: string
  ) => {
    const trimmed = String(reason || '').trim();
    if (trimmed.length < 3) {
      showNotification('error', 'Reason required', 'A decision reason of at least 3 characters is required.');
      return;
    }
    setActionLoading(true);
    try {
      await kycApi.updateKYCStatus(submission.id, status, trimmed);
      setRequests((prev) =>
        prev.map((item) =>
          item.id === submission.id
            ? {
                ...item,
                status,
                rejectionReason: status === 'approved' ? undefined : trimmed
              }
            : item
        )
      );
      showNotification('success', 'Decision recorded', `KYC submission marked ${status.replace(/_/g, ' ')}.`);
      setApproving(null);
      setApproveReason('');
      setRejecting(null);
      setRejectReason('');
      setResubmitting(null);
      setResubmitReason('');
    } catch (error: any) {
      const message =
        error?.response?.data?.error || error?.message || 'Unable to update KYC decision.';
      showNotification('error', 'Action Failed', message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!approving) return;
    await runDecision(approving, 'approved', approveReason);
  };

  const handleReject = async () => {
    if (!rejecting) return;
    await runDecision(rejecting, 'rejected', rejectReason);
  };

  const handleResubmit = async () => {
    if (!resubmitting) return;
    await runDecision(resubmitting, 'requires_updates', resubmitReason);
  };

  const handleSecureView = async (documentId: string) => {
    setViewingDocId(documentId);
    try {
      const view = await kycApi.viewDocumentSecure(documentId);
      if (view.signedUrl) {
        // Short-lived URL only in memory; open and do not persist
        window.open(view.signedUrl, '_blank', 'noopener,noreferrer');
      } else if (view.streamPath) {
        // Authenticated stream path relative to API — open via API base not public media
        showNotification(
          'info',
          'Secure stream',
          'Signed URL unavailable; use stream mode from an authorized session.'
        );
      } else {
        showNotification('error', 'Unavailable', 'Document is not available through the secure viewer.');
      }
    } catch (error: any) {
      const status = Number(error?.response?.status || 0);
      const code = String(error?.response?.data?.code || '');
      if (status === 403 || code === 'FORBIDDEN') {
        showNotification('error', 'Permission denied', 'You do not have permission to view KYC documents.');
      } else if (code === 'LEGACY_DOCUMENT') {
        showNotification(
          'error',
          'Legacy document',
          'This document was uploaded before private KYC storage. Ask the user to re-upload securely.'
        );
      } else {
        showNotification('error', 'View failed', error?.response?.data?.error || error?.message || 'Unable to view document.');
      }
    } finally {
      setViewingDocId(null);
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
          onClick={() => {
            loadRequests();
            loadFormConfig();
          }}
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
                          onClick={() => {
                            setApproving(submission);
                            setApproveReason('');
                          }}
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
                        <button
                          onClick={() => {
                            setResubmitting(submission);
                            setResubmitReason('');
                          }}
                          disabled={actionLoading}
                          className="text-orange-600 hover:bg-orange-50 px-2 py-1 rounded disabled:opacity-50"
                        >
                          Resubmit
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

      <div className="border-t border-gray-200 bg-gray-50 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">KYC Form Management</h3>
            <p className="text-xs text-gray-500">
              Configure KYC form copy, field requirements, document options, and camera-only capture rules.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadFormConfig}
              className="inline-flex items-center px-3 py-2 text-xs font-semibold text-gray-700 border border-gray-200 rounded-lg hover:bg-white"
              disabled={configLoading || configSaving}
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Reload Form
            </button>
            <button
              type="button"
              onClick={saveFormConfig}
              className="inline-flex items-center px-3 py-2 text-xs font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-60"
              disabled={!formConfig || configLoading || configSaving}
            >
              <Save className="w-4 h-4 mr-1" />
              {configSaving ? 'Saving...' : 'Save Form Config'}
            </button>
          </div>
        </div>

        {configLoading && !formConfig ? (
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
            Loading KYC form configuration...
          </div>
        ) : formConfig ? (
          <div className="space-y-6">
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">General Copy</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <label className="text-xs text-gray-600">
                  Form Title
                  <input
                    className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                    value={formConfig.copy.title}
                    onChange={(event) => updateCopyField('title', event.target.value)}
                  />
                </label>
                <label className="text-xs text-gray-600">
                  Form Subtitle
                  <input
                    className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                    value={formConfig.copy.subtitle}
                    onChange={(event) => updateCopyField('subtitle', event.target.value)}
                  />
                </label>
                <label className="text-xs text-gray-600 md:col-span-2">
                  Intro Message
                  <textarea
                    className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                    rows={2}
                    value={formConfig.copy.introMessage}
                    onChange={(event) => updateCopyField('introMessage', event.target.value)}
                  />
                </label>
                <label className="text-xs text-gray-600">
                  Personal Section Title
                  <input
                    className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                    value={formConfig.copy.personalSectionTitle}
                    onChange={(event) => updateCopyField('personalSectionTitle', event.target.value)}
                  />
                </label>
                <label className="text-xs text-gray-600">
                  Address Section Title
                  <input
                    className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                    value={formConfig.copy.addressSectionTitle}
                    onChange={(event) => updateCopyField('addressSectionTitle', event.target.value)}
                  />
                </label>
                <label className="text-xs text-gray-600">
                  Documents Section Title
                  <input
                    className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                    value={formConfig.copy.documentsSectionTitle}
                    onChange={(event) => updateCopyField('documentsSectionTitle', event.target.value)}
                  />
                </label>
                <label className="text-xs text-gray-600">
                  Submit Button Label
                  <input
                    className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                    value={formConfig.copy.submitLabel}
                    onChange={(event) => updateCopyField('submitLabel', event.target.value)}
                  />
                </label>
                <label className="text-xs text-gray-600">
                  Update Button Label
                  <input
                    className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
                    value={formConfig.copy.updateLabel}
                    onChange={(event) => updateCopyField('updateLabel', event.target.value)}
                  />
                </label>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <h4 className="text-sm font-semibold text-gray-900 mb-3">Personal Fields</h4>
              <div className="space-y-3">
                {(formConfig.personalFields || []).map((field, index) => (
                  <div key={`${field.key}-${index}`} className="grid grid-cols-1 md:grid-cols-6 gap-2 rounded-lg border border-gray-100 p-3">
                    <label className="text-xs text-gray-600 md:col-span-2">
                      Label
                      <input
                        className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                        value={field.label}
                        onChange={(event) => updatePersonalField(index, { label: event.target.value })}
                      />
                    </label>
                    <label className="text-xs text-gray-600">
                      Key
                      <input
                        className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                        value={String(field.key)}
                        onChange={(event) => updatePersonalField(index, { key: event.target.value })}
                      />
                    </label>
                    <label className="text-xs text-gray-600">
                      Type
                      <input
                        className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                        value={String(field.type || 'text')}
                        onChange={(event) => updatePersonalField(index, { type: event.target.value })}
                      />
                    </label>
                    <label className="text-xs text-gray-600">
                      Section
                      <input
                        className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                        value={String(field.section || 'personal')}
                        onChange={(event) => updatePersonalField(index, { section: event.target.value })}
                      />
                    </label>
                    <label className="text-xs text-gray-600">
                      Order
                      <input
                        type="number"
                        className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                        value={Number(field.order || 0)}
                        onChange={(event) => updatePersonalField(index, { order: Number(event.target.value || 0) })}
                      />
                    </label>
                    <label className="text-xs text-gray-600 md:col-span-3">
                      Placeholder
                      <input
                        className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                        value={field.placeholder || ''}
                        onChange={(event) => updatePersonalField(index, { placeholder: event.target.value })}
                      />
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                      <input
                        type="checkbox"
                        checked={Boolean(field.enabled)}
                        onChange={(event) => updatePersonalField(index, { enabled: event.target.checked })}
                      />
                      Enabled
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                      <input
                        type="checkbox"
                        checked={Boolean(field.required)}
                        onChange={(event) => updatePersonalField(index, { required: event.target.checked })}
                      />
                      Required
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-900">Document Groups</h4>
                <button
                  type="button"
                  onClick={addDocumentGroup}
                  className="inline-flex items-center rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add Group
                </button>
              </div>
              {(formConfig.documentGroups || []).map((group, groupIndex) => (
                <div key={`${group.key}-${groupIndex}`} className="rounded-lg border border-gray-100 p-3 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end">
                    <label className="text-xs text-gray-600 md:col-span-2">
                      Group Label
                      <input
                        className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                        value={group.label}
                        onChange={(event) => updateDocumentGroup(groupIndex, { label: event.target.value })}
                      />
                    </label>
                    <label className="text-xs text-gray-600">
                      Group Key
                      <input
                        className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                        value={group.key}
                        onChange={(event) => updateDocumentGroup(groupIndex, { key: event.target.value })}
                      />
                    </label>
                    <label className="text-xs text-gray-600">
                      Min Required
                      <input
                        type="number"
                        min={0}
                        className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                        value={Number(group.minRequired || 0)}
                        onChange={(event) => updateDocumentGroup(groupIndex, { minRequired: Number(event.target.value || 0) })}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => removeDocumentGroup(groupIndex)}
                      className="inline-flex items-center justify-center rounded-md border border-red-200 px-2 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-3.5 h-3.5 mr-1" />
                      Remove
                    </button>
                    <label className="inline-flex items-center gap-2 text-xs text-gray-700 md:col-span-2">
                      <input
                        type="checkbox"
                        checked={Boolean(group.required)}
                        onChange={(event) => updateDocumentGroup(groupIndex, { required: event.target.checked })}
                      />
                      Required Group
                    </label>
                  </div>
                  <label className="text-xs text-gray-600 block">
                    Description
                    <input
                      className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                      value={group.description || ''}
                      onChange={(event) => updateDocumentGroup(groupIndex, { description: event.target.value })}
                    />
                  </label>

                  <div className="space-y-2">
                    {(group.options || []).map((option, optionIndex) => (
                      <div key={`${option.key}-${optionIndex}`} className="grid grid-cols-1 md:grid-cols-7 gap-2 rounded-md border border-gray-100 p-2">
                        <label className="text-xs text-gray-600 md:col-span-2">
                          Label
                          <input
                            className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                            value={option.label}
                            onChange={(event) =>
                              updateDocumentOption(groupIndex, optionIndex, { label: event.target.value })
                            }
                          />
                        </label>
                        <label className="text-xs text-gray-600">
                          Key
                          <input
                            className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                            value={String(option.key)}
                            onChange={(event) =>
                              updateDocumentOption(groupIndex, optionIndex, { key: event.target.value })
                            }
                          />
                        </label>
                        <label className="text-xs text-gray-600 md:col-span-2">
                          Accept
                          <input
                            className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                            value={option.accept}
                            onChange={(event) =>
                              updateDocumentOption(groupIndex, optionIndex, { accept: event.target.value })
                            }
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => removeDocumentOption(groupIndex, optionIndex)}
                          className="inline-flex items-center justify-center rounded-md border border-red-200 px-2 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-1" />
                          Remove
                        </button>
                        <label className="text-xs text-gray-600 md:col-span-3">
                          Description
                          <input
                            className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                            value={option.description || ''}
                            onChange={(event) =>
                              updateDocumentOption(groupIndex, optionIndex, { description: event.target.value })
                            }
                          />
                        </label>
                        <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                          <input
                            type="checkbox"
                            checked={Boolean(option.required)}
                            onChange={(event) =>
                              updateDocumentOption(groupIndex, optionIndex, { required: event.target.checked })
                            }
                          />
                          Required
                        </label>
                        <label className="inline-flex items-center gap-2 text-xs text-gray-700">
                          <input
                            type="checkbox"
                            checked={Boolean(option.cameraOnly)}
                            onChange={(event) =>
                              updateDocumentOption(groupIndex, optionIndex, { cameraOnly: event.target.checked })
                            }
                          />
                          Camera only
                        </label>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addDocumentOption(groupIndex)}
                      className="inline-flex items-center rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Add Option
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Unable to load KYC form configuration.
          </div>
        )}
      </div>

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
                      {doc.secureView || doc.id ? (
                        <button
                          type="button"
                          disabled={viewingDocId === doc.id}
                          onClick={() => void handleSecureView(doc.id)}
                          className="text-blue-600 hover:underline text-xs disabled:opacity-50"
                        >
                          {viewingDocId === doc.id ? 'Opening…' : 'Secure view'}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400">No secure file</span>
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
        isOpen={Boolean(approving)}
        title="Approve KYC Submission"
        message="Provide a mandatory decision reason. Final approval is recorded in the KYC audit trail."
        confirmLabel="Approve"
        cancelLabel="Cancel"
        variant="info"
        loading={actionLoading}
        onConfirm={handleApprove}
        onCancel={() => {
          setApproving(null);
          setApproveReason('');
        }}
      >
        <textarea
          className="mt-3 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
          rows={3}
          value={approveReason}
          onChange={(event) => setApproveReason(event.target.value)}
          placeholder="Decision reason (required)"
        />
      </ConfirmModal>

      <ConfirmModal
        isOpen={Boolean(resubmitting)}
        title="Request KYC Resubmission"
        message="Provide a mandatory reason so the user knows what to correct."
        confirmLabel="Request resubmission"
        cancelLabel="Cancel"
        variant="info"
        loading={actionLoading}
        onConfirm={handleResubmit}
        onCancel={() => {
          setResubmitting(null);
          setResubmitReason('');
        }}
      >
        <textarea
          className="mt-3 w-full rounded-md border border-gray-200 px-3 py-2 text-sm"
          rows={3}
          value={resubmitReason}
          onChange={(event) => setResubmitReason(event.target.value)}
          placeholder="Resubmission reason (required)"
        />
      </ConfirmModal>

      <ConfirmModal
        isOpen={Boolean(rejecting)}
        title="Reject KYC Submission"
        message="Provide a mandatory reason for rejection. The user will see this feedback."
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
