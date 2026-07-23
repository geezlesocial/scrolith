import * as messagesController from '../controllers/messages.controller';
const searchMessages = (messagesController as any).searchMessages;
import prisma from '../utils/prismaClient';

jest.mock('../utils/prismaClient', () => {
  const mockPrisma = {
    conversation: {
      findMany: jest.fn(),
      findUnique: jest.fn()
    },
    conversationParticipant: {
      findMany: jest.fn()
    },
    directMessage: {
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
  conversationParticipant: { findMany: jest.Mock };
  directMessage: { findMany: jest.Mock };
  directMessageRecord: { findMany: jest.Mock };
};

const createResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const participant = (id: string, name: string, username: string, overrides: Record<string, unknown> = {}) => ({
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
    profile: { gender: null },
    ...overrides
  }
});

const message = (id: string, text: string, senderId = 'user-2', createdAt = '2026-05-03T10:00:00.000Z') => ({
  id,
  conversationId: 'conversation-1',
  senderId,
  text,
  messageType: 'TEXT',
  metadata: null,
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
  updatedAt: new Date('2026-05-03T10:00:00.000Z'),
  participants: [
    participant('user-1', 'Current User', 'currentuser'),
    participant('user-2', 'Sarah Art', 'sarahart')
  ],
  messages: [message('message-last', 'Latest message preview')],
  ...overrides
});

describe('message search controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.conversationParticipant.findMany.mockResolvedValue([
      { conversationId: 'conversation-1' }
    ]);
    mockPrisma.conversation.findMany.mockResolvedValue([]);
    (mockPrisma.conversation as any).findUnique.mockResolvedValue(conversation());
    mockPrisma.directMessage.findMany.mockResolvedValue([]);
    mockPrisma.directMessageRecord.findMany.mockResolvedValue([]);
  });

  test('rejects unauthenticated direct controller access', async () => {
    const res = createResponse();

    await searchMessages({ user: undefined, query: { q: 'sarah' } } as any, res as any);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('rejects short queries', async () => {
    const res = createResponse();

    await searchMessages({ user: { id: 'user-1', role: 'USER' }, query: { q: 's' } } as any, res as any);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.conversation.findMany).not.toHaveBeenCalled();
  });

  test('finds participant username matches within the authenticated user conversations', async () => {
    const res = createResponse();
    mockPrisma.conversation.findMany.mockResolvedValue([conversation()]);

    await searchMessages({ user: { id: 'user-1', role: 'USER' }, query: { q: 'sarah' } } as any, res as any);

    expect(mockPrisma.conversationParticipant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', deletedAt: null, isArchived: false },
        select: { conversationId: true }
      })
    );
    expect(mockPrisma.conversation.findMany.mock.calls[0][0].where).toEqual(
      expect.objectContaining({
        id: { in: ['conversation-1'] },
        OR: expect.arrayContaining([
          expect.objectContaining({
            participants: expect.objectContaining({
              some: expect.objectContaining({ userId: { not: 'user-1' } })
            })
          })
        ])
      })
    );
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data.results[0]).toEqual(
      expect.objectContaining({
        conversationId: 'conversation-1',
        matchType: 'username',
        participant: expect.objectContaining({ username: 'sarahart' })
      })
    );
  });

  test('finds message text matches and returns a matched snippet', async () => {
    const res = createResponse();
    const sourceConversation = conversation();
    (mockPrisma.conversation as any).findUnique.mockResolvedValue(sourceConversation);
    mockPrisma.directMessage.findMany.mockResolvedValue([
      {
        id: 'message-match',
        text: 'This conversation contains a milestone payment update for the project.',
        createdAt: new Date('2026-05-04T10:00:00.000Z'),
        conversationId: 'conversation-1',
        conversation: sourceConversation
      }
    ]);

    await searchMessages({ user: { id: 'user-1', role: 'USER' }, query: { q: 'payment' } } as any, res as any);

    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data.results[0]).toEqual(
      expect.objectContaining({
        conversationId: 'conversation-1',
        matchType: 'message',
        matchedMessageId: 'message-match',
        matchedMessageSnippet: expect.stringContaining('payment')
      })
    );
  });

  test('rejects admin search scope for non-admin users', async () => {
    const res = createResponse();

    await searchMessages(
      { user: { id: 'user-1', role: 'USER' }, query: { q: 'sarah', scope: 'admin' } } as any,
      res as any
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(mockPrisma.conversation.findMany).not.toHaveBeenCalled();
  });
});
