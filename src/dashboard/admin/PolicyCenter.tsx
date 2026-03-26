import React, { useEffect, useMemo, useState } from 'react';
import { Edit2, Plus, Power, RefreshCw, Search, Shield, UserCog } from 'lucide-react';
import { AdminService } from '../../services/admin';
import { useNotification } from '../../context/NotificationContext';

type PolicySummary = {
  namespaces: number;
  resources: number;
  rules: number;
  activeRules: number;
  overrides: number;
  activeOverrides: number;
  permissionSuggestions: number;
};

type CatalogResource = {
  id: string;
  key: string;
  label: string;
  description?: string;
};

type CatalogNamespace = {
  id: string;
  key: string;
  label: string;
  description?: string;
  resources: CatalogResource[];
};

type PolicyRule = {
  id: string;
  key: string;
  label: string;
  description?: string;
  permissionKey: string;
  effect: 'ALLOW' | 'DENY';
  priority: number;
  isActive: boolean;
  namespaceKey: string;
  namespaceLabel: string;
  resourceKey?: string | null;
  resourceLabel?: string | null;
  conditions?: any;
};

type PolicyOverrideUser = {
  id: string;
  email: string;
  username?: string;
  name?: string;
  role?: string;
  isActive?: boolean;
};

type PolicyOverride = {
  id: string;
  userId: string;
  permissionKey: string;
  resourceType?: string | null;
  resourceId?: string | null;
  effect: 'ALLOW' | 'DENY';
  reason?: string;
  expiresAt?: string | null;
  isActive: boolean;
};

const emptySummary: PolicySummary = {
  namespaces: 0,
  resources: 0,
  rules: 0,
  activeRules: 0,
  overrides: 0,
  activeOverrides: 0,
  permissionSuggestions: 0
};

const emptyRuleForm = {
  namespaceKey: '',
  resourceKey: '',
  key: '',
  label: '',
  description: '',
  permissionKey: '',
  effect: 'ALLOW' as 'ALLOW' | 'DENY',
  priority: 100,
  isActive: true,
  conditionsText: ''
};

const emptyOverrideForm = {
  permissionKey: '',
  resourceType: '',
  resourceId: '',
  effect: 'ALLOW' as 'ALLOW' | 'DENY',
  reason: '',
  expiresAt: '',
  isActive: true
};

