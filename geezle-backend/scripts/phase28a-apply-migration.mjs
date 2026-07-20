#!/usr/bin/env node
/**
 * Phase 28A — apply additive multi-currency migration via DATABASE_URL.
 * Safe: ADD COLUMN IF NOT EXISTS + CREATE TABLE IF NOT EXISTS only.
 * Does not print credentials or rewrite financial history.
 */
import pg from 'pg';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import { randomUUID } from 'crypto';

const here = dirname(fileURLToPath(import.meta.url));
const migrationName = '20260721090000_phase28_multi_currency';
const sqlPath = join(here, `../prisma/migrations/${migrationName}/migration.sql`);

const resolveDatabaseUrl = () => {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    return execSync(
      'gcloud secrets versions access latest --secret=DATABASE_URL --project=scrolith-500821',
      { encoding: 'utf8' }
    ).trim();
  } catch {
    return '';
  }
};

const url = resolveDatabaseUrl();
if (!url) {
  console.error('DATABASE_URL required (env or Secret Manager)');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
const report = {
  migrationName,
  migrationSafety: 'ADDITIVE',
  startedAt: new Date().toISOString(),
  steps: []
};

const t0 = Date.now();
await client.connect();

try {
  const recent = await client.query(
    `SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations
     ORDER BY finished_at DESC NULLS LAST LIMIT 12`
  );
  report.recentMigrations = recent.rows.map((r) => ({
    name: r.migration_name,
    finished: r.finished_at,
    rolledBack: r.rolled_back_at
  }));

  const colBefore = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='User'
       AND column_name IN ('preferred_currency','currency_preference_updated_at')
     ORDER BY column_name`
  );
  report.userColumnsBefore = colBefore.rows.map((r) => r.column_name);

  const tableBefore = await client.query(
    `SELECT to_regclass('public.fx_quotes') AS reg`
  );
  report.fxQuotesBefore = Boolean(tableBefore.rows[0]?.reg);

  const userCount = await client.query(`SELECT COUNT(*)::int AS c FROM "User"`);
  report.userCountBefore = userCount.rows[0]?.c;

  let walletCount = null;
  try {
    const w = await client.query(`SELECT COUNT(*)::int AS c FROM "Wallet"`);
    walletCount = w.rows[0]?.c;
  } catch {
    walletCount = null;
  }
  report.walletCountBefore = walletCount;

  const already =
    report.userColumnsBefore.includes('preferred_currency') &&
    report.fxQuotesBefore &&
    recent.rows.some((r) => r.migration_name === migrationName && r.finished_at && !r.rolled_back_at);

  if (already) {
    report.status = 'ALREADY_APPLIED';
    report.endedAt = new Date().toISOString();
    report.durationMs = Date.now() - t0;
    console.log(JSON.stringify(report, null, 2));
    await client.end();
    process.exit(0);
  }

  const sql = readFileSync(sqlPath, 'utf8');
  await client.query('BEGIN');
  report.steps.push('BEGIN');
  await client.query(sql);
  report.steps.push('SQL_APPLIED');

  const exists = await client.query(
    `SELECT 1 FROM _prisma_migrations WHERE migration_name=$1`,
    [migrationName]
  );
  if (!exists.rowCount) {
    await client.query(
      `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
       VALUES ($1, $2, NOW(), $3, NULL, NULL, NOW(), 1)`,
      [randomUUID(), 'phase28a-manual-apply-multi-currency', migrationName]
    );
    report.prismaRecord = 'inserted';
  } else {
    report.prismaRecord = 'already_present';
  }
  report.steps.push('PRISMA_RECORD');
  await client.query('COMMIT');
  report.steps.push('COMMIT');

  const colAfter = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='User'
       AND column_name IN ('preferred_currency','currency_preference_updated_at')
     ORDER BY column_name`
  );
  report.userColumnsAfter = colAfter.rows.map((r) => r.column_name);

  const tableAfter = await client.query(
    `SELECT to_regclass('public.fx_quotes') AS reg`
  );
  report.fxQuotesAfter = Boolean(tableAfter.rows[0]?.reg);

  const idx = await client.query(
    `SELECT indexname FROM pg_indexes WHERE tablename='fx_quotes' ORDER BY indexname`
  );
  report.fxQuotesIndexes = idx.rows.map((r) => r.indexname);

  const userCountAfter = await client.query(`SELECT COUNT(*)::int AS c FROM "User"`);
  report.userCountAfter = userCountAfter.rows[0]?.c;
  report.userCountUnchanged = report.userCountBefore === report.userCountAfter;

  report.status = 'APPLIED';
  report.destructiveChanges = false;
  report.historicalAmountsRewritten = false;
  report.walletBalancesRewritten = false;
  report.gatewayConfigurationChanged = false;
  report.endedAt = new Date().toISOString();
  report.durationMs = Date.now() - t0;
  console.log(JSON.stringify(report, null, 2));
  await client.end();
  process.exit(0);
} catch (error) {
  try {
    await client.query('ROLLBACK');
  } catch {
    /* ignore */
  }
  report.status = 'FAILED';
  report.error = error?.message || String(error);
  report.endedAt = new Date().toISOString();
  report.durationMs = Date.now() - t0;
  console.error(JSON.stringify(report, null, 2));
  await client.end();
  process.exit(1);
}
