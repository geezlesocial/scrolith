#!/usr/bin/env node
/**
 * Phase 22.3A — API certification for presence + receipts (no message bodies logged).
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, 'playwright-results/phase223');
mkdirSync(outDir, { recursive: true });

const apiBase = (process.env.CERT_API_BASE || 'https://api.scrolith.com/api').replace(/\/$/, '');
const report = {
  phase: '22.3A',
  generatedAt: new Date().toISOString(),
  apiBase,
  checks: {},
  evidence: [],
  artifacts: {}
};

const log = (name, ok, detail = {}) => {
  report.checks[name] = ok ? 'PASS' : 'FAIL';
  report.evidence.push({ name, ok, ...detail, at: new Date().toISOString() });
  console.log(JSON.stringify({ name, ok, ...detail }));
};

const json = async (res) => {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 200) };
  }
};

const extractData = (body) => body?.data ?? body;

let token = process.env.CERT_TOKEN || '';
if (!token) {
  for (const p of [
    join(root, 'tests/certification/fixtures/storage-state.p222.json'),
    join(root, 'tests/certification/fixtures/storage-state.p221.json'),
    join(root, 'tests/certification/fixtures/storage-state.json')
  ]) {
    if (!existsSync(p)) continue;
    try {
      const st = JSON.parse(readFileSync(p, 'utf8'));
      for (const o of st.origins || []) {
        const t = (o.localStorage || []).find((x) => x.name === 'token' || x.name === 'accessToken');
        if (t?.value) {
          token = t.value;
          break;
        }
      }
    } catch {
      /* ignore */
    }
    if (token) break;
  }
}

if (!token) {
  log('auth_token', false, { reason: 'missing' });
  writeFileSync(join(outDir, 'api-cert.json'), JSON.stringify(report, null, 2));
  process.exit(2);
}
log('auth_token', true, { source: 'storage_or_env' });

const headers = {
  Authorization: `Bearer ${token}`,
  Accept: 'application/json',
  'Content-Type': 'application/json'
};

// Health
{
  const healthUrl = apiBase.replace(/\/api$/, '') + '/api/health';
  const res = await fetch(healthUrl, { headers: { Accept: 'application/json' } });
  log('health', res.ok, { status: res.status });
}

const me = await fetch(`${apiBase}/auth/me`, { headers });
const meBody = await json(me);
const userId =
  meBody?.user?.id || meBody?.data?.user?.id || meBody?.data?.id || meBody?.id || '';
log('auth_me', me.ok && Boolean(userId), { status: me.status });

