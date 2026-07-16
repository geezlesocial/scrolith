import test from 'node:test';
import assert from 'node:assert/strict';
import type { Conversation, Message } from '../../src/types';
import {
  applyIncomingPreviewUpdate,
  clearConversationDraft,
  computeUnreadAfterIncoming,
  conversationMatchesInboxTab,
  filterConversationsForTab,
  formatMessagingBadgeCount,
  getConversationCategory,
  getConversationDisplayName,
  getConversationDraft,
  getMaxOpenChatWindows,
  hasCommunityMetadata,
  isSearchResponseCurrent,
  localSearchConversations,
  MESSAGING_PREVIEW_LIMIT,
  reconcileOptimisticMessage,
  setConversationDraft,
  setConversationUnreadLocal,
  sumConversationUnread,
  upsertOpenChatWindows
} from '../../src/services/messagingSurfaces';

const participant = (id: string, name: string) =>
  ({
    id,
    name,
    avatar: '',
    username: name.toLowerCase()
  }) as Conversation['participants'][number];

const conversation = (
  overrides: Partial<Conversation> & { id: string; participants: Conversation['participants'] }
) =>
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

const message = (overrides: Partial<Message> & { id: string }): Message =>
  ({
    text: '',
    timestamp: '2026-07-01T12:00:00.000Z',
    is_read: false,
    ...overrides
  }) as Message;

test('formatMessagingBadgeCount caps at 99+', () => {
  assert.equal(formatMessagingBadgeCount(0), '');
  assert.equal(formatMessagingBadgeCount(13), '13');
  assert.equal(formatMessagingBadgeCount(99), '99');
  assert.equal(formatMessagingBadgeCount(120), '99+');
});

test('sumConversationUnread aggregates per-conversation unread', () => {
  const list = [
    conversation({
      id: 'c1',
      participants: [participant('u1', 'A'), participant('u2', 'B')],
      unreadCount: 2
    }),
    conversation({
      id: 'c2',
      participants: [participant('u1', 'A'), participant('u3', 'C')],
      unreadCount: 5,
      unread_count: 5
    })
  ];
  assert.equal(sumConversationUnread(list), 7);
});

test('group classification uses type metadata only', () => {
  const group = conversation({
    id: 'g1',
    type: 'group',
    participants: [participant('u1', 'A'), participant('u2', 'B'), participant('u3', 'C')]
  });
  assert.equal(getConversationCategory(group), 'group');
  assert.equal(conversationMatchesInboxTab(group, 'groups'), true);
  assert.equal(conversationMatchesInboxTab(group, 'communities'), false);
});

test('community classification requires community metadata fields', () => {
  const bareGroup = conversation({
    id: 'g2',
    type: 'group',
    participants: [participant('u1', 'A'), participant('u2', 'B'), participant('u3', 'C')]
  });
  assert.equal(hasCommunityMetadata(bareGroup), false);

  const community = conversation({
    id: 'cm1',
    type: 'group',
    participants: [participant('u1', 'A'), participant('u2', 'B'), participant('u3', 'C')],
    communityId: 'community-9',
    metadata: { sourceType: 'COMMUNITY_GROUP' }
  } as any);

  assert.equal(hasCommunityMetadata(community), true);
  assert.equal(getConversationCategory(community), 'community');
  assert.equal(conversationMatchesInboxTab(community, 'communities'), true);
  assert.equal(conversationMatchesInboxTab(community, 'groups'), false);
});

test('filterConversationsForTab limits to 15 and filters unread', () => {
  const list: Conversation[] = [];
  for (let i = 0; i < 20; i += 1) {
    list.push(
      conversation({
        id: `c-${i}`,
        participants: [participant('u1', 'A'), participant(`u-${i}`, `User ${i}`)],
        unreadCount: i % 2 === 0 ? 1 : 0,
        lastMessageAt: `2026-07-01T${String(10 + (i % 10)).padStart(2, '0')}:00:00.000Z`
      })
    );
  }
  const unread = filterConversationsForTab(list, 'unread', MESSAGING_PREVIEW_LIMIT);
  assert.ok(unread.length <= 15);
  assert.ok(unread.every((entry) => Number(entry.unreadCount) > 0));

  const all = filterConversationsForTab(list, 'all', MESSAGING_PREVIEW_LIMIT);
  assert.equal(all.length, 15);
});

