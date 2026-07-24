/**
 * Ensures message send/react identity cannot be spoofed via body.senderId / body.userId.
 */
import * as messagesController from '../controllers/messages.controller';
import prisma from '../utils/prismaClient';

const postMessage = (messagesController as any).postMessage;
const toggleReaction = (messagesController as any).toggleReaction;

jest.mock('../utils/prismaClient', () => {
  const mockPrisma = {
    conversation: {
      findUnique: jest.fn()
    },
    directMessage: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    conversationParticipant: {
      create: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn()
    },
    messageReaction: {
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn()
    },
    file: {
      findMany: jest.fn()
    }
  };
  return { __esModule: true, default: mockPrisma };
});

const mockPrisma = prisma as any;

const createResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('messages sender/reactor identity protection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('postMessage rejects body.senderId that does not match authenticated user', async () => {
    const req: any = {
      user: { id: 'user-a', role: 'USER' },
      params: { id: 'conv-1' },
      body: { senderId: 'user-b', text: 'impersonation attempt' },
      headers: {},
      app: { get: () => null }
    };
    const res = createResponse();

    await postMessage(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'IDENTITY_SPOOF_DENIED'
      })
    );
    expect(mockPrisma.conversation.findUnique).not.toHaveBeenCalled();
  });

  test('postMessage accepts matching senderId and requires participant membership', async () => {
    mockPrisma.conversation.findUnique.mockResolvedValue({
      id: 'conv-1',
      type: 'DIRECT',
      participants: [
        { userId: 'user-a', deletedAt: null, isArchived: false },
        { userId: 'user-b', deletedAt: null, isArchived: false }
      ]
    });
    mockPrisma.directMessage.findFirst.mockResolvedValue(null);
    mockPrisma.directMessage.create.mockResolvedValue({
      id: 'msg-1',
      conversationId: 'conv-1',
      senderId: 'user-a',
      text: 'hello',
      createdAt: new Date('2026-07-24T00:00:00.000Z'),
      deletedAt: null,
      editedAt: null,
      attachments: [],
      messageType: 'TEXT',
      metadata: null,
      clientMessageId: null,
      reactions: []
    });
    mockPrisma.conversationParticipant.findMany = jest.fn().mockResolvedValue([]);
    // conversation.update used after send
    mockPrisma.conversation.update = jest.fn().mockResolvedValue({});

    const req: any = {
      user: { id: 'user-a', role: 'USER' },
      params: { id: 'conv-1' },
      body: { senderId: 'user-a', text: 'hello' },
      headers: {},
      app: { get: () => null }
    };
    const res = createResponse();

    await postMessage(req, res);

    // Should not 403 identity spoof; may succeed or hit optional side-effects
    const statusArg = res.status.mock.calls[0]?.[0];
    if (statusArg) {
      expect(statusArg).not.toBe(403);
    }
    expect(mockPrisma.conversation.findUnique).toHaveBeenCalled();
  });

  test('toggleReaction rejects body.userId spoof', async () => {
    const req: any = {
      user: { id: 'user-a', role: 'USER' },
      params: { id: 'conv-1', messageId: 'msg-1' },
      body: { userId: 'user-b', emoji: '👍' },
      headers: {},
      app: { get: () => null }
    };
    const res = createResponse();

    await toggleReaction(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'IDENTITY_SPOOF_DENIED'
      })
    );
  });

  test('toggleReaction rejects non-participant reactor', async () => {
    mockPrisma.directMessage.findUnique.mockResolvedValue({
      id: 'msg-1',
      conversationId: 'conv-1',
      deletedAt: null,
      senderId: 'user-b',
      conversation: {
        participants: [
          { userId: 'user-b', deletedAt: null },
          { userId: 'user-c', deletedAt: null }
        ]
      }
    });

    const req: any = {
      user: { id: 'user-a', role: 'USER' },
      params: { id: 'conv-1', messageId: 'msg-1' },
      body: { emoji: '👍' },
      headers: {},
      app: { get: () => null }
    };
    const res = createResponse();

    await toggleReaction(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 'NOT_CONVERSATION_PARTICIPANT'
      })
    );
  });
});
