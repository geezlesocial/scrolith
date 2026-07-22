#!/usr/bin/env node
/**
 * Phase 33.2 — apply additive Scrolitha AI foundation + assistant + discovery migrations.
 * Idempotent. Refuses destructive SQL. Do not store secrets in this file.
 */
import pg from 'pg';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const here = dirname(fileURLToPath(import.meta.url));

const migrations = [
  {
    name: '20260722190000_phase330_scrolitha_ai_foundation',
    path: join(here, '../prisma/migrations/20260722190000_phase330_scrolitha_ai_foundation/migration.sql'),
    checksum: 'phase332-apply-phase330',
    validate: async (client) => {
      const tables = await client.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema='public' AND table_name IN (
           'AIProviderConfiguration','AIModelConfiguration','AICapability','AIPrompt',
           'AIRequest','AIUsageLedger','AIConsent','AIFeatureFlag','AIAuditLog'
         ) ORDER BY table_name`
      );
      return { tables: tables.rows.map((r) => r.table_name) };
    },
    ok: (v) => v.tables.length >= 8
  },
  {
    name: '20260722200000_phase331_scrolitha_ai_assistant',
    path: join(here, '../prisma/migrations/20260722200000_phase331_scrolitha_ai_assistant/migration.sql'),
    checksum: 'phase332-apply-phase331',
    validate: async (client) => {
      const tables = await client.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema='public' AND table_name IN (
           'AIConversation','AIConversationMessage','AIFeedback'
         ) ORDER BY table_name`
      );
      return { tables: tables.rows.map((r) => r.table_name) };
    },
    ok: (v) => v.tables.length >= 3
  },
  {
    name: '20260722210000_phase332_intelligent_discovery',
    path: join(here, '../prisma/migrations/20260722210000_phase332_intelligent_discovery/migration.sql'),
    checksum: 'phase332-apply-phase332',
    validate: async (client) => {
      const tables = await client.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema='public' AND table_name IN (
           'AIUserMemory','AIRecommendationFeedback','AILearningSignal'
         ) ORDER BY table_name`
      );
      return { tables: tables.rows.map((r) => r.table_name) };
    },
    ok: (v) => v.tables.length >= 3
  }
];

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
const report = { phase: '33.2', results: [], startedAt: new Date().toISOString() };

try {
  const recent = await client.query(
    `SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations
     ORDER BY finished_at DESC NULLS LAST LIMIT 100`
  );
  report.recentMigrations = recent.rows
    .filter((r) => String(r.migration_name || '').includes('phase33') || String(r.migration_name || '').includes('20260722'))
    .slice(0, 30)
    .map((r) => ({ name: r.migration_name, finished: r.finished_at, rolledBack: r.rolled_back_at }));

  try {
    const nCount = await client.query(`SELECT COUNT(*)::int AS c FROM "Notification"`);
    report.notificationCountBefore = nCount.rows[0]?.c ?? null;
  } catch (e) {
    report.notificationCountBefore = null;
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

    const sql = readFileSync(mig.path, 'utf8');
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
      entry.status = 'APPLIED';
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
  report.ok = report.results.every((r) => r.valid || r.status === 'ALREADY_APPLIED');
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
} finally {
  await client.end().catch(() => {});
}
