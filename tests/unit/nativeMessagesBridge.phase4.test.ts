import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNativeMessagesEnvelope } from '../../src/mobile/nativeBridge';

test('projects direct and group conversations into a bounded native envelope', () => {
  const envelope = buildNativeMessagesEnvelope([
    {
      id: 'direct-1',
      type: 'direct',
      participants: [
        { id: 'self', name: 'Self' },
        { id: 'peer', name: 'Ada Lovelace', avatar: 'https://avatar.example.test/ada.png', isOnline: true }
      ],
      lastMessage: 'Hello',
      lastMessageAt: '2026-09-06T00:00:00.000Z',
      unreadCount: 2,
      lastMessagePreviewKind: 'text'
    },
    {
      id: 'group-1',
      type: 'group',
      title: 'Product team',
      category: 'community',
      participants: [{ id: 'self', name: 'Self' }],
      last_message: 'A file arrived',
      unread_count: 1,
      last_message_preview_kind: 'document'
    }
  ], 'self', 'request-1', 4);

  assert.equal(envelope.bridgeVersion, '2');
  assert.equal(envelope.kind, 'snapshot');
  assert.equal(envelope.requestId, 'request-1');
  assert.equal(envelope.revision, 4);
  assert.equal(envelope.items.length, 2);
  assert.equal(envelope.unreadCount, 3);
  assert.equal(envelope.items[0].title, 'Ada Lovelace');
  assert.equal(envelope.items[0].type, 'direct');
  assert.equal((envelope.items[0].preview as any).kind, 'text');
  assert.equal(envelope.items[1].type, 'community');
  assert.equal((envelope.items[1].preview as any).kind, 'file');
  assert.equal('avatarPath' in envelope.items[0], false);
});

test('limits native rows and never forwards external avatar URLs', () => {
  const conversations = Array.from({ length: 101 }, (_, index) => ({
    id: `conversation-${index}`,
    type: 'direct',
    participants: [{ id: 'peer', name: `Peer ${index}`, avatar: 'https://external.invalid/photo.png' }]
  }));
  const envelope = buildNativeMessagesEnvelope(conversations, 'self');

  assert.equal(envelope.items.length, 100);
  assert.equal(envelope.hasMore, true);
  assert.equal(envelope.items.some((item) => 'avatarPath' in item), false);
});
