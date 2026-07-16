import test from 'node:test';
import assert from 'node:assert/strict';
import type { Message } from '../../src/types';
import {
  applyLocalReactionToggle,
  buildClientSendId,
  canDeleteForMe,
  canEditOrUnsendMessage,
  getMyReaction,
  getPendingAttachmentsForConversation,
  getReactionCounts,
  insertSuggestionIntoDraft,
  isAllowedAttachmentSize,
  isFailedOutgoingMessage,
  isOptimisticMessageId,
  markMessageDeletedEveryone,
  mergeEditResponseIntoMessage,
  pendingToAttachmentIds,
  QUICK_REACTIONS,
  setPendingAttachmentsForConversation
} from '../../src/services/messagingComposer';

const message = (overrides: Partial<Message> & { id: string }): Message =>
  ({
    text: 'hello',
    timestamp: '2026-07-14T12:00:00.000Z',
    is_read: false,
    ...overrides
  }) as Message;

test('composer toolbar constants expose reaction set', () => {
  assert.ok(QUICK_REACTIONS.length >= 4);
});

test('canEditOrUnsendMessage allows owner and admin only', () => {
  const mine = message({ id: 'm1', senderId: 'u1', sender_id: 'u1' });
  assert.equal(canEditOrUnsendMessage(mine, 'u1', 'user'), true);
  assert.equal(canEditOrUnsendMessage(mine, 'u2', 'user'), false);
  assert.equal(canEditOrUnsendMessage(mine, 'u2', 'admin'), true);
  assert.equal(
    canEditOrUnsendMessage(message({ id: 'm2', senderId: 'u1', isDeleted: true }), 'u1', 'user'),
    false
  );
});

test('canDeleteForMe is false for already deleted rows', () => {
  assert.equal(canDeleteForMe(message({ id: 'm1' })), true);
  assert.equal(canDeleteForMe(message({ id: 'm2', is_deleted: true })), false);
});

test('attachment size guard rejects oversize files', () => {
  assert.equal(isAllowedAttachmentSize(1024), true);
  assert.equal(isAllowedAttachmentSize(60 * 1024 * 1024), false);
  assert.equal(isAllowedAttachmentSize(0), false);
});

test('pendingToAttachmentIds filters empty ids', () => {
  assert.deepEqual(
    pendingToAttachmentIds([
      { id: 'a', name: 'a', size: 1, type: 'document', fileId: 'a' },
      { id: '', name: 'b', size: 1, type: 'document' }
    ]),
    ['a']
  );
});

test('reaction toggle is idempotent for same emoji', () => {
  const base = message({ id: 'm1', reactions: [] });
  const added = applyLocalReactionToggle(base, 'u1', '👍');
  assert.equal(getMyReaction(added, 'u1'), '👍');
  assert.equal(getReactionCounts(added)['👍'], 1);
  const removed = applyLocalReactionToggle(added, 'u1', '👍');
  assert.equal(getMyReaction(removed, 'u1'), null);
  assert.equal(getReactionCounts(removed)['👍'] || 0, 0);
});

test('suggest reply insert can replace or append without empty overwrite', () => {
  assert.equal(insertSuggestionIntoDraft('draft', ''), 'draft');
  assert.equal(insertSuggestionIntoDraft('draft', 'Hi there', 'replace'), 'Hi there');
  assert.equal(insertSuggestionIntoDraft('draft', 'more', 'append'), 'draft\nmore');
});

test('failed and optimistic message detection', () => {
  assert.equal(isOptimisticMessageId('optimistic-c1-1'), true);
  assert.equal(isOptimisticMessageId('server-1'), false);
  assert.equal(
    isFailedOutgoingMessage(message({ id: 'm1', metadata: { sendFailed: true } })),
    true
  );
});

test('markMessageDeletedEveryone tombs content', () => {
  const deleted = markMessageDeletedEveryone(
    message({ id: 'm1', text: 'secret', attachments: [{ id: 'f1' } as any] })
  );
  assert.equal(deleted.isDeleted, true);
  assert.equal(deleted.text, '[Message deleted]');
  assert.deepEqual(deleted.attachments, []);
});

test('pending attachments stay isolated per conversation', () => {
  let map: Record<string, any[]> = {};
  map = setPendingAttachmentsForConversation(map, 'c1', [
    { id: 'a1', name: 'a.pdf', size: 10, type: 'document' }
  ]);
  map = setPendingAttachmentsForConversation(map, 'c2', [
    { id: 'b1', name: 'b.png', size: 20, type: 'image' }
  ]);
  assert.equal(getPendingAttachmentsForConversation(map, 'c1').length, 1);
  assert.equal(getPendingAttachmentsForConversation(map, 'c1')[0].id, 'a1');
  assert.equal(getPendingAttachmentsForConversation(map, 'c2')[0].id, 'b1');
  map = setPendingAttachmentsForConversation(map, 'c1', []);
  assert.equal(getPendingAttachmentsForConversation(map, 'c1').length, 0);
  assert.equal(getPendingAttachmentsForConversation(map, 'c2').length, 1);
});

test('client send id is deterministic prefix per conversation', () => {
  const id = buildClientSendId('conv-9', 123);
  assert.equal(id, 'optimistic-conv-9-123');
  assert.equal(isOptimisticMessageId(id), true);
});

test('mergeEditResponseIntoMessage preserves original id when API returns messageId only', () => {
  const previous = message({ id: 'server-msg-1', text: 'old', senderId: 'u1' });
  const merged = mergeEditResponseIntoMessage(previous, {
    messageId: 'server-msg-1',
    text: 'new text',
    editedAt: '2026-07-14T13:00:00.000Z'
  });
  assert.equal(merged.id, 'server-msg-1');
  assert.equal(merged.text, 'new text');
  assert.equal(merged.editedAt, '2026-07-14T13:00:00.000Z');
  assert.equal(merged.senderId, 'u1');
});

test('outgoing failed metadata supports retry reconstruction', () => {
  const failed = message({
    id: 'optimistic-c1-1',
    text: 'hello',
    metadata: {
      sendFailed: true,
      clientSendId: 'optimistic-c1-1',
      failedText: 'hello',
      failedAttachmentIds: ['file-1'],
      failedReplyToMessageId: 'm-prev'
    }
  });
  assert.equal(isFailedOutgoingMessage(failed), true);
  assert.equal(isOptimisticMessageId(failed.id), true);
  assert.deepEqual((failed.metadata as any).failedAttachmentIds, ['file-1']);
});
