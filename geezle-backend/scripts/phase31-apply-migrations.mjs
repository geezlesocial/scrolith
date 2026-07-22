#!/usr/bin/env node
/**
 * Phase 31 — apply approved additive migrations for Phase 29 + 30:
 *   20260721140000_phase291_enterprise_messaging_groups
 *   20260721160000_phase295_messaging_groups_search_indexes
 *   20260722120000_phase30_human_verification
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
    name: '20260721140000_phase291_enterprise_messaging_groups',
    path: join(
      here,
      '../prisma/migrations/20260721140000_phase291_enterprise_messaging_groups/migration.sql'
    ),
    checksum: 'phase31-apply-phase291',
    validate: async (client) => {
      const enumVal = await client.query(
        `SELECT 1 AS ok FROM pg_enum e
         JOIN pg_type t ON e.enumtypid = t.oid
         WHERE t.typname = 'ConversationVisibility' AND e.enumlabel = 'SECRET'
         LIMIT 1`
      );
      const col = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema='public' AND table_name='Conversation'
           AND column_name IN ('joinPolicy','messagingMode','slowModeSeconds','memberCount')`
      );
      return {
        secretEnum: enumVal.rowCount > 0,
        policyColumns: col.rows.map((r) => r.column_name).sort()
      };
    },
    ok: (v) => v.secretEnum && v.policyColumns.length >= 4
  },
  {
    name: '20260721160000_phase295_messaging_groups_search_indexes',
    path: join(
      here,
      '../prisma/migrations/20260721160000_phase295_messaging_groups_search_indexes/migration.sql'
    ),
    checksum: 'phase31-apply-phase295',
    validate: async (client) => {
      const idx = await client.query(
        `SELECT indexname FROM pg_indexes
         WHERE schemaname='public' AND indexname IN (
           'Conversation_type_visibility_lastMessageAt_idx',
           'Conversation_type_memberCount_idx',
           'DirectMessage_conversationId_createdAt_id_idx',
           'GroupModerationAction_createdAt_idx',
           'ConversationJoinRequest_status_createdAt_idx'
         )
         ORDER BY indexname`
      );
      return { indexes: idx.rows.map((r) => r.indexname) };
    },
    ok: (v) => v.indexes.length >= 3
  },
  {
    name: '20260722120000_phase30_human_verification',
    path: join(
      here,
      '../prisma/migrations/20260722120000_phase30_human_verification/migration.sql'
    ),
    checksum: 'phase31-apply-phase30-hv',
    validate: async (client) => {
      const tables = await client.query(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema='public' AND table_name IN (
           'HumanVerificationSettings',
           'HumanVerificationPolicy',
           'HumanVerificationChallenge',
           'HumanVerificationAttempt',
           'HumanVerificationAnalytics',
           'HumanVerificationAuditLog'
         )
         ORDER BY table_name`
      );
      return { tables: tables.rows.map((r) => r.table_name) };
    },
    ok: (v) => v.tables.length >= 6
  }
];

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
const report = { phase: 31, results: [] };

try {
  const recent = await client.query(
    `SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations
     ORDER BY finished_at DESC NULLS LAST LIMIT 40`
  );
  report.recentMigrations = recent.rows.map((r) => ({
    name: r.migration_name,
    finished: r.finished_at,
    rolledBack: r.rolled_back_at
  }));

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
      // Record exists but schema incomplete — re-run SQL idempotently
      entry.status = 'REPAIRING';
    }

    const sql = readFileSync(mig.path, 'utf8');
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
      entry.error = String(err?.message || err).slice(0, 400);
      report.results.push(entry);
      console.log(JSON.stringify(report, null, 2));
      process.exit(1);
    }

    const after = await mig.validate(client);
    entry.after = after;
    entry.valid = mig.ok(after);
    if (!entry.valid) {
      entry.status = 'VALIDATION_FAILED';
      report.results.push(entry);
      console.log(JSON.stringify(report, null, 2));
      process.exit(1);
    }
    report.results.push(entry);
  }

  report.success = report.results.every((r) =>
    ['APPLIED', 'ALREADY_APPLIED', 'REPAIRED'].includes(r.status) && r.valid
  );
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.success ? 0 : 1);
} finally {
  await client.end();
}
