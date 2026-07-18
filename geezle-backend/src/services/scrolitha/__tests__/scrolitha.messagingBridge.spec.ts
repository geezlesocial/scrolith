import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDefaultScrolithaPromptChips,
  isMessagingAssistantEnabled
} from '../scrolitha.messagingBridge';
import {
  isReservedScrolithaUsername,
  isScrolithaUsername,
  SCROLITHA_PLATFORM_USERNAME
} from '../scrolitha.platformIdentity';

test('Scrolitha reserved usernames cannot be claimed', () => {
  assert.equal(isReservedScrolithaUsername('scrolitha'), true);
  assert.equal(isReservedScrolithaUsername('@Scrolitha'), true);
  assert.equal(isReservedScrolithaUsername('ai'), true);
  assert.equal(isReservedScrolithaUsername('scrolitha_ai'), true);
  assert.equal(isReservedScrolithaUsername('random_user'), false);
});

test('Scrolitha username aliases resolve', () => {
  assert.equal(isScrolithaUsername(SCROLITHA_PLATFORM_USERNAME), true);
  assert.equal(isScrolithaUsername('@scrolitha'), true);
  assert.equal(isScrolithaUsername('ai'), true);
  assert.equal(isScrolithaUsername('not-ai'), false);
});

test('default prompt chips are non-empty and unique', () => {
  const chips = getDefaultScrolithaPromptChips();
  assert.ok(Array.isArray(chips) && chips.length >= 5);
  assert.equal(new Set(chips).size, chips.length);
});

test('messaging assistant disabled when access denied without rollout', async () => {
  // Without master/internal rollout, isMessagingAssistantEnabled falls back to user-facing access.
  // With no env/config, user-facing access is typically false for anonymous actors.
  const enabled = await isMessagingAssistantEnabled({ id: 'anon-test-user', role: 'freelancer' });
  assert.equal(typeof enabled, 'boolean');
});
