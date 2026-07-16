import React, { useEffect, useMemo, useState } from 'react';
import { InsightsService } from '../../services/insights';
import { useNotification } from '../../context/NotificationContext';

const SCOPE_OPTIONS: Array<'global' | 'freelancer' | 'employer'> = ['global', 'freelancer', 'employer'];

const numberValue = (value: any, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const parseRulesInput = (raw: string) => {
  const text = String(raw || '').trim();
  if (!text) return {};
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Rules must be a valid JSON object.');
  }
  return parsed;
};

const prettyRules = (rules: any) => {
  try {
    return JSON.stringify(rules || {}, null, 2);
  } catch (_error) {
    return '{}';
  }
};

const parseRoleScopeText = (raw: string) => {
  const tokens = String(raw || '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(tokens.length ? tokens : ['all']));
};

const roleScopeTextFromValue = (value: any) => {
  if (Array.isArray(value) && value.length) return value.join(', ');
  if (typeof value === 'string' && value.trim()) return value;
  return 'all';
};

const parseContentTypesText = (raw: string) =>
  Array.from(
    new Set(
      String(raw || '')
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
    )
  );

const thisWeekKey = () => {
  const now = new Date();
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
};

const toLocalInputValue = (value: Date | string | null | undefined) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
};

const currentWeekWindowInputs = () => {
  const now = new Date();
  const utc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 1 - day);
  utc.setUTCHours(0, 0, 0, 0);
  const start = new Date(utc);
  const end = new Date(utc);
  end.setUTCDate(end.getUTCDate() + 6);
  end.setUTCHours(23, 59, 0, 0);
  return {
    startAt: toLocalInputValue(start),
    endAt: toLocalInputValue(end)
  };
};

