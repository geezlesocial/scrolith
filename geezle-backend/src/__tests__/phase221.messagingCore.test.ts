/**
 * Phase 22.1 — pure unit tests for messaging core hardening helpers.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseClientMessageId } from '../services/messaging/clientMessageId';
import { filterReceiversForMessagePush } from '../services/messaging/notificationPolicy';

test('parseClientMessageId accepts body and header aliases', () => {
  assert.equal(parseClientMessageId({ clientMessageId: 'abc-1' }), 'abc-1');
  assert.equal(parseClientMessageId({ client_send_id: 'abc-2' }), 'abc-2');
  assert.equal(parseClientMessageId({}, { 'x-client-message-id': 'hdr-1' }), 'hdr-1');
  assert.equal(parseClientMessageId({}), null);
});

test('parseClientMessageId rejects control characters and truncates long ids', () => {
  assert.equal(parseClientMessageId({ clientMessageId: 'bad\nid' }), null);
  const long = 'x'.repeat(200);
  const parsed = parseClientMessageId({ clientMessageId: long });
  assert.ok(parsed);
  assert.equal(parsed!.length, 128);
});

test('mute filter removes muted receivers and never notifies sender', () => {
  const result = filterReceiversForMessagePush({
    receiverIds: ['a', 'b', 'sender', 'c'],
    mutedUserIds: ['b'],
    senderId: 'sender'
  });
  assert.deepEqual(result.sort(), ['a', 'c']);
});

test('mute filter keeps unmuted only (mention bypass off in 22.1)', () => {
  const result = filterReceiversForMessagePush({
    receiverIds: ['a', 'b'],
    mutedUserIds: ['a', 'b'],
    senderId: 's',
    allowMentionBypass: false,
    mentionedUserIds: ['a']
  });
  assert.deepEqual(result, []);
});

test('mute filter can allow mention bypass when enabled (forward-compat)', () => {
  const result = filterReceiversForMessagePush({
    receiverIds: ['a', 'b'],
    mutedUserIds: ['a', 'b'],
    senderId: 's',
    allowMentionBypass: true,
    mentionedUserIds: ['a']
  });
  assert.deepEqual(result, ['a']);
});
