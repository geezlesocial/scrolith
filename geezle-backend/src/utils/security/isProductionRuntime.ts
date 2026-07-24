/**
 * Production runtime detection for security fail-closed behavior.
 * Ambiguous environments are treated as production-like when NODE_ENV is production
 * or Cloud Run service env is present.
 */
export const isProductionRuntime = (): boolean => {
  const nodeEnv = String(process.env.NODE_ENV || '')
    .trim()
    .toLowerCase();
  if (nodeEnv === 'production') return true;
  // Cloud Run always sets K_SERVICE
  if (process.env.K_SERVICE && nodeEnv !== 'development' && nodeEnv !== 'test') {
    return true;
  }
  return false;
};

export const isTruthyEnv = (raw: string | undefined | null): boolean =>
  ['1', 'true', 'yes', 'on'].includes(String(raw || '').trim().toLowerCase());

/** Roles that may join administrative realtime rooms (from DB, never client). */
export const isAuthoritativeAdminRole = (role: unknown): boolean => {
  const r = String(role || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!r) return false;
  // Exact allowlist only — never substring matching (blocks not_admin, etc.)
  const allowed = new Set([
    'admin',
    'superadmin',
    'super_admin',
    'platform_admin',
    'platformadmin',
    'staff_admin'
  ]);
  return allowed.has(r);
};
