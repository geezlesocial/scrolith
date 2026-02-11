import React, { useEffect, useMemo, useState } from 'react';
import { RecoService } from '../../services/reco';
import { useNotification } from '../../context/NotificationContext';

const SURFACES = ['member_home', 'who_to_follow', 'search_suggest', 'directory'] as const;
const ENTITY_TYPES = ['freelancer', 'client', 'page'] as const;
const MODES = ['auto', 'manual', 'hybrid'] as const;

type Surface = (typeof SURFACES)[number];
type EntityType = (typeof ENTITY_TYPES)[number];

const toNumber = (value: any, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const RecommendationManagement: React.FC = () => {
  const { showNotification } = useNotification();
  const [surface, setSurface] = useState<Surface>('member_home');
  const [entityType, setEntityType] = useState<EntityType>('freelancer');
  const [config, setConfig] = useState<any>(null);
  const [rules, setRules] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [auditViewerId, setAuditViewerId] = useState('');
  const [auditEntityId, setAuditEntityId] = useState('');
  const [auditResult, setAuditResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [creatingRule, setCreatingRule] = useState(false);
  const [newRule, setNewRule] = useState({
    action: 'boost',
    entityType: 'freelancer',
    entityId: '*',
    surface: '*',
    value: 1.2,
    priority: 100,
    isActive: true,
    note: ''
  });

  const loadConfig = async () => {
    const data = await RecoService.getAdminConfig({ surface, entityType });
    setConfig(data && !Array.isArray(data) ? data : null);
  };

  const loadRules = async () => {
    const data = await RecoService.listAdminRules({ includeInactive: true });
    setRules(Array.isArray(data) ? data : []);
  };

  const loadAnalytics = async () => {
    const data = await RecoService.getAdminAnalytics(30);
    setAnalytics(data || null);
  };

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      setLoading(true);
      try {
        await Promise.all([loadConfig(), loadRules(), loadAnalytics()]);
      } catch (error: any) {
        if (!mounted) return;
        showNotification('error', 'Recommendations', error?.message || 'Failed to load recommendation settings.');
      } finally {
        if (mounted) setLoading(false);
      }
    };
    run();
    return () => {
      mounted = false;
    };
  }, [surface, entityType]);

  const updateConfigField = (path: string, value: any) => {
    setConfig((current: any) => {
      if (!current) return current;
      const next = { ...current };
      const keys = path.split('.');
      let pointer = next;
      for (let index = 0; index < keys.length - 1; index += 1) {
        const key = keys[index];
        pointer[key] = { ...(pointer[key] || {}) };
        pointer = pointer[key];
      }
      pointer[keys[keys.length - 1]] = value;
      return next;
    });
  };

  const saveConfig = async () => {
    if (!config) return;
    setSavingConfig(true);
    try {
      const payload = {
        surface,
        entityType,
        mode: config.mode,
        enabled: Boolean(config.enabled),
        weights: config.weights || {},
        gating: {
          ...(config.gating || {}),
          minAccountAgeDays: toNumber(config.gating?.minAccountAgeDays, 7),
          minProfileCompleteness: toNumber(config.gating?.minProfileCompleteness, 0.4),
          maxFrequencyPerViewerPerDay: toNumber(config.gating?.maxFrequencyPerViewerPerDay, 3)
        },
        penalties: config.penalties || {},
        diversity: config.diversity || {},
        coldStart: config.coldStart || {},
        notes: config.notes || ''
      };
      const updated = await RecoService.updateAdminConfig(payload);
      setConfig(updated);
      showNotification('success', 'Recommendations', 'Configuration saved.');
    } catch (error: any) {
      showNotification('error', 'Recommendations', error?.message || 'Failed to save configuration.');
    } finally {
      setSavingConfig(false);
    }
  };

  const createRule = async () => {
    setCreatingRule(true);
    try {
      await RecoService.createAdminRule({
        ...newRule,
        value: toNumber(newRule.value, 1.2),
        priority: Math.max(1, Math.floor(toNumber(newRule.priority, 100)))
      });
      showNotification('success', 'Recommendation Rules', 'Rule created.');
      await loadRules();
    } catch (error: any) {
      showNotification('error', 'Recommendation Rules', error?.message || 'Failed to create rule.');
    } finally {
      setCreatingRule(false);
    }
  };

  const toggleRuleActive = async (rule: any, isActive: boolean) => {
    try {
      await RecoService.updateAdminRule(rule.id, { isActive });
      await loadRules();
    } catch (error: any) {
      showNotification('error', 'Recommendation Rules', error?.message || 'Failed to update rule.');
    }
  };

  const removeRule = async (ruleId: string) => {
    try {
      await RecoService.deleteAdminRule(ruleId);
      await loadRules();
      showNotification('success', 'Recommendation Rules', 'Rule deleted.');
    } catch (error: any) {
      showNotification('error', 'Recommendation Rules', error?.message || 'Failed to delete rule.');
    }
  };

  const runAudit = async () => {
    if (!auditViewerId || !auditEntityId) {
      showNotification('warning', 'Recommendation Audit', 'viewerId and entityId are required.');
      return;
    }
    try {
      const result = await RecoService.getAdminAudit({
        viewerId: auditViewerId,
        entityId: auditEntityId,
        entityType,
        surface
      });
      setAuditResult(result || null);
    } catch (error: any) {
      showNotification('error', 'Recommendation Audit', error?.message || 'Failed to run audit.');
    }
  };

  const filteredRules = useMemo(
    () => rules.filter((rule) => rule.surface === '*' || rule.surface === surface),
    [rules, surface]
  );

  if (loading && !config) {
    return <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading recommendation controls...</div>;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <select className="rounded-md border border-gray-300 px-3 py-2 text-sm" value={surface} onChange={(e) => setSurface(e.target.value as Surface)}>
            {SURFACES.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>
          <select className="rounded-md border border-gray-300 px-3 py-2 text-sm" value={entityType} onChange={(e) => setEntityType(e.target.value as EntityType)}>
            {ENTITY_TYPES.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>
          <select className="rounded-md border border-gray-300 px-3 py-2 text-sm" value={config?.mode || 'hybrid'} onChange={(e) => updateConfigField('mode', e.target.value)}>
            {MODES.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={Boolean(config?.enabled)} onChange={(e) => updateConfigField('enabled', e.target.checked)} />
            Enabled
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {['relevance', 'quality', 'activity', 'social', 'performance', 'diversityBoost'].map((key) => (
            <label key={key} className="text-xs font-medium uppercase text-gray-500">
              {key}
              <input
                type="number"
                step="0.01"
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-700"
                value={toNumber(config?.weights?.[key], 0)}
                onChange={(e) => updateConfigField(`weights.${key}`, toNumber(e.target.value, 0))}
              />
            </label>
          ))}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="text-xs font-medium uppercase text-gray-500">
            Min Account Age (days)
            <input type="number" className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={toNumber(config?.gating?.minAccountAgeDays, 7)} onChange={(e) => updateConfigField('gating.minAccountAgeDays', toNumber(e.target.value, 7))} />
          </label>
          <label className="text-xs font-medium uppercase text-gray-500">
            Min Profile Completeness
            <input type="number" step="0.01" className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={toNumber(config?.gating?.minProfileCompleteness, 0.4)} onChange={(e) => updateConfigField('gating.minProfileCompleteness', toNumber(e.target.value, 0.4))} />
          </label>
          <label className="text-xs font-medium uppercase text-gray-500">
            Max Frequency / Viewer / Day
            <input type="number" className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={toNumber(config?.gating?.maxFrequencyPerViewerPerDay, 3)} onChange={(e) => updateConfigField('gating.maxFrequencyPerViewerPerDay', toNumber(e.target.value, 3))} />
          </label>
        </div>

        <div className="mt-4 flex justify-end">
          <button type="button" disabled={savingConfig} onClick={saveConfig} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
            {savingConfig ? 'Saving...' : 'Save Config'}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Manual Rules</h3>
        <div className="grid gap-2 md:grid-cols-7">
          <select className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={newRule.action} onChange={(e) => setNewRule((prev) => ({ ...prev, action: e.target.value }))}>
            <option value="boost">boost</option>
            <option value="pin">pin</option>
            <option value="exclude">exclude</option>
            <option value="shadow">shadow</option>
          </select>
          <input className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={newRule.entityType} onChange={(e) => setNewRule((prev) => ({ ...prev, entityType: e.target.value }))} placeholder="entityType" />
          <input className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={newRule.entityId} onChange={(e) => setNewRule((prev) => ({ ...prev, entityId: e.target.value }))} placeholder="entityId or *" />
          <input className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={newRule.surface} onChange={(e) => setNewRule((prev) => ({ ...prev, surface: e.target.value }))} placeholder="surface or *" />
          <input type="number" step="0.01" className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={newRule.value} onChange={(e) => setNewRule((prev) => ({ ...prev, value: toNumber(e.target.value, 1.2) }))} placeholder="value" />
          <input type="number" className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={newRule.priority} onChange={(e) => setNewRule((prev) => ({ ...prev, priority: toNumber(e.target.value, 100) }))} placeholder="priority" />
          <button type="button" disabled={creatingRule} onClick={createRule} className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white hover:bg-slate-800 disabled:opacity-60">
            {creatingRule ? 'Adding...' : 'Add Rule'}
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {filteredRules.slice(0, 30).map((rule) => (
            <div key={rule.id} className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium text-gray-800">{rule.action} {rule.entityType}:{rule.entityId} on {rule.surface}</p>
                <p className="text-xs text-gray-500">value {rule.value ?? '-'} | priority {rule.priority} | {rule.isActive ? 'active' : 'inactive'}</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => void toggleRuleActive(rule, !rule.isActive)} className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-700">
                  {rule.isActive ? 'Disable' : 'Enable'}
                </button>
                <button type="button" onClick={() => void removeRule(rule.id)} className="rounded-md border border-red-300 px-2 py-1 text-xs text-red-700">
                  Delete
                </button>
              </div>
            </div>
          ))}
          {filteredRules.length === 0 ? <p className="text-xs text-gray-500">No rules for current surface.</p> : null}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Explainability Audit</h3>
        <div className="grid gap-2 md:grid-cols-4">
          <input className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" placeholder="viewerId" value={auditViewerId} onChange={(e) => setAuditViewerId(e.target.value)} />
          <input className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" placeholder="entityId" value={auditEntityId} onChange={(e) => setAuditEntityId(e.target.value)} />
          <button type="button" onClick={runAudit} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm text-white hover:bg-indigo-700">Run Audit</button>
        </div>
        {auditResult ? (
          <pre className="mt-3 overflow-auto rounded-md bg-slate-900 p-3 text-xs text-slate-100">{JSON.stringify(auditResult, null, 2)}</pre>
        ) : null}
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Analytics (30 days)</h3>
        {analytics ? (
          <div className="space-y-2 text-sm text-gray-700">
            <p>Impressions: {analytics?.totals?.impressions || 0}</p>
            <p>Clicks: {analytics?.totals?.clicks || 0}</p>
            <p>Follows: {analytics?.totals?.follows || 0}</p>
            <p>CTR: {Number(analytics?.totals?.ctr || 0).toFixed(3)}</p>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No analytics data yet.</p>
        )}
      </section>
    </div>
  );
};

export default RecommendationManagement;
