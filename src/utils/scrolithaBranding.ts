const EXTERNAL_AI_BRANDING_RULES: Array<[RegExp, string]> = [
  [/\bgoogle\s+gemini\b/gi, 'Scrolitha'],
  [/\bgemini\b/gi, 'Scrolitha'],
  [/\bopenai\b/gi, 'Scrolitha'],
  [/\bchatgpt\b/gi, 'Scrolitha'],
  [/\bgoogle\s+ai\b/gi, 'Scrolitha'],
  [/\bgpt(?:-\d+(?:\.\d+)?)?\b/gi, 'Scrolitha']
];

const TEXT_REPAIR_RULES: Array<[RegExp, string]> = [
  [/â€™/g, "'"],
  [/â€˜/g, "'"],
  [/â€œ/g, '"'],
  [/â€/g, '"'],
  [/â€“/g, '-'],
  [/â€”/g, '-'],
  [/â€¦/g, '...'],
  [/Â /g, ' '],
  [/Â/g, '']
];

export const repairScrolithaText = (value: string) => {
  let next = String(value || '');
  for (const [pattern, replacement] of TEXT_REPAIR_RULES) {
    next = next.replace(pattern, replacement);
  }
  return next;
};

export const replaceExternalAiBranding = (value: string) => {
  let next = repairScrolithaText(value);
  for (const [pattern, replacement] of EXTERNAL_AI_BRANDING_RULES) {
    next = next.replace(pattern, replacement);
  }
  return next;
};

export const sanitizeScrolithaPageConfig = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeScrolithaPageConfig(entry)) as T;
  }

  if (value && typeof value === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      sanitized[key] = sanitizeScrolithaPageConfig(entry);
    }
    return sanitized as T;
  }

  if (typeof value === 'string') {
    return replaceExternalAiBranding(value) as T;
  }

  return value;
};
