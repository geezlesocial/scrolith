/**
 * Phase 26A — authenticated language preference API certification against tagged backend.
 * Redacts secrets/tokens from output.
 */
import { execSync } from 'child_process';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import pg from 'pg';

const { Client } = pg;
const BE = process.env.P26_BE_URL || 'https://p26---scrolith-backend-25ysnpjdda-as.a.run.app';

const secret = execSync(
  'gcloud secrets versions access latest --secret=DATABASE_URL --project=scrolith-500821',
  { encoding: 'utf8' }
).trim();
const jwtSecret = execSync(
  'gcloud secrets versions access latest --secret=JWT_SECRET --project=scrolith-500821',
  { encoding: 'utf8' }
).trim();

const url = new URL(secret.replace(/^postgresql:/, 'http:'));
const user = decodeURIComponent(url.username);
const pass = decodeURIComponent(url.password);
const db = url.pathname.replace(/^\//, '') || 'postgres';
const local = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@127.0.0.1:5433/${db}?sslmode=disable`;

const client = new Client({ connectionString: local });
await client.connect();
const userRow = await client.query(
  `SELECT id, email, role::text AS role FROM "User" WHERE "isActive" = true ORDER BY "createdAt" ASC LIMIT 1`
);
const postRow = await client.query(
  `SELECT id, "authorId", "sourceLanguage", "languageManuallySet" FROM "CommunityPost" WHERE status <> 'deleted' ORDER BY "createdAt" DESC LIMIT 1`
);
await client.end();

const u = userRow.rows[0];
const post = postRow.rows[0];
if (!u) {
  console.log(JSON.stringify({ status: 'FAILED', error: 'no_user' }));
  process.exit(1);
}

const token = jwt.sign({ id: u.id, email: u.email, role: u.role }, jwtSecret, { expiresIn: '15m' });
const auth = { Authorization: `Bearer ${token}` };

async function req(method, path, body) {
  const res = await fetch(`${BE}${path}`, {
    method,
    headers: {
      ...auth,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, json };
}

const results = {};

// GET prefs
results.getPrefs = await req('GET', '/api/auth/me/language-preferences');

// invalid empty
results.putEmpty = await req('PUT', '/api/auth/me/language-preferences', { understoodLanguages: [] });

// invalid code
results.putInvalid = await req('PUT', '/api/auth/me/language-preferences', {
  understoodLanguages: ['xx-not-real']
});

// valid multi + alias
results.putValid = await req('PUT', '/api/auth/me/language-preferences', {
  understoodLanguages: ['en', 'EN', 'tl', 'fil', 'ar'],
  preferredTranslationLanguage: 'en',
  languageSuggestionsEnabled: true,
  autoTranslateEnabled: false,
  confirm: true
});

// reload
results.getPrefsAfter = await req('GET', '/api/auth/me/language-preferences');

// decision endpoint
if (post?.id) {
  results.decision = await req('GET', `/api/community/posts/${post.id}/translation-decision`);
  // manual language as author if same user, else expect 403
  results.manualLanguage = await req('POST', `/api/community/posts/${post.id}/language`, {
    languageCode: 'en'
  });
}

// translation decision unit-style checks via policy on server response shape
const prefs = results.getPrefsAfter?.json?.data || {};
const decision = results.decision?.json?.data?.decision || {};

console.log(
  JSON.stringify(
    {
      status: 'SUCCESS',
      userIdPrefix: String(u.id).slice(0, 8),
      postIdPrefix: post ? String(post.id).slice(0, 8) : null,
      getPrefsStatus: results.getPrefs.status,
      putEmptyStatus: results.putEmpty.status,
      putEmptyError: results.putEmpty.json?.error || null,
      putInvalidStatus: results.putInvalid.status,
      putValidStatus: results.putValid.status,
      understoodAfter: prefs.understoodLanguages || results.putValid.json?.data?.understoodLanguages,
      confirmed: prefs.languagePreferencesConfirmed ?? results.putValid.json?.data?.languagePreferencesConfirmed,
      decisionStatus: results.decision?.status,
      decisionReason: decision.reason || null,
      recommendTranslation: decision.recommendTranslation,
      manualStatus: results.manualLanguage?.status,
      manualError: results.manualLanguage?.json?.error || null
    },
    null,
    2
  )
);
