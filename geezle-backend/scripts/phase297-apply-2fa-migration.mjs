import pg from 'pg';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(
  here,
  '../prisma/migrations/20260722010000_phase297_admin_2fa_and_system_controls/migration.sql'
);
const migrationName = '20260722010000_phase297_admin_2fa_and_system_controls';
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const sql = readFileSync(sqlPath, 'utf8');
  await client.query(sql);
  const exists = await client.query(
    'SELECT 1 FROM _prisma_migrations WHERE migration_name=$1',
    [migrationName]
  );
  if (!exists.rowCount) {
    await client.query(
      `INSERT INTO _prisma_migrations
        (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
       VALUES ($1, $2, NOW(), $3, NULL, NULL, NOW(), 1)`,
      [randomUUID(), 'phase297-admin-2fa', migrationName]
    );
  }
  const cols = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='User' AND column_name LIKE 'twoFactor%'`
  );
  console.log(
    JSON.stringify(
      { status: 'OK', columns: cols.rows.map((r) => r.column_name) },
      null,
      2
    )
  );
} finally {
  await client.end();
}
