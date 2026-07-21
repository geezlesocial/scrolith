#!/usr/bin/env node
/**
 * Reactivate User.isActive=false accounts (admin bulk deactivate recovery).
 * Does not print emails or PII in full when REACTIVATE_DRY_RUN=1.
 */
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}

const dryRun = process.env.REACTIVATE_DRY_RUN === '1';
const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  const counts = await client.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE "isActive" = true)::int AS active,
      COUNT(*) FILTER (WHERE "isActive" = false)::int AS inactive
    FROM "User"
  `);
  console.log(JSON.stringify({ before: counts.rows[0] }, null, 2));

  const sample = await client.query(`
    SELECT id, left(email, 3) AS email_prefix, role, "isActive", "updatedAt"
    FROM "User"
    WHERE "isActive" = false
    ORDER BY "updatedAt" DESC NULLS LAST
    LIMIT 30
  `);
  console.log(JSON.stringify({ inactiveSample: sample.rows }, null, 2));

  if (dryRun) {
    console.log(JSON.stringify({ status: 'DRY_RUN', wouldReactivate: counts.rows[0].inactive }));
    process.exit(0);
  }

  const result = await client.query(`
    UPDATE "User"
    SET "isActive" = true, "updatedAt" = NOW()
    WHERE "isActive" = false
    RETURNING id
  `);

  const after = await client.query(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE "isActive" = true)::int AS active,
      COUNT(*) FILTER (WHERE "isActive" = false)::int AS inactive
    FROM "User"
  `);

  console.log(
    JSON.stringify(
      {
        status: 'REACTIVATED',
        reactivatedCount: result.rowCount,
        after: after.rows[0]
      },
      null,
      2
    )
  );
} finally {
  await client.end();
}
