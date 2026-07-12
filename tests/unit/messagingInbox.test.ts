import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getConversationMergeKey,
  getMessageMergeKey,
  mergeDirectConversations,
  messageMatchesConversation
} from '../../src/services/messagingMerge';
import type { Conversation } from '../../src/types';

const participant = (id: string, name: string) =>
  ({
    id,
    name,
    avatar: '',
    username: name.toLowerCase().replace(/\s+/g, ''),
    role: 'USER'
  }) as Conversation['participants'][number];

const conversation = (overrides: Partial<Conversation> & { id: string; participants: Conversation['participants'] }) =>
  ({
    type: 'direct',
    messages: [],
    lastMessage: '',
    lastMessageAt: '',
    last_message: '',
    last_message_at: '',
    unreadCount: 0,
    unread_count: 0,
    ...overrides
  }) as Conversation;

test('getConversationMergeKey uses participant pair only (no story split)', () => {
  const withStory = conversation({
    id: 'c-story',
    participants: [participant('user-1', 'A'), participant('user-2', 'B')],
    messages: [
      {
        id: 'm1',
        conversation_id: 'c-story',
        sender_id: 'user-2',
        receiver_id: 'user-1',
        text: 'Reacted to your story',
        timestamp: '2026-05-03T10:00:00.000Z',
        is_read: false,
        metadata: { storyId: 'story-99', storyThreadKey: 'story:story-99' }
      } as any
    ]
  });
  const withoutStory = conversation({
    id: 'c-plain',
    participants: [participant('user-2', 'B'), participant('user-1', 'A')],
    messages: [
      {
        id: 'm2',
        conversation_id: 'c-plain',
        sender_id: 'user-1',
        receiver_id: 'user-2',
        text: 'Hey',
        timestamp: '2026-05-03T11:00:00.000Z',
        is_read: true
      } as any
    ]
  });

  assert.equal(getConversationMergeKey(withStory), 'direct:user-1:user-2');
  assert.equal(getConversationMergeKey(withoutStory), 'direct:user-1:user-2');
  assert.equal(getConversationMergeKey(withStory), getConversationMergeKey(withoutStory));
});

test('mergeDirectConversations collapses duplicates and merges story reaction + comment messages', () => {
  const reaction = conversation({
    id: 'c-reaction',
    participants: [participant('user-1', 'A'), participant('user-2', 'B')],
    lastMessageAt: '2026-05-03T10:00:00.000Z',
    unreadCount: 1,
    messages: [
      {
        id: 'msg-reaction',
        conversation_id: 'c-reaction',
        sender_id: 'user-2',
        receiver_id: 'user-1',
        text: 'B reacted 👍 to your story',
        timestamp: '2026-05-03T10:00:00.000Z',
        is_read: false,
        metadata: { storyId: 'story-1', storyThreadKey: 'story:story-1', category: 'story_reaction' }
      } as any
    ]
  });
  const comment = conversation({
    id: 'c-comment',
    participants: [participant('user-1', 'A'), participant('user-2', 'B')],
    lastMessageAt: '2026-05-03T12:00:00.000Z',
    unreadCount: 1,
    messages: [
      {
        id: 'msg-comment',
        conversation_id: 'c-comment',
        sender_id: 'user-2',
        receiver_id: 'user-1',
        text: 'Looks great',
        timestamp: '2026-05-03T12:00:00.000Z',
        is_read: false,
        metadata: { storyId: 'story-1', storyThreadKey: 'story:story-1', category: 'story_comment' }
      } as any,
      {
        id: 'msg-comment',
        conversation_id: 'c-comment',
        sender_id: 'user-2',
        receiver_id: 'user-1',
        text: 'Looks great',
        timestamp: '2026-05-03T12:00:00.000Z',
        is_read: false,
        metadata: { storyId: 'story-1', storyThreadKey: 'story:story-1', category: 'story_comment' }
      } as any
    ]
  });
  const other = conversation({
    id: 'c-other',
    participants: [participant('user-1', 'A'), participant('user-3', 'C')],
    lastMessageAt: '2026-05-03T09:00:00.000Z',
    messages: [
      {
        id: 'msg-other',
        conversation_id: 'c-other',
        sender_id: 'user-3',
        receiver_id: 'user-1',
        text: 'Hi',
        timestamp: '2026-05-03T09:00:00.000Z',
        is_read: true
      } as any
    ]
  });

  const merged = mergeDirectConversations([reaction, comment, other]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, 'c-comment');
  assert.deepEqual(
    merged[0].messages.map((entry) => entry.id),
    ['msg-reaction', 'msg-comment']
  );
  assert.equal(merged[0].unreadCount, 2);
  assert.equal(merged[0].lastMessage, 'Looks great');
  assert.equal(merged[1].id, 'c-other');
});

test('messageMatchesConversation matches story-tagged messages to participant inbox row', () => {
  const convo = conversation({
    id: 'c-1',
    participants: [participant('user-1', 'A'), participant('user-2', 'B')]
  });
  const storyMessage = {
    id: 'm-story',
    conversationId: 'c-other-id',
    senderId: 'user-2',
    receiverId: 'user-1',
    text: 'Reacted to your story',
    metadata: { storyId: 'story-1', storyThreadKey: 'story:story-1' }
  };

  assert.equal(messageMatchesConversation(storyMessage, convo), true);
  assert.ok(getMessageMergeKey(storyMessage).startsWith(getConversationMergeKey(convo)));
});

test('messageMatchesConversation matches by conversation id', () => {
  const convo = conversation({
    id: 'c-exact',
    participants: [participant('user-1', 'A'), participant('user-2', 'B')]
  });
  assert.equal(
    messageMatchesConversation(
      { id: 'm1', conversationId: 'c-exact', senderId: 'user-2', receiverId: 'user-1', text: 'hi' },
      convo
    ),
    true
  );
});