const InsightsGrowth: React.FC = () => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [recomputeBusy, setRecomputeBusy] = useState(false);
  const [rebuildBusy, setRebuildBusy] = useState(false);
  const [achievementBusy, setAchievementBusy] = useState(false);
  const [challengeBusy, setChallengeBusy] = useState(false);
  const [questBusy, setQuestBusy] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [achievements, setAchievements] = useState<any[]>([]);
  const [challenges, setChallenges] = useState<any[]>([]);
  const [quests, setQuests] = useState<any[]>([]);
  const [challengeWeekKey, setChallengeWeekKey] = useState(thisWeekKey());
  const [leaderboardScope, setLeaderboardScope] = useState<'global' | 'freelancer' | 'employer'>('global');
  const [leaderboardWeekKey, setLeaderboardWeekKey] = useState(thisWeekKey());
  const [leaderboard, setLeaderboard] = useState<any>(null);
  const defaultChallengeWindow = currentWeekWindowInputs();
  const [newChallenge, setNewChallenge] = useState({
    key: '',
    title: '',
    description: '',
    category: 'creator',
    contentTypesText: 'scroll_video',
    entryLimitPerUser: 1,
    maxWinners: 3,
    startAt: defaultChallengeWindow.startAt,
    endAt: defaultChallengeWindow.endAt,
    rewardText: '{\n  "winnerAchievementKey": "WEEKLY_SPOTLIGHT_WINNER"\n}'
  });
  const [editingChallengeId, setEditingChallengeId] = useState<string | null>(null);
  const [editingChallengeDraft, setEditingChallengeDraft] = useState({
    title: '',
    description: '',
    category: 'creator',
    contentTypesText: 'scroll_video',
    entryLimitPerUser: 1,
    maxWinners: 3,
    startAt: '',
    endAt: '',
    rewardText: '{\n  "winnerAchievementKey": "WEEKLY_SPOTLIGHT_WINNER"\n}'
  });
  const [newAchievement, setNewAchievement] = useState({
    key: '',
    title: '',
    description: '',
    tier: 'bronze',
    rulesText: '{\n  "all": []\n}'
  });
  const [editingAchievementId, setEditingAchievementId] = useState<string | null>(null);
  const [editingAchievementDraft, setEditingAchievementDraft] = useState({
    title: '',
    description: '',
    tier: 'bronze',
    rulesText: '{\n  "all": []\n}'
  });
  const [newQuest, setNewQuest] = useState({
    key: '',
    title: '',
    description: '',
    roleScopeText: 'all',
    difficulty: 'standard',
    isWeekly: true,
    rotationWeight: 100,
    verificationRulesText: '{\n  "all": []\n}',
    rewardText: '{\n  "type": "badge",\n  "points": 10\n}'
  });
  const [editingQuestId, setEditingQuestId] = useState<string | null>(null);
  const [editingQuestDraft, setEditingQuestDraft] = useState({
    title: '',
    description: '',
    roleScopeText: 'all',
    difficulty: 'standard',
    isWeekly: true,
    rotationWeight: 100,
    verificationRulesText: '{\n  "all": []\n}',
    rewardText: '{\n  "type": "badge",\n  "points": 10\n}'
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [cfg, achievementRows, challengeRows, questRows] = await Promise.all([
        InsightsService.getAdminConfig(),
        InsightsService.getAdminAchievements(),
        InsightsService.getAdminCreatorChallenges(challengeWeekKey),
        InsightsService.getAdminQuests()
      ]);
      setConfig(cfg || null);
      setAchievements(Array.isArray(achievementRows) ? achievementRows : []);
      setChallenges(Array.isArray(challengeRows) ? challengeRows : []);
      setQuests(Array.isArray(questRows) ? questRows : []);
    } catch (error: any) {
      showNotification('error', 'Insights', error?.message || 'Failed to load Insights configuration.');
    } finally {
      setLoading(false);
    }
  };

  const loadChallenges = async (weekKey = challengeWeekKey) => {
    try {
      const rows = await InsightsService.getAdminCreatorChallenges(weekKey);
      setChallenges(Array.isArray(rows) ? rows : []);
    } catch (error: any) {
      showNotification('error', 'Creator Challenges', error?.message || 'Failed to load creator challenges.');
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
    void loadChallenges(challengeWeekKey);
  }, [challengeWeekKey]);

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
      const rules = parseRulesInput(newAchievement.rulesText);
      await InsightsService.createAdminAchievement({
        key,
        title,
        description: newAchievement.description || null,
        tier: newAchievement.tier || 'bronze',
        rules
      });
      setNewAchievement({
        key: '',
        title: '',
        description: '',
        tier: 'bronze',
        rulesText: '{\n  "all": []\n}'
      });
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

  const startEditAchievement = (item: any) => {
    setEditingAchievementId(String(item.id));
    setEditingAchievementDraft({
      title: String(item.title || ''),
      description: String(item.description || ''),
      tier: String(item.tier || 'bronze'),
      rulesText: prettyRules(item.rules || {})
    });
  };

  const cancelEditAchievement = () => {
    setEditingAchievementId(null);
    setEditingAchievementDraft({
      title: '',
      description: '',
      tier: 'bronze',
      rulesText: '{\n  "all": []\n}'
    });
  };

  const saveEditAchievement = async (id: string) => {
    const title = String(editingAchievementDraft.title || '').trim();
    if (!title) {
      showNotification('warning', 'Achievements', 'Title is required.');
      return;
    }
    setAchievementBusy(true);
    try {
      const rules = parseRulesInput(editingAchievementDraft.rulesText);
      await InsightsService.updateAdminAchievement(id, {
        title,
        description: editingAchievementDraft.description || null,
        tier: editingAchievementDraft.tier || 'bronze',
        rules
      });
      setAchievements(await InsightsService.getAdminAchievements());
      cancelEditAchievement();
      showNotification('success', 'Achievements', 'Achievement updated.');
    } catch (error: any) {
      showNotification('error', 'Achievements', error?.message || 'Failed to update achievement.');
    } finally {
      setAchievementBusy(false);
    }
  };

  const createChallenge = async () => {
    const key = String(newChallenge.key || '').trim().toUpperCase();
    const title = String(newChallenge.title || '').trim();
    if (!key || !title) {
      showNotification('warning', 'Creator Challenges', 'Key and title are required.');
      return;
    }
    setChallengeBusy(true);
    try {
      await InsightsService.createAdminCreatorChallenge({
        key,
        weekKey: challengeWeekKey,
        title,
        description: newChallenge.description || null,
        category: newChallenge.category || 'creator',
        contentTypes: parseContentTypesText(newChallenge.contentTypesText),
        entryLimitPerUser: Math.max(1, Math.floor(numberValue(newChallenge.entryLimitPerUser, 1))),
        maxWinners: Math.max(1, Math.floor(numberValue(newChallenge.maxWinners, 3))),
        startAt: newChallenge.startAt,
        endAt: newChallenge.endAt,
        reward: parseRulesInput(newChallenge.rewardText)
      });
      const nextWindow = currentWeekWindowInputs();
      setNewChallenge({
        key: '',
        title: '',
        description: '',
        category: 'creator',
        contentTypesText: 'scroll_video',
        entryLimitPerUser: 1,
        maxWinners: 3,
        startAt: nextWindow.startAt,
        endAt: nextWindow.endAt,
        rewardText: '{\n  "winnerAchievementKey": "WEEKLY_SPOTLIGHT_WINNER"\n}'
      });
      await loadChallenges(challengeWeekKey);
      showNotification('success', 'Creator Challenges', 'Challenge created.');
    } catch (error: any) {
      showNotification('error', 'Creator Challenges', error?.message || 'Failed to create challenge.');
    } finally {
      setChallengeBusy(false);
    }
  };

  const toggleChallenge = async (id: string) => {
    try {
      await InsightsService.toggleAdminCreatorChallenge(id);
      await loadChallenges(challengeWeekKey);
    } catch (error: any) {
      showNotification('error', 'Creator Challenges', error?.message || 'Failed to toggle challenge.');
    }
  };

  const finalizeChallenge = async (id: string) => {
    setChallengeBusy(true);
    try {
      await InsightsService.finalizeAdminCreatorChallenge(id);
      await loadChallenges(challengeWeekKey);
      showNotification('success', 'Creator Challenges', 'Challenge finalized.');
    } catch (error: any) {
      showNotification('error', 'Creator Challenges', error?.message || 'Failed to finalize challenge.');
    } finally {
      setChallengeBusy(false);
    }
  };

  const startEditChallenge = (item: any) => {
    setEditingChallengeId(String(item.id));
    setEditingChallengeDraft({
      title: String(item.title || ''),
      description: String(item.description || ''),
      category: String(item.category || 'creator'),
      contentTypesText: Array.isArray(item.contentTypes) ? item.contentTypes.join(', ') : 'scroll_video',
      entryLimitPerUser: Math.max(1, Math.floor(numberValue(item.entryLimitPerUser, 1))),
      maxWinners: Math.max(1, Math.floor(numberValue(item.maxWinners, 3))),
      startAt: toLocalInputValue(item.startAt),
      endAt: toLocalInputValue(item.endAt),
      rewardText: prettyRules(item.reward || {})
    });
  };

  const cancelEditChallenge = () => {
    setEditingChallengeId(null);
    setEditingChallengeDraft({
      title: '',
      description: '',
      category: 'creator',
      contentTypesText: 'scroll_video',
      entryLimitPerUser: 1,
      maxWinners: 3,
      startAt: '',
      endAt: '',
      rewardText: '{\n  "winnerAchievementKey": "WEEKLY_SPOTLIGHT_WINNER"\n}'
    });
  };

  const saveEditChallenge = async (id: string) => {
    const title = String(editingChallengeDraft.title || '').trim();
    if (!title) {
      showNotification('warning', 'Creator Challenges', 'Title is required.');
      return;
    }
    setChallengeBusy(true);
    try {
      await InsightsService.updateAdminCreatorChallenge(id, {
        title,
        description: editingChallengeDraft.description || null,
        category: editingChallengeDraft.category || 'creator',
        contentTypes: parseContentTypesText(editingChallengeDraft.contentTypesText),
        entryLimitPerUser: Math.max(1, Math.floor(numberValue(editingChallengeDraft.entryLimitPerUser, 1))),
        maxWinners: Math.max(1, Math.floor(numberValue(editingChallengeDraft.maxWinners, 3))),
        startAt: editingChallengeDraft.startAt,
        endAt: editingChallengeDraft.endAt,
        reward: parseRulesInput(editingChallengeDraft.rewardText)
      });
      await loadChallenges(challengeWeekKey);
      cancelEditChallenge();
      showNotification('success', 'Creator Challenges', 'Challenge updated.');
    } catch (error: any) {
      showNotification('error', 'Creator Challenges', error?.message || 'Failed to update challenge.');
    } finally {
      setChallengeBusy(false);
    }
  };

  const createQuest = async () => {
    const key = String(newQuest.key || '').trim().toUpperCase();
    const title = String(newQuest.title || '').trim();
    if (!key || !title) {
      showNotification('warning', 'Quest Catalog', 'Key and title are required.');
      return;
    }
    setQuestBusy(true);
    try {
      const payload = {
        key,
        title,
        description: newQuest.description || null,
        roleScope: parseRoleScopeText(newQuest.roleScopeText),
        difficulty: String(newQuest.difficulty || 'standard').trim().toLowerCase() || 'standard',
        isWeekly: Boolean(newQuest.isWeekly),
        rotationWeight: Math.max(1, Math.floor(numberValue(newQuest.rotationWeight, 100))),
        verificationRules: parseRulesInput(newQuest.verificationRulesText),
        reward: parseRulesInput(newQuest.rewardText)
      };
      await InsightsService.createAdminQuest(payload);
      setNewQuest({
        key: '',
        title: '',
        description: '',
        roleScopeText: 'all',
        difficulty: 'standard',
        isWeekly: true,
        rotationWeight: 100,
        verificationRulesText: '{\n  "all": []\n}',
        rewardText: '{\n  "type": "badge",\n  "points": 10\n}'
      });
      setQuests(await InsightsService.getAdminQuests());
      showNotification('success', 'Quest Catalog', 'Quest created.');
    } catch (error: any) {
      showNotification('error', 'Quest Catalog', error?.message || 'Failed to create quest.');
    } finally {
      setQuestBusy(false);
    }
  };

  const toggleQuest = async (id: string) => {
    try {
      await InsightsService.toggleAdminQuest(id);
      setQuests(await InsightsService.getAdminQuests());
    } catch (error: any) {
      showNotification('error', 'Quest Catalog', error?.message || 'Failed to toggle quest.');
    }
  };

  const startEditQuest = (item: any) => {
    setEditingQuestId(String(item.id));
    setEditingQuestDraft({
      title: String(item.title || ''),
      description: String(item.description || ''),
      roleScopeText: roleScopeTextFromValue(item.roleScope),
      difficulty: String(item.difficulty || 'standard'),
      isWeekly: Boolean(item.isWeekly),
      rotationWeight: Math.max(1, Math.floor(numberValue(item.rotationWeight, 100))),
      verificationRulesText: prettyRules(item.verificationRules || {}),
      rewardText: prettyRules(item.reward || {})
    });
  };

  const cancelEditQuest = () => {
    setEditingQuestId(null);
    setEditingQuestDraft({
      title: '',
      description: '',
      roleScopeText: 'all',
      difficulty: 'standard',
      isWeekly: true,
      rotationWeight: 100,
      verificationRulesText: '{\n  "all": []\n}',
      rewardText: '{\n  "type": "badge",\n  "points": 10\n}'
    });
  };

  const saveEditQuest = async (id: string) => {
    const title = String(editingQuestDraft.title || '').trim();
    if (!title) {
      showNotification('warning', 'Quest Catalog', 'Title is required.');
      return;
    }
    setQuestBusy(true);
    try {
      await InsightsService.updateAdminQuest(id, {
        title,
        description: editingQuestDraft.description || null,
        roleScope: parseRoleScopeText(editingQuestDraft.roleScopeText),
        difficulty: String(editingQuestDraft.difficulty || 'standard').trim().toLowerCase() || 'standard',
        isWeekly: Boolean(editingQuestDraft.isWeekly),
        rotationWeight: Math.max(1, Math.floor(numberValue(editingQuestDraft.rotationWeight, 100))),
        verificationRules: parseRulesInput(editingQuestDraft.verificationRulesText),
        reward: parseRulesInput(editingQuestDraft.rewardText)
      });
      setQuests(await InsightsService.getAdminQuests());
      cancelEditQuest();
      showNotification('success', 'Quest Catalog', 'Quest updated.');
    } catch (error: any) {
      showNotification('error', 'Quest Catalog', error?.message || 'Failed to update quest.');
    } finally {
      setQuestBusy(false);
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
        <textarea
          className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1.5 font-mono text-xs"
          value={newAchievement.rulesText}
          onChange={(e) => setNewAchievement((prev) => ({ ...prev, rulesText: e.target.value }))}
          placeholder="Rules JSON"
          rows={8}
        />
        <p className="mt-2 text-xs text-gray-500">
          Dynamic rules example: <code>{'{ "all": [ { "field": "currentStreakDays", "op": "gte", "value": 7 } ] }'}</code>
        </p>

        <div className="mt-3 space-y-2">
          {achievements.map((item) => (
            <div key={item.id} className="rounded-md border border-gray-200 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-800">{item.title}</p>
                  <p className="truncate text-xs text-gray-500">
                    {item.key} | {item.tier} | {item.isActive ? 'active' : 'inactive'}
                  </p>
                  <p className="mt-1 line-clamp-2 font-mono text-[11px] text-gray-500">{prettyRules(item.rules || {})}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startEditAchievement(item)}
                    className="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleAchievement(item.id)}
                    className="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700"
                  >
                    {item.isActive ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>

              {editingAchievementId === item.id ? (
                <div className="mt-3 rounded-md border border-blue-100 bg-blue-50/40 p-3">
                  <div className="grid gap-2 md:grid-cols-3">
                    <input
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      value={editingAchievementDraft.title}
                      onChange={(e) => setEditingAchievementDraft((prev) => ({ ...prev, title: e.target.value }))}
                      placeholder="Title"
                    />
                    <select
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      value={editingAchievementDraft.tier}
                      onChange={(e) => setEditingAchievementDraft((prev) => ({ ...prev, tier: e.target.value }))}
                    >
                      <option value="bronze">bronze</option>
                      <option value="silver">silver</option>
                      <option value="gold">gold</option>
                      <option value="platinum">platinum</option>
                    </select>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => cancelEditAchievement()}
                        className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveEditAchievement(item.id)}
                        disabled={achievementBusy}
                        className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                  <textarea
                    className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    value={editingAchievementDraft.description}
                    onChange={(e) => setEditingAchievementDraft((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Description"
                    rows={2}
                  />
                  <textarea
                    className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1.5 font-mono text-xs"
                    value={editingAchievementDraft.rulesText}
                    onChange={(e) => setEditingAchievementDraft((prev) => ({ ...prev, rulesText: e.target.value }))}
                    placeholder="Rules JSON"
                    rows={8}
                  />
                </div>
              ) : null}
            </div>
          ))}
          {achievements.length === 0 ? <p className="text-xs text-gray-500">No achievements yet.</p> : null}
        </div>
      </section>
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Weekly Creator Challenges</h3>
            <p className="text-xs text-gray-500">Submit, vote, win loops managed from the same insights surface as quests and achievements.</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              value={challengeWeekKey}
              onChange={(e) => setChallengeWeekKey(e.target.value)}
              placeholder="YYYY-Wnn"
            />
            <button
              type="button"
              onClick={() => void loadChallenges(challengeWeekKey)}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Load
            </button>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-4">
          <input
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            value={newChallenge.key}
            onChange={(e) => setNewChallenge((prev) => ({ ...prev, key: e.target.value }))}
            placeholder="WEEKLY_SCROLL_SPOTLIGHT"
          />
          <input
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            value={newChallenge.title}
            onChange={(e) => setNewChallenge((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="Challenge title"
          />
          <input
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            value={newChallenge.category}
            onChange={(e) => setNewChallenge((prev) => ({ ...prev, category: e.target.value }))}
            placeholder="Category"
          />
          <button
            type="button"
            onClick={() => void createChallenge()}
            disabled={challengeBusy}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {challengeBusy ? 'Adding...' : 'Add Challenge'}
          </button>
        </div>
        <textarea
          className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          value={newChallenge.description}
          onChange={(e) => setNewChallenge((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="Description"
          rows={2}
        />
        <div className="mt-2 grid gap-2 md:grid-cols-4">
          <input
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            value={newChallenge.contentTypesText}
            onChange={(e) => setNewChallenge((prev) => ({ ...prev, contentTypesText: e.target.value }))}
            placeholder="scroll_video, community_post"
          />
          <input
            type="number"
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            value={Math.floor(numberValue(newChallenge.entryLimitPerUser, 1))}
            onChange={(e) => setNewChallenge((prev) => ({ ...prev, entryLimitPerUser: Math.max(1, Math.floor(numberValue(e.target.value, 1))) }))}
            placeholder="Entries per user"
          />
          <input
            type="number"
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            value={Math.floor(numberValue(newChallenge.maxWinners, 3))}
            onChange={(e) => setNewChallenge((prev) => ({ ...prev, maxWinners: Math.max(1, Math.floor(numberValue(e.target.value, 3))) }))}
            placeholder="Max winners"
          />
          <div className="text-xs text-gray-500">
            Content types should use the platform keys: <code>scroll_video</code>, <code>community_post</code>.
          </div>
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <label className="text-xs font-medium uppercase text-gray-500">
            Start At
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-800"
              value={newChallenge.startAt}
              onChange={(e) => setNewChallenge((prev) => ({ ...prev, startAt: e.target.value }))}
            />
          </label>
          <label className="text-xs font-medium uppercase text-gray-500">
            End At
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-800"
              value={newChallenge.endAt}
              onChange={(e) => setNewChallenge((prev) => ({ ...prev, endAt: e.target.value }))}
            />
          </label>
        </div>
        <textarea
          className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1.5 font-mono text-xs"
          value={newChallenge.rewardText}
          onChange={(e) => setNewChallenge((prev) => ({ ...prev, rewardText: e.target.value }))}
          placeholder="Reward JSON"
          rows={4}
        />

        <div className="mt-3 space-y-2">
          {challenges.map((item) => (
            <div key={item.id} className="rounded-md border border-gray-200 px-3 py-2 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-800">{item.title}</p>
                  <p className="truncate text-xs text-gray-500">
                    {item.key} | {item.category} | {Array.isArray(item.contentTypes) ? item.contentTypes.join(', ') : 'creator'} |{' '}
                    {item.status} | {item.isActive ? 'active' : 'inactive'}
                  </p>
                  <p className="mt-1 text-xs text-gray-500">
                    {Number(item.stats?.totalEntries || 0)} entries | {Number(item.stats?.totalVotes || 0)} votes | winners {Number(item.maxWinners || 3)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startEditChallenge(item)}
                    className="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleChallenge(item.id)}
                    className="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700"
                  >
                    {item.isActive ? 'Disable' : 'Enable'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void finalizeChallenge(item.id)}
                    disabled={challengeBusy || String(item.status || '').toLowerCase() === 'finalized'}
                    className="rounded-md bg-amber-600 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-60"
                  >
                    Finalize
                  </button>
                </div>
              </div>

              {editingChallengeId === item.id ? (
                <div className="mt-3 rounded-md border border-blue-100 bg-blue-50/40 p-3">
                  <div className="grid gap-2 md:grid-cols-4">
                    <input
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      value={editingChallengeDraft.title}
                      onChange={(e) => setEditingChallengeDraft((prev) => ({ ...prev, title: e.target.value }))}
                      placeholder="Title"
                    />
                    <input
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      value={editingChallengeDraft.category}
                      onChange={(e) => setEditingChallengeDraft((prev) => ({ ...prev, category: e.target.value }))}
                      placeholder="Category"
                    />
                    <input
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      value={editingChallengeDraft.contentTypesText}
                      onChange={(e) => setEditingChallengeDraft((prev) => ({ ...prev, contentTypesText: e.target.value }))}
                      placeholder="scroll_video, community_post"
                    />
                    <input
                      type="number"
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      value={Math.floor(numberValue(editingChallengeDraft.maxWinners, 3))}
                      onChange={(e) => setEditingChallengeDraft((prev) => ({ ...prev, maxWinners: Math.max(1, Math.floor(numberValue(e.target.value, 3))) }))}
                      placeholder="Winners"
                    />
                  </div>
                  <textarea
                    className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    value={editingChallengeDraft.description}
                    onChange={(e) => setEditingChallengeDraft((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Description"
                    rows={2}
                  />
                  <div className="mt-2 grid gap-2 md:grid-cols-3">
                    <input
                      type="number"
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      value={Math.floor(numberValue(editingChallengeDraft.entryLimitPerUser, 1))}
                      onChange={(e) => setEditingChallengeDraft((prev) => ({ ...prev, entryLimitPerUser: Math.max(1, Math.floor(numberValue(e.target.value, 1))) }))}
                      placeholder="Entries per user"
                    />
                    <input
                      type="datetime-local"
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      value={editingChallengeDraft.startAt}
                      onChange={(e) => setEditingChallengeDraft((prev) => ({ ...prev, startAt: e.target.value }))}
                    />
                    <input
                      type="datetime-local"
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      value={editingChallengeDraft.endAt}
                      onChange={(e) => setEditingChallengeDraft((prev) => ({ ...prev, endAt: e.target.value }))}
                    />
                  </div>
                  <textarea
                    className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1.5 font-mono text-xs"
                    value={editingChallengeDraft.rewardText}
                    onChange={(e) => setEditingChallengeDraft((prev) => ({ ...prev, rewardText: e.target.value }))}
                    placeholder="Reward JSON"
                    rows={4}
                  />
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => cancelEditChallenge()}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveEditChallenge(item.id)}
                      disabled={challengeBusy}
                      className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : null}

              {Array.isArray(item.topEntries) && item.topEntries.length ? (
                <div className="mt-3 space-y-2">
                  {item.topEntries.map((entry: any) => (
                    <div key={entry.id} className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate font-semibold text-gray-800">{entry.title}</p>
                        <span>
                          {Number(entry.voteCount || 0)} votes{entry.isWinner ? ' | winner' : ''}
                        </span>
                      </div>
                      <p className="mt-1 truncate">
                        {entry.author?.name}
                        {entry.author?.username ? ` (@${entry.author.username})` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          {challenges.length === 0 ? <p className="text-xs text-gray-500">No challenges for this week yet.</p> : null}
        </div>
      </section>
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-gray-900">Career Quests Catalog</h3>
          <span className="text-xs text-gray-500">{quests.length} total</span>
        </div>

        <div className="grid gap-2 md:grid-cols-4">
          <input
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            value={newQuest.key}
            onChange={(e) => setNewQuest((prev) => ({ ...prev, key: e.target.value }))}
            placeholder="QUEST_KEY"
          />
          <input
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            value={newQuest.title}
            onChange={(e) => setNewQuest((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="Title"
          />
          <input
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            value={newQuest.roleScopeText}
            onChange={(e) => setNewQuest((prev) => ({ ...prev, roleScopeText: e.target.value }))}
            placeholder="Role scope: all, freelancer, employer"
          />
          <button
            type="button"
            onClick={() => void createQuest()}
            disabled={questBusy}
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {questBusy ? 'Adding...' : 'Add Quest'}
          </button>
        </div>
        <textarea
          className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          value={newQuest.description}
          onChange={(e) => setNewQuest((prev) => ({ ...prev, description: e.target.value }))}
          placeholder="Description (optional)"
          rows={2}
        />
        <div className="mt-2 grid gap-2 md:grid-cols-3">
          <select
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            value={newQuest.difficulty}
            onChange={(e) => setNewQuest((prev) => ({ ...prev, difficulty: e.target.value }))}
          >
            <option value="starter">starter</option>
            <option value="standard">standard</option>
            <option value="milestone">milestone</option>
            <option value="advanced">advanced</option>
          </select>
          <input
            type="number"
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            value={Math.floor(numberValue(newQuest.rotationWeight, 100))}
            onChange={(e) => setNewQuest((prev) => ({ ...prev, rotationWeight: Math.max(1, Math.floor(numberValue(e.target.value, 100))) }))}
            placeholder="Rotation weight"
          />
          <label className="flex items-center gap-2 rounded-md border border-gray-300 px-2 py-1.5 text-sm">
            <input
              type="checkbox"
              checked={Boolean(newQuest.isWeekly)}
              onChange={(e) => setNewQuest((prev) => ({ ...prev, isWeekly: e.target.checked }))}
            />
            Weekly quest
          </label>
        </div>
        <textarea
          className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1.5 font-mono text-xs"
          value={newQuest.verificationRulesText}
          onChange={(e) => setNewQuest((prev) => ({ ...prev, verificationRulesText: e.target.value }))}
          placeholder="Verification rules JSON"
          rows={8}
        />
        <textarea
          className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1.5 font-mono text-xs"
          value={newQuest.rewardText}
          onChange={(e) => setNewQuest((prev) => ({ ...prev, rewardText: e.target.value }))}
          placeholder="Reward JSON"
          rows={5}
        />

        <div className="mt-3 space-y-2">
          {quests.map((item) => (
            <div key={item.id} className="rounded-md border border-gray-200 px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-gray-800">{item.title}</p>
                  <p className="truncate text-xs text-gray-500">
                    {item.key} | scope: {roleScopeTextFromValue(item.roleScope)} | {item.difficulty || 'standard'} |{' '}
                    {item.isWeekly ? 'weekly' : 'always'} | weight {Number(item.rotationWeight || 100)} |{' '}
                    {item.isActive ? 'active' : 'inactive'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => startEditQuest(item)}
                    className="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleQuest(item.id)}
                    className="rounded-md border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700"
                  >
                    {item.isActive ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>

              {editingQuestId === item.id ? (
                <div className="mt-3 rounded-md border border-blue-100 bg-blue-50/40 p-3">
                  <div className="grid gap-2 md:grid-cols-4">
                    <input
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      value={editingQuestDraft.title}
                      onChange={(e) => setEditingQuestDraft((prev) => ({ ...prev, title: e.target.value }))}
                      placeholder="Title"
                    />
                    <input
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      value={editingQuestDraft.roleScopeText}
                      onChange={(e) => setEditingQuestDraft((prev) => ({ ...prev, roleScopeText: e.target.value }))}
                      placeholder="all, freelancer, employer"
                    />
                    <select
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      value={editingQuestDraft.difficulty}
                      onChange={(e) => setEditingQuestDraft((prev) => ({ ...prev, difficulty: e.target.value }))}
                    >
                      <option value="starter">starter</option>
                      <option value="standard">standard</option>
                      <option value="milestone">milestone</option>
                      <option value="advanced">advanced</option>
                    </select>
                    <input
                      type="number"
                      className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                      value={Math.floor(numberValue(editingQuestDraft.rotationWeight, 100))}
                      onChange={(e) => setEditingQuestDraft((prev) => ({ ...prev, rotationWeight: Math.max(1, Math.floor(numberValue(e.target.value, 100))) }))}
                      placeholder="Rotation weight"
                    />
                  </div>
                  <label className="mt-2 inline-flex items-center gap-2 text-xs font-semibold uppercase text-gray-500">
                    <input
                      type="checkbox"
                      checked={Boolean(editingQuestDraft.isWeekly)}
                      onChange={(e) => setEditingQuestDraft((prev) => ({ ...prev, isWeekly: e.target.checked }))}
                    />
                    Weekly quest
                  </label>
                  <textarea
                    className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    value={editingQuestDraft.description}
                    onChange={(e) => setEditingQuestDraft((prev) => ({ ...prev, description: e.target.value }))}
                    placeholder="Description"
                    rows={2}
                  />
                  <textarea
                    className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1.5 font-mono text-xs"
                    value={editingQuestDraft.verificationRulesText}
                    onChange={(e) => setEditingQuestDraft((prev) => ({ ...prev, verificationRulesText: e.target.value }))}
                    placeholder="Verification rules JSON"
                    rows={8}
                  />
                  <textarea
                    className="mt-2 w-full rounded-md border border-gray-300 px-2 py-1.5 font-mono text-xs"
                    value={editingQuestDraft.rewardText}
                    onChange={(e) => setEditingQuestDraft((prev) => ({ ...prev, rewardText: e.target.value }))}
                    placeholder="Reward JSON"
                    rows={5}
                  />
                  <div className="mt-2 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => cancelEditQuest()}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveEditQuest(item.id)}
                      disabled={questBusy}
                      className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
          {quests.length === 0 ? <p className="text-xs text-gray-500">No quests yet.</p> : null}
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

