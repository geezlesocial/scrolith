#!/usr/bin/env ts-node
/*
  syncEnvToSettings.ts
  Reads selected env vars and POSTs them to the running backend's
  /api/admin/system/settings endpoint. This is intentionally conservative:
  - Only non-empty env values are included
  - Does not overwrite unrelated settings
  Usage: ts-node src/scripts/syncEnvToSettings.ts [--url http://localhost:5000]
*/

import dotenv from 'dotenv';
import process from 'process';
import readline from 'readline';

dotenv.config();

const argv = process.argv.slice(2);
let target = 'http://localhost:5000';
let dryRun = false;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--url' && argv[i+1]) {
    target = argv[i+1];
  }
  if (argv[i] === '--dry-run') {
    dryRun = true;
  }
}

function nonEmpty(v: any) {
  return v !== undefined && v !== null && String(v).trim() !== '';
}

const candidates: Array<{ path: string; value: any }> = [];

// Collect candidates for confirmation
if (nonEmpty(process.env.EMAIL_HOST)) candidates.push({ path: 'email.host', value: process.env.EMAIL_HOST });
if (nonEmpty(process.env.EMAIL_PORT)) candidates.push({ path: 'email.port', value: process.env.EMAIL_PORT });
if (nonEmpty(process.env.EMAIL_FROM_NAME)) candidates.push({ path: 'email.fromName', value: process.env.EMAIL_FROM_NAME });
if (nonEmpty(process.env.EMAIL_FROM_EMAIL)) candidates.push({ path: 'email.fromEmail', value: process.env.EMAIL_FROM_EMAIL });
if (nonEmpty(process.env.EMAIL_USER)) candidates.push({ path: 'email.username', value: process.env.EMAIL_USER });
if (nonEmpty(process.env.EMAIL_PASS)) candidates.push({ path: 'email.password', value: process.env.EMAIL_PASS });

if (nonEmpty(process.env.GOOGLE_API_KEY)) candidates.push({ path: 'aiConfig.providers.google.apiKey', value: process.env.GOOGLE_API_KEY });
if (nonEmpty(process.env.GOOGLE_GEMINI_KEY)) candidates.push({ path: 'aiConfig.providers.google.api_key', value: process.env.GOOGLE_GEMINI_KEY });
if (nonEmpty(process.env.OPENAI_API_KEY)) candidates.push({ path: 'aiConfig.providers.openai.apiKey', value: process.env.OPENAI_API_KEY });

if (nonEmpty(process.env.STORAGE_DRIVER)) candidates.push({ path: 'storage.driver', value: process.env.STORAGE_DRIVER });
if (nonEmpty(process.env.S3_BUCKET)) candidates.push({ path: 'storage.s3.bucket', value: process.env.S3_BUCKET });
if (nonEmpty(process.env.S3_REGION)) candidates.push({ path: 'storage.s3.region', value: process.env.S3_REGION });
if (nonEmpty(process.env.S3_ACCESS_KEY_ID)) candidates.push({ path: 'storage.s3.accessKeyId', value: process.env.S3_ACCESS_KEY_ID });
if (nonEmpty(process.env.S3_SECRET_ACCESS_KEY)) candidates.push({ path: 'storage.s3.secretAccessKey', value: process.env.S3_SECRET_ACCESS_KEY });
if (nonEmpty(process.env.B2_BUCKET)) candidates.push({ path: 'storage.backblaze.bucket', value: process.env.B2_BUCKET });
if (nonEmpty(process.env.B2_REGION)) candidates.push({ path: 'storage.backblaze.region', value: process.env.B2_REGION });
if (nonEmpty(process.env.B2_ACCESS_KEY_ID)) candidates.push({ path: 'storage.backblaze.accessKeyId', value: process.env.B2_ACCESS_KEY_ID });
if (nonEmpty(process.env.B2_SECRET_ACCESS_KEY)) candidates.push({ path: 'storage.backblaze.secretAccessKey', value: process.env.B2_SECRET_ACCESS_KEY });

if (nonEmpty(process.env.CURRENCY_PROVIDER)) candidates.push({ path: 'currency.provider', value: process.env.CURRENCY_PROVIDER });
if (nonEmpty(process.env.CURRENCY_API_KEY)) candidates.push({ path: 'currency.apiKey', value: process.env.CURRENCY_API_KEY });

if (candidates.length === 0) {
  console.log('No environment values found to sync. Exiting.');
  process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string) {
  return new Promise<string>((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

async function buildPayloadInteractive() {
  const payload: any = {};

  for (const c of candidates) {
    const preview = String(c.value).length > 60 ? String(c.value).slice(0, 60) + '...' : String(c.value);
    const ans = await ask(`Update ${c.path} => "${preview}" ? (y/N): `);
    if (ans.toLowerCase() === 'y' || ans.toLowerCase() === 'yes') {
      // apply to payload by path
      const parts = c.path.split('.');
      let cur = payload;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (i === parts.length - 1) {
          cur[p] = (parts[p] === 'port') ? Number(c.value) : c.value;
        } else {
          if (!cur[parts[i]]) cur[parts[i]] = {};
          cur = cur[parts[i]];
        }
      }
    }
  }

  rl.close();
  return payload;
}

async function postPayload(payload: any) {
  const url = `${target.replace(/\/$/, '')}/api/admin/system/settings`;
  console.log('Posting payload to', url);
  console.log('Payload preview:', JSON.stringify(payload, null, 2));

  if (Object.keys(payload).length === 0) {
    console.log('No keys selected for update. Nothing to do.');
    return;
  }
  // Audit log entry (before actual POST)
  try {
    const fs = await import('fs');
    const path = await import('path');
    const logDir = path.join(process.cwd(), 'logs');
    const logPath = path.join(logDir, 'sync-env.log');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });
    const entry = {
      timestamp: new Date().toISOString(),
      user: process.env.USER || process.env.USERNAME || 'unknown',
      target: url,
      dryRun,
      payload
    };
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
  } catch (e) {
    console.warn('Failed to write audit log:', e);
  }

  // If dry-run, stop after logging
  if (dryRun) {
    console.log('Dry-run enabled — not sending payload. Audit logged.');
    return;
  }

  // Use curl fallback if fetch not available
  const g = (global as unknown) as { fetch?: typeof fetch };
  if (typeof g.fetch !== 'function') {
    console.log('Global fetch not available. Use this curl command:');
    const tmp = JSON.stringify(payload).replace(/"/g, '\\"');
    console.log(`curl -X POST "${url}" -H "Content-Type: application/json" -d "${tmp}"`);
    return;
  }

  try {
    const res = await g.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (err: any) {
    console.error('Failed to POST payload:', err.message || err);
  }
}

async function main() {
  const payload = await buildPayloadInteractive();
  await postPayload(payload);
}

main();
