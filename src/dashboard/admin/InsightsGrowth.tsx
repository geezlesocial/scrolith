import React, { useEffect, useMemo, useState } from 'react';
import { InsightsService } from '../../services/insights';
import { useNotification } from '../../context/NotificationContext';

const SCOPE_OPTIONS: Array<'global' | 'freelancer' | 'employer'> = ['global', 'freelancer', 'employer'];

const numberValue = (value: any, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const thisWeekKey = () => {
  const now = new Date();
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

const InsightsGrowth: React.FC = () => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [recomputeBusy, setRecomputeBusy] = useState(false);
  const [rebuildBusy, setRebuildBusy] = useState(false);
  const [achievementBusy, setAchievementBusy] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [achievements, setAchievements] = useState<any[]>([]);
  const [leaderboardScope, setLeaderboardScope] = useState<'global' | 'freelancer' | 'employer'>('global');
  const [leaderboardWeekKey, setLeaderboardWeekKey] = useState(thisWeekKey());
  const [leaderboard, setLeaderboard] = useState<any>(null);
  const [newAchievement, setNewAchievement] = useState({
    key: '',
    title: '',
    description: '',
    tier: 'bronze'
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [cfg, achievementRows] = await Promise.all([
        InsightsService.getAdminConfig(),
        InsightsService.getAdminAchievements()
      ]);
      setConfig(cfg || null);
      setAchievements(Array.isArray(achievementRows) ? achievementRows : []);
    } catch (error: any) {
      showNotification('error', 'Insights', error?.message || 'Failed to load Insights configuration.');
    } finally {
      setLoading(false);
    }
  };

  const loadLeaderboard = async (weekKey = leaderboardWeekKey, scope = leaderboardScope) => {
    try {
      const row = await InsightsService.getAdminLeaderboard(weekKey, scope);
      setLeaderboard(row || null);
    } catch (error: any) {
      showNotification('error', 'Insights Leaderboard', error?.message || 'Failed to load leaderboard.');
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    void loadLeaderboard();
  }, [leaderboardScope]);

  const updateConfigField = (path: string, value: any) => {
    setConfig((current: any) => {
      if (!current) return current;
      const next = { ...current };
      const keys = path.split('.');
      let pointer = next;
      for (let i = 0; i < keys.length - 1; i += 1) {
        pointer[keys[i]] = { ...(pointer[keys[i]] || {}) };
        pointer = pointer[keys[i]];
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
        pgs: {
          ...(config.pgs || {}),
          weights: {
            ...(config.pgs?.weights || {}),
            trustCompliance: numberValue(config.pgs?.weights?.trustCompliance, 0.22),
            deliveryReliability: numberValue(config.pgs?.weights?.deliveryReliability, 0.2),
            quality: numberValue(config.pgs?.weights?.quality, 0.2),
            communityContribution: numberValue(config.pgs?.weights?.communityContribution, 0.14),
            consistency: numberValue(config.pgs?.weights?.consistency, 0.1),
            marketplacePerformance: numberValue(config.pgs?.weights?.marketplacePerformance, 0.1),
            profileCompleteness: numberValue(config.pgs?.weights?.profileCompleteness, 0.04)
          },
          dailyCaps: {
            ...(config.pgs?.dailyCaps || {}),
            posts: Math.max(1, Math.floor(numberValue(config.pgs?.dailyCaps?.posts, 5))),
            comments: Math.max(1, Math.floor(numberValue(config.pgs?.dailyCaps?.comments, 10))),
            proposals: Math.max(1, Math.floor(numberValue(config.pgs?.dailyCaps?.proposals, 5))),
            messages: Math.max(1, Math.floor(numberValue(config.pgs?.dailyCaps?.messages, 30))),
            completions: Math.max(1, Math.floor(numberValue(config.pgs?.dailyCaps?.completions, 5)))
          }
        },
        matching: {
          ...(config.matching || {}),
          limitPerType: Math.max(5, Math.floor(numberValue(config.matching?.limitPerType, 20))),
          minScore: Math.max(1, numberValue(config.matching?.minScore, 25))
        },
        postPrediction: {
          ...(config.postPrediction || {}),
          randomSampleRate: Math.max(0, Math.min(1, numberValue(config.postPrediction?.randomSampleRate, 0.2)))
        }
      };
      const updated = await InsightsService.updateAdminConfig(payload);
      setConfig(updated);
      showNotification('success', 'Insights', 'Insights configuration saved.');
    } catch (error: any) {
      showNotification('error', 'Insights', error?.message || 'Failed to save Insights configuration.');
    } finally {
      setSavingConfig(false);
    }
  };

  const recomputeAll = async () => {
    setRecomputeBusy(true);
    try {
      const result = await InsightsService.recomputeAll(500);
      showNotification(
        'success',
        'Insights Recompute',
        `Completed. success=${Number(result?.success || 0)}, failed=${Number(result?.failed || 0)}`
      );
    } catch (error: any) {
      showNotification('error', 'Insights Recompute', error?.message || 'Failed to recompute scores.');
    } finally {
      setRecomputeBusy(false);
    }
  };

  const rebuildLeaderboard = async () => {
    setRebuildBusy(true);
    try {
      await InsightsService.rebuildAdminLeaderboard(SCOPE_OPTIONS);
      await loadLeaderboard();
      showNotification('success', 'Insights Leaderboard', 'Leaderboards rebuilt.');
    } catch (error: any) {
      showNotification('error', 'Insights Leaderboard', error?.message || 'Failed to rebuild leaderboards.');
    } finally {
      setRebuildBusy(false);
    }
  };

  const createAchievement = async () => {
    const key = String(newAchievement.key || '').trim().toUpperCase();
    const title = String(newAchievement.title || '').trim();
    if (!key || !title) {
      showNotification('warning', 'Achievements', 'Key and title are required.');
      return;
    }
    setAchievementBusy(true);
    try {
      await InsightsService.createAdminAchievement({
        key,
        title,
        description: newAchievement.description || null,
        tier: newAchievement.tier || 'bronze'
      });
      setNewAchievement({ key: '', title: '', description: '', tier: 'bronze' });
      setAchievements(await InsightsService.getAdminAchievements());
      showNotification('success', 'Achievements', 'Achievement created.');
    } catch (error: any) {
      showNotification('error', 'Achievements', error?.message || 'Failed to create achievement.');
    } finally {
      setAchievementBusy(false);
    }
  };

  const toggleAchievement = async (id: string) => {
    try {
      await InsightsService.toggleAdminAchievement(id);
      setAchievements(await InsightsService.getAdminAchievements());
    } catch (error: any) {
      showNotification('error', 'Achievements', error?.message || 'Failed to toggle achievement.');
    }
  };

  const leaderboardEntries = useMemo(
    () => (Array.isArray(leaderboard?.entries) ? leaderboard.entries.slice(0, 20) : []),
    [leaderboard]
  );

  if (loading && !config) {
    return <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading insights controls...</div>;
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-gray-900">PGS Weights & Anti-gaming</h3>
            <p className="text-xs text-gray-500">Deterministic score tuning and daily caps for enterprise-safe behavior.</p>
          </div>
          <button
            type="button"
            onClick={() => void recomputeAll()}
            disabled={recomputeBusy}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold uppercase text-gray-700 disabled:opacity-60"
          >
            {recomputeBusy ? 'Recomputing...' : 'Recompute all'}
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          {[
            ['pgs.weights.trustCompliance', 'Trust'],
            ['pgs.weights.deliveryReliability', 'Reliability'],
            ['pgs.weights.quality', 'Quality'],
            ['pgs.weights.communityContribution', 'Community'],
            ['pgs.weights.consistency', 'Consistency'],
            ['pgs.weights.marketplacePerformance', 'Performance'],
            ['pgs.weights.profileCompleteness', 'Profile']
          ].map(([path, label]) => (
            <label key={path} className="text-xs font-medium uppercase text-gray-500">
              {label}
              <input
                type="number"
                step="0.01"
                value={numberValue(path.split('.').reduce((obj: any, key: string) => obj?.[key], config), 0)}
                onChange={(event) => updateConfigField(path, numberValue(event.target.value, 0))}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-800"
              />
            </label>
          ))}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-5">
          {[
            ['pgs.dailyCaps.posts', 'Posts/day'],
            ['pgs.dailyCaps.comments', 'Comments/day'],
            ['pgs.dailyCaps.proposals', 'Proposals/day'],
            ['pgs.dailyCaps.messages', 'Messages/day'],
            ['pgs.dailyCaps.completions', 'Completions/day']
          ].map(([path, label]) => (
            <label key={path} className="text-xs font-medium uppercase text-gray-500">
              {label}
              <input
                type="number"
                value={Math.floor(numberValue(path.split('.').reduce((obj: any, key: string) => obj?.[key], config), 0))}
                onChange={(event) => updateConfigField(path, Math.max(1, Math.floor(numberValue(event.target.value, 1))))}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-800"
              />
            </label>
          ))}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="text-xs font-medium uppercase text-gray-500">
            Matching Limit / Type
            <input
              type="number"
              value={Math.floor(numberValue(config?.matching?.limitPerType, 20))}
              onChange={(event) => updateConfigField('matching.limitPerType', Math.max(5, Math.floor(numberValue(event.target.value, 20))))}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-800"
            />
          </label>
          <label className="text-xs font-medium uppercase text-gray-500">
            Matching Min Score
            <input
              type="number"
              step="0.1"
              value={numberValue(config?.matching?.minScore, 25)}
              onChange={(event) => updateConfigField('matching.minScore', Math.max(1, numberValue(event.target.value, 25)))}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-800"
            />
          </label>
          <label className="text-xs font-medium uppercase text-gray-500">
            AI Sample Rate
            <input
              type="number"
              step="0.01"
              min={0}
              max={1}
              value={numberValue(config?.postPrediction?.randomSampleRate, 0.2)}
              onChange={(event) => updateConfigField('postPrediction.randomSampleRate', Math.max(0, Math.min(1, numberValue(event.target.value, 0.2))))}
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-800"
            />
          </label>
        </div>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => void saveConfig()}
            disabled={savingConfig}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {savingConfig ? 'Saving...' : 'Save Config'}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-gray-900">Achievements</h3>
          <span className="text-xs text-gray-500">{achievements.length} total</span>
        </div>

        <div className="grid gap-2 md:grid-cols-4">
          <input
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            value={newAchievement.key}
            onChange={(e) => setNewAchievement((prev) => ({ ...prev, key: e.target.value }))}
            placeholder="KEY_NAME"
          />
          <input
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            value={newAchievement.title}
            onChange={(e) => setNewAchievement((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="Title"
          />
          <select
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            value={newAchievement.tier}
            onChange={(e) => setNewAchievement((prev) => ({ ...prev, tier: e.target.value }))}
          >
            <option value="bronze">bronze</option>
            <option value="silver">silver</option>
            <option value="gold">gold</option>
            <option value="platinum">platinum</option>
          </select>
          <button
            type="button"
            onClick={() => void createAchievement()}
            disabled={achievementBusy}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {achievementBusy ? 'Adding...' : 'Add Achievement'}
          </button>
        </div>
        <textarea
          className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          value={newAchievement.description}
          onChange={(e) => setNewAchievement((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="Description (optional)"
          rows={2}
        />

        <div className="mt-3 space-y-2">
          {achievements.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-semibold text-gray-800">{item.title}</p>
                <p className="truncate text-xs text-gray-500">
                  {item.key} · {item.tier} · {item.isActive ? 'active' : 'inactive'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => void toggleAchievement(item.id)}
                className="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700"
              >
                {item.isActive ? 'Disable' : 'Enable'}
              </button>
            </div>
          ))}
          {achievements.length === 0 ? <p className="text-xs text-gray-500">No achievements yet.</p> : null}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-gray-900">Weekly Leaderboard</h3>
          <button
            type="button"
            onClick={() => void rebuildLeaderboard()}
            disabled={rebuildBusy}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold uppercase text-gray-700 disabled:opacity-60"
          >
            {rebuildBusy ? 'Rebuilding...' : 'Rebuild now'}
          </button>
        </div>
        <div className="mb-3 grid gap-2 md:grid-cols-3">
          <select
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            value={leaderboardScope}
            onChange={(e) => setLeaderboardScope(e.target.value as any)}
          >
            {SCOPE_OPTIONS.map((scope) => (
              <option key={scope} value={scope}>
                {scope}
              </option>
            ))}
          </select>
          <input
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            value={leaderboardWeekKey}
            onChange={(e) => setLeaderboardWeekKey(e.target.value)}
            placeholder="YYYY-Wnn"
          />
          <button
            type="button"
            onClick={() => void loadLeaderboard(leaderboardWeekKey, leaderboardScope)}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
          >
            Load
          </button>
        </div>
        <div className="space-y-2">
          {leaderboardEntries.map((entry: any, index: number) => (
            <div key={`${entry.userId || 'row'}-${index}`} className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2 text-sm">
              <p className="truncate text-gray-800">
                #{index + 1} {entry.displayName || entry.username || entry.userId || 'User'}
              </p>
              <span className="font-semibold text-indigo-600">{Number(entry.score || 0).toFixed(0)}</span>
            </div>
          ))}
          {leaderboardEntries.length === 0 ? <p className="text-xs text-gray-500">No leaderboard entries loaded.</p> : null}
        </div>
      </section>
    </div>
  );
};

export default InsightsGrowth;
