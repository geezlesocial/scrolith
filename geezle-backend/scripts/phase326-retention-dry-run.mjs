#!/usr/bin/env node
/**
 * Phase 32.6 — retention dry-run against production (or any DATABASE_URL).
 * Never deletes. Use for operational validation before enabling purge kill switch.
 */
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const defaults = {
  notificationEventsDays: 90,
  deliveryLogsDays: 60,
  auditLogsDays: 180,
  analyticsSummariesDays: 365,
  digestsDays: 90,
  lifecycleEventsDays: 60
};

const daysAgo = (d) => new Date(Date.now() - d * 864e5).toISOString();

const client = new pg.Client({ connectionString: url });
await client.connect();

const report = {
  phase: '32.6',
  dryRun: true,
  at: new Date().toISOString(),
  windows: defaults,
  candidates: {},
  totals: {},
  notes: []
};

try {
  // Load ops config if present
  try {
    const cfg = await client.query(
      `SELECT value FROM "NotificationOpsConfig" WHERE key='retention' LIMIT 1`
    );
    if (cfg.rows[0]?.value) {
      report.windows = { ...defaults, ...cfg.rows[0].value };
    }
  } catch {
    report.notes.push('NotificationOpsConfig missing or empty — using defaults');
  }

  const w = report.windows;
  const count = async (label, sql, params) => {
    try {
      const r = await client.query(sql, params);
      report.candidates[label] = Number(r.rows[0]?.c || 0);
    } catch (e) {
      report.candidates[label] = null;
      report.notes.push(`${label}: ${String(e.message || e).slice(0, 100)}`);
    }
  };

  await count(
    'notificationEvents',
    `SELECT COUNT(*)::int AS c FROM "NotificationEvent" WHERE "createdAt" < $1::timestamptz`,
    [daysAgo(w.notificationEventsDays)]
  );
  await count(
    'deliveryLogs',
    `SELECT COUNT(*)::int AS c FROM "NotificationDelivery" WHERE "createdAt" < $1::timestamptz`,
    [daysAgo(w.deliveryLogsDays)]
  );
  await count(
    'auditLogs',
    `SELECT COUNT(*)::int AS c FROM "NotificationAudit" WHERE "createdAt" < $1::timestamptz`,
    [daysAgo(w.auditLogsDays)]
  );
  await count(
    'lifecycleEvents',
    `SELECT COUNT(*)::int AS c FROM "NotificationLifecycleEvent" WHERE "createdAt" < $1::timestamptz`,
    [daysAgo(w.lifecycleEventsDays)]
  );
  await count(
    'digests',
    `SELECT COUNT(*)::int AS c FROM "NotificationDigest" WHERE "createdAt" < $1::timestamptz`,
    [daysAgo(w.digestsDays)]
  );
  await count(
    'analyticsCounters',
    `SELECT COUNT(*)::int AS c FROM "NotificationAnalyticsCounter" WHERE "date" < $1::date`,
    [daysAgo(w.analyticsSummariesDays).slice(0, 10)]
  );
  // Inbox rows are NOT purge candidates in 32.6
  await count('notificationInboxTotal', `SELECT COUNT(*)::int AS c FROM "Notification"`, []);
  await count(
    'digestSchedulesEnabled',
    `SELECT COUNT(*)::int AS c FROM "NotificationDigestSchedule" WHERE enabled=true AND mode <> 'off'`,
    []
  );

  // Inbox is never purged in 32.6 — exclude from purge candidate sum
  report.totals.purgeCandidateSum = [
    'notificationEvents',
    'deliveryLogs',
    'auditLogs',
    'lifecycleEvents',
    'digests',
    'analyticsCounters'
  ].reduce((a, k) => a + (Number(report.candidates[k]) || 0), 0);
  report.totals.candidateSum = report.totals.purgeCandidateSum;
  report.success = true;
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
} catch (e) {
  report.success = false;
  report.error = String(e.message || e).slice(0, 300);
  console.log(JSON.stringify(report, null, 2));
  process.exit(1);
} finally {
  await client.end();
}
