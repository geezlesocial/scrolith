#!/usr/bin/env node
/**
 * Phase 29.7 — apply approved additive messaging-group migrations via DATABASE_URL.
 * Only:
 *   20260721140000_phase291_enterprise_messaging_groups
 *   20260721160000_phase295_messaging_groups_search_indexes
 * Does not print credentials or row-level PII.
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
    checksum: 'phase297-manual-apply-phase291',
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
        policyColumns: col.rows.map((r) => r.column_name)
      };
    }
  },
  {
    name: '20260721160000_phase295_messaging_groups_search_indexes',
    path: join(
      here,
      '../prisma/migrations/20260721160000_phase295_messaging_groups_search_indexes/migration.sql'
    ),
    checksum: 'phase297-manual-apply-phase295',
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
    }
  }
];

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
const report = { phase: '29.7', steps: [], results: [] };

try {
  const recent = await client.query(
    `SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations
     ORDER BY finished_at DESC NULLS LAST LIMIT 20`
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

    if (already) {
      entry.status = 'ALREADY_APPLIED';
      entry.after = before;
      report.results.push(entry);
      continue;
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
      entry.status = 'APPLIED';
      report.steps.push(`${mig.name}:applied`);
    } catch (e) {
      await client.query('ROLLBACK');
      entry.status = 'FAILED';
      entry.error = String(e.message || e);
      report.results.push(entry);
      console.log(JSON.stringify({ ...report, status: 'FAILED' }, null, 2));
      process.exit(1);
    }

    entry.after = await mig.validate(client);
    report.results.push(entry);
  }

  // Integrity summary
  const secret = await client.query(
    `SELECT 1 AS ok FROM pg_enum e
     JOIN pg_type t ON e.enumtypid = t.oid
     WHERE t.typname = 'ConversationVisibility' AND e.enumlabel = 'SECRET'
     LIMIT 1`
  );
  const joinPolicy = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='Conversation' AND column_name='joinPolicy'`
  );
  const indexes = await client.query(
    `SELECT count(*)::int AS n FROM pg_indexes
     WHERE schemaname='public' AND indexname LIKE '%type_visibility_lastMessageAt%'
        OR indexname = 'DirectMessage_conversationId_createdAt_id_idx'`
  );

  report.integrity = {
    secretEnum: secret.rowCount > 0,
    joinPolicyColumn: joinPolicy.rowCount > 0,
    searchIndexesPresent: Number(indexes.rows[0]?.n || 0) >= 1
  };
  report.status =
    report.integrity.secretEnum && report.integrity.joinPolicyColumn ? 'OK' : 'PARTIAL';
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== 'OK') process.exit(1);
} catch (e) {
  console.error(JSON.stringify({ status: 'FAILED', error: String(e.message || e) }, null, 2));
  process.exit(1);
} finally {
  await client.end();
}
