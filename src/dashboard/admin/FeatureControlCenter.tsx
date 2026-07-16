import React, { useEffect, useMemo, useState } from 'react';
import { Flag, Power, RefreshCw, Search, SlidersHorizontal, TestTube2 } from 'lucide-react';
import { AdminService } from '../../services/admin';
import { useNotification } from '../../context/NotificationContext';

type FeatureSummary = {
  flags: number;
  activeFlags: number;
  killSwitches: number;
  audiences: number;
  rules: number;
  activeRules: number;
  exposures: number;
  auditLogs: number;
};

type FeatureFlagRow = {
  id: string;
  key: string;
  label: string;
  description?: string;
  category: string;
  defaultValue: boolean;
  isActive: boolean;
  killSwitch: boolean;
  audiencesCount?: number;
  rulesCount?: number;
  exposuresCount?: number;
};

type FeatureAudience = {
  id: string;
  flagId: string;
  key: string;
  label: string;
  roleScope: string[];
  countryScope: string[];
  platformScope: string[];
  appVersions: string[];
  isActive: boolean;
  rulesCount?: number;
};

type FeatureRule = {
  id: string;
  flagId: string;
  audienceId?: string | null;
  audienceKey?: string | null;
  audienceLabel?: string | null;
  rolloutPercent: number;
  value: boolean;
  startAt?: string | null;
  endAt?: string | null;
  priority: number;
  isActive: boolean;
  conditions?: any;
};

type FeatureAudit = {
  id: string;
  action: string;
  createdAt: string;
  staffId?: string | null;
};

const emptySummary: FeatureSummary = {
  flags: 0,
  activeFlags: 0,
  killSwitches: 0,
  audiences: 0,
  rules: 0,
  activeRules: 0,
  exposures: 0,
  auditLogs: 0
};

const emptyFlagForm = {
  key: '',
  label: '',
  description: '',
  category: 'platform',
  defaultValue: false,
  isActive: true
};

const emptyAudienceForm = {
  key: '',
  label: '',
  roleScope: '',
  countryScope: '',
  platformScope: '',
  appVersions: '',
  isActive: true
};

const emptyRuleForm = {
  audienceId: '',
  rolloutPercent: 100,
  value: false,
  startAt: '',
  endAt: '',
  priority: 100,
  isActive: true,
  conditionsText: ''
};

const emptyResolveForm = {
  key: '',
  userId: '',
  sessionKey: '',
  role: '',
  country: '',
  platform: 'web',
  appVersion: ''
};

const parseCommaList = (value: string) =>
  value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

const toDateInput = (value?: string | null) => (value ? String(value).slice(0, 16) : '');