test('localSearchConversations matches participant names and previews', () => {
  const list = [
    conversation({
      id: 'c1',
      participants: [participant('u1', 'Ada'), participant('u2', 'Grace')],
      lastMessage: 'Shipping tomorrow'
    }),
    conversation({
      id: 'c2',
      participants: [participant('u1', 'Ada'), participant('u3', 'Linus')],
      lastMessage: 'Hello'
    })
  ];
  assert.equal(localSearchConversations(list, 'grace', 'u1').length, 1);
  assert.equal(localSearchConversations(list, 'shipping', 'u1').length, 1);
});

test('applyIncomingPreviewUpdate increments unread for inactive other messages only', () => {
  const base = [
    conversation({
      id: 'c1',
      participants: [participant('u1', 'Me'), participant('u2', 'Other')],
      unreadCount: 0,
      messages: []
    })
  ];

  const incoming = message({
    id: 'm1',
    conversationId: 'c1',
    conversation_id: 'c1',
    senderId: 'u2',
    sender_id: 'u2',
    text: 'Hello'
  });

  const inactive = applyIncomingPreviewUpdate(base, incoming, {
    currentUserId: 'u1',
    activeConversationIds: []
  });
  assert.equal(inactive[0].unreadCount, 1);
  assert.equal(inactive[0].lastMessage, 'Hello');

  const active = applyIncomingPreviewUpdate(base, incoming, {
    currentUserId: 'u1',
    activeConversationIds: ['c1']
  });
  assert.equal(active[0].unreadCount, 0);

  const self = applyIncomingPreviewUpdate(
    base,
    message({
      id: 'm2',
      conversationId: 'c1',
      senderId: 'u1',
      sender_id: 'u1',
      text: 'Mine'
    }),
    { currentUserId: 'u1', activeConversationIds: [] }
  );
  assert.equal(self[0].unreadCount, 0);
});

test('reconcileOptimisticMessage replaces temp row by id/text match', () => {
  const optimistic = message({
    id: 'optimistic-1',
    senderId: 'u1',
    sender_id: 'u1',
    text: 'Ping'
  });
  const server = message({
    id: 'server-9',
    senderId: 'u1',
    sender_id: 'u1',
    text: 'Ping'
  });
  const next = reconcileOptimisticMessage([optimistic], server);
  assert.equal(next.length, 1);
  assert.equal(next[0].id, 'server-9');
});

test('setConversationUnreadLocal updates only the target conversation', () => {
  const list = [
    conversation({
      id: 'c1',
      participants: [participant('u1', 'A'), participant('u2', 'B')],
      unreadCount: 3
    }),
    conversation({
      id: 'c2',
      participants: [participant('u1', 'A'), participant('u3', 'C')],
      unreadCount: 1
    })
  ];
  const next = setConversationUnreadLocal(list, 'c1', 0);
  assert.equal(next[0].unreadCount, 0);
  assert.equal(next[1].unreadCount, 1);
});

test('upsertOpenChatWindows enforces viewport window limits', () => {
  let windows: ReturnType<typeof upsertOpenChatWindows> = [];
  windows = upsertOpenChatWindows(windows, 'a', 1300);
  windows = upsertOpenChatWindows(windows, 'b', 1300);
  assert.equal(windows.length, 1);
  assert.equal(windows[0].conversationId, 'b');

  windows = upsertOpenChatWindows([], 'a', 1600);
  windows = upsertOpenChatWindows(windows, 'b', 1600);
  windows = upsertOpenChatWindows(windows, 'c', 1600);
  windows = upsertOpenChatWindows(windows, 'd', 1600);
  assert.equal(windows.length, 3);
  assert.ok(!windows.some((entry) => entry.conversationId === 'a'));
});

test('getMaxOpenChatWindows thresholds', () => {
  assert.equal(getMaxOpenChatWindows(800), 0);
  assert.equal(getMaxOpenChatWindows(1280), 1);
  assert.equal(getMaxOpenChatWindows(1600), 3);
});

