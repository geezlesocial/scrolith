/**
 * Lightweight pure-behavior tests for professional discovery scoring helpers.
 * Service file uses Prisma; we re-export score logic via runtime import where safe.
 */

const mockCommunityClubFindMany = jest.fn();

jest.mock('../../utils/prismaClient', () => ({
  __esModule: true,
  default: {
    communityClub: { findMany: mockCommunityClubFindMany },
    appSetting: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    feedPreference: { findUnique: jest.fn() }
  }
}));

describe('professionalDiscovery service module', () => {
  beforeEach(() => {
    mockCommunityClubFindMany.mockReset();
  });

  test('module exports expected functions', async () => {
    const mod = await import('../professionalDiscovery.service');
    expect(typeof mod.getProfessionalDiscoveryBundle).toBe('function');
    expect(typeof mod.getMarketplaceRecommendations).toBe('function');
    expect(typeof mod.getGroupRecommendations).toBe('function');
    expect(typeof mod.getBlogRecommendations).toBe('function');
  });

  test('loads CommunityClub using only schema fields and maps media fields', async () => {
    mockCommunityClubFindMany.mockResolvedValue([
      {
        id: 'club-1',
        name: 'Builders Club',
        description: 'A professional community',
        slug: 'builders',
        avatarImage: '/avatar.png',
        coverImage: '/cover.png',
        memberCount: 12,
        visibility: 'PUBLIC',
        category: 'Technology',
        status: 'active'
      }
    ]);

    const mod = await import('../professionalDiscovery.service');
    const [item] = await mod.getGroupRecommendations(undefined, 1);
    const query = mockCommunityClubFindMany.mock.calls[0][0];

    expect(query.select).toEqual({
      id: true,
      name: true,
      description: true,
      slug: true,
      avatarImage: true,
      coverImage: true,
      memberCount: true,
      visibility: true,
      category: true,
      status: true
    });
    expect(query.select).not.toHaveProperty('title');
    expect(query.select).not.toHaveProperty('tags');
    expect(item).toMatchObject({
      title: 'Builders Club',
      imageUrl: '/avatar.png',
      avatarUrl: '/avatar.png',
      coverUrl: '/cover.png',
      meta: { memberCount: 12 }
    });
  });
});
