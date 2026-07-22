#!/usr/bin/env node
/**
 * Phase 32.5 — apply approved additive Phase 32 migrations (32.0–32.4).
 * Idempotent: skips already-applied rows; validates after each step.
 */
import pg from 'pg';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const here = dirname(fileURLToPath(import.meta.url));

const migrations = [
  {
    name: '20260722140000_phase320_notification_center_foundation',
    path: join(here, '../prisma/migrations/20260722140000_phase320_notification_center_foundation/migration.sql'),
    checksum: 'phase325-apply-phase320',
    validate: async (client) => {
      const tables = await client.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema='public' AND table_name IN (
           'NotificationEvent','NotificationDelivery','NotificationPreference',
           'NotificationAudit','NotificationAnalyticsCounter'
         ) ORDER BY table_name`
      );
      return { tables: tables.rows.map((r) => r.table_name) };
    },
    ok: (v) => v.tables.length >= 5
  },
  {
    name: '20260722150000_phase321_notification_inbox',
    path: join(here, '../prisma/migrations/20260722150000_phase321_notification_inbox/migration.sql'),
    checksum: 'phase325-apply-phase321',
    validate: async (client) => {
      const cols = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema='public' AND table_name='Notification'
           AND column_name IN ('category','priority','pinnedAt','archivedAt','deletedAt','eventId','deepLink')
         ORDER BY column_name`
      );
      return { columns: cols.rows.map((r) => r.column_name) };
    },
    ok: (v) => v.columns.length >= 5
  },
  {
    name: '20260722160000_phase322_preferences_digests',
    path: join(here, '../prisma/migrations/20260722160000_phase322_preferences_digests/migration.sql'),
    checksum: 'phase325-apply-phase322',
    validate: async (client) => {
      const tables = await client.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema='public' AND table_name IN (
           'NotificationEventPreference','NotificationGlobalPreference',
           'NotificationFocusSession','NotificationDigestSchedule',
           'NotificationDigest','NotificationDigestItem','NotificationSuppression'
         ) ORDER BY table_name`
      );
      const cols = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema='public' AND table_name='NotificationPreference'
           AND column_name IN ('deliveryMode','minPriority','version')`
      );
      return {
        tables: tables.rows.map((r) => r.table_name),
        prefCols: cols.rows.map((r) => r.column_name)
      };
    },
    ok: (v) => v.tables.length >= 7 && v.prefCols.length >= 3
  },
  {
    name: '20260722170000_phase323_android_cross_device',
    path: join(here, '../prisma/migrations/20260722170000_phase323_android_cross_device/migration.sql'),
    checksum: 'phase325-apply-phase323',
    validate: async (client) => {
      const tables = await client.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema='public' AND table_name IN (
           'NotificationLifecycleEvent','NotificationSyncState'
         ) ORDER BY table_name`
      );
      const cols = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema='public' AND table_name='DeviceToken'
           AND column_name IN ('deviceName','appVersion','pushStatus','lastSyncAt')`
      );
      return {
        tables: tables.rows.map((r) => r.table_name),
        deviceCols: cols.rows.map((r) => r.column_name)
      };
    },
    ok: (v) => v.tables.length >= 2 && v.deviceCols.length >= 3
  },
  {
    name: '20260722180000_phase324_notification_operations',
    path: join(here, '../prisma/migrations/20260722180000_phase324_notification_operations/migration.sql'),
    checksum: 'phase325-apply-phase324',
    validate: async (client) => {
      const tables = await client.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema='public' AND table_name IN (
           'NotificationOpsTemplate','NotificationCampaign',
           'NotificationCampaignDelivery','NotificationRetryJob','NotificationOpsConfig'
         ) ORDER BY table_name`
      );
      return { tables: tables.rows.map((r) => r.table_name) };
    },
    ok: (v) => v.tables.length >= 5
  }
];

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
const report = { phase: '32.5', results: [], startedAt: new Date().toISOString() };

try {
  const recent = await client.query(
    `SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations
     ORDER BY finished_at DESC NULLS LAST LIMIT 80`
  );
  report.recentMigrations = recent.rows.map((r) => ({
    name: r.migration_name,
    finished: r.finished_at,
    rolledBack: r.rolled_back_at
  }));

  // Baseline: existing Notification rows still readable
  try {
    const nCount = await client.query(`SELECT COUNT(*)::int AS c FROM "Notification"`);
    report.notificationCountBefore = nCount.rows[0]?.c ?? null;
  } catch (e) {
    report.notificationCountBefore = null;
    report.notificationCountError = String(e?.message || e).slice(0, 200);
  }

  for (const mig of migrations) {
    const entry = { name: mig.name, status: 'PENDING' };
    const already = recent.rows.some(
      (r) => r.migration_name === mig.name && r.finished_at && !r.rolled_back_at
    );
    const before = await mig.validate(client);
    entry.before = before;

    if (already && mig.ok(before)) {
      entry.status = 'ALREADY_APPLIED';
      entry.after = before;
      entry.valid = true;
      report.results.push(entry);
      continue;
    }

    if (already && !mig.ok(before)) {
      entry.status = 'REPAIRING';
    }

    const sql = readFileSync(mig.path, 'utf8');
    // Safety: refuse destructive SQL
    if (/\b(DROP\s+TABLE|TRUNCATE|DELETE\s+FROM)\b/i.test(sql)) {
      entry.status = 'BLOCKED_DESTRUCTIVE';
      entry.error = 'Migration contains DROP/TRUNCATE/DELETE — refused';
      report.results.push(entry);
      console.log(JSON.stringify(report, null, 2));
      process.exit(1);
    }

    await client.query('BEGIN');
    try {
      await client.query(sql);
      const exists = await client.query(
        `SELECT 1 FROM _prisma_migrations WHERE migration_name=$1`,
        [mig.name]
      );
      if (!exists.rowCount) {
        await client.query(
          `INSERT INTO _prisma_migrations
            (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
           VALUES ($1, $2, NOW(), $3, NULL, NULL, NOW(), 1)`,
          [randomUUID(), mig.checksum, mig.name]
        );
        entry.prismaRecord = 'inserted';
      } else {
        entry.prismaRecord = 'already_present';
      }
      await client.query('COMMIT');
      entry.status = entry.status === 'REPAIRING' ? 'REPAIRED' : 'APPLIED';
    } catch (err) {
      await client.query('ROLLBACK');
      entry.status = 'FAILED';
      entry.error = String(err?.message || err).slice(0, 500);
      report.results.push(entry);
      report.finishedAt = new Date().toISOString();
      console.log(JSON.stringify(report, null, 2));
      process.exit(1);
    }

    const after = await mig.validate(client);
    entry.after = after;
    entry.valid = mig.ok(after);
    if (!entry.valid) {
      entry.status = 'VALIDATION_FAILED';
      report.results.push(entry);
      report.finishedAt = new Date().toISOString();
      console.log(JSON.stringify(report, null, 2));
      process.exit(1);
    }
    report.results.push(entry);
  }

  try {
    const nCount = await client.query(`SELECT COUNT(*)::int AS c FROM "Notification"`);
    report.notificationCountAfter = nCount.rows[0]?.c ?? null;
  } catch {
    report.notificationCountAfter = null;
  }

  report.finishedAt = new Date().toISOString();
  report.success = report.results.every(
    (r) => ['APPLIED', 'ALREADY_APPLIED', 'REPAIRED'].includes(r.status) && r.valid
  );
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.success ? 0 : 1);
} finally {
  await client.end();
}