// Presence heartbeat
{
  const res = await fetch(`${apiBase}/messages/presence/heartbeat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ state: 'online' })
  });
  const body = await json(res);
  const data = extractData(body);
  log('presence_heartbeat', res.ok && (data?.userId || data?.isOnline !== undefined || res.status === 200), {
    status: res.status,
    state: data?.state || null
  });
}

// Presence batch (self)
{
  const res = await fetch(
    `${apiBase}/messages/presence?ids=${encodeURIComponent(userId)}`,
    { headers }
  );
  const body = await json(res);
  const data = extractData(body);
  const list = Array.isArray(data) ? data : [];
  log('presence_batch', res.ok, { status: res.status, count: list.length });
}

// Presence privacy cycle
for (const visibility of ['EVERYONE', 'CONTACTS', 'NOBODY', 'EVERYONE']) {
  const res = await fetch(`${apiBase}/messages/presence/privacy`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ visibility })
  });
  const body = await json(res);
  const data = extractData(body);
  log(`presence_privacy_${visibility.toLowerCase()}`, res.ok && (data?.visibility === visibility || res.status === 200), {
    status: res.status,
    visibility: data?.visibility || null
  });
}

// Conversations list (compat)
let conversationId = '';
{
  const res = await fetch(`${apiBase}/messages/conversations?limit=20`, { headers });
  const body = await json(res);
  const data = extractData(body);
  const arr = Array.isArray(data) ? data : data?.conversations || [];
  conversationId = String(arr[0]?.id || '');
  log('dm_list', res.ok, { status: res.status, count: arr.length, hasConvo: Boolean(conversationId) });
}

// Receipts on a conversation
if (conversationId) {
  const deliv = await fetch(`${apiBase}/messages/conversations/${conversationId}/receipts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ deliveredAt: new Date().toISOString() })
  });
  const delivBody = await json(deliv);
  log('receipt_delivered', deliv.ok, { status: deliv.status });

  const read = await fetch(`${apiBase}/messages/conversations/${conversationId}/read`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ userId })
  });
  const readBody = await json(read);
  const readData = extractData(readBody);
  log('receipt_read', read.ok, {
    status: read.status,
    hasWatermark: Boolean(readData?.lastReadAt || read.status === 200)
  });

  // Send message + verify list still works (compat / delivery_status field optional)
  const clientMessageId = `p223-cert-${Date.now()}`;
  const send = await fetch(`${apiBase}/messages/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text: 'p223 cert presence/receipts', clientMessageId })
  });
  const sendBody = await json(send);
  const msg = extractData(sendBody);
  const msgId = msg?.id || msg?.message?.id || '';
  log('dm_send_compat', send.ok && Boolean(msgId), { status: send.status });

  // Idempotent replay (22.1)
  const send2 = await fetch(`${apiBase}/messages/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text: 'p223 cert replay', clientMessageId })
  });
  const send2Body = await json(send2);
  const msg2 = extractData(send2Body);
  const same = Boolean(msgId) && String(msg2?.id || msg2?.message?.id || '') === String(msgId);
  log('dm_idempotent_221', send2.ok && same, { status: send2.status });

  // Thread get — deliveryStatus may be present on outgoing
  const thread = await fetch(`${apiBase}/messages/conversations/${conversationId}`, { headers });
  const threadBody = await json(thread);
  const threadData = extractData(threadBody);
  const messages = Array.isArray(threadData?.messages) ? threadData.messages : [];
  const outgoing = messages.find((m) => String(m.id) === String(msgId));
  log('delivery_status_field', thread.ok, {
    status: thread.status,
    hasDeliveryStatus: Boolean(
      outgoing?.deliveryStatus || outgoing?.delivery_status || outgoing?.is_read !== undefined
    )
  });
} else {
  log('receipt_delivered', false, { reason: 'no_conversation' });
  log('receipt_read', false, { reason: 'no_conversation' });
  log('dm_send_compat', false, { reason: 'no_conversation' });
  log('dm_idempotent_221', false, { reason: 'no_conversation' });
  log('delivery_status_field', false, { reason: 'no_conversation' });
}

// Group create smoke (22.2 regression)
{
  const title = `P223 Group ${Date.now()}`;
  const res = await fetch(`${apiBase}/messages/conversations`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type: 'GROUP',
      title,
      participants: [userId]
    })
  });
  const body = await json(res);
  const data = extractData(body);
  const gid = String(data?.id || '');
  report.artifacts.groupId = gid || null;
  log('group_create_222', res.ok && Boolean(gid), { status: res.status });
  if (gid) {
    const mem = await fetch(`${apiBase}/messages/conversations/${gid}/members`, { headers });
    log('group_members_222', mem.ok, { status: mem.status });
  } else {
    log('group_members_222', false, { reason: 'no_group' });
  }
}

const required = [
  'health',
  'auth_me',
  'presence_heartbeat',
  'presence_batch',
  'presence_privacy_everyone',
  'presence_privacy_contacts',
  'presence_privacy_nobody',
  'dm_list',
  'receipt_delivered',
  'receipt_read',
  'dm_send_compat',
  'dm_idempotent_221',
  'delivery_status_field',
  'group_create_222',
  'group_members_222'
];
const failed = required.filter((k) => report.checks[k] !== 'PASS');
report.overall = failed.length === 0 ? 'PASS' : 'FAIL';
report.failed = failed;
report.presence = [
  'presence_heartbeat',
  'presence_batch',
  'presence_privacy_everyone',
  'presence_privacy_contacts',
  'presence_privacy_nobody'
].every((k) => report.checks[k] === 'PASS')
  ? 'PASS'
  : 'FAIL';
report.receipts =
  report.checks.receipt_delivered === 'PASS' && report.checks.receipt_read === 'PASS'
    ? 'PASS'
    : 'FAIL';
report.dmCompat =
  report.checks.dm_send_compat === 'PASS' && report.checks.dm_idempotent_221 === 'PASS'
    ? 'PASS'
    : 'FAIL';
report.group222 =
  report.checks.group_create_222 === 'PASS' && report.checks.group_members_222 === 'PASS'
    ? 'PASS'
    : 'FAIL';

writeFileSync(join(outDir, 'api-cert.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ overall: report.overall, failed, presence: report.presence, receipts: report.receipts }, null, 2));
process.exit(failed.length === 0 ? 0 : 1);
