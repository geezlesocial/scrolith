import React, { useEffect, useMemo, useState } from 'react';
import { Compass, Edit2, Power, RefreshCw, Search, Sparkles } from 'lucide-react';
import { AdminService } from '../../services/admin';
import { useNotification } from '../../context/NotificationContext';
import RecommendationManagement from './RecommendationManagement';

type DiscoverySummary = {
  searchRules: number;
  activeSearchRules: number;
  feedRecipes: number;
  activeFeedRecipes: number;
  recommendationConfigs: number;
  recommendationRules: number;
};

type SearchRule = {
  id: string;
  key: string;
  label: string;
  description?: string;
  scope: 'all' | 'search' | 'unified';
  targetType: 'all' | 'posts' | 'people' | 'pages' | 'jobs' | 'gigs';
  targetId?: string | null;
  queryPattern?: string | null;
  action: 'pin' | 'boost' | 'demote' | 'exclude';
  value: number;
  priority: number;
  metadata?: any;
  isActive: boolean;
};

type FeedRecipe = {
  id: string;
  key: string;
  label: string;
  description?: string;
  mode: 'for_you' | 'following' | 'hire' | 'sell' | 'learn' | 'local';
  weights: Record<string, any>;
  queryTakeMultiplier: number;
  queryTakeCap: number;
  isSystemRecipe: boolean;
  isActive: boolean;
};

const emptySummary: DiscoverySummary = {
  searchRules: 0,
  activeSearchRules: 0,
  feedRecipes: 0,
  activeFeedRecipes: 0,
  recommendationConfigs: 0,
  recommendationRules: 0
};

const emptyRuleForm = {
  key: '',
  label: '',
  description: '',
  scope: 'all' as 'all' | 'search' | 'unified',
  targetType: 'all' as 'all' | 'posts' | 'people' | 'pages' | 'jobs' | 'gigs',
  targetId: '',
  queryPattern: '',
  action: 'boost' as 'pin' | 'boost' | 'demote' | 'exclude',
  value: 1,
  priority: 100,
  isActive: true,
  metadataText: ''
};

const emptyRecipeForm = {
  key: '',
  label: '',
  description: '',
  mode: 'for_you' as 'for_you' | 'following' | 'hire' | 'sell' | 'learn' | 'local',
  queryTakeMultiplier: 4,
  queryTakeCap: 120,
  isActive: true,
  isSystemRecipe: false,
  weightsText: '{}'
};

