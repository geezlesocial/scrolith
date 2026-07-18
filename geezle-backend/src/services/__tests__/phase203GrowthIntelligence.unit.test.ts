/**
 * Phase 20.3 — growth intelligence contracts (source-level + pure helpers).
 */
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../..');

describe('Phase 20.3 growth intelligence contracts', () => {
  test('growthIntelligence service exports getGrowthPulse', () => {
    const source = fs.readFileSync(path.join(root, 'services/growthIntelligence.service.ts'), 'utf8');
    expect(source).toMatch(/export const getGrowthPulse/);
    expect(source).toMatch(/version:\s*'20\.3\.0'/);
    expect(source).toMatch(/scrolithaPrompts/);
    expect(source).toMatch(/postingGuidance/);
  });

  test('professional discovery ranks with feed intent boosts', () => {
    const source = fs.readFileSync(path.join(root, 'services/professionalDiscovery.service.ts'), 'utf8');
    expect(source).toMatch(/feedIntent/);
    expect(source).toMatch(/Aligned with your hiring focus/);
    expect(source).toMatch(/Supports your sell \/ service goals/);
    expect(source).toMatch(/Matches your learning focus/);
  });

  test('growth-pulse route is mounted under professional-discovery', () => {
    const routes = fs.readFileSync(path.join(root, 'routes/professionalDiscovery.routes.ts'), 'utf8');
    expect(routes).toMatch(/\/growth-pulse/);
    expect(routes).toMatch(/getGrowthPulse/);
  });

  test('feed orchestrator growth explanations for person/page recs', () => {
    const source = fs.readFileSync(path.join(root, 'services/feedOrchestrator.service.ts'), 'utf8');
    expect(source).toMatch(/Verified professional to expand your network/);
    expect(source).toMatch(/Pages worth following for opportunities/);
    expect(source).toMatch(/reasons:/);
  });
});
