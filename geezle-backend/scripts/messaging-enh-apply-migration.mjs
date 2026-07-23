#!/usr/bin/env node
/**
 * Apply additive messaging appearance/pins migration via DATABASE_URL.
 * Non-destructive: ADD COLUMN IF NOT EXISTS only.
 * Does not print credentials.
 */
import pg from 'pg';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const here = dirname(fileURLToPath(import.meta.url));
const migrationName = '20260723150000_messaging_appearance_pins';
const sqlPath = join(here, '../prisma/migrations', migrationName, 'migration.sql');

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

const report = { migrationName, steps: [] };

try {
  const colsBefore = await client.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema='public'
      AND (
        (table_name='ConversationParticipant' AND column_name='chatAppearanceJson')
        OR (table_name='ConversationSettings' AND column_name='pinPolicy')
      )
    ORDER BY table_name, column_name
  `);
  report.columnsBefore = colsBefore.rows;

  const migBefore = await client.query(
    `SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations
     WHERE migration_name=$1`,
    [migrationName]
  );
  report.prismaBefore = migBefore.rows;

  const already =
    colsBefore.rows.length >= 2 &&
    migBefore.rows.some((r) => r.finished_at && !r.rolled_back_at);

  if (already) {
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
      [randomUUID(), 'messaging-enh-manual-appearance-pins', migrationName]
    );
    report.prismaRecord = 'inserted';
  } else {
    report.prismaRecord = 'already_present';
  }

  await client.query('COMMIT');
  report.steps.push('applied_sql_and_committed');

  const colsAfter = await client.query(`
    SELECT table_name, column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_schema='public'
      AND (
        (table_name='ConversationParticipant' AND column_name='chatAppearanceJson')
        OR (table_name='ConversationSettings' AND column_name='pinPolicy')
      )
    ORDER BY table_name, column_name
  `);
  report.columnsAfter = colsAfter.rows;

  const rowCounts = await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM "ConversationParticipant") AS participants,
      (SELECT COUNT(*)::int FROM "ConversationSettings") AS settings,
      (SELECT COUNT(*)::int FROM "Conversation") AS conversations
  `);
  report.rowCounts = rowCounts.rows[0];
  report.status = 'APPLIED';
  console.log(JSON.stringify(report, null, 2));
  await client.end();
  process.exit(0);
} catch (e) {
  try {
    await client.query('ROLLBACK');
  } catch {
    /* ignore */
  }
  report.status = 'FAILED';
  report.error = String(e?.message || e).slice(0, 500);
  console.error(JSON.stringify(report, null, 2));
  await client.end().catch(() => null);
  process.exit(1);
}
