import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('discovery engine frontend contracts (phase 8)', () => {
  it('service client targets discovery-engine API', () => {
    const service = readFileSync(join(__dirname, '../../src/services/discoveryEngine.ts'), 'utf8');
    assert.match(service, /discovery-engine\/recommend/);
    assert.match(service, /discovery-engine\/feedback/);
    assert.match(service, /trackingToken/);
  });

  it('recommendation rail fails closed when empty and supports a11y', () => {
    const rail = readFileSync(
      join(__dirname, '../../src/components/discovery/DiscoveryRecommendationRail.tsx'),
      'utf8'
    );
    assert.match(rail, /if \(!user\?\.id \|\| dismissed\) return null/);
    assert.match(rail, /items\.length === 0 && !refreshAvailable\) return null/);
    assert.match(rail, /aria-labelledby/);
    assert.match(rail, /aria-label=\{`Reason:/);
    assert.match(rail, /not_interested/);
    assert.match(rail, /IntersectionObserver/);
    assert.match(rail, /discovery:recommendations_invalidated/);
    assert.match(rail, /BroadcastChannel/);
    assert.match(rail, /focus-visible:outline/);
  });
});
