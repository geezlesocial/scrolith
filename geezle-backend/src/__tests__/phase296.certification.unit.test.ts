/**
 * Phase 29.6 — Certification harness (contract + security + simulated load).
 * No production I/O. Validates program integrity for production readiness gate.
 */
import fs from 'fs';
import path from 'path';
import {
  canSendWithMode,
  computeEffectivePermissions,
  defaultPermissionsForRole,
  modeAllowsSend
} from '../services/messaging/permissionEngine';
import {
  canExposeGroupInDiscovery,
  sanitizeGroupPayload,
  redactForLogs,
  MAX_GROUP_TEXT_LEN
} from '../services/messaging/groupSecurity.service';
import {
  assessMessageSendAbuse,
  clearAbuseBucketsForTests,
  DEFAULT_ABUSE_CONFIG
} from '../services/messaging/groupAbuseProtection.service';
import {
  GROUP_EVENT_ALIASES,
  GROUP_WIRE_EVENTS,
  groupRoomName,
  mapGateToAckStatus
} from '../services/messaging/groupRealtimeEvents';
import {
  setTypingState,
  snapshotEphemeral,
  clearEphemeralForTests,
  checkTypingRate
} from '../services/messaging/groupEphemeralIndicators';
import {
  encodeCatchupCursor,
  decodeCatchupCursor
} from '../services/messaging/groupCatchup';
import { resolveJoinPolicyForVisibility, normalizeGroupVisibility } from '../services/messaging/groupVisibility';

const root = path.join(__dirname, '../..');
const monorepo = path.join(root, '..');

const exists = (rel: string) => fs.existsSync(path.join(root, rel));
const existsMono = (rel: string) => fs.existsSync(path.join(monorepo, rel));
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

describe('Phase 29.6 — artifact presence (29.0–29.5)', () => {
  test('backend foundation modules exist', () => {
    [
      'src/services/messaging/permissionEngine.ts',
      'src/services/messaging/groupSendGate.ts',
      'src/services/messaging/groupRealtime.ts',
      'src/services/messaging/groupSearch.service.ts',
      'src/services/messaging/groupDiscovery.service.ts',
      'src/services/messaging/groupAnalytics.service.ts',
      'src/services/messaging/groupAbuseProtection.service.ts',
      'src/controllers/groupEnterprise.controller.ts',
      'src/controllers/admin.messagingGroups.controller.ts',
      'src/controllers/groupIntelligence.controller.ts',
      'prisma/migrations/20260721140000_phase291_enterprise_messaging_groups/migration.sql',
      'prisma/migrations/20260721160000_phase295_messaging_groups_search_indexes/migration.sql'
    ].forEach((p) => expect(exists(p)).toBe(true));
  });

  test('frontend group UX artifacts exist', () => {
    expect(existsMono('geezle/src/components/messaging/GroupCreateWizard.tsx')).toBe(true);
    expect(existsMono('geezle/src/components/messaging/GroupManagePanel.tsx')).toBe(true);
    expect(existsMono('geezle/src/dashboard/admin/MessagingGroupsAdmin.tsx')).toBe(true);
    expect(existsMono('geezle/src/utils/groupMessagingUx.ts')).toBe(true);
  });

  test('docs gates 29.0–29.5 present', () => {
    [
      'docs/PHASE29_0_COMPLETION_GATE.json',
      'docs/PHASE29_1_COMPLETION_GATE.json',
      'docs/PHASE29_2_COMPLETION_GATE.json',
      'docs/PHASE29_3_COMPLETION_GATE.json',
      'docs/PHASE29_4_COMPLETION_GATE.json',
      'docs/PHASE29_5_COMPLETION_GATE.json'
    ].forEach((p) => expect(existsMono(p)).toBe(true));
  });
});

describe('Phase 29.6 — migration safety', () => {
  test('29.1 and 29.5 migrations are additive only', () => {
    const m291 = read('prisma/migrations/20260721140000_phase291_enterprise_messaging_groups/migration.sql');
    const m295 = read('prisma/migrations/20260721160000_phase295_messaging_groups_search_indexes/migration.sql');
    expect(m291).toMatch(/SECRET/);
    expect(m291).not.toMatch(/DROP TABLE/i);
    expect(m291).not.toMatch(/DROP COLUMN/i);
    expect(m295).toMatch(/CREATE INDEX IF NOT EXISTS/);
    expect(m295).not.toMatch(/DROP TABLE/i);
    expect(m295).not.toMatch(/ALTER TABLE.*DROP/i);
  });
});

describe('Phase 29.6 — security certification matrix', () => {
  test('SECRET isolation rules', () => {
    expect(canExposeGroupInDiscovery('SECRET')).toBe(false);
    expect(canExposeGroupInDiscovery('PUBLIC')).toBe(true);
    expect(resolveJoinPolicyForVisibility('SECRET', 'OPEN')).toBe('INVITE_ONLY');
    expect(normalizeGroupVisibility('SECRET')).toBe('SECRET');
  });

  test('permission engine role matrix (DM-safe defaults)', () => {
    expect(defaultPermissionsForRole('OWNER').canBan).toBe(true);
    expect(defaultPermissionsForRole('MEMBER').canKick).toBe(false);
    expect(modeAllowsSend('LOCKED', 'OWNER')).toBe(false);
    expect(modeAllowsSend('ANNOUNCEMENT', 'MEMBER')).toBe(false);
    expect(canSendWithMode({ role: 'MEMBER', messagingMode: 'EVERYONE' }).allowed).toBe(true);
    const guest = computeEffectivePermissions({ role: 'MEMBER', profileKey: 'readOnly' });
    expect(guest.canSend).toBe(false);
  });

  test('payload validation and log redaction', () => {
    expect(sanitizeGroupPayload({ text: 'ok' }).ok).toBe(true);
    expect(sanitizeGroupPayload({ text: 'x'.repeat(MAX_GROUP_TEXT_LEN + 1) }).ok).toBe(false);
    const red = redactForLogs({ text: 'private', code: 'secret', path: '/x' });
    expect(red.text).toBeUndefined();
    expect(red.code).toBeUndefined();
    expect(red.path).toBe('/x');
  });

  test('routes do not log invite codes on realtime paths', () => {
    const enterprise = read('src/controllers/groupEnterprise.controller.ts');
    expect(enterprise).toMatch(/code intentionally omitted|INVITE_CREATED/);
    const search = read('src/services/messaging/groupSearch.service.ts');
    // user search truncates invite codes for admin hits
    expect(search).toMatch(/slice\(0, 4\)/);
  });
});

