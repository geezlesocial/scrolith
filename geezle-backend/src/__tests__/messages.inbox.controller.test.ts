import * as messagesController from '../controllers/messages.controller';
import prisma from '../utils/prismaClient';

const listConversations = (messagesController as any).listConversations;
const {
  mergeConversationPayloads,
  getConversationInboxMergeKey,
  dedupeMessagesById,
  DEFAULT_CONVERSATION_PREVIEW_LIMIT
} = (messagesController as any).messagingInboxTestUtils;

jest.mock('../utils/prismaClient', () => {
  const mockPrisma = {
    conversation: {
      findMany: jest.fn()
    },
    file: {
      findMany: jest.fn()
    },
    directMessageRecord: {
      findMany: jest.fn()
    }
  };

  return {
    __esModule: true,
    default: mockPrisma
  };
});

const mockPrisma = prisma as unknown as {
  conversation: { findMany: jest.Mock };
  file: { findMany: jest.Mock };
  directMessageRecord: { findMany: jest.Mock };
};

const createResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const participant = (id: string, name: string, username: string) => ({
  userId: id,
  joinedAt: new Date('2026-05-01T00:00:00.000Z'),
  lastReadAt: new Date('2026-05-01T00:00:00.000Z'),
  label: 'other',
  isStarred: false,
  isMuted: false,
  isArchived: false,
  deletedAt: null,
  user: {
    id,
    name,
    username,
    email: `${username || id}@example.com`,
    avatar: '',
    role: 'USER',
    isOnline: false,
    lastSeenAt: null,
    profile: { gender: null }
  }
});

const message = (
  id: string,
  text: string,
  senderId: string,
  createdAt: string,
  metadata: Record<string, unknown> | null = null
) => ({
  id,
  conversationId: 'conversation-1',
  senderId,
  text,
  messageType: 'TEXT',
  metadata,
  attachments: [],
  replyToMessageId: null,
  replyToSnapshot: null,
  createdAt: new Date(createdAt),
  deletedAt: null,
  editedAt: null,
  reactions: []
});

const conversation = (overrides: Record<string, unknown> = {}) => ({
  id: 'conversation-1',
  type: 'DIRECT',
  lastMessageText: 'Latest',
  lastMessageAt: new Date('2026-05-03T12:00:00.000Z'),
  updatedAt: new Date('2026-05-03T12:00:00.000Z'),
  participants: [
    participant('user-1', 'Current User', 'currentuser'),
    participant('user-2', 'Sarah Art', 'sarahart')
  ],
  messages: [message('message-1', 'Hello', 'user-2', '2026-05-03T12:00:00.000Z')],
  ...overrides
});

