import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeComposerTextareaHeight,
  isComposerOverlayPositioning,
  MESSAGES_COMPOSER_MAX_HEIGHT_DESKTOP,
  MESSAGES_COMPOSER_MIN_HEIGHT_DESKTOP,
  MESSAGES_COMPOSER_REGION_CLASS,
  MESSAGES_HISTORY_VIEWPORT_CLASS,
  SCROLITHA_PROMPT_CHIP_CONTAINER_CLASS
} from '../../src/messages/messagesWorkspaceLayout';
import {
  isMessagingDockExcludedPath,
  shouldShowMessagingDock
} from '../../src/services/messagingSurfaces';

test('composer starts compact on desktop', () => {
  const compact = computeComposerTextareaHeight({ scrollHeight: 40, isMobile: false });
  assert.equal(compact.height, MESSAGES_COMPOSER_MIN_HEIGHT_DESKTOP);
  assert.equal(compact.overflowY, 'hidden');
});

test('composer grows up to desktop max then scrolls internally', () => {
  const mid = computeComposerTextareaHeight({ scrollHeight: 100, isMobile: false });
  assert.equal(mid.height, 100);
  assert.equal(mid.overflowY, 'hidden');

  const tall = computeComposerTextareaHeight({ scrollHeight: 400, isMobile: false });
  assert.equal(tall.height, MESSAGES_COMPOSER_MAX_HEIGHT_DESKTOP);
  assert.equal(tall.overflowY, 'auto');
});

test('history viewport contract includes flex-1 and min-h-0', () => {
  assert.match(MESSAGES_HISTORY_VIEWPORT_CLASS, /flex-1/);
  assert.match(MESSAGES_HISTORY_VIEWPORT_CLASS, /min-h-0/);
  assert.match(MESSAGES_HISTORY_VIEWPORT_CLASS, /overflow-y-auto/);
});

test('composer region is shrink-0 not sticky/fixed', () => {
  assert.match(MESSAGES_COMPOSER_REGION_CLASS, /shrink-0/);
  assert.equal(isComposerOverlayPositioning(MESSAGES_COMPOSER_REGION_CLASS), false);
  assert.equal(isComposerOverlayPositioning('sticky bottom-0'), true);
  assert.equal(isComposerOverlayPositioning('fixed inset-x-0'), true);
});

test('Scrolitha chips use nowrap horizontal scroll class contract', () => {
  assert.match(SCROLITHA_PROMPT_CHIP_CONTAINER_CLASS, /flex-nowrap/);
  assert.match(SCROLITHA_PROMPT_CHIP_CONTAINER_CLASS, /overflow-x-auto/);
  assert.doesNotMatch(SCROLITHA_PROMPT_CHIP_CONTAINER_CLASS, /flex-wrap/);
});

test('dock exclusion remains on messages routes after viewport patch', () => {
  assert.equal(shouldShowMessagingDock('/messages'), false);
  assert.equal(shouldShowMessagingDock('/messages/abc'), false);
  assert.equal(isMessagingDockExcludedPath('/messages?tab=1'), true);
  assert.equal(shouldShowMessagingDock('/home'), true);
});
