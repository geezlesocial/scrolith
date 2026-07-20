#!/usr/bin/env node
/**
 * Phase 22.3 — apply presence/receipts additive migration via DATABASE_URL.
 */
import pg from 'pg';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const here = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(
  here,
  '../prisma/migrations/20260720160000_phase223_presence_receipts/migration.sql'
);
const migrationName = '20260720160000_phase223_presence_receipts';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
const report = { migrationName, steps: [] };

try {
  const vis = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='User' AND column_name='presenceVisibility'`
  );
  const deliv = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='ConversationParticipant' AND column_name='lastDeliveredAt'`
  );
  report.before = {
    presenceVisibility: vis.rows.length > 0,
    lastDeliveredAt: deliv.rows.length > 0
  };

  const recent = await client.query(
    `SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations
     ORDER BY finished_at DESC NULLS LAST LIMIT 8`
  );
  report.recentMigrations = recent.rows.map((r) => ({
    name: r.migration_name,
    finished: r.finished_at,
    rolledBack: r.rolled_back_at
  }));

  const already = recent.rows.some(
    (r) => r.migration_name === migrationName && r.finished_at && !r.rolled_back_at
  );
  if (already && report.before.presenceVisibility && report.before.lastDeliveredAt) {
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
      [randomUUID(), 'phase223-manual-apply-presence-receipts', migrationName]
    );
    report.prismaRecord = 'inserted';
  } else {
    report.prismaRecord = 'already_present';
  }
  await client.query('COMMIT');
  report.steps.push('migration_sql_applied');

  const afterVis = await client.query(
    `SELECT column_name, data_type, column_default, is_nullable
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name='User' AND column_name='presenceVisibility'`
  );
  const afterDel = await client.query(
    `SELECT column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name='ConversationParticipant' AND column_name='lastDeliveredAt'`
  );
  const indexes = await client.query(
    `SELECT indexname FROM pg_indexes
     WHERE tablename='ConversationParticipant'
       AND (indexname ILIKE '%lastReadAt%' OR indexname ILIKE '%lastDeliveredAt%')`
  );
  report.after = {
    presenceVisibility: afterVis.rows[0] || null,
    lastDeliveredAt: afterDel.rows[0] || null,
    indexes: indexes.rows.map((r) => r.indexname)
  };
  report.status = 'APPLIED';
  console.log(JSON.stringify(report, null, 2));
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
