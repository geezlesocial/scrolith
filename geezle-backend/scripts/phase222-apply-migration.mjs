#!/usr/bin/env node
/**
 * Phase 22.2 — apply additive group messaging migration via DATABASE_URL (proxy).
 * Does not print credentials.
 */
import pg from 'pg';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const here = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(
  here,
  '../prisma/migrations/20260720140000_phase222_group_messaging/migration.sql'
);
const migrationName = '20260720140000_phase222_group_messaging';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

const report = { migrationName, steps: [] };

try {
  const titleCol = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='Conversation' AND column_name='title'`
  );
  report.titleColumnBefore = titleCol.rows.length > 0;

  const roleCol = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='ConversationParticipant' AND column_name='role'`
  );
  report.roleColumnBefore = roleCol.rows.length > 0;

  const inviteTable = await client.query(
    `SELECT to_regclass('public."ConversationInvite"') AS reg`
  );
  report.inviteTableBefore = Boolean(inviteTable.rows[0]?.reg);

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
  if (already && report.titleColumnBefore && report.roleColumnBefore && report.inviteTableBefore) {
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
      [randomUUID(), 'phase222-manual-apply-group-messaging', migrationName]
    );
    report.prismaRecord = 'inserted';
  } else {
    report.prismaRecord = 'already_present';
  }
  await client.query('COMMIT');
  report.steps.push('migration_sql_applied');

  const afterTitle = await client.query(
    `SELECT column_name, data_type, is_nullable FROM information_schema.columns
     WHERE table_schema='public' AND table_name='Conversation' AND column_name IN ('title','description','avatarFileId','visibility')`
  );
  report.conversationColumns = afterTitle.rows;

  const afterRole = await client.query(
    `SELECT column_name, udt_name, is_nullable FROM information_schema.columns
     WHERE table_schema='public' AND table_name='ConversationParticipant' AND column_name IN ('role','notifications')`
  );
  report.participantColumns = afterRole.rows;

  const inviteAfter = await client.query(
    `SELECT to_regclass('public."ConversationInvite"') AS reg`
  );
  report.inviteTableAfter = Boolean(inviteAfter.rows[0]?.reg);

  const enums = await client.query(
    `SELECT t.typname FROM pg_type t
     WHERE t.typname IN (
       'ConversationMemberRole','ConversationNotificationLevel',
       'ConversationVisibility','ConversationInviteStatus'
     )
     ORDER BY 1`
  );
  report.enums = enums.rows.map((r) => r.typname);

  const groupOwnerStats = await client.query(
    `SELECT
       COUNT(DISTINCT c.id)::int AS group_conversations,
       COUNT(*) FILTER (WHERE cp.role = 'OWNER')::int AS owners
     FROM "Conversation" c
     LEFT JOIN "ConversationParticipant" cp ON cp."conversationId" = c.id AND cp."deletedAt" IS NULL
     WHERE c.type = 'GROUP'`
  );
  report.groupOwnerStats = groupOwnerStats.rows[0];

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
