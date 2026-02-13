export type TextOverrideRule = {
  id?: string;
  locale?: string;
  matchText: string;
  replacementText: string;
  isRegex?: boolean;
  enabled?: boolean;
  priority?: number;
};

const byPriority = (a: TextOverrideRule, b: TextOverrideRule) =>
  Number(a.priority ?? 100) - Number(b.priority ?? 100);

export const applyOverrides = (value: string, overrides: TextOverrideRule[] = []) => {
  const input = String(value ?? '');
  if (!input) return input;

  let output = input;
  const activeRules = (overrides || [])
    .filter((rule) => rule && rule.enabled !== false && String(rule.matchText || '').trim())
    .sort(byPriority);

  activeRules.forEach((rule) => {
    const matchText = String(rule.matchText || '');
    const replacement = String(rule.replacementText ?? '');
    if (!rule.isRegex) {
      if (output === matchText) output = replacement;
      return;
    }

    try {
      const regex = new RegExp(matchText, 'g');
      output = output.replace(regex, replacement);
    } catch {
      // Ignore invalid regex rules so one bad rule doesn't break rendering.
    }
  });

  return output;
};

