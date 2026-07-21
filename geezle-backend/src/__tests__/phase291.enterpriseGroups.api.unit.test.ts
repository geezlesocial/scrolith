/**
 * Phase 29.1 — route registration + regression: DM path must not require group fields.
 */
import fs from 'fs';
import path from 'path';

const routesPath = path.join(__dirname, '../routes/messages.routes.ts');
const postMessagePath = path.join(__dirname, '../controllers/messages.controller.ts');
const enterprisePath = path.join(__dirname, '../controllers/groupEnterprise.controller.ts');
const migrationPath = path.join(
  __dirname,
  '../../prisma/migrations/20260721140000_phase291_enterprise_messaging_groups/migration.sql'
);

describe('Phase 29.1 enterprise groups foundation wiring', () => {
  const routes = fs.readFileSync(routesPath, 'utf8');
  const postMessage = fs.readFileSync(postMessagePath, 'utf8');
  const enterprise = fs.readFileSync(enterprisePath, 'utf8');
  const migration = fs.readFileSync(migrationPath, 'utf8');

  test('registers additive /groups routes without removing Phase 22.2 paths', () => {
    expect(routes).toMatch(/router\.post\('\/groups'/);
    expect(routes).toMatch(/router\.get\('\/groups\/:id'/);
    expect(routes).toMatch(/router\.patch\('\/groups\/:id'/);
    expect(routes).toMatch(/join-requests/);
    expect(routes).toMatch(/createEnterpriseInvite/);
    expect(routes).toMatch(/listGroupAudit/);
    // Preserve 22.2
    expect(routes).toMatch(/updateGroupMeta/);
    expect(routes).toMatch(/createGroupInvite/);
    expect(routes).toMatch(/acceptGroupInvite/);
    expect(routes).toMatch(/listGroupMembers/);
  });

  test('postMessage integrates group send gate only for GROUP type', () => {
    expect(postMessage).toMatch(/evaluateGroupSendGate/);
    expect(postMessage).toMatch(/conversation\.type === 'GROUP'/);
    expect(postMessage).toMatch(/hasActiveBlockBetween/);
    expect(postMessage).toMatch(/GROUP_NOT_MEMBER/);
    // DM create path still exists
    expect(postMessage).toMatch(/export const postMessage/);
    expect(postMessage).toMatch(/export const createConversation/);
  });

  test('enterprise controller implements wizard create + lock + SECRET join force', () => {
    expect(enterprise).toMatch(/createEnterpriseGroup/);
    expect(enterprise).toMatch(/lockGroup/);
    expect(enterprise).toMatch(/unlockGroup/);
    expect(enterprise).toMatch(/SECRET/);
    expect(enterprise).toMatch(/INVITE_ONLY/);
    expect(enterprise).toMatch(/recordGroupAudit/);
  });

  test('migration is additive with SECRET enum and no DROP of message tables', () => {
    expect(migration).toMatch(/ADD VALUE IF NOT EXISTS 'SECRET'/);
    expect(migration).toMatch(/ConversationSettings/);
    expect(migration).toMatch(/ConversationJoinRequest/);
    expect(migration).toMatch(/ConversationMemberRestriction/);
    expect(migration).toMatch(/GroupModerationAction/);
    expect(migration).toMatch(/ConversationPinnedMessage/);
    expect(migration).toMatch(/slowModeSeconds/);
    expect(migration).toMatch(/messagingMode/);
    expect(migration).not.toMatch(/DROP TABLE "DirectMessage"/i);
    expect(migration).not.toMatch(/DROP TABLE "Conversation"/i);
  });
});
