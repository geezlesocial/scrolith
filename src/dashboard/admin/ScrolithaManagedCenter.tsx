import React, { useEffect, useState } from 'react';
import { AdminService } from '../../services/admin';
import { useNotification } from '../../context/NotificationContext';

type Props = {
  initialSection?: 'scrolitha' | 'managed-delivery';
};

const cardClass = 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm';

const ScrolithaManagedCenter: React.FC<Props> = ({ initialSection = 'scrolitha' }) => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'scrolitha' | 'managed-delivery'>(initialSection);
  const [summary, setSummary] = useState<any>({});
  const [settings, setSettings] = useState<any>({});
  const [aiOutputs, setAiOutputs] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [summaryData, settingsData, outputsData, projectsData, rulesData] = await Promise.all([
        AdminService.getScrolithaManagedSummary(),
        AdminService.getScrolithaManagedSettings(),
        AdminService.getAiOutputs(),
        AdminService.getManagedProjects(),
        AdminService.getManagedEscalationRules()
      ]);
      setSummary(summaryData || {});
      setSettings(settingsData || {});
      setAiOutputs(Array.isArray(outputsData) ? outputsData : []);
      setProjects(Array.isArray(projectsData) ? projectsData : []);
      setRules(Array.isArray(rulesData) ? rulesData : []);
    } catch (error: any) {
      showNotification('alert', 'Error', error?.message || 'Failed to load Scrolitha controls');
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
      await AdminService.updateScrolithaManagedSettings(settings);
      showNotification('success', 'Saved', 'Scrolitha settings updated');
      await load();
    } catch (error: any) {
      showNotification('alert', 'Error', error?.message || 'Failed to save Scrolitha settings');
    } finally {
      setSaving(null);
    }
  };

  const reviewOutput = async (id: string, state: string) => {
    setSaving(id);
    try {
      await AdminService.reviewAiOutput(id, { humanOverrideState: state, metadata: { source: 'admin-console' } });
      showNotification('success', 'Saved', 'AI review updated');
      await load();
    } catch (error: any) {
      showNotification('alert', 'Error', error?.message || 'Failed to review AI output');
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <div className={cardClass}>Loading Scrolitha controls...</div>;

  return (
    <div className="space-y-6">
      <div className="flex gap-3">
        <button onClick={() => setActiveSection('scrolitha')} className={`rounded-lg px-4 py-2 text-sm font-medium ${activeSection === 'scrolitha' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>Scrolitha Controls</button>
        <button onClick={() => setActiveSection('managed-delivery')} className={`rounded-lg px-4 py-2 text-sm font-medium ${activeSection === 'managed-delivery' ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-700'}`}>Managed Delivery</button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          ['AI outputs', aiOutputs.length],
          ['Managed projects', projects.length],
          ['Escalation rules', rules.length],
          ['Assistive only', settings.assistiveOnly ? 'Yes' : 'No']
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
            <h2 className="text-lg font-semibold text-slate-900">Platform controls</h2>
            <p className="text-sm text-slate-500">Assistive AI, explainability, and managed delivery execution boundaries.</p>
          </div>
          <button onClick={saveSettings} disabled={saving === 'settings'} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
            {saving === 'settings' ? 'Saving...' : 'Save settings'}
          </button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-4">
          {[
            ['enabled', 'Enabled'],
            ['assistiveOnly', 'Assistive only'],
            ['requireHumanApproval', 'Human approval required'],
            ['managedDeliveryEnabled', 'Managed delivery enabled']
          ].map(([key, label]) => (
            <label key={key} className="text-sm text-slate-600">
              <div className="mb-1 font-medium">{label}</div>
              <select value={settings[key] ? 'true' : 'false'} onChange={(e) => setSettings((s: any) => ({ ...s, [key]: e.target.value === 'true' }))} className="w-full rounded-lg border border-slate-200 px-3 py-2">
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </label>
          ))}
        </div>
      </section>

      {activeSection === 'scrolitha' ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className={cardClass}>
            <h2 className="text-lg font-semibold text-slate-900">AI review queue</h2>
            <div className="mt-4 space-y-3">
              {aiOutputs.slice(0, 8).map((output) => (
                <div key={output.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-900">{output.moduleKey} · {output.taskType}</div>
                      <div className="text-sm text-slate-500">{output.humanOverrideState} · Confidence {output.confidence ?? 'n/a'}</div>
                      <div className="mt-1 text-sm text-slate-600">{output.explanation || 'No explanation recorded'}</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => reviewOutput(output.id, 'APPROVED')} disabled={saving === output.id} className="rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700">Approve</button>
                      <button onClick={() => reviewOutput(output.id, 'REJECTED')} disabled={saving === output.id} className="rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700">Reject</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className={cardClass}>
            <h2 className="text-lg font-semibold text-slate-900">Model usage snapshot</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {Object.entries(summary || {}).slice(0, 6).map(([key, value]) => (
                <div key={key} className="rounded-lg bg-slate-50 p-3">
                  <div className="text-xs uppercase tracking-wide text-slate-500">{key}</div>
                  <div className="mt-1 text-sm font-medium text-slate-900">{String(value)}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className={cardClass}>
            <h2 className="text-lg font-semibold text-slate-900">Managed projects</h2>
            <div className="mt-4 space-y-3">
              {projects.slice(0, 8).map((project) => (
                <div key={project.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="font-medium text-slate-900">{project.title}</div>
                  <div className="text-sm text-slate-500">{project.status} · {project.slaStatus} · Risk {project.riskLevel}</div>
                  <div className="mt-1 text-sm text-slate-600">{project.entityType} · {project.entityId || 'No linked entity'}</div>
                </div>
              ))}
            </div>
          </section>

          <section className={cardClass}>
            <h2 className="text-lg font-semibold text-slate-900">Escalation matrix</h2>
            <div className="mt-4 space-y-3">
              {rules.slice(0, 8).map((rule) => (
                <div key={rule.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="font-medium text-slate-900">{rule.code} · {rule.name}</div>
                  <div className="text-sm text-slate-500">{rule.triggerType} · Target {rule.targetRole}</div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default ScrolithaManagedCenter;