const DiscoveryStudio: React.FC = () => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [savingRule, setSavingRule] = useState(false);
  const [savingRecipe, setSavingRecipe] = useState(false);
  const [summary, setSummary] = useState<DiscoverySummary>(emptySummary);
  const [rules, setRules] = useState<SearchRule[]>([]);
  const [recipes, setRecipes] = useState<FeedRecipe[]>([]);
  const [query, setQuery] = useState('');
  const [scopeFilter, setScopeFilter] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [selectedRecipeId, setSelectedRecipeId] = useState('');
  const [ruleForm, setRuleForm] = useState(emptyRuleForm);
  const [recipeForm, setRecipeForm] = useState(emptyRecipeForm);

  const selectedRecipe = useMemo(
    () => recipes.find((recipe) => recipe.id === selectedRecipeId) || null,
    [recipes, selectedRecipeId]
  );

  const loadSummary = async () => {
    const data = await AdminService.getDiscoverySummary();
    setSummary(data || emptySummary);
  };

  const loadRules = async () => {
    const data = await AdminService.getDiscoverySearchRules({
      query: query || undefined,
      scope: scopeFilter || undefined,
      targetType: targetTypeFilter || undefined,
      activeOnly
    });
    setRules(Array.isArray(data) ? data : []);
  };

  const loadRecipes = async () => {
    const data = await AdminService.getDiscoveryFeedRecipes();
    const rows = Array.isArray(data) ? data : [];
    setRecipes(rows);
    setSelectedRecipeId((current) => {
      if (current && rows.some((recipe) => recipe.id === current)) return current;
      return rows[0]?.id || '';
    });
  };

  const refreshAll = async () => {
    try {
      setRefreshing(true);
      await Promise.all([loadSummary(), loadRules(), loadRecipes()]);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        setLoading(true);
        await Promise.all([loadSummary(), loadRules(), loadRecipes()]);
      } catch (error: any) {
        showNotification('alert', 'Discovery Studio Error', error?.message || 'Failed to load discovery studio.');
      } finally {
        setLoading(false);
      }
    };
    bootstrap();
  }, []);

  useEffect(() => {
    if (loading) return;
    loadRules().catch((error: any) => {
      showNotification('alert', 'Search Rules Error', error?.message || 'Failed to load search ranking rules.');
    });
  }, [scopeFilter, targetTypeFilter, activeOnly]);

  useEffect(() => {
    if (!selectedRecipe) return;
    setRecipeForm({
      key: selectedRecipe.key,
      label: selectedRecipe.label,
      description: selectedRecipe.description || '',
      mode: selectedRecipe.mode,
      queryTakeMultiplier: Number(selectedRecipe.queryTakeMultiplier || 4),
      queryTakeCap: Number(selectedRecipe.queryTakeCap || 120),
      isActive: selectedRecipe.isActive !== false,
      isSystemRecipe: Boolean(selectedRecipe.isSystemRecipe),
      weightsText: JSON.stringify(selectedRecipe.weights || {}, null, 2)
    });
  }, [selectedRecipeId, selectedRecipe]);

  useEffect(() => {
    const refresh = () => {
      refreshAll().catch(() => null);
    };
    window.addEventListener('search:rules_updated', refresh as EventListener);
    window.addEventListener('feed:recipe_updated', refresh as EventListener);
    return () => {
      window.removeEventListener('search:rules_updated', refresh as EventListener);
      window.removeEventListener('feed:recipe_updated', refresh as EventListener);
    };
  }, [query, scopeFilter, targetTypeFilter, activeOnly]);

  const resetRuleForm = () => {
    setEditingRuleId(null);
    setRuleForm(emptyRuleForm);
  };

  const startEditRule = (rule: SearchRule) => {
    setEditingRuleId(rule.id);
    setRuleForm({
      key: rule.key,
      label: rule.label,
      description: rule.description || '',
      scope: rule.scope,
      targetType: rule.targetType,
      targetId: rule.targetId || '',
      queryPattern: rule.queryPattern || '',
      action: rule.action,
      value: Number(rule.value || 1),
      priority: Number(rule.priority || 100),
      isActive: rule.isActive !== false,
      metadataText: rule.metadata ? JSON.stringify(rule.metadata, null, 2) : ''
    });
  };

  const saveRule = async () => {
    try {
      setSavingRule(true);
      const payload = {
        key: ruleForm.key,
        label: ruleForm.label,
        description: ruleForm.description || null,
        scope: ruleForm.scope,
        targetType: ruleForm.targetType,
        targetId: ruleForm.targetId || null,
        queryPattern: ruleForm.queryPattern || null,
        action: ruleForm.action,
        value: Number(ruleForm.value || 1),
        priority: Number(ruleForm.priority || 100),
        isActive: ruleForm.isActive,
        metadata: ruleForm.metadataText.trim() ? JSON.parse(ruleForm.metadataText) : null
      };

      if (editingRuleId) {
        await AdminService.updateDiscoverySearchRule(editingRuleId, payload);
        showNotification('success', 'Discovery Rules', 'Search ranking rule updated.');
      } else {
        await AdminService.createDiscoverySearchRule(payload);
        showNotification('success', 'Discovery Rules', 'Search ranking rule created.');
      }

      resetRuleForm();
      await Promise.all([loadSummary(), loadRules()]);
    } catch (error: any) {
      showNotification('alert', 'Save Failed', error?.message || 'Failed to save search ranking rule.');
    } finally {
      setSavingRule(false);
    }
  };

  const deactivateRule = async (rule: SearchRule) => {
    if (!window.confirm(`Deactivate ${rule.label}?`)) return;
    try {
      await AdminService.deactivateDiscoverySearchRule(rule.id);
      showNotification('info', 'Discovery Rules', `${rule.label} has been deactivated.`);
      await Promise.all([loadSummary(), loadRules()]);
    } catch (error: any) {
      showNotification('alert', 'Deactivate Failed', error?.message || 'Failed to deactivate search ranking rule.');
    }
  };

  const saveRecipe = async () => {
    if (!selectedRecipeId) {
      showNotification('info', 'Recipe Required', 'Select a feed recipe before saving.');
      return;
    }

    try {
      setSavingRecipe(true);
      const payload = {
        key: recipeForm.key,
        label: recipeForm.label,
        description: recipeForm.description || null,
        mode: recipeForm.mode,
        queryTakeMultiplier: Number(recipeForm.queryTakeMultiplier || 4),
        queryTakeCap: Number(recipeForm.queryTakeCap || 120),
        isActive: recipeForm.isActive,
        isSystemRecipe: recipeForm.isSystemRecipe,
        weights: recipeForm.weightsText.trim() ? JSON.parse(recipeForm.weightsText) : {}
      };

      await AdminService.updateDiscoveryFeedRecipe(selectedRecipeId, payload);
      showNotification('success', 'Feed Recipes', 'Feed recipe updated.');
      await Promise.all([loadSummary(), loadRecipes()]);
    } catch (error: any) {
      showNotification('alert', 'Recipe Save Failed', error?.message || 'Failed to save feed recipe.');
    } finally {
      setSavingRecipe(false);
    }
  };

  if (loading) {
    return <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading discovery studio...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Discovery Studio</h2>
          <p className="text-sm text-gray-500">
            Search ranking rules, community feed recipes, and recommendation controls for native Scrolith discovery.
          </p>
        </div>
        <button
          onClick={() => void refreshAll()}
          className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Search Rules', value: `${summary.activeSearchRules}/${summary.searchRules}` },
          { label: 'Feed Recipes', value: `${summary.activeFeedRecipes}/${summary.feedRecipes}` },
          { label: 'Reco Configs', value: summary.recommendationConfigs },
          { label: 'Reco Rules', value: summary.recommendationRules }
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{card.label}</div>
            <div className="mt-2 text-2xl font-bold text-slate-900">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr,1fr]">
        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Compass className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-gray-900">Search Ranking Rules</h3>
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="flex items-center rounded-lg border border-gray-200 px-3">
                <Search className="mr-2 h-4 w-4 text-gray-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      loadRules().catch(() => null);
                    }
                  }}
                  placeholder="Search rules"
                  className="w-full bg-transparent py-2 text-sm outline-none"
                />
              </div>
              <select
                value={scopeFilter}
                onChange={(event) => setScopeFilter(event.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="">All scopes</option>
                <option value="all">all</option>
                <option value="search">search</option>
                <option value="unified">unified</option>
              </select>
              <select
                value={targetTypeFilter}
                onChange={(event) => setTargetTypeFilter(event.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="">All targets</option>
                <option value="all">all</option>
                <option value="posts">posts</option>
                <option value="people">people</option>
                <option value="pages">pages</option>
                <option value="jobs">jobs</option>
                <option value="gigs">gigs</option>
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
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-4 py-3">
              <h3 className="text-sm font-bold text-gray-900">Rule Inventory</h3>
              <p className="mt-1 text-xs text-gray-500">Pin, boost, demote, or exclude search results without changing the base search contracts.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-3">Rule</th>
                    <th className="px-4 py-3">Target</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                        No search ranking rules match the current filters.
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
                          <div className="text-sm font-medium text-gray-800">{rule.targetType}</div>
                          <div className="text-xs text-gray-500">{rule.scope}{rule.targetId ? ` / ${rule.targetId}` : ''}</div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                            {rule.action} {Number(rule.value || 1)}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-top text-sm font-semibold text-gray-800">{rule.priority}</td>
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
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-gray-900">{editingRuleId ? 'Edit Search Rule' : 'Create Search Rule'}</h3>
            </div>
            <div className="grid gap-2">
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
              <textarea
                value={ruleForm.description}
                onChange={(event) => setRuleForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Description"
                rows={2}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <div className="grid gap-2 md:grid-cols-2">
                <select
                  value={ruleForm.scope}
                  onChange={(event) => setRuleForm((current) => ({ ...current, scope: event.target.value as any }))}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  <option value="all">all</option>
                  <option value="search">search</option>
                  <option value="unified">unified</option>
                </select>
                <select
                  value={ruleForm.targetType}
                  onChange={(event) => setRuleForm((current) => ({ ...current, targetType: event.target.value as any }))}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  <option value="all">all</option>
                  <option value="posts">posts</option>
                  <option value="people">people</option>
                  <option value="pages">pages</option>
                  <option value="jobs">jobs</option>
                  <option value="gigs">gigs</option>
                </select>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <input
                  value={ruleForm.targetId}
                  onChange={(event) => setRuleForm((current) => ({ ...current, targetId: event.target.value }))}
                  placeholder="Target ID or *"
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <input
                  value={ruleForm.queryPattern}
                  onChange={(event) => setRuleForm((current) => ({ ...current, queryPattern: event.target.value }))}
                  placeholder="Query pattern"
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid gap-2 md:grid-cols-3">
                <select
                  value={ruleForm.action}
                  onChange={(event) => setRuleForm((current) => ({ ...current, action: event.target.value as any }))}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  <option value="boost">boost</option>
                  <option value="pin">pin</option>
                  <option value="demote">demote</option>
                  <option value="exclude">exclude</option>
                </select>
                <input
                  type="number"
                  step="0.1"
                  value={ruleForm.value}
                  onChange={(event) => setRuleForm((current) => ({ ...current, value: Number(event.target.value || 1) }))}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  value={ruleForm.priority}
                  onChange={(event) => setRuleForm((current) => ({ ...current, priority: Number(event.target.value || 100) }))}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <textarea
                value={ruleForm.metadataText}
                onChange={(event) => setRuleForm((current) => ({ ...current, metadataText: event.target.value }))}
                placeholder='Metadata JSON, e.g. {"categoryId":"..."}'
                rows={4}
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
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => void saveRule()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                {savingRule ? 'Saving...' : editingRuleId ? 'Save Rule' : 'Create Rule'}
              </button>
              <button
                onClick={resetRuleForm}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Reset
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <Compass className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-gray-900">Feed Recipes</h3>
            </div>
            <div className="grid gap-2">
              <select
                value={selectedRecipeId}
                onChange={(event) => setSelectedRecipeId(event.target.value)}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                {recipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>
                    {recipe.label} ({recipe.mode})
                  </option>
                ))}
              </select>
              <input
                value={recipeForm.key}
                onChange={(event) => setRecipeForm((current) => ({ ...current, key: event.target.value }))}
                placeholder="Recipe key"
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <input
                value={recipeForm.label}
                onChange={(event) => setRecipeForm((current) => ({ ...current, label: event.target.value }))}
                placeholder="Recipe label"
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <textarea
                value={recipeForm.description}
                onChange={(event) => setRecipeForm((current) => ({ ...current, description: event.target.value }))}
                placeholder="Description"
                rows={2}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
              <div className="grid gap-2 md:grid-cols-3">
                <select
                  value={recipeForm.mode}
                  onChange={(event) => setRecipeForm((current) => ({ ...current, mode: event.target.value as any }))}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                >
                  <option value="for_you">for_you</option>
                  <option value="following">following</option>
                  <option value="hire">hire</option>
                  <option value="sell">sell</option>
                  <option value="learn">learn</option>
                  <option value="local">local</option>
                </select>
                <input
                  type="number"
                  value={recipeForm.queryTakeMultiplier}
                  onChange={(event) =>
                    setRecipeForm((current) => ({ ...current, queryTakeMultiplier: Number(event.target.value || 4) }))
                  }
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
                <input
                  type="number"
                  value={recipeForm.queryTakeCap}
                  onChange={(event) =>
                    setRecipeForm((current) => ({ ...current, queryTakeCap: Number(event.target.value || 120) }))
                  }
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
                />
              </div>
              <textarea
                value={recipeForm.weightsText}
                onChange={(event) => setRecipeForm((current) => ({ ...current, weightsText: event.target.value }))}
                rows={8}
                className="rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs"
              />
              <div className="grid gap-2 md:grid-cols-2">
                <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  Active
                  <input
                    type="checkbox"
                    checked={recipeForm.isActive}
                    onChange={(event) => setRecipeForm((current) => ({ ...current, isActive: event.target.checked }))}
                    className="rounded text-blue-600"
                  />
                </label>
                <label className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  System recipe
                  <input
                    type="checkbox"
                    checked={recipeForm.isSystemRecipe}
                    onChange={(event) =>
                      setRecipeForm((current) => ({ ...current, isSystemRecipe: event.target.checked }))
                    }
                    className="rounded text-blue-600"
                  />
                </label>
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={() => void saveRecipe()}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                {savingRecipe ? 'Saving...' : 'Save Recipe'}
              </button>
              {selectedRecipe ? (
                <div className="text-xs text-gray-500">
                  Active feed mode: <span className="font-semibold text-gray-700">{selectedRecipe.mode}</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-blue-600" />
          <h3 className="text-sm font-bold text-gray-900">Recommendation Controls</h3>
        </div>
        <RecommendationManagement />
      </div>
    </div>
  );
};

export default DiscoveryStudio;