test('getConversationDisplayName prefers other participant for direct chats', () => {
  const convo = conversation({
    id: 'c1',
    participants: [participant('u1', 'Me'), participant('u2', 'Other Person')]
  });
  assert.equal(getConversationDisplayName(convo, 'u1'), 'Other Person');
});

test('computeUnreadAfterIncoming never double-counts or goes negative', () => {
  assert.equal(
    computeUnreadAfterIncoming({
      previousUnread: 2,
      isFromOther: true,
      isActiveVisible: false,
      messageAlreadyPresent: false
    }),
    3
  );
  assert.equal(
    computeUnreadAfterIncoming({
      previousUnread: 2,
      isFromOther: true,
      isActiveVisible: false,
      messageAlreadyPresent: true
    }),
    2
  );
  assert.equal(
    computeUnreadAfterIncoming({
      previousUnread: 4,
      isFromOther: false,
      isActiveVisible: false,
      messageAlreadyPresent: false
    }),
    4
  );
  assert.equal(
    computeUnreadAfterIncoming({
      previousUnread: 4,
      isFromOther: true,
      isActiveVisible: true,
      messageAlreadyPresent: false
    }),
    0
  );
  assert.equal(
    computeUnreadAfterIncoming({
      previousUnread: -3,
      isFromOther: true,
      isActiveVisible: false,
      messageAlreadyPresent: false
    }),
    1
  );
});

test('re-applying the same message id does not inflate unread', () => {
  const base = [
    conversation({
      id: 'c1',
      participants: [participant('u1', 'Me'), participant('u2', 'Other')],
      unreadCount: 0,
      messages: []
    })
  ];
  const incoming = message({
    id: 'm-dup',
    conversationId: 'c1',
    conversation_id: 'c1',
    senderId: 'u2',
    sender_id: 'u2',
    text: 'Hello again'
  });
  const once = applyIncomingPreviewUpdate(base, incoming, {
    currentUserId: 'u1',
    activeConversationIds: []
  });
  assert.equal(once[0].unreadCount, 1);
  const twice = applyIncomingPreviewUpdate(once, incoming, {
    currentUserId: 'u1',
    activeConversationIds: []
  });
  assert.equal(twice[0].unreadCount, 1);
  assert.equal(twice[0].messages.filter((entry) => entry.id === 'm-dup').length, 1);
});

test('optimistic self-send then socket echo does not change unread', () => {
  const base = [
    conversation({
      id: 'c1',
      participants: [participant('u1', 'Me'), participant('u2', 'Other')],
      unreadCount: 2,
      messages: []
    })
  ];
  const optimistic = message({
    id: 'optimistic-c1-1',
    conversationId: 'c1',
    conversation_id: 'c1',
    senderId: 'u1',
    sender_id: 'u1',
    text: 'Outbound'
  });
  const afterOptimistic = applyIncomingPreviewUpdate(base, optimistic, {
    currentUserId: 'u1',
    activeConversationIds: []
  });
  assert.equal(afterOptimistic[0].unreadCount, 2);

  const server = message({
    id: 'server-out-1',
    conversationId: 'c1',
    conversation_id: 'c1',
    senderId: 'u1',
    sender_id: 'u1',
    text: 'Outbound'
  });
  const afterEcho = applyIncomingPreviewUpdate(afterOptimistic, server, {
    currentUserId: 'u1',
    activeConversationIds: []
  });
  assert.equal(afterEcho[0].unreadCount, 2);
  assert.equal(afterEcho[0].messages.length, 1);
  assert.equal(afterEcho[0].messages[0].id, 'server-out-1');
});

test('mark-read rollback restores prior unread via setConversationUnreadLocal', () => {
  const list = [
    conversation({
      id: 'c1',
      participants: [participant('u1', 'A'), participant('u2', 'B')],
      unreadCount: 5
    })
  ];
  const optimistic = setConversationUnreadLocal(list, 'c1', 0);
  assert.equal(optimistic[0].unreadCount, 0);
  const restored = setConversationUnreadLocal(optimistic, 'c1', 5);
  assert.equal(restored[0].unreadCount, 5);
});

test('formatMessagingBadgeCount 99+ does not alter numeric sumConversationUnread', () => {
  const list = [
    conversation({
      id: 'c1',
      participants: [participant('u1', 'A'), participant('u2', 'B')],
      unreadCount: 120
    })
  ];
  assert.equal(sumConversationUnread(list), 120);
  assert.equal(formatMessagingBadgeCount(120), '99+');
});

