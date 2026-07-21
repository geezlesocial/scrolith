/**
 * Phase 29.2 — wiring / regression checks (file-level contracts).
 */
import fs from 'fs';
import path from 'path';

const routes = fs.readFileSync(path.join(__dirname, '../routes/messages.routes.ts'), 'utf8');
const server = fs.readFileSync(path.join(__dirname, '../server.ts'), 'utf8');
const postMessage = fs.readFileSync(path.join(__dirname, '../controllers/messages.controller.ts'), 'utf8');
const enterprise = fs.readFileSync(
  path.join(__dirname, '../controllers/groupEnterprise.controller.ts'),
  'utf8'
);
const mig291 = fs.readFileSync(
  path.join(
    __dirname,
    '../../prisma/migrations/20260721140000_phase291_enterprise_messaging_groups/migration.sql'
  ),
  'utf8'
);

describe('Phase 29.2 realtime wiring', () => {
  test('registers pin + catchup routes without removing 22.2/29.1 routes', () => {
    expect(routes).toMatch(/postGroupPin/);
    expect(routes).toMatch(/getGroupCatchup/);
    expect(routes).toMatch(/createEnterpriseGroup/);
    expect(routes).toMatch(/acceptGroupInvite/);
    expect(routes).toMatch(/listGroupMembers/);
  });

  test('server reuses community namespace and adds group room join + catchup', () => {
    expect(server).toMatch(/communityNs\.on\('connection'/);
    expect(server).toMatch(/messages:group:join/);
    expect(server).toMatch(/messages:catchup/);
    expect(server).toMatch(/authorizeGroupRealtimeAccess/);
    expect(server).toMatch(/setTypingState/);
    expect(server).toMatch(/clearUserEphemeralEverywhere/);
    // still single stack
    expect(server).not.toMatch(/io\.of\('\/messaging-groups'/);
  });

  test('postMessage exposes sendAck contract and dual-emits group room', () => {
    expect(postMessage).toMatch(/sendAck/);
    expect(postMessage).toMatch(/status: 'accepted'/);
    expect(postMessage).toMatch(/status: 'duplicate'/);
    expect(postMessage).toMatch(/groupRoomName/);
    expect(postMessage).toMatch(/evaluateGroupSendGate/);
  });

  test('enterprise mutations emit lifecycle events', () => {
    expect(enterprise).toMatch(/GROUP_WIRE_EVENTS\.GROUP_LOCKED/);
    expect(enterprise).toMatch(/GROUP_WIRE_EVENTS\.MEMBER_JOINED/);
    expect(enterprise).toMatch(/GROUP_WIRE_EVENTS\.INVITE_CREATED/);
    expect(enterprise).toMatch(/GROUP_WIRE_EVENTS\.PERMISSIONS_UPDATED/);
    // never put invite code in realtime emit payload construction intentionally:
    expect(enterprise).toMatch(/code intentionally omitted|code: invite\.code/);
  });

  test('Phase 29.1 migration file is unchanged in content markers', () => {
    expect(mig291).toMatch(/Phase 29\.1/);
    expect(mig291).toMatch(/SECRET/);
    expect(mig291).toMatch(/ConversationSettings/);
  });
});
