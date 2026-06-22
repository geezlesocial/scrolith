import React, { useEffect, useState } from 'react';
import { AdminService } from '../../services/admin';
import { useNotification } from '../../context/NotificationContext';

const cardClass = 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm';

const ProcurementCenter: React.FC = () => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>({});
  const [settings, setSettings] = useState<any>({});
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [budgetRules, setBudgetRules] = useState<any[]>([]);
  const [purchaseRequests, setPurchaseRequests] = useState<any[]>([]);
  const [approvalQueue, setApprovalQueue] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [summaryData, settingsData, centersData, rulesData, requestsData, approvalsData, invoicesData] = await Promise.all([
        AdminService.getProcurementSummary(),
        AdminService.getProcurementSettings(),
        AdminService.getProcurementCostCenters(),
        AdminService.getBudgetRules(),
        AdminService.getProcurementPurchaseRequests(),
        AdminService.getProcurementApprovalQueue(),
        AdminService.getProcurementInvoices()
      ]);
      setSummary(summaryData || {});
      setSettings(settingsData || {});
      setCostCenters(Array.isArray(centersData) ? centersData : []);
      setBudgetRules(Array.isArray(rulesData) ? rulesData : []);
      setPurchaseRequests(Array.isArray(requestsData) ? requestsData : []);
      setApprovalQueue(Array.isArray(approvalsData) ? approvalsData : []);
      setInvoices(Array.isArray(invoicesData) ? invoicesData : []);
    } catch (error: any) {
      showNotification('alert', 'Error', error?.message || 'Failed to load procurement center');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const saveSettings = async () => {
    setSaving('settings');
    try {
      await AdminService.updateProcurementSettings(settings);
      showNotification('success', 'Saved', 'Procurement settings updated');
      await load();
    } catch (error: any) {
      showNotification('alert', 'Error', error?.message || 'Failed to save procurement settings');
    } finally {
      setSaving(null);
    }
  };

  const decide = async (id: string, decision: 'approve' | 'reject' | 'hold') => {
    setSaving(id);
    try {
      await AdminService.decideProcurementRequest(id, decision, { note: `Actioned from ${decision} queue` });
      showNotification('success', 'Saved', `Request ${decision}d`);
      await load();
    } catch (error: any) {
      showNotification('alert', 'Error', error?.message || `Failed to ${decision} request`);
    } finally {
      setSaving(null);
    }
  };

  const approveInvoice = async (id: string, mode: 'approve' | 'reconcile') => {
    setSaving(id);
    try {
      if (mode === 'approve') await AdminService.approveProcurementInvoice(id);
      else await AdminService.reconcileProcurementInvoice(id);
      showNotification('success', 'Saved', `Invoice ${mode}d`);
      await load();
    } catch (error: any) {
      showNotification('alert', 'Error', error?.message || `Failed to ${mode} invoice`);
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return <div className={cardClass}>Loading procurement controls...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        {[
          ['Cost centers', costCenters.length],
          ['Budget rules', budgetRules.length],
          ['Pending approvals', approvalQueue.length],
          ['Invoices', invoices.length]
        ].map(([label, value]) => (
          <div key={String(label)} className={cardClass}>
            <div className="text-sm text-slate-500">{label}</div>
            <div className="mt-2 text-2xl font-semibold text-slate-900">{value as any}</div>
          </div>
        ))}
      </div>

      <section className={cardClass}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Procurement settings</h2>
            <p className="text-sm text-slate-500">Enterprise purchasing guardrails and billing controls.</p>
          </div>
          <button
            onClick={saveSettings}
            disabled={saving === 'settings'}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving === 'settings' ? 'Saving...' : 'Save settings'}
          </button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="text-sm text-slate-600">
            <div className="mb-1 font-medium">Enabled</div>
            <select
              value={settings.enabled ? 'true' : 'false'}
              onChange={(e) => setSettings((current: any) => ({ ...current, enabled: e.target.value === 'true' }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            >
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </label>
          <label className="text-sm text-slate-600">
            <div className="mb-1 font-medium">Default approval threshold</div>
            <input
              type="number"
              value={settings.defaultApprovalThreshold ?? 0}
              onChange={(e) => setSettings((current: any) => ({ ...current, defaultApprovalThreshold: Number(e.target.value || 0) }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
          <label className="text-sm text-slate-600">
            <div className="mb-1 font-medium">Invoice prefix</div>
            <input
              value={settings.invoicePrefix || ''}
              onChange={(e) => setSettings((current: any) => ({ ...current, invoicePrefix: e.target.value }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2"
            />
          </label>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className={cardClass}>
          <h2 className="text-lg font-semibold text-slate-900">Cost centers</h2>
          <div className="mt-4 space-y-3">
            {costCenters.slice(0, 8).map((center) => (
              <div key={center.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-slate-900">{center.name}</div>
                    <div className="text-sm text-slate-500">{center.code} · {center.department || 'No department'}</div>
                  </div>
                  <span className="text-xs text-slate-500">{center.currency || 'USD'}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={cardClass}>
          <h2 className="text-lg font-semibold text-slate-900">Budget rules</h2>
          <div className="mt-4 space-y-3">
            {budgetRules.slice(0, 8).map((rule) => (
              <div key={rule.id} className="rounded-lg border border-slate-200 p-3">
                <div className="font-medium text-slate-900">{rule.interval} · {rule.limitAmount} {rule.currency || 'USD'}</div>
                <div className="text-sm text-slate-500">
                  Threshold {rule.alertThresholdPercent}% · {rule.hardStop ? 'Hard stop' : 'Approval escalation'}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className={cardClass}>
          <h2 className="text-lg font-semibold text-slate-900">Approval queue</h2>
          <div className="mt-4 space-y-3">
            {approvalQueue.slice(0, 6).map((request) => (
              <div key={request.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-slate-900">{request.title || request.requestNumber}</div>
                    <div className="text-sm text-slate-500">{request.amount} {request.currency || 'USD'} · {request.status}</div>
                  </div>
                  <div className="flex gap-2">
                    {(['approve', 'hold', 'reject'] as const).map((decision) => (
                      <button
                        key={decision}
                        onClick={() => decide(request.id, decision)}
                        disabled={saving === request.id}
                        className="rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700"
                      >
                        {decision}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={cardClass}>
          <h2 className="text-lg font-semibold text-slate-900">Invoices</h2>
          <div className="mt-4 space-y-3">
            {invoices.slice(0, 6).map((invoice) => (
              <div key={invoice.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-slate-900">{invoice.invoiceNumber}</div>
                    <div className="text-sm text-slate-500">{invoice.totalAmount} {invoice.currency || 'USD'} · {invoice.status}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => approveInvoice(invoice.id, 'approve')} disabled={saving === invoice.id} className="rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700">Approve</button>
                    <button onClick={() => approveInvoice(invoice.id, 'reconcile')} disabled={saving === invoice.id} className="rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700">Reconcile</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className={cardClass}>
        <h2 className="text-lg font-semibold text-slate-900">Current request volume</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {purchaseRequests.slice(0, 6).map((request) => (
            <div key={request.id} className="rounded-lg bg-slate-50 p-3">
              <div className="font-medium text-slate-900">{request.requestNumber}</div>
              <div className="text-sm text-slate-500">{request.title}</div>
              <div className="mt-2 text-xs text-slate-500">{request.financeStatus || 'Pending finance'} · {request.status}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default ProcurementCenter;
