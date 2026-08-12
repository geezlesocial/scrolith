import { COMMUNITY_CLUB_VISIBILITY } from '../utils/communityPrismaEnums';

const mockPrisma = {
  appSetting: {
    findUnique: jest.fn(),
    upsert: jest.fn()
  },
  clubMembership: {
    count: jest.fn()
  },
  communityClub: {
    findMany: jest.fn()
  },
  communityChannel: {
    findMany: jest.fn()
  },
  communityEvent: {
    findMany: jest.fn()
  },
  question: {
    findMany: jest.fn()
  },
  scrollSeries: {
    findMany: jest.fn()
  }
};

jest.mock('../utils/prismaClient', () => ({
  __esModule: true,
  default: mockPrisma
}));

const generatorContext = () => ({
  viewerId: 'viewer-1',
  profile: {
    viewerId: 'viewer-1',
    skills: [],
    topics: ['community'],
    communities: [],
    categories: [],
    locations: [],
    negativeTokens: [],
    explicitWeight: 0.5,
    implicitWeight: 0.5,
    coldStart: false,
    personalizationAllowed: true
  },
  blockedUserIds: new Set<string>(),
  entityTypes: new Set<any>(['community', 'group']),
  limitPerGenerator: 5
});

describe('community Prisma enum query contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.appSetting.findUnique.mockResolvedValue(null);
    mockPrisma.appSetting.upsert.mockResolvedValue({});
    mockPrisma.clubMembership.count.mockResolvedValue(0);
    mockPrisma.communityClub.findMany.mockResolvedValue([]);
    mockPrisma.communityChannel.findMany.mockResolvedValue([]);
    mockPrisma.communityEvent.findMany.mockResolvedValue([]);
    mockPrisma.question.findMany.mockResolvedValue([]);
    mockPrisma.scrollSeries.findMany.mockResolvedValue([]);
  });

  test('professional discovery uses schema public visibility enum for public clubs', async () => {
    const { getGroupRecommendations } = await import('../services/professionalDiscovery.service');

    await getGroupRecommendations(null, 3);

    expect(mockPrisma.communityClub.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'active',
          visibility: COMMUNITY_CLUB_VISIBILITY.PUBLIC
        }
      })
    );
  });

  test('community visibility helper matches generated Prisma runtime enum', () => {
    const prismaRuntime = jest.requireActual('@prisma/client') as {
      ChannelVisibility?: typeof COMMUNITY_CLUB_VISIBILITY;
    };

    expect(prismaRuntime.ChannelVisibility).toEqual(COMMUNITY_CLUB_VISIBILITY);
  });

  test('discovery community recommendations use schema public visibility enum', async () => {
    const { generateCommunities, generateGroups } = await import('../services/discoveryEngine/discoveryEngine.generators');

    await generateCommunities(generatorContext() as any);
    await generateGroups(generatorContext() as any);

    expect(mockPrisma.communityClub.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          status: 'active',
          visibility: COMMUNITY_CLUB_VISIBILITY.PUBLIC
        }
      })
    );
    expect(mockPrisma.communityClub.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          status: 'active',
          visibility: COMMUNITY_CLUB_VISIBILITY.PUBLIC
        }
      })
    );
  });

  test('member-home event recommendations use current CommunityEvent schema fields without status', async () => {
    const { __feedOrchestratorTestUtils } = await import('../services/feedOrchestrator.service');
    const now = new Date('2026-08-12T00:00:00.000Z');

    const where = __feedOrchestratorTestUtils.buildCommunityEventActiveWhere(now);

    expect(where).toEqual({ endTime: { gte: now } });
    expect(where).not.toHaveProperty('status');
  });

  test('member-home fan club summary uses schema public visibility enum', async () => {
    const { getEngagementExpansionSummary } = await import('../modules/insights/services/engagementExpansion.service');

    await getEngagementExpansionSummary('viewer-1');

    expect(mockPrisma.communityClub.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { visibility: COMMUNITY_CLUB_VISIBILITY.PUBLIC }
      })
    );
  });
});
