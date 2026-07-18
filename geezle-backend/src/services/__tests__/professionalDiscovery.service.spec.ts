/**
 * Lightweight pure-behavior tests for professional discovery scoring helpers.
 * Service file uses Prisma; we re-export score logic via runtime import where safe.
 */

describe('professionalDiscovery service module', () => {
  test('module exports expected functions', async () => {
    const mod = await import('../professionalDiscovery.service');
    expect(typeof mod.getProfessionalDiscoveryBundle).toBe('function');
    expect(typeof mod.getMarketplaceRecommendations).toBe('function');
    expect(typeof mod.getGroupRecommendations).toBe('function');
    expect(typeof mod.getBlogRecommendations).toBe('function');
  });
});
