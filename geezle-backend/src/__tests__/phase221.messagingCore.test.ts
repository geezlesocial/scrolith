/**
 * Phase 22.1 — pure unit tests for messaging core hardening helpers.
 * Phase 29.6 — jest-compatible (was node:test only; still pure unit).
 */
import { parseClientMessageId } from '../services/messaging/clientMessageId';
import { filterReceiversForMessagePush } from '../services/messaging/notificationPolicy';

describe('Phase 22.1 messaging core', () => {
  test('parseClientMessageId accepts body and header aliases', () => {
    expect(parseClientMessageId({ clientMessageId: 'abc-1' })).toBe('abc-1');
    expect(parseClientMessageId({ client_send_id: 'abc-2' })).toBe('abc-2');
    expect(parseClientMessageId({}, { 'x-client-message-id': 'hdr-1' })).toBe('hdr-1');
    expect(parseClientMessageId({})).toBeNull();
  });

  test('parseClientMessageId rejects control characters and truncates long ids', () => {
    expect(parseClientMessageId({ clientMessageId: 'bad\nid' })).toBeNull();
    const long = 'x'.repeat(200);
    const parsed = parseClientMessageId({ clientMessageId: long });
    expect(parsed).toBeTruthy();
    expect(parsed!.length).toBe(128);
  });

  test('mute filter removes muted receivers and never notifies sender', () => {
    const result = filterReceiversForMessagePush({
      receiverIds: ['a', 'b', 'sender', 'c'],
      mutedUserIds: ['b'],
      senderId: 'sender'
    });
    expect(result.sort()).toEqual(['a', 'c']);
  });

  test('mute filter keeps unmuted only (mention bypass off in 22.1)', () => {
    const result = filterReceiversForMessagePush({
      receiverIds: ['a', 'b'],
      mutedUserIds: ['a', 'b'],
      senderId: 's',
      allowMentionBypass: false,
      mentionedUserIds: ['a']
    });
    expect(result).toEqual([]);
  });

  test('mute filter can allow mention bypass when enabled (forward-compat)', () => {
    const result = filterReceiversForMessagePush({
      receiverIds: ['a', 'b'],
      mutedUserIds: ['a', 'b'],
      senderId: 's',
      allowMentionBypass: true,
      mentionedUserIds: ['a']
    });
    expect(result).toEqual(['a']);
  });
});