describe('Phase 29.6 — realtime / socket contracts', () => {
  test('wire events and aliases', () => {
    expect(GROUP_WIRE_EVENTS.MESSAGE_NEW).toBe('messages:new');
    expect(GROUP_WIRE_EVENTS.GROUP_LOCKED).toBe('messages:group_locked');
    expect(GROUP_EVENT_ALIASES['group.locked']).toBe(GROUP_WIRE_EVENTS.GROUP_LOCKED);
    expect(groupRoomName('abc')).toBe('messages:group:abc');
    expect(mapGateToAckStatus('GROUP_SLOW_MODE')).toBe('slow_mode');
  });

  test('multi-typer + catch-up cursor', () => {
    clearEphemeralForTests();
    setTypingState({ conversationId: 'c', userId: 'a', name: 'A', isTyping: true });
    setTypingState({ conversationId: 'c', userId: 'b', name: 'B', isTyping: true });
    expect(snapshotEphemeral('c').typing).toHaveLength(2);
    const cur = encodeCatchupCursor(new Date('2026-07-21T00:00:00.000Z'), 'm1');
    expect(decodeCatchupCursor(cur)?.id).toBe('m1');
  });

  test('single community namespace retained', () => {
    const server = read('src/server.ts');
    expect(server).toMatch(/io\.of\('\/community'\)/);
    expect(server).toMatch(/messages:group:join/);
    expect(server).not.toMatch(/io\.of\('\/messaging-groups'/);
  });
});

describe('Phase 29.6 — simulated load / stress (in-process)', () => {
  beforeEach(() => {
    clearAbuseBucketsForTests();
    clearEphemeralForTests();
  });

  test('permission evaluation throughput (5k iterations)', () => {
    const t0 = Date.now();
    for (let i = 0; i < 5000; i++) {
      canSendWithMode({
        role: i % 4 === 0 ? 'OWNER' : 'MEMBER',
        messagingMode: i % 10 === 0 ? 'ANNOUNCEMENT' : 'EVERYONE'
      });
    }
    const ms = Date.now() - t0;
    expect(ms).toBeLessThan(2000);
  });

  test('abuse flood under storm of 200 sends', () => {
    let flagged = 0;
    for (let i = 0; i < 200; i++) {
      const a = assessMessageSendAbuse(
        { userId: 'load-u', conversationId: 'load-c', text: `msg ${i}` },
        { ...DEFAULT_ABUSE_CONFIG, messageFloodPerMinute: 30 }
      );
      if (a.signals.includes('flood_messages')) flagged += 1;
    }
    expect(flagged).toBeGreaterThan(0);
  });

  test('typing storm rate-limits', () => {
    let limited = 0;
    for (let i = 0; i < 100; i++) {
      const r = checkTypingRate('storm-c', 'storm-u');
      if (!r.allowed) limited += 1;
    }
    expect(limited).toBeGreaterThan(0);
  });

  test('ephemeral multi-typer fan-in 50 concurrent typers', () => {
    for (let i = 0; i < 50; i++) {
      setTypingState({
        conversationId: 'big',
        userId: `u${i}`,
        name: `User${i}`,
        isTyping: true
      });
    }
    expect(snapshotEphemeral('big').typing.length).toBe(50);
  });
});

describe('Phase 29.6 — API route inventory regression', () => {
  test('messages routes register groups surface', () => {
    const r = read('src/routes/messages.routes.ts');
    [
      '/groups',
      '/groups/search',
      '/groups/discover',
      '/groups/:id/health',
      '/groups/:id/pins',
      '/groups/:id/catchup',
      '/groups/:id/lock'
    ].forEach((p) => expect(r.includes(p)).toBe(true));
    expect(r).toMatch(/searchMessages/);
    expect(r).toMatch(/createConversation|postMessage/);
  });

  test('admin messaging-groups routes registered', () => {
    const r = read('src/routes/admin/messaging-groups.routes.ts');
    expect(r).toMatch(/overview/);
    expect(r).toMatch(/analytics/);
    expect(r).toMatch(/search/);
    expect(r).toMatch(/actions/);
    expect(r).toMatch(/export/);
  });
});

describe('Phase 29.6 — multi-typer label contract (source inspection)', () => {
  test('FE groupMessagingUx defines multi-typer labels', () => {
    const p = path.join(monorepo, 'geezle/src/utils/groupMessagingUx.ts');
    expect(fs.existsSync(p)).toBe(true);
    const src = fs.readFileSync(p, 'utf8');
    expect(src).toMatch(/formatMultiTyperLabel/);
    expect(src).toMatch(/people are typing/);
    expect(src).toMatch(/resolveGroupComposerRestriction/);
  });
});