test('upsertOpenChatWindows never duplicates the same conversation id', () => {
  let windows = upsertOpenChatWindows([], 'same', 1600);
  windows = upsertOpenChatWindows(windows, 'same', 1600);
  windows = upsertOpenChatWindows(windows, 'same', 1600);
  assert.equal(windows.length, 1);
  assert.equal(windows[0].conversationId, 'same');
  assert.equal(windows[0].minimized, false);
});

test('minimized windows count toward simultaneous window limit', () => {
  let windows = upsertOpenChatWindows([], 'a', 1600, { minimize: true });
  windows = upsertOpenChatWindows(windows, 'b', 1600, { minimize: true });
  windows = upsertOpenChatWindows(windows, 'c', 1600, { minimize: true });
  windows = upsertOpenChatWindows(windows, 'd', 1600, { minimize: true });
  assert.equal(windows.length, 3);
  assert.ok(!windows.some((entry) => entry.conversationId === 'a'));
});

test('draft isolation is per conversation and session-scoped', () => {
  let drafts: Record<string, string> = {};
  drafts = setConversationDraft(drafts, 'c1', 'hello c1');
  drafts = setConversationDraft(drafts, 'c2', 'hello c2');
  assert.equal(getConversationDraft(drafts, 'c1'), 'hello c1');
  assert.equal(getConversationDraft(drafts, 'c2'), 'hello c2');
  drafts = setConversationDraft(drafts, 'c1', 'edited c1');
  assert.equal(getConversationDraft(drafts, 'c1'), 'edited c1');
  assert.equal(getConversationDraft(drafts, 'c2'), 'hello c2');
  drafts = clearConversationDraft(drafts, 'c1');
  assert.equal(getConversationDraft(drafts, 'c1'), '');
  assert.equal(getConversationDraft(drafts, 'c2'), 'hello c2');
});

test('stale search responses are rejected by sequence guard', () => {
  assert.equal(isSearchResponseCurrent(3, 3), true);
  assert.equal(isSearchResponseCurrent(2, 3), false);
  assert.equal(isSearchResponseCurrent(4, 3), false);
});

test('Communities tab stays empty without community metadata (no misclassification)', () => {
  const list = [
    conversation({
      id: 'd1',
      type: 'direct',
      participants: [participant('u1', 'A'), participant('u2', 'B')],
      lastMessageAt: '2026-07-01T12:00:00.000Z'
    }),
    conversation({
      id: 'g1',
      type: 'group',
      participants: [participant('u1', 'A'), participant('u2', 'B'), participant('u3', 'C')],
      lastMessageAt: '2026-07-01T13:00:00.000Z'
    })
  ];
  const communities = filterConversationsForTab(list, 'communities', 15);
  assert.equal(communities.length, 0);
  const groups = filterConversationsForTab(list, 'groups', 15);
  assert.equal(groups.length, 1);
  const all = filterConversationsForTab(list, 'all', 15);
  assert.equal(all.length, 2);
});

test('All tab always includes every permitted conversation type', () => {
  const list = [
    conversation({
      id: 'd1',
      type: 'direct',
      participants: [participant('u1', 'A'), participant('u2', 'B')],
      unreadCount: 1,
      lastMessageAt: '2026-07-01T10:00:00.000Z'
    }),
    conversation({
      id: 'g1',
      type: 'group',
      participants: [participant('u1', 'A'), participant('u2', 'B'), participant('u3', 'C')],
      lastMessageAt: '2026-07-01T11:00:00.000Z'
    }),
    conversation({
      id: 'cm1',
      type: 'group',
      participants: [participant('u1', 'A'), participant('u2', 'B'), participant('u4', 'D')],
      communityId: 'community-1',
      lastMessageAt: '2026-07-01T12:00:00.000Z'
    } as any)
  ];
  const all = filterConversationsForTab(list, 'all', 15);
  assert.equal(all.length, 3);
  assert.ok(all.some((entry) => entry.id === 'd1'));
  assert.ok(all.some((entry) => entry.id === 'g1'));
  assert.ok(all.some((entry) => entry.id === 'cm1'));
});
