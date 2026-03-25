export type PostAiInsightPreference = 'auto' | 'on' | 'off';

const asOptionalBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return undefined;
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return undefined;
};

export const resolvePostAiInsightPreference = (
  value: unknown,
  fallback: PostAiInsightPreference = 'auto'
): PostAiInsightPreference => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'auto' || normalized === 'on' || normalized === 'off') {
    return normalized as PostAiInsightPreference;
  }
  return fallback;
};

export const resolveStoredPostAiInsightPreference = (
  value: unknown
): Exclude<PostAiInsightPreference, 'auto'> => {
  const parsed = asOptionalBoolean(value);
  return parsed === true ? 'on' : 'off';
};

export const postAiInsightPreferenceToBoolean = (
  preference: PostAiInsightPreference
): boolean | undefined => {
  if (preference === 'on') return true;
  if (preference === 'off') return false;
  return undefined;
};
