#!/usr/bin/env node
/**
 * Phase 22.3C — apply messaging privacy additive migration via DATABASE_URL (proxy).
 * Does not print credentials or user identifiers.
 */
import pg from 'pg';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const here = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(
  here,
  '../prisma/migrations/20260720180000_phase223b_messaging_privacy/migration.sql'
);
const migrationName = '20260720180000_phase223b_messaging_privacy';

const expectedColumns = [
  'presenceVisibility',
  'lastSeenVisibility',
  'readReceiptsEnabled',
  'typingIndicatorsEnabled',
  'recordingIndicatorsEnabled',
  'directMessageAudience',
  'groupInviteAudience',
  'notificationMessagePreviewEnabled',
  'messagingPrivacyUpdatedAt'
];

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
const report = { migrationName, steps: [] };

try {
  const before = await client.query(
    `SELECT column_name, data_type, column_default, is_nullable
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name='User'
       AND column_name = ANY($1::text[])
     ORDER BY column_name`,
    [expectedColumns]
  );
  report.columnsBefore = before.rows.map((r) => ({
    name: r.column_name,
    type: r.data_type,
    default: r.column_default,
    nullable: r.is_nullable
  }));

  const recent = await client.query(
    `SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations
     ORDER BY finished_at DESC NULLS LAST LIMIT 12`
  );
  report.recentMigrations = recent.rows.map((r) => ({
    name: r.migration_name,
    finished: r.finished_at,
    rolledBack: r.rolled_back_at
  }));

  const already = recent.rows.some(
    (r) => r.migration_name === migrationName && r.finished_at && !r.rolled_back_at
  );
  const haveAll = expectedColumns.every((c) =>
    report.columnsBefore.some((row) => row.name === c)
  );
  if (already && haveAll) {
    report.status = 'ALREADY_APPLIED';
    console.log(JSON.stringify(report, null, 2));
    await client.end();
    process.exit(0);
  }

  const sql = readFileSync(sqlPath, 'utf8');
  await client.query('BEGIN');
  await client.query(sql);

  const exists = await client.query(
    `SELECT 1 FROM _prisma_migrations WHERE migration_name=$1`,
    [migrationName]
  );
  if (!exists.rowCount) {
    await client.query(
      `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
       VALUES ($1, $2, NOW(), $3, NULL, NULL, NOW(), 1)`,
      [randomUUID(), 'phase223c-manual-apply-messaging-privacy', migrationName]
    );
    report.prismaRecord = 'inserted';
  } else {
    report.prismaRecord = 'already_present';
  }
  await client.query('COMMIT');
  report.steps.push('migration_sql_applied');

  const after = await client.query(
    `SELECT column_name, data_type, column_default, is_nullable
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name='User'
       AND column_name = ANY($1::text[])
     ORDER BY column_name`,
    [expectedColumns]
  );
  report.columnsAfter = after.rows.map((r) => ({
    name: r.column_name,
    type: r.data_type,
    default: r.column_default,
    nullable: r.is_nullable
  }));

  // Aggregate-only default compatibility sample (no user ids)
  const sample = await client.query(
    `SELECT
       COUNT(*)::int AS total_users,
       COUNT(*) FILTER (WHERE COALESCE("presenceVisibility",'EVERYONE') = 'EVERYONE')::int AS online_everyone,
       COUNT(*) FILTER (WHERE COALESCE("lastSeenVisibility",'EVERYONE') = 'EVERYONE')::int AS lastseen_everyone,
       COUNT(*) FILTER (WHERE COALESCE("readReceiptsEnabled", true) = true)::int AS receipts_on,
       COUNT(*) FILTER (WHERE COALESCE("typingIndicatorsEnabled", true) = true)::int AS typing_on,
       COUNT(*) FILTER (WHERE COALESCE("recordingIndicatorsEnabled", true) = true)::int AS recording_on,
       COUNT(*) FILTER (WHERE COALESCE("directMessageAudience",'EVERYONE') = 'EVERYONE')::int AS dm_everyone,
       COUNT(*) FILTER (WHERE COALESCE("groupInviteAudience",'EVERYONE') = 'EVERYONE')::int AS invite_everyone,
       COUNT(*) FILTER (WHERE COALESCE("notificationMessagePreviewEnabled", true) = true)::int AS preview_on
     FROM "User"`
  );
  report.defaultCompatibilitySample = sample.rows[0];
  report.allColumnsPresent = expectedColumns.every((c) =>
    report.columnsAfter.some((row) => row.name === c)
  );
  report.status = report.allColumnsPresent ? 'APPLIED' : 'PARTIAL';
  console.log(JSON.stringify(report, null, 2));
  if (!report.allColumnsPresent) process.exit(1);
} catch (e) {
  try {
    await client.query('ROLLBACK');
  } catch {
    /* ignore */
  }
  console.error(JSON.stringify({ status: 'FAILED', error: String(e.message || e) }, null, 2));
  process.exit(1);
} finally {
  await client.end();
}
