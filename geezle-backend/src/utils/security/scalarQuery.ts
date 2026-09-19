export const scalarQuery = (value: unknown): string => Array.isArray(value) ? '' : String(value || '').trim();
