import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LONG_MESSAGE_PREVIEW_LENGTH,
  getVisibleMessageText
} from '../../src/components/messaging/ExpandableMessageText';

test('keeps messages at the expansion threshold complete', () => {
  const message = 'a'.repeat(LONG_MESSAGE_PREVIEW_LENGTH);
  assert.equal(getVisibleMessageText(message, false), message);
});

test('creates a bounded preview and restores the complete message', () => {
  const message = 'a'.repeat(LONG_MESSAGE_PREVIEW_LENGTH + 24);
  assert.equal(
    getVisibleMessageText(message, false),
    `${'a'.repeat(LONG_MESSAGE_PREVIEW_LENGTH)}...`
  );
  assert.equal(getVisibleMessageText(message, true), message);
});
