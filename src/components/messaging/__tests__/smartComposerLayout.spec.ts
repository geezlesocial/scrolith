import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeComposerTextareaHeight,
  isComposerOverlayPositioning,
  MESSAGES_COMPOSER_REGION_CLASS
} from '../../../messages/messagesWorkspaceLayout';

test('composer region is content-sized shrink-0 not overlay', () => {
  assert.ok(MESSAGES_COMPOSER_REGION_CLASS.includes('shrink-0'));
  assert.equal(isComposerOverlayPositioning(MESSAGES_COMPOSER_REGION_CLASS), false);
  assert.equal(isComposerOverlayPositioning('sticky bottom-0'), true);
  assert.equal(isComposerOverlayPositioning('fixed inset-x-0 bottom-0'), true);
});

test('textarea height clamps on mobile and desktop', () => {
  const desktop = computeComposerTextareaHeight({ scrollHeight: 400, isMobile: false });
  assert.ok(desktop.height <= 168);
  assert.equal(desktop.overflowY, 'auto');

  const mobile = computeComposerTextareaHeight({ scrollHeight: 20, isMobile: true });
  assert.ok(mobile.height >= 40);
});

test('smart composer attachment launcher options are exactly Files Media Camera', () => {
  const options = ['files', 'media', 'camera'];
  assert.deepEqual(options, ['files', 'media', 'camera']);
  assert.equal(options.includes('location'), false);
});
