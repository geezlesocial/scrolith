import { RecoManualAction } from './reco.defaults';

type ManualRuleRecord = {
  id: string;
  surface: string;
  entityType: string;
  entityId: string;
  action: string;
  value?: number | null;
  priority?: number | null;
  metadata?: Record<string, any> | null;
};

type ManualApplyInput<T> = {
  items: T[];
  rules: ManualRuleRecord[];
  getEntityId: (item: T) => string;
  getSurface: (item: T) => string;
  getEntityType: (item: T) => string;
  getScore: (item: T) => number;
  setScore: (item: T, score: number) => void;
  setPinnedRank: (item: T, rank: number | null) => void;
  pushManualInfo: (item: T, info: any) => void;
};

const normalizeAction = (value: unknown): RecoManualAction | null => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'boost' || normalized === 'pin' || normalized === 'exclude' || normalized === 'shadow') {
    return normalized;
  }
  return null;
};

export const applyManualRules = <T>(input: ManualApplyInput<T>): T[] => {
  if (!Array.isArray(input.rules) || input.rules.length === 0) {
    return input.items;
  }

  const now = Date.now();
  const filteredRules = input.rules.filter((rule) => normalizeAction(rule.action));
  if (!filteredRules.length) return input.items;

  const kept: T[] = [];

  input.items.forEach((item) => {
    const entityId = String(input.getEntityId(item) || '').trim();
    const surface = String(input.getSurface(item) || '').trim().toLowerCase();
    const entityType = String(input.getEntityType(item) || '').trim().toLowerCase();
    if (!entityId) return;

    const matches = filteredRules.filter((rule) => {
      const action = normalizeAction(rule.action);
      if (!action) return false;
      const surfaceMatches =
        rule.surface === '*' ||
        String(rule.surface || '').trim().toLowerCase() === surface;
      const typeMatches =
        rule.entityType === '*' ||
        String(rule.entityType || '').trim().toLowerCase() === entityType;
      const idMatches = rule.entityId === '*' || String(rule.entityId || '').trim() === entityId;
      return surfaceMatches && typeMatches && idMatches;
    });

    if (!matches.length) {
      kept.push(item);
      return;
    }

    let currentScore = input.getScore(item);
    let excluded = false;
    let pinnedRank: number | null = null;

    matches.forEach((rule) => {
      const action = normalizeAction(rule.action);
      if (!action) return;
      const value = Number(rule.value);
      const numericValue = Number.isFinite(value) ? value : undefined;

      if (action === 'exclude') {
        excluded = true;
        input.pushManualInfo(item, {
          ruleId: rule.id,
          action,
          value: numericValue ?? null,
          appliedAt: new Date(now).toISOString()
        });
        return;
      }

      if (action === 'pin') {
        const rank = Math.max(1, Math.floor(numericValue ?? rule.priority ?? 1));
        pinnedRank = pinnedRank === null ? rank : Math.min(pinnedRank, rank);
        input.pushManualInfo(item, {
          ruleId: rule.id,
          action,
          value: rank,
          appliedAt: new Date(now).toISOString()
        });
        return;
      }

      if (action === 'shadow') {
        const multiplier =
          numericValue !== undefined
            ? numericValue > 0 && numericValue <= 1
              ? Math.max(0.05, 1 - numericValue)
              : Math.max(0.05, numericValue)
            : 0.5;
        currentScore = currentScore * multiplier;
        input.pushManualInfo(item, {
          ruleId: rule.id,
          action,
          value: multiplier,
          appliedAt: new Date(now).toISOString()
        });
        return;
      }

      if (action === 'boost') {
        const metadataMode = String((rule.metadata as any)?.mode || '').toLowerCase();
        if (metadataMode === 'lift') {
          const lift = numericValue !== undefined ? numericValue : 0.1;
          currentScore = currentScore + lift;
          input.pushManualInfo(item, {
            ruleId: rule.id,
            action,
            mode: 'lift',
            value: lift,
            appliedAt: new Date(now).toISOString()
          });
          return;
        }

        const multiplier = numericValue !== undefined ? Math.max(0.1, numericValue) : 1.2;
        currentScore = currentScore * multiplier;
        input.pushManualInfo(item, {
          ruleId: rule.id,
          action,
          mode: 'multiplier',
          value: multiplier,
          appliedAt: new Date(now).toISOString()
        });
      }
    });

    if (excluded) return;
    input.setScore(item, currentScore);
    input.setPinnedRank(item, pinnedRank);
    kept.push(item);
  });

  return kept.sort((left, right) => {
    const leftPinned = (left as any).pinnedRank;
    const rightPinned = (right as any).pinnedRank;
    const leftPinnedValue = leftPinned === null || leftPinned === undefined ? Number.POSITIVE_INFINITY : Number(leftPinned);
    const rightPinnedValue = rightPinned === null || rightPinned === undefined ? Number.POSITIVE_INFINITY : Number(rightPinned);
    if (leftPinnedValue !== rightPinnedValue) {
      return leftPinnedValue - rightPinnedValue;
    }
    return input.getScore(right) - input.getScore(left);
  });
};

