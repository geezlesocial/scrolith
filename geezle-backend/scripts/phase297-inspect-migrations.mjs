#!/usr/bin/env node
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const recent = await client.query(
    `SELECT migration_name, finished_at, rolled_back_at
     FROM _prisma_migrations
     ORDER BY finished_at DESC NULLS LAST
     LIMIT 30`
  );
  const cols = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='Conversation'
       AND column_name IN ('joinPolicy','messagingMode','memberCount','slowModeSeconds')
     ORDER BY column_name`
  );
  const sec = await client.query(
    `SELECT e.enumlabel FROM pg_enum e
     JOIN pg_type t ON e.enumtypid = t.oid
     WHERE t.typname = 'ConversationVisibility'
     ORDER BY e.enumlabel`
  );
  const idx = await client.query(
    `SELECT indexname FROM pg_indexes
     WHERE schemaname='public' AND (
       indexname LIKE 'Conversation_type_%'
       OR indexname LIKE 'DirectMessage_conversationId_createdAt%'
       OR indexname LIKE 'GroupModerationAction%'
       OR indexname LIKE 'ConversationJoinRequest%'
     )
     ORDER BY indexname`
  );
  const privacyCols = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='User'
       AND column_name IN (
         'presenceVisibility','lastSeenVisibility','readReceiptsEnabled',
         'typingIndicatorsEnabled','directMessageAudience'
       )
     ORDER BY column_name`
  );
  console.log(
    JSON.stringify(
      {
        recent: recent.rows.map((r) => ({
          name: r.migration_name,
          finished: r.finished_at,
          rolledBack: r.rolled_back_at
        })),
        conversationPolicyColumns: cols.rows.map((r) => r.column_name),
        visibilityEnums: sec.rows.map((r) => r.enumlabel),
        messagingIndexes: idx.rows.map((r) => r.indexname),
        privacyUserColumns: privacyCols.rows.map((r) => r.column_name)
      },
      null,
      2
    )
  );
} finally {
  await client.end();
}
