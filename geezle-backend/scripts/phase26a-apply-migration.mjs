/**
 * Phase 26A — apply additive multilingual migration via Cloud SQL proxy.
 * Does not print secrets.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Client } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const MIGRATION = '20260720190000_phase26_multilingual_intelligence';

const secret = execSync(
  'gcloud secrets versions access latest --secret=DATABASE_URL --project=scrolith-500821',
  { encoding: 'utf8' }
).trim();

const url = new URL(secret.replace(/^postgresql:/, 'http:'));
const user = decodeURIComponent(url.username);
const pass = decodeURIComponent(url.password);
const db = url.pathname.replace(/^\//, '') || 'postgres';
const local = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@127.0.0.1:5433/${db}?sslmode=disable`;

const sqlPath = path.join(root, 'prisma', 'migrations', MIGRATION, 'migration.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');
const start = Date.now();
const client = new Client({ connectionString: local });

await client.connect();
try {
  const mig = await client.query(
    `SELECT migration_name, finished_at FROM _prisma_migrations WHERE migration_name = $1`,
    [MIGRATION]
  );
  console.log(
    JSON.stringify({
      existingMigrations: mig.rows.map((r) => ({ name: r.migration_name, finished: r.finished_at }))
    })
  );

  await client.query('BEGIN');
  await client.query(sql);
  if (mig.rowCount === 0) {
    await client.query(
      `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
       VALUES ($1, $2, NOW(), $3, NULL, NULL, NOW(), 1)`,
      [crypto.randomUUID(), 'phase26a-manual-apply', MIGRATION]
    );
  }
  await client.query('COMMIT');

  const colsUser = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='User'
       AND column_name IN (
         'understoodLanguages','preferredTranslationLanguage','languageSuggestionsEnabled',
         'autoTranslateEnabled','languagePreferencesUpdatedAt','languagePreferencesConfirmed'
       )
     ORDER BY column_name`
  );
  const colsPost = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='public' AND table_name='CommunityPost'
       AND column_name IN (
         'languageDetectionStatus','isMixedLanguage','detectedLanguageCodes',
         'languageManuallySet','languageDetectedAt','sourceLanguage'
       )
     ORDER BY column_name`
  );
  const counts = await client.query(
    `SELECT
       (SELECT COUNT(*)::int FROM "User") AS users,
       (SELECT COUNT(*)::int FROM "CommunityPost") AS posts,
       (SELECT COUNT(*)::int FROM "ContentTranslation") AS translations,
       (SELECT COUNT(*)::int FROM "CommunityPost" WHERE "sourceLanguage" IS NULL) AS posts_null_language,
       (SELECT COUNT(*)::int FROM "CommunityPost" WHERE lower(coalesce("sourceLanguage",'')) IN ('unknown','und')) AS posts_unknown_label`
  );

  console.log(
    JSON.stringify(
      {
        status: 'SUCCESS',
        migrationName: MIGRATION,
        durationMs: Date.now() - start,
        userColumns: colsUser.rows.map((r) => r.column_name),
        postColumns: colsPost.rows.map((r) => r.column_name),
        counts: counts.rows[0]
      },
      null,
      2
    )
  );
} catch (e) {
  try {
    await client.query('ROLLBACK');
  } catch {
    // ignore
  }
  console.log(
    JSON.stringify({
      status: 'FAILED',
      error: String(e?.message || e).slice(0, 500),
      durationMs: Date.now() - start
    })
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