const FeatureControlCenter: React.FC = () => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingFlag, setSavingFlag] = useState(false);
  const [savingAudience, setSavingAudience] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [resolving, setResolving] = useState(false);

  const [summary, setSummary] = useState<FeatureSummary>(emptySummary);
  const [flags, setFlags] = useState<FeatureFlagRow[]>([]);
  const [audiences, setAudiences] = useState<FeatureAudience[]>([]);
  const [rules, setRules] = useState<FeatureRule[]>([]);
  const [auditLog, setAuditLog] = useState<FeatureAudit[]>([]);

  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);

  const [selectedFlagId, setSelectedFlagId] = useState('');
  const [editingFlagId, setEditingFlagId] = useState<string | null>(null);
  const [editingAudienceId, setEditingAudienceId] = useState<string | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  const [flagForm, setFlagForm] = useState(emptyFlagForm);
  const [audienceForm, setAudienceForm] = useState(emptyAudienceForm);
  const [ruleForm, setRuleForm] = useState(emptyRuleForm);
  const [resolveForm, setResolveForm] = useState(emptyResolveForm);
  const [resolveResult, setResolveResult] = useState<any>(null);

  const categories = useMemo(
    () => Array.from(new Set(flags.map((flag) => String(flag.category || 'platform')))).sort(),
    [flags]
  );

  const selectedFlag = useMemo(
    () => flags.find((flag) => flag.id === selectedFlagId) || null,
    [flags, selectedFlagId]
  );

  const loadSummary = async () => {
    const data = await AdminService.getFeatureControlSummary();
    setSummary(data || emptySummary);
  };

  const loadFlags = async () => {
    const data = await AdminService.getFeatureFlags({
      query: query || undefined,
      category: categoryFilter || undefined,
      activeOnly
    });
    const rows = Array.isArray(data) ? data : [];
    setFlags(rows);
    setSelectedFlagId((current) => {
      if (current && rows.some((flag) => flag.id === current)) return current;
      return rows[0]?.id || '';
    });
  };

  const loadSelectedFlagDetails = async (flagId: string) => {
    if (!flagId) {
      setAudiences([]);
      setRules([]);
      setAuditLog([]);
      return;
    }

    const [loadedAudiences, loadedRules, loadedAudit] = await Promise.all([
      AdminService.getFeatureAudiences(flagId),
      AdminService.getFeatureRules(flagId),
      AdminService.getFeatureFlagAudit({ flagId, limit: 20 })
    ]);
    setAudiences(Array.isArray(loadedAudiences) ? loadedAudiences : []);
    setRules(Array.isArray(loadedRules) ? loadedRules : []);
    setAuditLog(Array.isArray(loadedAudit) ? loadedAudit : []);
  };

  const refreshAll = async () => {
    try {
      setRefreshing(true);
      await Promise.all([loadSummary(), loadFlags()]);
      if (selectedFlagId) {
        await loadSelectedFlagDetails(selectedFlagId);
      }
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        setLoading(true);
        await Promise.all([loadSummary(), loadFlags()]);
      } catch (error: any) {
        showNotification('alert', 'Feature Control Error', error?.message || 'Failed to load feature control center');
      } finally {
        setLoading(false);
      }
    };
    bootstrap();
  }, []);

  useEffect(() => {
    if (loading) return;
    loadFlags().catch((error: any) => {
      showNotification('alert', 'Feature Flags Error', error?.message || 'Failed to load feature flags');
    });
  }, [categoryFilter, activeOnly]);

  useEffect(() => {
    loadSelectedFlagDetails(selectedFlagId).catch((error: any) => {
      showNotification('alert', 'Feature Details Error', error?.message || 'Failed to load feature flag details');
    });
  }, [selectedFlagId]);

  useEffect(() => {
    const refresh = () => {
      refreshAll().catch(() => null);
    };
    window.addEventListener('feature_flags:updated', refresh as EventListener);
    window.addEventListener('feature_flags:kill_switch_toggled', refresh as EventListener);
    return () => {
      window.removeEventListener('feature_flags:updated', refresh as EventListener);
      window.removeEventListener('feature_flags:kill_switch_toggled', refresh as EventListener);
    };
  }, [selectedFlagId]);

  useEffect(() => {
    if (!flagForm.key && !editingFlagId && flags.length > 0) {
      setResolveForm((current) => ({ ...current, key: current.key || flags[0].key }));
    }
  }, [flags, editingFlagId, flagForm.key]);

  const resetFlagForm = () => {
    setEditingFlagId(null);
    setFlagForm(emptyFlagForm);
  };

  const resetAudienceForm = () => {
    setEditingAudienceId(null);
    setAudienceForm(emptyAudienceForm);
  };

  const resetRuleForm = () => {
    setEditingRuleId(null);
    setRuleForm(emptyRuleForm);
  };

  const startEditFlag = (flag: FeatureFlagRow) => {
    setEditingFlagId(flag.id);
    setFlagForm({
      key: flag.key,
      label: flag.label,
      description: flag.description || '',
      category: flag.category || 'platform',
      defaultValue: flag.defaultValue !== false,
      isActive: flag.isActive !== false
    });
  };

  const startEditAudience = (audience: FeatureAudience) => {
    setEditingAudienceId(audience.id);
    setAudienceForm({
      key: audience.key,
      label: audience.label,
      roleScope: (audience.roleScope || []).join(', '),
      countryScope: (audience.countryScope || []).join(', '),
      platformScope: (audience.platformScope || []).join(', '),
      appVersions: (audience.appVersions || []).join(', '),
      isActive: audience.isActive !== false
    });
  };

  const startEditRule = (rule: FeatureRule) => {
    setEditingRuleId(rule.id);
    setRuleForm({
      audienceId: rule.audienceId || '',
      rolloutPercent: Number(rule.rolloutPercent || 0),
      value: Boolean(rule.value),
      startAt: toDateInput(rule.startAt),
      endAt: toDateInput(rule.endAt),
      priority: Number(rule.priority || 100),
      isActive: rule.isActive !== false,
      conditionsText: rule.conditions ? JSON.stringify(rule.conditions, null, 2) : ''
    });
  };

  const saveFlag = async () => {
    try {
      setSavingFlag(true);
      const payload = {
        key: flagForm.key,
        label: flagForm.label,
        description: flagForm.description || null,
        category: flagForm.category || 'platform',
        defaultValue: flagForm.defaultValue,
        isActive: flagForm.isActive
      };

      if (editingFlagId) {
        await AdminService.updateFeatureFlag(editingFlagId, payload);
        showNotification('success', 'Feature Flag Updated', `${payload.label} was updated.`);
      } else {
        await AdminService.createFeatureFlag(payload);
        showNotification('success', 'Feature Flag Created', `${payload.label} was created.`);
      }

      resetFlagForm();
      await Promise.all([loadSummary(), loadFlags()]);
    } catch (error: any) {
      showNotification('alert', 'Save Failed', error?.message || 'Failed to save feature flag');
    } finally {
      setSavingFlag(false);
    }
  };

  const saveAudience = async () => {
    if (!selectedFlagId) {
      showNotification('info', 'Select a Flag', 'Select a feature flag before saving audiences.');
      return;
    }

    try {
      setSavingAudience(true);
      const payload = {
        flagId: selectedFlagId,
        key: audienceForm.key,
        label: audienceForm.label,
        roleScope: parseCommaList(audienceForm.roleScope),
        countryScope: parseCommaList(audienceForm.countryScope),
        platformScope: parseCommaList(audienceForm.platformScope),
        appVersions: parseCommaList(audienceForm.appVersions),
        isActive: audienceForm.isActive
      };

      if (editingAudienceId) {
        await AdminService.updateFeatureAudience(editingAudienceId, payload);
        showNotification('success', 'Audience Updated', `${payload.label} was updated.`);
      } else {
        await AdminService.createFeatureAudience(selectedFlagId, payload);
        showNotification('success', 'Audience Created', `${payload.label} was created.`);
      }

      resetAudienceForm();
      await Promise.all([loadSummary(), loadSelectedFlagDetails(selectedFlagId), loadFlags()]);
    } catch (error: any) {
      showNotification('alert', 'Save Failed', error?.message || 'Failed to save audience');
    } finally {
      setSavingAudience(false);
    }
  };

  const saveRule = async () => {
    if (!selectedFlagId) {
      showNotification('info', 'Select a Flag', 'Select a feature flag before saving rules.');
      return;
    }

    try {
      setSavingRule(true);
      const payload = {
        flagId: selectedFlagId,
        audienceId: ruleForm.audienceId || null,
        rolloutPercent: Number(ruleForm.rolloutPercent || 0),
        value: ruleForm.value,
        startAt: ruleForm.startAt || null,
        endAt: ruleForm.endAt || null,
        priority: Number(ruleForm.priority || 100),
        isActive: ruleForm.isActive,
        conditions: ruleForm.conditionsText.trim() ? JSON.parse(ruleForm.conditionsText) : undefined
      };

      if (editingRuleId) {
        await AdminService.updateFeatureRule(editingRuleId, payload);
        showNotification('success', 'Rule Updated', 'Feature rollout rule updated.');
      } else {
        await AdminService.createFeatureRule(selectedFlagId, payload);
        showNotification('success', 'Rule Created', 'Feature rollout rule created.');
      }

      resetRuleForm();
      await Promise.all([loadSummary(), loadSelectedFlagDetails(selectedFlagId), loadFlags()]);
    } catch (error: any) {
      showNotification('alert', 'Save Failed', error?.message || 'Failed to save feature rule');
    } finally {
      setSavingRule(false);
    }
  };

  const deactivateRule = async (rule: FeatureRule) => {
    if (!window.confirm('Deactivate this rule?')) return;
    try {
      await AdminService.deactivateFeatureRule(rule.id);
      showNotification('info', 'Rule Deactivated', 'The feature rule has been deactivated.');
      await Promise.all([loadSummary(), loadSelectedFlagDetails(rule.flagId), loadFlags()]);
    } catch (error: any) {
      showNotification('alert', 'Deactivate Failed', error?.message || 'Failed to deactivate feature rule');
    }
  };

  const toggleKillSwitch = async (flag: FeatureFlagRow) => {
    try {
      const enabled = !flag.killSwitch;
      await AdminService.toggleFeatureKillSwitch(flag.id, enabled);
      showNotification(
        enabled ? 'alert' : 'success',
        enabled ? 'Kill Switch Enabled' : 'Kill Switch Disabled',
        `${flag.label} is now ${enabled ? 'force-disabled' : 'following its rollout rules again'}.`
      );
      await Promise.all([loadSummary(), loadFlags(), loadSelectedFlagDetails(flag.id)]);
    } catch (error: any) {
      showNotification('alert', 'Kill Switch Failed', error?.message || 'Failed to toggle kill switch');
    }
  };

  const resolveFlag = async () => {
    try {
      setResolving(true);
      const result = await AdminService.resolveFeatureFlag({
        key: resolveForm.key,
        userId: resolveForm.userId || null,
        sessionKey: resolveForm.sessionKey || null,
        role: resolveForm.role || null,
        country: resolveForm.country || null,
        platform: resolveForm.platform || null,
        appVersion: resolveForm.appVersion || null
      });
      setResolveResult(result || null);
    } catch (error: any) {
      showNotification('alert', 'Resolution Failed', error?.message || 'Failed to resolve feature flag');
    } finally {
      setResolving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
        Loading feature control center...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Feature Control Center</h2>
          <p className="text-sm text-gray-500">
            Native Scrolith feature flags, targeted audiences, rollout rules, kill switches, and audit visibility.
          </p>
        </div>
        <button
          onClick={() => {
            refreshAll().catch((error: any) =>
              showNotification('alert', 'Refresh Failed', error?.message || 'Failed to refresh feature control data')
            );
          }}
          className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Flags', value: `${summary.activeFlags}/${summary.flags}` },
          { label: 'Kill Switches', value: summary.killSwitches },
          { label: 'Audiences', value: summary.audiences },
          { label: 'Rules / Exposures', value: `${summary.activeRules}/${summary.rules} · ${summary.exposures}` }
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{item.label}</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr,1fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-gray-900">Flag Filters</h3>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="flex items-center rounded-lg border border-gray-200 px-3">
                <Search className="mr-2 h-4 w-4 text-gray-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      loadFlags().catch((error: any) =>
                        showNotification('alert', 'Feature Flags Error', error?.message || 'Failed to load feature flags')
                      );
                    }
                  }}
                  placeholder="Search flags"
                  className="w-full bg-transparent py-2 text-sm outline-none"
                />
              </div>
              <select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="">All categories</option>
                {categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                Active only
                <input
                  type="checkbox"
                  checked={activeOnly}
                  onChange={(event) => setActiveOnly(event.target.checked)}
                  className="rounded text-blue-600"
                />
              </label>
              <button
                onClick={() =>
                  loadFlags().catch((error: any) =>
                    showNotification('alert', 'Feature Flags Error', error?.message || 'Failed to load feature flags')
                  )
                }
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Search
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-3">
              <h3 className="text-sm font-bold text-gray-900">Feature Flags</h3>
              <p className="mt-1 text-xs text-gray-500">
                Default-off production-safe flags with audience targeting and emergency kill switches.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Flag</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Default</th>
                    <th className="px-4 py-3">Rollout</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {flags.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">
                        No feature flags match the current filters.
                      </td>
                    </tr>
                  ) : (
                    flags.map((flag) => (
                      <tr
                        key={flag.id}
                        className={`border-t border-gray-100 ${selectedFlagId === flag.id ? 'bg-blue-50/50' : ''}`}
                      >
                        <td className="px-4 py-3 align-top">
                          <button className="text-left" onClick={() => setSelectedFlagId(flag.id)}>
                            <div className="font-semibold text-gray-900">{flag.label}</div>
                            <div className="text-xs text-gray-500">{flag.key}</div>
                            {flag.description ? <div className="mt-1 text-xs text-gray-500">{flag.description}</div> : null}
                          </button>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                            {flag.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className={`text-xs font-semibold ${flag.defaultValue ? 'text-emerald-700' : 'text-gray-500'}`}>
                            {flag.defaultValue ? 'ON' : 'OFF'}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="text-xs text-gray-700">
                            {flag.audiencesCount || 0} audiences · {flag.rulesCount || 0} rules
                          </div>
                          <div className={`mt-1 text-xs font-semibold ${flag.killSwitch ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {flag.killSwitch ? 'Kill switch ON' : flag.isActive ? 'Active' : 'Inactive'}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => startEditFlag(flag)}
                              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => toggleKillSwitch(flag)}
                              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                                flag.killSwitch
                                  ? 'border border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                                  : 'border border-rose-200 text-rose-700 hover:bg-rose-50'
                              }`}
                            >
                              <Power className="mr-1 inline h-3.5 w-3.5" />
                              {flag.killSwitch ? 'Restore' : 'Kill'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Flag className="h-4 w-4 text-blue-600" />
                <h3 className="text-sm font-bold text-gray-900">{editingFlagId ? 'Edit Feature Flag' : 'Create Feature Flag'}</h3>
              </div>
              {editingFlagId ? (
                <button onClick={resetFlagForm} className="text-xs font-semibold text-gray-500 hover:text-gray-700">
                  Reset
                </button>
              ) : null}
            </div>
            <div className="grid gap-3">
              <input
                value={flagForm.key}
                onChange={(event) => setFlagForm((current) => ({ ...current, key: event.target.value }))}
                placeholder="feature_control_center_enabled"
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <input
                value={flagForm.label}
                onChange={(event) => setFlagForm((current) => ({ ...current, label: event.target.value }))}
                placeholder="Feature Control Center"
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  value={flagForm.category}
                  onChange={(event) => setFlagForm((current) => ({ ...current, category: event.target.value }))}
                  placeholder="control_plane"
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  Default ON
                  <input
                    type="checkbox"
                    checked={flagForm.defaultValue}
                    onChange={(event) =>
                      setFlagForm((current) => ({ ...current, defaultValue: event.target.checked }))
                    }
                    className="rounded text-blue-600"
                  />
                </label>
              </div>
              <textarea
                value={flagForm.description}
                onChange={(event) => setFlagForm((current) => ({ ...current, description: event.target.value }))}
                rows={3}
                placeholder="Describe the rollout purpose and operational impact."
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                Flag is active
                <input
                  type="checkbox"
                  checked={flagForm.isActive}
                  onChange={(event) => setFlagForm((current) => ({ ...current, isActive: event.target.checked }))}
                  className="rounded text-blue-600"
                />
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={saveFlag}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  {savingFlag ? 'Saving...' : editingFlagId ? 'Save Flag' : 'Create Flag'}
                </button>
                <button
                  onClick={resetFlagForm}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>

          {selectedFlag ? (
            <>
              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">{selectedFlag.label}</h3>
                    <p className="text-xs text-gray-500">{selectedFlag.key}</p>
                    <p className="mt-2 text-xs text-gray-500">{selectedFlag.description || 'No description set.'}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-semibold ${
                      selectedFlag.killSwitch ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {selectedFlag.killSwitch ? 'Kill switch active' : 'Normal rollout'}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-gray-900">Audiences</h3>
                  {editingAudienceId ? (
                    <button onClick={resetAudienceForm} className="text-xs font-semibold text-gray-500 hover:text-gray-700">
                      Reset
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-2">
                  <input
                    value={audienceForm.key}
                    onChange={(event) => setAudienceForm((current) => ({ ...current, key: event.target.value }))}
                    placeholder="mobile_beta"
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                  <input
                    value={audienceForm.label}
                    onChange={(event) => setAudienceForm((current) => ({ ...current, label: event.target.value }))}
                    placeholder="Mobile beta testers"
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                  <input
                    value={audienceForm.roleScope}
                    onChange={(event) => setAudienceForm((current) => ({ ...current, roleScope: event.target.value }))}
                    placeholder="Roles: admin, freelancer"
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                  <input
                    value={audienceForm.platformScope}
                    onChange={(event) =>
                      setAudienceForm((current) => ({ ...current, platformScope: event.target.value }))
                    }
                    placeholder="Platforms: web, mobile, android"
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                  <div className="grid gap-2 md:grid-cols-2">
                    <input
                      value={audienceForm.countryScope}
                      onChange={(event) =>
                        setAudienceForm((current) => ({ ...current, countryScope: event.target.value }))
                      }
                      placeholder="Countries: ng, us"
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                    <input
                      value={audienceForm.appVersions}
                      onChange={(event) =>
                        setAudienceForm((current) => ({ ...current, appVersions: event.target.value }))
                      }
                      placeholder="App versions: 1.0.0, 1.0.1"
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                    Audience is active
                    <input
                      type="checkbox"
                      checked={audienceForm.isActive}
                      onChange={(event) =>
                        setAudienceForm((current) => ({ ...current, isActive: event.target.checked }))
                      }
                      className="rounded text-blue-600"
                    />
                  </label>
                  <button
                    onClick={saveAudience}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    {savingAudience ? 'Saving...' : editingAudienceId ? 'Save Audience' : 'Add Audience'}
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  {audiences.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-gray-200 p-3 text-sm text-gray-400">
                      No audiences created for this flag yet.
                    </div>
                  ) : (
                    audiences.map((audience) => (
                      <div key={audience.id} className="rounded-lg border border-gray-200 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-gray-900">{audience.label}</div>
                            <div className="text-xs text-gray-500">{audience.key}</div>
                            <div className="mt-1 text-xs text-gray-500">
                              Roles: {(audience.roleScope || []).join(', ') || 'any'} · Platforms:{' '}
                              {(audience.platformScope || []).join(', ') || 'any'}
                            </div>
                          </div>
                          <button
                            onClick={() => startEditAudience(audience)}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-gray-900">Rollout Rules</h3>
                  {editingRuleId ? (
                    <button onClick={resetRuleForm} className="text-xs font-semibold text-gray-500 hover:text-gray-700">
                      Reset
                    </button>
                  ) : null}
                </div>
                <div className="grid gap-2">
                  <select
                    value={ruleForm.audienceId}
                    onChange={(event) => setRuleForm((current) => ({ ...current, audienceId: event.target.value }))}
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  >
                    <option value="">No audience scope</option>
                    {audiences.map((audience) => (
                      <option key={audience.id} value={audience.id}>
                        {audience.label}
                      </option>
                    ))}
                  </select>
                  <div className="grid gap-2 md:grid-cols-3">
                    <input
                      type="number"
                      value={ruleForm.rolloutPercent}
                      onChange={(event) =>
                        setRuleForm((current) => ({ ...current, rolloutPercent: Number(event.target.value || 0) }))
                      }
                      placeholder="Rollout %"
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                    <input
                      type="number"
                      value={ruleForm.priority}
                      onChange={(event) =>
                        setRuleForm((current) => ({ ...current, priority: Number(event.target.value || 100) }))
                      }
                      placeholder="Priority"
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                    <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                      Value ON
                      <input
                        type="checkbox"
                        checked={ruleForm.value}
                        onChange={(event) => setRuleForm((current) => ({ ...current, value: event.target.checked }))}
                        className="rounded text-blue-600"
                      />
                    </label>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2">
                    <input
                      type="datetime-local"
                      value={ruleForm.startAt}
                      onChange={(event) => setRuleForm((current) => ({ ...current, startAt: event.target.value }))}
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                    <input
                      type="datetime-local"
                      value={ruleForm.endAt}
                      onChange={(event) => setRuleForm((current) => ({ ...current, endAt: event.target.value }))}
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <textarea
                    value={ruleForm.conditionsText}
                    onChange={(event) => setRuleForm((current) => ({ ...current, conditionsText: event.target.value }))}
                    rows={4}
                    placeholder='{"notes":"optional custom targeting metadata"}'
                    className="rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs"
                  />
                  <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                    Rule is active
                    <input
                      type="checkbox"
                      checked={ruleForm.isActive}
                      onChange={(event) => setRuleForm((current) => ({ ...current, isActive: event.target.checked }))}
                      className="rounded text-blue-600"
                    />
                  </label>
                  <button
                    onClick={saveRule}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    {savingRule ? 'Saving...' : editingRuleId ? 'Save Rule' : 'Add Rule'}
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  {rules.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-gray-200 p-3 text-sm text-gray-400">
                      No rollout rules created for this flag yet.
                    </div>
                  ) : (
                    rules.map((rule) => (
                      <div key={rule.id} className="rounded-lg border border-gray-200 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-gray-900">
                              {rule.value ? 'Enable' : 'Disable'} · {rule.rolloutPercent}% rollout
                            </div>
                            <div className="text-xs text-gray-500">
                              Priority {rule.priority} · {rule.audienceLabel || 'No audience scope'}
                            </div>
                            <div className="mt-1 text-xs text-gray-500">
                              {rule.startAt ? `Starts ${new Date(rule.startAt).toLocaleString()} · ` : ''}
                              {rule.endAt ? `Ends ${new Date(rule.endAt).toLocaleString()}` : 'No schedule end'}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => startEditRule(rule)}
                              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => deactivateRule(rule)}
                              className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                            >
                              Deactivate
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <TestTube2 className="h-4 w-4 text-blue-600" />
                  <h3 className="text-sm font-bold text-gray-900">Resolution Tester</h3>
                </div>
                <div className="grid gap-2">
                  <input
                    value={resolveForm.key}
                    onChange={(event) => setResolveForm((current) => ({ ...current, key: event.target.value }))}
                    placeholder="Flag key"
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                  <div className="grid gap-2 md:grid-cols-2">
                    <input
                      value={resolveForm.userId}
                      onChange={(event) => setResolveForm((current) => ({ ...current, userId: event.target.value }))}
                      placeholder="User ID"
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                    <input
                      value={resolveForm.sessionKey}
                      onChange={(event) =>
                        setResolveForm((current) => ({ ...current, sessionKey: event.target.value }))
                      }
                      placeholder="Session key"
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="grid gap-2 md:grid-cols-3">
                    <input
                      value={resolveForm.role}
                      onChange={(event) => setResolveForm((current) => ({ ...current, role: event.target.value }))}
                      placeholder="Role"
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                    <input
                      value={resolveForm.country}
                      onChange={(event) => setResolveForm((current) => ({ ...current, country: event.target.value }))}
                      placeholder="Country"
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                    <input
                      value={resolveForm.platform}
                      onChange={(event) => setResolveForm((current) => ({ ...current, platform: event.target.value }))}
                      placeholder="Platform"
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <input
                    value={resolveForm.appVersion}
                    onChange={(event) => setResolveForm((current) => ({ ...current, appVersion: event.target.value }))}
                    placeholder="App version"
                    className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                  <button
                    onClick={resolveFlag}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                  >
                    {resolving ? 'Resolving...' : 'Resolve Flag'}
                  </button>
                </div>
                {resolveResult ? (
                  <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">
                    <div className="font-semibold">
                      Resolved: {resolveResult.value ? 'ON' : 'OFF'} · Variant {resolveResult.variant || 'default'}
                    </div>
                    <div className="mt-1">Flag: {resolveResult.flag?.key}</div>
                    <div className="mt-1">Exposure: {resolveResult.exposure?.id}</div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-bold text-gray-900">Recent Audit</h3>
                <div className="mt-3 space-y-2">
                  {auditLog.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-gray-200 p-3 text-sm text-gray-400">
                      No audit activity recorded for this flag yet.
                    </div>
                  ) : (
                    auditLog.map((entry) => (
                      <div key={entry.id} className="rounded-lg border border-gray-200 p-3">
                        <div className="font-semibold text-gray-900">{entry.action}</div>
                        <div className="text-xs text-gray-500">{new Date(entry.createdAt).toLocaleString()}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default FeatureControlCenter;
