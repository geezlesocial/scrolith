/**
 * Phase 29.4 — admin/moderation metrics (no private message bodies).
 */

type CounterMap = Map<string, number>;
const counters: CounterMap = new Map();

const bump = (name: string, n = 1) => {
  counters.set(name, (counters.get(name) || 0) + n);
};

export const groupAdminMetrics = {
  views: () => bump('group_admin_views_total'),
  actions: () => bump('group_admin_actions_total'),
  restrictions: () => bump('group_restrictions_total'),
  lockdowns: () => bump('group_lockdowns_total'),
  invitesRevoked: () => bump('group_invites_revoked_total'),
  promotions: () => bump('group_member_promotions_total'),
  bans: () => bump('group_member_bans_total'),
  reportsProcessed: () => bump('group_reports_processed_total'),
  snapshot: () => {
    const out: Record<string, number> = {};
    counters.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  },
  resetForTests: () => counters.clear()
};

export const GROUP_ADMIN_METRICS_VERSION = '29.4';
