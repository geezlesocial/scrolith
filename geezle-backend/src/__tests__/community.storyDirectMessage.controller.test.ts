import * as communityStoriesController from '../controllers/community.stories.controller';
const sendStoryDirectMessage = (communityStoriesController as any).sendStoryDirectMessage;
import prisma from '../utils/prismaClient';
import { deliverStoryEngagementAlert } from '../services/storyEngagementDelivery.service';

jest.mock('../utils/prismaClient', () => {
  const mockPrisma = {
    communityStory: {
      findUnique: jest.fn()
    },
    user: {
      findUnique: jest.fn()
    },
    userFollow: {
      findMany: jest.fn()
    },
    file: {
      findUnique: jest.fn()
    }
  };

  return {
    __esModule: true,
    default: mockPrisma
  };
});

jest.mock('../utils/realtime', () => ({
  __esModule: true,
  default: {
    emitToUser: jest.fn()
  }
}));

jest.mock('../utils/fileUsage', () => ({
  addFileUsage: jest.fn(),
  removeUsage: jest.fn()
}));

jest.mock('../utils/mediaUrl', () => ({
  resolveDirectMediaUrl: jest.fn((value) => value || null),
  resolveFileBaseUrl: jest.fn(() => 'https://api.scrolith.com')
}));

jest.mock('../services/storyEngagementDelivery.service', () => ({
  buildStoryActionUrl: jest.fn((storyId: string) => `/community?story=${encodeURIComponent(storyId)}`),
  deliverStoryEngagementAlert: jest.fn()
}));

const mockPrisma = prisma as unknown as {
  communityStory: { findUnique: jest.Mock };
  user: { findUnique: jest.Mock };
  userFollow: { findMany: jest.Mock };
  file: { findUnique: jest.Mock };
};

const mockDeliverStoryEngagementAlert = deliverStoryEngagementAlert as jest.Mock;
const THUMBS_UP_REACTION = '\u{1F44D}';

const createResponse = () => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const createRequest = (overrides: Record<string, any> = {}) => ({
  user: { id: 'viewer-1' },
  params: { id: 'story-1' },
  body: {},
  protocol: 'https',
  get: jest.fn(() => 'api.scrolith.com'),
  ...overrides
});

describe('sendStoryDirectMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.communityStory.findUnique.mockResolvedValue({
      id: 'story-1',
      authorId: 'owner-1',
      visibility: 'public',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      type: 'image',
      content: 'A story worth replying to',
      mediaFileId: null
    });
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'viewer-1',
      name: 'Viewer User',
      username: 'viewer'
    });
    mockPrisma.userFollow.findMany.mockResolvedValue([]);
    mockPrisma.file.findUnique.mockResolvedValue(null);
    mockDeliverStoryEngagementAlert.mockResolvedValue({
      conversationId: 'conversation-1',
      messageId: 'message-1',
      actionUrl: '/messages/conversation-1'
    });
  });

  it('sends a story comment as an inbox message to the story owner', async () => {
    const req: any = createRequest({ body: { text: 'This looks excellent.' } });
    const res = createResponse();

    await sendStoryDirectMessage(req, res as any);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        storyId: 'story-1',
        type: 'message',
        reactionType: null,
        conversationId: 'conversation-1',
        messageId: 'message-1',
        actionUrl: '/messages/conversation-1'
      }
    });
    expect(mockDeliverStoryEngagementAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'owner-1',
        actorId: 'viewer-1',
        storyId: 'story-1',
        notificationType: 'story_message',
        title: 'New message from your story',
        inboxText: 'This looks excellent.',
        inboxIsSystem: false,
        inboxMetadata: expect.objectContaining({
          category: 'story_message',
          storyId: 'story-1',
          storyReference: expect.objectContaining({
            storyId: 'story-1',
            caption: 'A story worth replying to'
          }),
          messagePreview: 'This looks excellent.'
        })
      })
    );
  });

  it('sends a quick reaction as an inbox message to the story owner', async () => {
    const req: any = createRequest({ body: { reactionType: 'like' } });
    const res = createResponse();

    await sendStoryDirectMessage(req, res as any);

    expect(res.status).not.toHaveBeenCalled();
    expect(mockDeliverStoryEngagementAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'owner-1',
        actorId: 'viewer-1',
        notificationType: 'story_reaction',
        title: 'New reaction to your story',
        inboxText: `Viewer User reacted ${THUMBS_UP_REACTION} to your story`,
        inboxIsSystem: false,
        inboxMetadata: expect.objectContaining({
          category: 'story_reaction',
          reactionType: THUMBS_UP_REACTION,
          storyReference: expect.objectContaining({
            storyId: 'story-1'
          })
        })
      })
    );
  });

  it('allows the owner story input path instead of rejecting it as not messageable', async () => {
    mockPrisma.communityStory.findUnique.mockResolvedValueOnce({
      id: 'story-1',
      authorId: 'viewer-1',
      visibility: 'public',
      expiresAt: new Date('2099-01-01T00:00:00.000Z'),
      type: 'image',
      content: 'Owner story',
      mediaFileId: null
    });
    const req: any = createRequest({ body: { text: 'Owner note from story.' } });
    const res = createResponse();

    await sendStoryDirectMessage(req, res as any);

    expect(res.status).not.toHaveBeenCalledWith(400);
    expect(mockDeliverStoryEngagementAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'viewer-1',
        actorId: 'viewer-1',
        notificationType: 'story_message',
        inboxText: 'Owner note from story.',
        inboxIsSystem: false
      })
    );
  });
});
