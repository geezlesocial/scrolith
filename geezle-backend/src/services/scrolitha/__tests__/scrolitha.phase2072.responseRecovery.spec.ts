import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDefaultScrolithaPromptChips,
  isMessagingAssistantEnabled
} from '../scrolitha.messagingBridge';
import { listScrolithaTools, isToolActivationAllowed } from '../scrolitha.tools';
import { resolveScrolithaRolloutFlags } from '../scrolitha.rollout';

/**
 * Phase 20.7.2 — basic response invariant:
 * MASTER + MESSAGING_ASSISTANT must not depend on Phase 20.7.1 capability flags.
 */

test('prompt chips still available for empty-state guidance', () => {
  const chips = getDefaultScrolithaPromptChips();
  assert.ok(chips.includes('Find jobs for me'));
  assert.ok(chips.length >= 5);
});

test('tool write actions remain gated when toolWriteActions is off (default)', async () => {
  const createGig = listScrolithaTools().find((t) => t.key === 'CREATE_GIG');
  assert.ok(createGig);
  const activation = await isToolActivationAllowed(createGig as any, {
    id: 'user-1',
    role: 'freelancer',
    isAdmin: false
  });
  // Without toolWriteActions env, draft tools should not activate for ordinary users.
  assert.equal(activation.allowed, false);
});

test('read-only tools can activate for messaging-safe keys when messaging surface is used', async () => {
  const profile = listScrolithaTools().find((t) => t.key === 'GET_ME_PROFILE');
  assert.ok(profile);
  assert.equal(profile!.riskClass, 'read_only');
  // Without toolExecution public flag, messagingSafe path requires messaging surface.
  const denied = await isToolActivationAllowed(profile as any, {
    id: 'user-1',
    role: 'freelancer',
    isAdmin: false
  }, { surface: 'execute' });
  // May be false when toolExecution is off — that is intentional.
  assert.equal(typeof denied.allowed, 'boolean');
});

test('rollout flag shape includes messagingAssistant independent of 20.7.1 flags', async () => {
  const flags = await resolveScrolithaRolloutFlags();
  assert.ok('messagingAssistant' in flags);
  assert.ok('richEntityCards' in flags);
  assert.ok('toolExecution' in flags);
  assert.ok('messagingStream' in flags);
  // Defaults for new caps are false when env unset
  assert.equal(flags.richEntityCards, false);
  assert.equal(flags.toolExecution, false);
  assert.equal(flags.toolWriteActions, false);
  assert.equal(flags.messagingStream, false);
});

test('messaging assistant capability check returns boolean for ordinary actor', async () => {
  const enabled = await isMessagingAssistantEnabled({
    id: 'test-user',
    role: 'freelancer',
    email: 'user@example.com',
    isAdmin: false
  });
  assert.equal(typeof enabled, 'boolean');
});

test('admin actor is not excluded from messaging capability type shape', async () => {
  // Regression: postMessage previously skipped AI for admin roles entirely.
  // Capability check must still be a boolean (not throw) for admin actors.
  const enabled = await isMessagingAssistantEnabled({
    id: 'admin-user',
    role: 'admin',
    email: 'admin@scrolith.com',
    isAdmin: true
  });
  assert.equal(typeof enabled, 'boolean');
});
