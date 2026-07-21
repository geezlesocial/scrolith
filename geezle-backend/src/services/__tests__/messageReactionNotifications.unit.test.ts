/**
 * Pure-ish unit checks for message reaction notification eligibility helpers.
 * Dispatch itself is integration-level (prisma/push); policy filter is the critical gate.
 */
import { filterReceiversForMessagePush } from '../messaging/notificationPolicy';

describe('message reaction push eligibility', () => {
  test('never notifies the reactor', () => {
    const ids = filterReceiversForMessagePush({
      receiverIds: ['author', 'reactor', 'other'],
      mutedUserIds: [],
      senderId: 'reactor'
    });
    expect(ids).toEqual(['author', 'other']);
    expect(ids).not.toContain('reactor');
  });

  test('respects mute for direct chats', () => {
    const ids = filterReceiversForMessagePush({
      receiverIds: ['author', 'muted-peer'],
      mutedUserIds: ['muted-peer'],
      senderId: 'reactor'
    });
    expect(ids).toEqual(['author']);
  });

  test('group MENTIONS level suppresses non-mentions', () => {
    const ids = filterReceiversForMessagePush({
      receiverIds: ['a', 'b'],
      mutedUserIds: [],
      senderId: 'reactor',
      isGroup: true,
      notificationLevelByUserId: { a: 'MENTIONS', b: 'ALL' },
      mentionedUserIds: [],
      allowMentionBypass: false
    });
    expect(ids).toEqual(['b']);
  });
});
