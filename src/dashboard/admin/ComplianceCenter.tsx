import React, { useEffect, useState } from 'react';
import { AdminService } from '../../services/admin';
import { useNotification } from '../../context/NotificationContext';

const cardClass = 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm';

const ComplianceCenter: React.FC = () => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>({});
  const [settings, setSettings] = useState<any>({});
  const [cases, setCases] = useState<any[]>([]);
  const [riskRules, setRiskRules] = useState<any[]>([]);
  const [appeals, setAppeals] = useState<any[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [summaryData, settingsData, casesData, riskData, appealsData] = await Promise.all([
        AdminService.getComplianceSummary(),
        AdminService.getComplianceSettings(),
        AdminService.getComplianceCases(),
        AdminService.getRiskRules(),
        AdminService.getComplianceAppeals()
      ]);
      setSummary(summaryData || {});
      setSettings(settingsData || {});
      setCases(Array.isArray(casesData) ? casesData : []);
      setRiskRules(Array.isArray(riskData) ? riskData : []);
      setAppeals(Array.isArray(appealsData) ? appealsData : []);
    } catch (error: any) {
      showNotification('alert', 'Error', error?.message || 'Failed to load compliance center');
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
      await AdminService.updateComplianceSettings(settings);
      showNotification('success', 'Saved', 'Compliance settings updated');
      await load();
    } catch (error: any) {
      showNotification('alert', 'Error', error?.message || 'Failed to update compliance settings');
    } finally {
      setSaving(null);
    }
  };

  const releaseHold = async (holdId: string) => {
    setSaving(holdId);
    try {
      await AdminService.releaseHoldAction(holdId, { metadata: { source: 'admin-console' } });
      showNotification('success', 'Saved', 'Hold released');
      await load();
    } catch (error: any) {
      showNotification('alert', 'Error', error?.message || 'Failed to release hold');
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <div className={cardClass}>Loading compliance operations...</div>;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        {[
          ['Open cases', summary.openCases ?? cases.filter((item) => item.status === 'OPEN').length],
          ['Appeals', appeals.length],
          ['Risk rules', riskRules.length],
          ['High risk items', summary.highRiskCases ?? cases.filter((item) => ['HIGH', 'CRITICAL'].includes(item.priority)).length]
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
            <h2 className="text-lg font-semibold text-slate-900">Compliance settings</h2>
            <p className="text-sm text-slate-500">Shadow-mode scoring and automatic hold behavior.</p>
          </div>
          <button onClick={saveSettings} disabled={saving === 'settings'} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            {saving === 'settings' ? 'Saving...' : 'Save settings'}
          </button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <label className="text-sm text-slate-600">
            <div className="mb-1 font-medium">Enabled</div>
            <select value={settings.enabled ? 'true' : 'false'} onChange={(e) => setSettings((s: any) => ({ ...s, enabled: e.target.value === 'true' }))} className="w-full rounded-lg border border-slate-200 px-3 py-2">
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </label>
          <label className="text-sm text-slate-600">
            <div className="mb-1 font-medium">Shadow mode</div>
            <select value={settings.shadowMode ? 'true' : 'false'} onChange={(e) => setSettings((s: any) => ({ ...s, shadowMode: e.target.value === 'true' }))} className="w-full rounded-lg border border-slate-200 px-3 py-2">
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </label>
          <label className="text-sm text-slate-600">
            <div className="mb-1 font-medium">Auto-hold high confidence</div>
            <select value={settings.autoHoldHighConfidence ? 'true' : 'false'} onChange={(e) => setSettings((s: any) => ({ ...s, autoHoldHighConfidence: e.target.value === 'true' }))} className="w-full rounded-lg border border-slate-200 px-3 py-2">
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </label>
          <label className="text-sm text-slate-600">
            <div className="mb-1 font-medium">Default SLA hours</div>
            <input type="number" value={settings.defaultSlaHours ?? 48} onChange={(e) => setSettings((s: any) => ({ ...s, defaultSlaHours: Number(e.target.value || 48) }))} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
          </label>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className={cardClass}>
          <h2 className="text-lg font-semibold text-slate-900">Case queue</h2>
          <div className="mt-4 space-y-3">
            {cases.slice(0, 8).map((entry) => (
              <div key={entry.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-slate-900">{entry.caseNumber}</div>
                    <div className="text-sm text-slate-500">{entry.caseType} · {entry.status} · {entry.priority}</div>
                    <div className="mt-1 text-sm text-slate-600">{entry.summary || 'No summary yet'}</div>
                  </div>
                  {Array.isArray(entry.holds) && entry.holds.find((hold: any) => hold.status === 'ACTIVE') ? (
                    <button onClick={() => releaseHold(entry.holds.find((hold: any) => hold.status === 'ACTIVE').id)} disabled={saving === entry.holds.find((hold: any) => hold.status === 'ACTIVE').id} className="rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700">
                      Release hold
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className={cardClass}>
          <h2 className="text-lg font-semibold text-slate-900">Risk rules</h2>
          <div className="mt-4 space-y-3">
            {riskRules.slice(0, 8).map((rule) => (
              <div key={rule.id} className="rounded-lg border border-slate-200 p-3">
                <div className="font-medium text-slate-900">{rule.code} · {rule.name}</div>
                <div className="text-sm text-slate-500">{rule.entityType} / {rule.signalType} / {rule.mode}</div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className={cardClass}>
        <h2 className="text-lg font-semibold text-slate-900">Appeals</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {appeals.slice(0, 6).map((appeal) => (
            <div key={appeal.id} className="rounded-lg bg-slate-50 p-3">
              <div className="font-medium text-slate-900">{appeal.status}</div>
              <div className="text-sm text-slate-500">{appeal.case?.caseNumber || appeal.caseId}</div>
              <div className="mt-1 text-sm text-slate-600">{appeal.statement}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default ComplianceCenter;