describe('messaging inbox list + merge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.conversation.findMany.mockResolvedValue([]);
    mockPrisma.file.findMany.mockResolvedValue([]);
    mockPrisma.directMessageRecord.findMany.mockResolvedValue([]);
  });

  test('default preview limit stays lightweight for inbox', () => {
    expect(DEFAULT_CONVERSATION_PREVIEW_LIMIT).toBe(5);
  });

  test('merges duplicate direct conversations for the same participant pair', () => {
    const storyReaction = {
      id: 'conversation-story',
      type: 'direct',
      participants: [
        { id: 'user-1', name: 'Current User' },
        { id: 'user-2', name: 'Sarah Art' }
      ],
      messages: [
        {
          id: 'msg-reaction',
          text: 'Sarah Art reacted 👍 to your story',
          timestamp: '2026-05-03T11:00:00.000Z',
          metadata: {
            storyId: 'story-1',
            storyThreadKey: 'story:story-1',
            category: 'story_reaction'
          }
        }
      ],
      last_message: 'Sarah Art reacted 👍 to your story',
      last_message_at: '2026-05-03T11:00:00.000Z',
      unread_count: 1
    };
    const storyComment = {
      id: 'conversation-comment',
      type: 'direct',
      participants: [
        { id: 'user-1', name: 'Current User' },
        { id: 'user-2', name: 'Sarah Art' }
      ],
      messages: [
        {
          id: 'msg-comment',
          text: 'This looks excellent.',
          timestamp: '2026-05-03T12:00:00.000Z',
          metadata: {
            storyId: 'story-1',
            storyThreadKey: 'story:story-1',
            category: 'story_comment'
          }
        },
        // Duplicate message id should collapse during merge.
        {
          id: 'msg-comment',
          text: 'This looks excellent.',
          timestamp: '2026-05-03T12:00:00.000Z',
          metadata: {
            storyId: 'story-1',
            storyThreadKey: 'story:story-1',
            category: 'story_comment'
          }
        }
      ],
      last_message: 'This looks excellent.',
      last_message_at: '2026-05-03T12:00:00.000Z',
      unread_count: 1
    };

    expect(getConversationInboxMergeKey(storyReaction)).toBe('direct:user-1:user-2');
    expect(getConversationInboxMergeKey(storyComment)).toBe('direct:user-1:user-2');

    const merged = mergeConversationPayloads([storyReaction, storyComment]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('conversation-comment');
    expect(merged[0].messages.map((entry: any) => entry.id)).toEqual(['msg-reaction', 'msg-comment']);
    expect(merged[0].unread_count).toBe(2);
    expect(merged[0].last_message).toBe('This looks excellent.');
  });

  test('dedupeMessagesById keeps first occurrence and sorts by timestamp', () => {
    const result = dedupeMessagesById([
      { id: 'b', timestamp: '2026-05-03T12:00:00.000Z' },
      { id: 'a', timestamp: '2026-05-03T11:00:00.000Z' },
      { id: 'b', timestamp: '2026-05-03T13:00:00.000Z' }
    ]);
    expect(result.map((entry: any) => entry.id)).toEqual(['a', 'b']);
  });

  test('listConversations returns pagination metadata and deduped payload', async () => {
    const res = createResponse();
    const primary = conversation({
      id: 'conversation-primary',
      updatedAt: new Date('2026-05-03T13:00:00.000Z'),
      messages: [
        message('m1', 'Primary', 'user-2', '2026-05-03T13:00:00.000Z', {
          storyId: 'story-1',
          storyThreadKey: 'story:story-1'
        })
      ]
    });
    const duplicate = conversation({
      id: 'conversation-duplicate',
      updatedAt: new Date('2026-05-03T12:30:00.000Z'),
      messages: [
        message('m2', 'Duplicate row', 'user-2', '2026-05-03T12:30:00.000Z', {
          storyId: 'story-1',
          storyThreadKey: 'story:story-1',
          category: 'story_reaction'
        })
      ]
    });
    // Fill remaining page slots so hasMore can be asserted with API min limit=10.
    const fillers = Array.from({ length: 9 }, (_, index) =>
      conversation({
        id: `conversation-fill-${index}`,
        updatedAt: new Date(`2026-05-02T${String(10 + index).padStart(2, '0')}:00:00.000Z`),
        participants: [
          participant('user-1', 'Current User', 'currentuser'),
          participant(`user-fill-${index}`, `Fill ${index}`, `fill${index}`)
        ],
        messages: [
          message(
            `m-fill-${index}`,
            `Fill ${index}`,
            `user-fill-${index}`,
            `2026-05-02T${String(10 + index).padStart(2, '0')}:00:00.000Z`
          )
        ]
      })
    );

    // limit clamps to min 10, so take=11; extra row signals hasMore.
    mockPrisma.conversation.findMany.mockResolvedValue([primary, duplicate, ...fillers]);

    await listConversations(
      {
        user: { id: 'user-1', role: 'USER' },
        query: { limit: '10', messagePreviewLimit: '5' }
      } as any,
      res as any
    );

    expect(mockPrisma.conversation.findMany).toHaveBeenCalledTimes(1);
    const findManyArgs = mockPrisma.conversation.findMany.mock.calls[0][0];
    expect(findManyArgs.take).toBe(11);
    expect(findManyArgs.include.messages.take).toBe(5);
    // Inbox list must not pull replyToMessage joins.
    expect(findManyArgs.include.messages.select.replyToMessage).toBeUndefined();

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        pagination: expect.objectContaining({
          limit: 10,
          hasMore: true,
          nextCursor: 'conversation-fill-7'
        })
      })
    );

    const payload = res.json.mock.calls[0][0].data;
    // primary + duplicate share participants and collapse; page has 10 rows before merge => 9 after.
    expect(payload).toHaveLength(9);
    expect(payload[0].id).toBe('conversation-primary');
    expect(payload[0].messages.map((entry: any) => entry.id).sort()).toEqual(['m1', 'm2']);
  });

  test('listConversations returns empty data for unauthenticated non-admin', async () => {
    const res = createResponse();
    await listConversations({ user: undefined, query: {} } as any, res as any);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [] });
    expect(mockPrisma.conversation.findMany).not.toHaveBeenCalled();
  });
});