const PolicyCenter: React.FC = () => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [savingOverride, setSavingOverride] = useState(false);
  const [summary, setSummary] = useState<PolicySummary>(emptySummary);
  const [catalog, setCatalog] = useState<CatalogNamespace[]>([]);
  const [permissionSuggestions, setPermissionSuggestions] = useState<string[]>([]);
  const [rules, setRules] = useState<PolicyRule[]>([]);
  const [namespaceFilter, setNamespaceFilter] = useState('');
  const [resourceFilter, setResourceFilter] = useState('');
  const [query, setQuery] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState(emptyRuleForm);
  const [overrideLookup, setOverrideLookup] = useState('');
  const [overrideUser, setOverrideUser] = useState<PolicyOverrideUser | null>(null);
  const [overrides, setOverrides] = useState<PolicyOverride[]>([]);
  const [editingOverrideId, setEditingOverrideId] = useState<string | null>(null);
  const [overrideForm, setOverrideForm] = useState(emptyOverrideForm);

  const filteredNamespace = useMemo(
    () => catalog.find((entry) => entry.key === namespaceFilter) || null,
    [catalog, namespaceFilter]
  );
  const formNamespace = useMemo(
    () => catalog.find((entry) => entry.key === ruleForm.namespaceKey) || null,
    [catalog, ruleForm.namespaceKey]
  );

  const loadSummaryAndCatalog = async () => {
    const [summaryData, catalogData] = await Promise.all([
      AdminService.getPolicySummary(),
      AdminService.getPolicyCatalog()
    ]);
    setSummary(summaryData || emptySummary);
    setCatalog(Array.isArray(catalogData?.namespaces) ? catalogData.namespaces : []);
    setPermissionSuggestions(Array.isArray(catalogData?.permissionSuggestions) ? catalogData.permissionSuggestions : []);
  };

  const loadRules = async () => {
    const data = await AdminService.getPolicyRules({
      namespaceKey: namespaceFilter || undefined,
      resourceKey: resourceFilter || undefined,
      query: query || undefined,
      activeOnly
    });
    setRules(Array.isArray(data) ? data : []);
  };

  const loadOverrides = async (identifier = overrideLookup) => {
    const cleaned = identifier.trim();
    if (!cleaned) {
      showNotification('info', 'User Lookup Required', 'Enter a user email, username, or ID.');
      return;
    }
    const data = await AdminService.getUserPermissionOverrides(cleaned);
    setOverrideUser(data?.user || null);
    setOverrides(Array.isArray(data?.overrides) ? data.overrides : []);
    if (!data?.user) {
      showNotification('info', 'User Not Found', 'No user matched that identifier.');
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        setLoading(true);
        await Promise.all([loadSummaryAndCatalog(), loadRules()]);
      } catch (error: any) {
        showNotification('alert', 'Policy Center Error', error?.message || 'Failed to load Policy Center');
      } finally {
        setLoading(false);
      }
    };
    bootstrap();
  }, []);

  useEffect(() => {
    if (loading) return;
    loadRules().catch((error: any) => {
      showNotification('alert', 'Policy Rules Error', error?.message || 'Failed to load policy rules');
    });
  }, [namespaceFilter, resourceFilter, activeOnly]);

  useEffect(() => {
    if (!ruleForm.namespaceKey && catalog.length > 0) {
      setRuleForm((current) => ({
        ...current,
        namespaceKey: catalog[0]?.key || ''
      }));
    }
  }, [catalog, ruleForm.namespaceKey]);

  const resetRuleForm = () => {
    setEditingRuleId(null);
    setRuleForm({
      ...emptyRuleForm,
      namespaceKey: catalog[0]?.key || ''
    });
  };

  const startEditRule = (rule: PolicyRule) => {
    setEditingRuleId(rule.id);
    setRuleForm({
      namespaceKey: rule.namespaceKey,
      resourceKey: rule.resourceKey || '',
      key: rule.key,
      label: rule.label,
      description: rule.description || '',
      permissionKey: rule.permissionKey,
      effect: rule.effect,
      priority: Number(rule.priority || 100),
      isActive: rule.isActive !== false,
      conditionsText: rule.conditions ? JSON.stringify(rule.conditions, null, 2) : ''
    });
  };

  const saveRule = async () => {
    try {
      setSavingRule(true);
      const payload = {
        namespaceKey: ruleForm.namespaceKey,
        resourceKey: ruleForm.resourceKey || null,
        key: ruleForm.key,
        label: ruleForm.label,
        description: ruleForm.description || null,
        permissionKey: ruleForm.permissionKey,
        effect: ruleForm.effect,
        priority: Number(ruleForm.priority || 100),
        isActive: ruleForm.isActive,
        conditions: ruleForm.conditionsText.trim() ? JSON.parse(ruleForm.conditionsText) : undefined
      };
      if (editingRuleId) {
        await AdminService.updatePolicyRule(editingRuleId, payload);
        showNotification('success', 'Policy Updated', `${payload.label} was updated.`);
      } else {
        await AdminService.createPolicyRule(payload);
        showNotification('success', 'Policy Created', `${payload.label} was created.`);
      }
      resetRuleForm();
      await Promise.all([loadSummaryAndCatalog(), loadRules()]);
    } catch (error: any) {
      showNotification('alert', 'Save Failed', error?.message || 'Failed to save policy rule');
    } finally {
      setSavingRule(false);
    }
  };

  const deactivateRule = async (rule: PolicyRule) => {
    if (!window.confirm(`Deactivate ${rule.label}?`)) return;
    try {
      await AdminService.deactivatePolicyRule(rule.id);
      showNotification('info', 'Rule Deactivated', `${rule.label} has been deactivated.`);
      await Promise.all([loadSummaryAndCatalog(), loadRules()]);
    } catch (error: any) {
      showNotification('alert', 'Deactivate Failed', error?.message || 'Failed to deactivate rule');
    }
  };

  const resetOverrideForm = () => {
    setEditingOverrideId(null);
    setOverrideForm(emptyOverrideForm);
  };

  const startEditOverride = (override: PolicyOverride) => {
    setEditingOverrideId(override.id);
    setOverrideForm({
      permissionKey: override.permissionKey,
      resourceType: override.resourceType || '',
      resourceId: override.resourceId || '',
      effect: override.effect,
      reason: override.reason || '',
      expiresAt: override.expiresAt ? String(override.expiresAt).slice(0, 16) : '',
      isActive: override.isActive !== false
    });
  };

  const saveOverride = async () => {
    if (!overrideUser?.id) {
      showNotification('info', 'User Lookup Required', 'Load a user before saving overrides.');
      return;
    }
    try {
      setSavingOverride(true);
      const payload = {
        identifier: overrideUser.email || overrideUser.id,
        permissionKey: overrideForm.permissionKey,
        resourceType: overrideForm.resourceType || null,
        resourceId: overrideForm.resourceId || null,
        effect: overrideForm.effect,
        reason: overrideForm.reason || null,
        expiresAt: overrideForm.expiresAt || null,
        isActive: overrideForm.isActive
      };
      if (editingOverrideId) {
        await AdminService.updateUserPermissionOverride(editingOverrideId, payload);
        showNotification('success', 'Override Updated', 'The user override was updated.');
      } else {
        await AdminService.createUserPermissionOverride(payload);
        showNotification('success', 'Override Added', 'A user override was created.');
      }
      resetOverrideForm();
      await Promise.all([loadSummaryAndCatalog(), loadOverrides(overrideLookup)]);
    } catch (error: any) {
      showNotification('alert', 'Override Save Failed', error?.message || 'Failed to save override');
    } finally {
      setSavingOverride(false);
    }
  };

  const deactivateOverride = async (override: PolicyOverride) => {
    if (!window.confirm(`Deactivate ${override.permissionKey}?`)) return;
    try {
      await AdminService.deactivateUserPermissionOverride(override.id);
      showNotification('info', 'Override Deactivated', 'The override has been deactivated.');
      await Promise.all([loadSummaryAndCatalog(), loadOverrides(overrideLookup)]);
    } catch (error: any) {
      showNotification('alert', 'Override Deactivate Failed', error?.message || 'Failed to deactivate override');
    }
  };

  if (loading) {
    return <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading Policy Center...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Policy Center</h2>
          <p className="text-sm text-gray-500">Native rules, resource scopes, and per-user permission overrides.</p>
        </div>
        <button
          onClick={async () => {
            try {
              setRefreshing(true);
              await Promise.all([loadSummaryAndCatalog(), loadRules()]);
              showNotification('success', 'Policy Center Refreshed', 'Policy data is now up to date.');
            } catch (error: any) {
              showNotification('alert', 'Refresh Failed', error?.message || 'Failed to refresh policy data');
            } finally {
              setRefreshing(false);
            }
          }}
          className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Namespaces', value: summary.namespaces },
          { label: 'Resources', value: summary.resources },
          { label: 'Rules', value: `${summary.activeRules}/${summary.rules}` },
          { label: 'Overrides', value: `${summary.activeOverrides}/${summary.overrides}` }
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{item.label}</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[2fr,1fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-gray-900">Rules</h3>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <select
                value={namespaceFilter}
                onChange={(event) => {
                  setNamespaceFilter(event.target.value);
                  setResourceFilter('');
                }}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="">All namespaces</option>
                {catalog.map((namespace) => (
                  <option key={namespace.id} value={namespace.key}>
                    {namespace.label}
                  </option>
                ))}
              </select>
              <select
                value={resourceFilter}
                onChange={(event) => setResourceFilter(event.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="">All resources</option>
                {(filteredNamespace?.resources || []).map((resource) => (
                  <option key={resource.id} value={resource.key}>
                    {resource.label}
                  </option>
                ))}
              </select>
              <div className="flex items-center rounded-lg border border-gray-200 px-3">
                <Search className="mr-2 h-4 w-4 text-gray-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') loadRules().catch(() => undefined);
                  }}
                  placeholder="Search rules"
                  className="w-full bg-transparent py-2 text-sm outline-none"
                />
              </div>
              <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                Active only
                <input
                  type="checkbox"
                  checked={activeOnly}
                  onChange={(event) => setActiveOnly(event.target.checked)}
                  className="rounded text-blue-600"
                />
              </label>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Rule</th>
                    <th className="px-4 py-3">Permission</th>
                    <th className="px-4 py-3">Scope</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-400">
                        No rules match the current filters.
                      </td>
                    </tr>
                  ) : (
                    rules.map((rule) => (
                      <tr key={rule.id} className="border-t border-gray-100">
                        <td className="px-4 py-3 align-top">
                          <div className="font-semibold text-gray-900">{rule.label}</div>
                          <div className="text-xs text-gray-500">{rule.key}</div>
                          {rule.description ? <div className="mt-1 text-xs text-gray-500">{rule.description}</div> : null}
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                            {rule.permissionKey}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="text-sm font-medium text-gray-800">{rule.namespaceLabel}</div>
                          <div className="text-xs text-gray-500">{rule.resourceLabel || 'Namespace-wide'}</div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="font-semibold text-gray-800">{rule.priority}</div>
                          <div className="text-xs text-gray-500">{rule.effect}</div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span
                            className={`rounded-full px-2 py-1 text-xs font-semibold ${
                              rule.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                            }`}
                          >
                            {rule.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => startEditRule(rule)}
                              className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                            >
                              <Edit2 className="mr-1 h-3.5 w-3.5" />
                              Edit
                            </button>
                            <button
                              onClick={() => deactivateRule(rule)}
                              disabled={!rule.isActive}
                              className="inline-flex items-center rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Power className="mr-1 h-3.5 w-3.5" />
                              Deactivate
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

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900">{editingRuleId ? 'Edit Rule' : 'Create Rule'}</h3>
                <p className="text-xs text-gray-500">Additive rules only. Existing behavior remains untouched until a rule is activated.</p>
              </div>
              <button
                onClick={resetRuleForm}
                className="inline-flex items-center rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                <Plus className="mr-1 h-3.5 w-3.5" />
                New
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <select
                value={ruleForm.namespaceKey}
                onChange={(event) => setRuleForm((current) => ({ ...current, namespaceKey: event.target.value, resourceKey: '' }))}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="">Select namespace</option>
                {catalog.map((namespace) => (
                  <option key={namespace.id} value={namespace.key}>
                    {namespace.label}
                  </option>
                ))}
              </select>
              <select
                value={ruleForm.resourceKey}
                onChange={(event) => setRuleForm((current) => ({ ...current, resourceKey: event.target.value }))}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="">Namespace-wide</option>
                {(formNamespace?.resources || []).map((resource) => (
                  <option key={resource.id} value={resource.key}>
                    {resource.label}
                  </option>
                ))}
              </select>
              <input
                value={ruleForm.key}
                onChange={(event) => setRuleForm((current) => ({ ...current, key: event.target.value }))}
                placeholder="Rule key"
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <input
                value={ruleForm.label}
                onChange={(event) => setRuleForm((current) => ({ ...current, label: event.target.value }))}
                placeholder="Rule label"
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <input
                list="policy-permission-suggestions"
                value={ruleForm.permissionKey}
                onChange={(event) => setRuleForm((current) => ({ ...current, permissionKey: event.target.value }))}
                placeholder="Permission key"
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm md:col-span-2"
              />
              <textarea
                value={ruleForm.description}
                onChange={(event) => setRuleForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Description"
                rows={3}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm md:col-span-2"
              />
              <select
                value={ruleForm.effect}
                onChange={(event) => setRuleForm((current) => ({ ...current, effect: event.target.value as 'ALLOW' | 'DENY' }))}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="ALLOW">ALLOW</option>
                <option value="DENY">DENY</option>
              </select>
              <input
                type="number"
                value={ruleForm.priority}
                onChange={(event) => setRuleForm((current) => ({ ...current, priority: Number(event.target.value || 100) }))}
                placeholder="Priority"
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <textarea
                value={ruleForm.conditionsText}
                onChange={(event) => setRuleForm((current) => ({ ...current, conditionsText: event.target.value }))}
                placeholder='Conditions JSON, e.g. {"audience":["guest","member"]}'
                rows={5}
                className="rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs md:col-span-2"
              />
              <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 md:col-span-2">
                Rule is active
                <input
                  type="checkbox"
                  checked={ruleForm.isActive}
                  onChange={(event) => setRuleForm((current) => ({ ...current, isActive: event.target.checked }))}
                  className="rounded text-blue-600"
                />
              </label>
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={saveRule}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                {savingRule ? 'Saving...' : editingRuleId ? 'Save Changes' : 'Create Rule'}
              </button>
              <button
                onClick={resetRuleForm}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Reset
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-gray-900">Native Catalog</h3>
            </div>
            <div className="space-y-3">
              {catalog.map((namespace) => (
                <div key={namespace.id} className="rounded-lg border border-gray-200 p-3">
                  <div className="font-semibold text-gray-900">{namespace.label}</div>
                  {namespace.description ? <div className="mt-1 text-xs text-gray-500">{namespace.description}</div> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {namespace.resources.map((resource) => (
                      <span key={resource.id} className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                        {resource.label}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <UserCog className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-gray-900">User Overrides</h3>
            </div>
            <div className="space-y-3">
              <div className="flex gap-2">
                <input
                  value={overrideLookup}
                  onChange={(event) => setOverrideLookup(event.target.value)}
                  placeholder="User email, username, or ID"
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <button
                  onClick={() => loadOverrides().catch((error: any) => showNotification('alert', 'Lookup Failed', error?.message || 'Failed to load user overrides'))}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Load
                </button>
              </div>
              {overrideUser ? (
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
                  <div className="font-semibold">{overrideUser.name || overrideUser.email}</div>
                  <div className="text-xs">{overrideUser.email}</div>
                  <div className="mt-1 text-xs">{overrideUser.username ? `@${overrideUser.username}` : 'No username'} · {overrideUser.role}</div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-gray-200 p-3 text-sm text-gray-400">
                  Load a user to manage per-user permission overrides.
                </div>
              )}

              {overrideUser ? (
                <>
                  <input
                    list="policy-permission-suggestions"
                    value={overrideForm.permissionKey}
                    onChange={(event) => setOverrideForm((current) => ({ ...current, permissionKey: event.target.value }))}
                    placeholder="Permission key"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                  <div className="grid gap-2 md:grid-cols-2">
                    <input
                      value={overrideForm.resourceType}
                      onChange={(event) => setOverrideForm((current) => ({ ...current, resourceType: event.target.value }))}
                      placeholder="Resource type"
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                    <input
                      value={overrideForm.resourceId}
                      onChange={(event) => setOverrideForm((current) => ({ ...current, resourceId: event.target.value }))}
                      placeholder="Resource ID"
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="grid gap-2 md:grid-cols-3">
                    <select
                      value={overrideForm.effect}
                      onChange={(event) => setOverrideForm((current) => ({ ...current, effect: event.target.value as 'ALLOW' | 'DENY' }))}
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    >
                      <option value="ALLOW">ALLOW</option>
                      <option value="DENY">DENY</option>
                    </select>
                    <input
                      type="datetime-local"
                      value={overrideForm.expiresAt}
                      onChange={(event) => setOverrideForm((current) => ({ ...current, expiresAt: event.target.value }))}
                      className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                    />
                    <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                      Active
                      <input
                        type="checkbox"
                        checked={overrideForm.isActive}
                        onChange={(event) => setOverrideForm((current) => ({ ...current, isActive: event.target.checked }))}
                        className="rounded text-blue-600"
                      />
                    </label>
                  </div>
                  <textarea
                    value={overrideForm.reason}
                    onChange={(event) => setOverrideForm((current) => ({ ...current, reason: event.target.value }))}
                    placeholder="Reason / operator note"
                    rows={3}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={saveOverride}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      {savingOverride ? 'Saving...' : editingOverrideId ? 'Save Override' : 'Add Override'}
                    </button>
                    <button
                      onClick={resetOverrideForm}
                      className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      Reset
                    </button>
                  </div>

                  {overrides.length > 0 ? (
                    <div className="space-y-2">
                      {overrides.map((override) => (
                        <div key={override.id} className="rounded-lg border border-gray-200 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold text-gray-900">{override.permissionKey}</div>
                              <div className="mt-1 text-xs text-gray-500">
                                {override.effect} · {override.resourceType || 'Global'}{override.resourceId ? ` / ${override.resourceId}` : ''}
                              </div>
                              {override.reason ? <div className="mt-1 text-xs text-gray-500">{override.reason}</div> : null}
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => startEditOverride(override)}
                                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => deactivateOverride(override)}
                                disabled={!override.isActive}
                                className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                Deactivate
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <datalist id="policy-permission-suggestions">
        {permissionSuggestions.map((permission) => (
          <option key={permission} value={permission} />
        ))}
      </datalist>
    </div>
  );
};

export default PolicyCenter;
