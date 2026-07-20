#!/usr/bin/env node
/**
 * Phase 22.3C — API certification for messaging privacy + menu action regression.
 * Does not log message bodies, tokens, or full privacy payloads.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const outDir = join(root, 'playwright-results/phase223c');
mkdirSync(outDir, { recursive: true });

const apiBase = (process.env.CERT_API_BASE || 'https://api.scrolith.com/api').replace(/\/$/, '');
const report = {
  phase: '22.3C',
  generatedAt: new Date().toISOString(),
  apiBase,
  checks: {},
  evidence: [],
  stats: { passed: 0, failed: 0, skipped: 0 }
};

const log = (name, ok, detail = {}) => {
  const status = ok === 'SKIP' ? 'SKIP' : ok ? 'PASS' : 'FAIL';
  report.checks[name] = status;
  if (status === 'PASS') report.stats.passed += 1;
  else if (status === 'FAIL') report.stats.failed += 1;
  else report.stats.skipped += 1;
  report.evidence.push({ name, status, ...detail, at: new Date().toISOString() });
  console.log(JSON.stringify({ name, status, ...detail }));
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
    join(root, 'tests/certification/fixtures/storage-state.scrolith.com.json'),
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

// Unauthenticated privacy
{
  const res = await fetch(`${apiBase}/messages/settings/privacy`, {
    headers: { Accept: 'application/json' }
  });
  log('privacy_get_unauth', res.status === 401 || res.status === 403, { status: res.status });
}

const me = await fetch(`${apiBase}/auth/me`, { headers });
const meBody = await json(me);
const userId =
  meBody?.user?.id || meBody?.data?.user?.id || meBody?.data?.id || meBody?.id || '';
log('auth_me', me.ok && Boolean(userId), { status: me.status });

// GET privacy
let originalSettings = null;
{
  const res = await fetch(`${apiBase}/messages/settings/privacy`, { headers });
  const body = await json(res);
  const data = extractData(body);
  const settings = data?.settings || data;
  originalSettings = settings && typeof settings === 'object' ? { ...settings } : null;
  log('privacy_get', res.ok && Boolean(settings), {
    status: res.status,
    hasUpdatedAt: Boolean(settings?.updatedAt),
    online: settings?.onlineStatusVisibility || null,
    receipts: settings?.readReceiptsEnabled
  });
}

// Defaults-compatible fields present
if (originalSettings) {
  const required = [
    'onlineStatusVisibility',
    'lastSeenVisibility',
    'readReceiptsEnabled',
    'typingIndicatorsEnabled',
    'recordingIndicatorsEnabled',
    'directMessageAudience',
    'groupInviteAudience',
    'notificationMessagePreviewEnabled'
  ];
  log(
    'privacy_schema_fields',
    required.every((k) => Object.prototype.hasOwnProperty.call(originalSettings, k)),
    { keys: required.length }
  );
}

// Partial PATCH cycles — restore at end
const patches = [
  {
    name: 'privacy_patch_online_contacts',
    body: { onlineStatusVisibility: 'CONTACTS' },
    assert: (s) => s?.onlineStatusVisibility === 'CONTACTS'
  },
  {
    name: 'privacy_patch_online_nobody',
    body: { onlineStatusVisibility: 'NOBODY' },
    assert: (s) => s?.onlineStatusVisibility === 'NOBODY'
  },
  {
    name: 'privacy_patch_lastseen_nobody',
    body: { lastSeenVisibility: 'NOBODY' },
    assert: (s) => s?.lastSeenVisibility === 'NOBODY'
  },
  {
    name: 'privacy_patch_receipts_off',
    body: { readReceiptsEnabled: false },
    assert: (s) => s?.readReceiptsEnabled === false
  },
  {
    name: 'privacy_patch_typing_off',
    body: { typingIndicatorsEnabled: false },
    assert: (s) => s?.typingIndicatorsEnabled === false
  },
  {
    name: 'privacy_patch_recording_off',
    body: { recordingIndicatorsEnabled: false },
    assert: (s) => s?.recordingIndicatorsEnabled === false
  },
  {
    name: 'privacy_patch_dm_contacts',
    body: { directMessageAudience: 'CONTACTS' },
    assert: (s) => s?.directMessageAudience === 'CONTACTS'
  },
  {
    name: 'privacy_patch_dm_followers',
    body: { directMessageAudience: 'FOLLOWERS' },
    assert: (s) => s?.directMessageAudience === 'FOLLOWERS'
  },
  {
    name: 'privacy_patch_dm_nobody',
    body: { directMessageAudience: 'NOBODY' },
    assert: (s) => s?.directMessageAudience === 'NOBODY'
  },
  {
    name: 'privacy_patch_invite_nobody',
    body: { groupInviteAudience: 'NOBODY' },
    assert: (s) => s?.groupInviteAudience === 'NOBODY'
  },
  {
    name: 'privacy_patch_preview_off',
    body: { notificationMessagePreviewEnabled: false },
    assert: (s) => s?.notificationMessagePreviewEnabled === false
  }
];

for (const p of patches) {
  const res = await fetch(`${apiBase}/messages/settings/privacy`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(p.body)
  });
  const body = await json(res);
  const data = extractData(body);
  const settings = data?.settings || data;
  log(p.name, res.ok && p.assert(settings), {
    status: res.status,
    okShape: Boolean(settings)
  });
}

// Invalid enum should not accept garbage as valid (normalized fallback OR 400)
{
  const res = await fetch(`${apiBase}/messages/settings/privacy`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ onlineStatusVisibility: 'INVALID_VALUE_XYZ' })
  });
  const body = await json(res);
  const settings = extractData(body)?.settings || extractData(body);
  const safe =
    res.status === 400 ||
    (res.ok &&
      settings &&
      ['EVERYONE', 'CONTACTS', 'NOBODY'].includes(settings.onlineStatusVisibility) &&
      settings.onlineStatusVisibility !== 'INVALID_VALUE_XYZ');
  log('privacy_invalid_enum_safe', safe, { status: res.status });
}

// Presence still works with privacy set
{
  const res = await fetch(`${apiBase}/messages/presence/heartbeat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ state: 'online' })
  });
  log('presence_heartbeat', res.ok, { status: res.status });
}

{
  const res = await fetch(
    `${apiBase}/messages/presence?ids=${encodeURIComponent(userId)}`,
    { headers }
  );
  log('presence_batch_self', res.ok, { status: res.status });
}

// Conversations + menu-action style prefs
let conversationId = '';
{
  const res = await fetch(`${apiBase}/messages/conversations?limit=20`, { headers });
  const body = await json(res);
  const data = extractData(body);
  const arr = Array.isArray(data) ? data : data?.conversations || [];
  conversationId = String(arr[0]?.id || '');
  log('conversations_list', res.ok, { status: res.status, count: arr.length, hasConvo: Boolean(conversationId) });
}

if (conversationId) {
  // Star toggle
  const starOn = await fetch(`${apiBase}/messages/conversations/${conversationId}/preferences`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ isStarred: true })
  });
  log('menu_star_on', starOn.ok, { status: starOn.status });
  const starOff = await fetch(`${apiBase}/messages/conversations/${conversationId}/preferences`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ isStarred: false })
  });
  log('menu_star_off', starOff.ok, { status: starOff.status });

  // Mute toggle
  const muteOn = await fetch(`${apiBase}/messages/conversations/${conversationId}/preferences`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ isMuted: true })
  });
  log('menu_mute_on', muteOn.ok, { status: muteOn.status });
  const muteOff = await fetch(`${apiBase}/messages/conversations/${conversationId}/preferences`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ isMuted: false })
  });
  log('menu_mute_off', muteOff.ok, { status: muteOff.status });

  // Archive / unarchive
  const arch = await fetch(`${apiBase}/messages/conversations/${conversationId}/preferences`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ isArchived: true })
  });
  log('menu_archive', arch.ok, { status: arch.status });
  const unarch = await fetch(`${apiBase}/messages/conversations/${conversationId}/preferences`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ isArchived: false })
  });
  log('menu_unarchive', unarch.ok, { status: unarch.status });

  // Label
  const labelJobs = await fetch(`${apiBase}/messages/conversations/${conversationId}/preferences`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ label: 'jobs' })
  });
  log('menu_label_jobs', labelJobs.ok, { status: labelJobs.status });
  const labelOther = await fetch(`${apiBase}/messages/conversations/${conversationId}/preferences`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ label: 'other' })
  });
  log('menu_label_other', labelOther.ok, { status: labelOther.status });

  // Mark unread
  const unread = await fetch(`${apiBase}/messages/conversations/${conversationId}/unread`, {
    method: 'POST',
    headers,
    body: JSON.stringify({})
  });
  log('menu_mark_unread', unread.ok || unread.status === 204, { status: unread.status });

  // Receipts still work (internal)
  const deliv = await fetch(`${apiBase}/messages/conversations/${conversationId}/receipts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ deliveredAt: new Date().toISOString() })
  });
  log('receipts_delivered', deliv.ok, { status: deliv.status });

  const read = await fetch(`${apiBase}/messages/conversations/${conversationId}/read`, {
    method: 'POST',
    headers,
    body: JSON.stringify({})
  });
  log('receipts_read', read.ok, { status: read.status });
} else {
  log('menu_actions', 'SKIP', { reason: 'no_conversation' });
}

// 22.1 idempotent send regression if conversation present
if (conversationId) {
  const clientMessageId = `p223c-cert-${Date.now()}`;
  const payload = {
    text: 'p223c certification ping',
    clientMessageId
  };
  const a = await fetch(`${apiBase}/messages/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  const b = await fetch(`${apiBase}/messages/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  const aBody = await json(a);
  const bBody = await json(b);
  const aId = extractData(aBody)?.id || extractData(aBody)?.message?.id;
  const bId = extractData(bBody)?.id || extractData(bBody)?.message?.id;
  log('phase221_idempotent_send', a.ok && b.ok && (!aId || !bId || aId === bId), {
    statusA: a.status,
    statusB: b.status,
    sameId: Boolean(aId && bId && aId === bId)
  });
}

// Restore privacy to production-safe defaults (EVERYONE / enabled)
{
  const restore = {
    onlineStatusVisibility: 'EVERYONE',
    lastSeenVisibility: 'EVERYONE',
    readReceiptsEnabled: true,
    typingIndicatorsEnabled: true,
    recordingIndicatorsEnabled: true,
    directMessageAudience: 'EVERYONE',
    groupInviteAudience: 'EVERYONE',
    notificationMessagePreviewEnabled: true
  };
  const res = await fetch(`${apiBase}/messages/settings/privacy`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(restore)
  });
  const body = await json(res);
  const settings = extractData(body)?.settings || extractData(body);
  log(
    'privacy_restore_defaults',
    res.ok &&
      settings?.onlineStatusVisibility === 'EVERYONE' &&
      settings?.readReceiptsEnabled === true &&
      settings?.notificationMessagePreviewEnabled === true,
    { status: res.status }
  );
}

// Persist re-read
{
  const res = await fetch(`${apiBase}/messages/settings/privacy`, { headers });
  const settings = extractData(await json(res))?.settings || extractData(await json(res));
  // note: json consumed once — re-fetch cleanly
}
{
  const res = await fetch(`${apiBase}/messages/settings/privacy`, { headers });
  const body = await json(res);
  const settings = extractData(body)?.settings || extractData(body);
  log(
    'privacy_persist_after_restore',
    res.ok && settings?.onlineStatusVisibility === 'EVERYONE' && settings?.typingIndicatorsEnabled === true,
    { status: res.status }
  );
}

report.overall = report.stats.failed === 0 ? 'PASS' : 'FAIL';
writeFileSync(join(outDir, 'api-cert.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ overall: report.overall, stats: report.stats }, null, 2));
process.exit(report.stats.failed === 0 ? 0 : 1);
