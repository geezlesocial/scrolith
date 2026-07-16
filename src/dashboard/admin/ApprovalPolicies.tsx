import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock3, FileCheck2, XCircle } from 'lucide-react';
import { AdminService } from '../../services/admin';
import { useNotification } from '../../context/NotificationContext';

const summaryCards = [
  { key: 'activePolicies', label: 'Active policies', icon: FileCheck2 },
  { key: 'observed', label: 'Observed', icon: Clock3 },
  { key: 'pending', label: 'Pending', icon: Clock3 },
  { key: 'approved', label: 'Approved', icon: CheckCircle2 },
  { key: 'rejected', label: 'Rejected', icon: XCircle }
];

const ApprovalPolicies: React.FC = () => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>({});
  const [policies, setPolicies] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [summaryData, policiesData, requestsData] = await Promise.all([
        AdminService.getApprovalPolicySummary(),
        AdminService.getApprovalPolicies(),
        AdminService.getApprovalRequests({ limit: 25 })
      ]);
      setSummary(summaryData || {});
      setPolicies(Array.isArray(policiesData) ? policiesData : []);
      setRequests(Array.isArray(requestsData) ? requestsData : []);
    } catch (error: any) {
      showNotification('alert', 'Error', error?.message || 'Failed to load approval policies');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updatePolicyMode = async (policy: any, mode: string) => {
    setSaving(policy.id);
    try {
      await AdminService.updateApprovalPolicy(policy.id, { ...policy, mode });
      showNotification('success', 'Saved', 'Approval policy updated');
      await load();
    } catch (error: any) {
      showNotification('alert', 'Error', error?.message || 'Failed to update approval policy');
    } finally {
      setSaving(null);
    }
  };

  const decide = async (requestId: string, decision: 'approve' | 'reject') => {
    setSaving(requestId);
    try {
      if (decision === 'approve') await AdminService.approveApprovalRequest(requestId, 'Reviewed from admin dashboard');
      else await AdminService.rejectApprovalRequest(requestId, 'Rejected from admin dashboard');
      showNotification('success', 'Saved', `Request ${decision}d`);
      await load();
    } catch (error: any) {
      showNotification('alert', 'Error', error?.message || `Failed to ${decision} request`);
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading approval governance...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-5">
        {summaryCards.map(({ key, label, icon: Icon }) => (
          <div key={key} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500">{label}</span>
              <Icon className="h-4 w-4 text-slate-400" />
            </div>
            <div className="mt-3 text-2xl font-semibold text-slate-900">{summary?.[key] ?? 0}</div>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Approval policies</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th className="pb-3">Label</th>
                <th className="pb-3">Scope</th>
                <th className="pb-3">Mode</th>
                <th className="pb-3">Approvals</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((policy) => (
                <tr key={policy.id} className="border-t border-slate-100">
                  <td className="py-3">
                    <div className="font-medium text-slate-900">{policy.label}</div>
                    <div className="text-xs text-slate-500">{policy.description || 'No description'}</div>
                  </td>
                  <td className="py-3 text-slate-600">{policy.moduleKey}.{policy.actionKey} / {policy.entityType}</td>
                  <td className="py-3">
                    <select
                      className="rounded-lg border border-slate-200 px-3 py-2"
                      value={policy.mode}
                      onChange={(event) => updatePolicyMode(policy, event.target.value)}
                      disabled={saving === policy.id}
                    >
                      <option value="AUDIT_ONLY">Audit only</option>
                      <option value="ENFORCED">Enforced</option>
                      <option value="DISABLED">Disabled</option>
                    </select>
                  </td>
                  <td className="py-3 text-slate-600">{policy.minApprovals}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Recent approval requests</h2>
        <div className="mt-4 space-y-3">
          {requests.map((request) => (
            <div key={request.id} className="rounded-lg border border-slate-100 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="font-medium text-slate-900">{request.title}</div>
                  <div className="mt-1 text-sm text-slate-600">{request.moduleKey}.{request.actionKey} / {request.status}</div>
                  <div className="mt-1 text-xs text-slate-500">{request.summary || 'No summary provided'}</div>
                </div>
                {request.status === 'PENDING' ? (
                  <div className="flex gap-2">
                    <button
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                      onClick={() => decide(request.id, 'approve')}
                      disabled={saving === request.id}
                    >
                      Approve
                    </button>
                    <button
                      className="rounded-lg bg-rose-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                      onClick={() => decide(request.id, 'reject')}
                      disabled={saving === request.id}
                    >
                      Reject
                    </button>
                  </div>
                ) : (
                  <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{request.status}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default ApprovalPolicies;
