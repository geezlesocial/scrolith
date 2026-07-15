/**
 * Phase 9.5 — Enterprise Search UX unit tests (no React DOM; pure helpers).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_TRENDING,
  SEARCH_TABS,
  TAB_TO_DOMAINS,
  escapeRegExp,
  filtersRelevantToTab,
  isEnterpriseSearchUxEnabled
} from '../../src/search/enterpriseSearch.ux.ts';

describe('enterprise search UX flag', () => {
  it('defaults to OFF without env/localStorage', () => {
    assert.equal(isEnterpriseSearchUxEnabled(), false);
  });
});

describe('enterprise search domain tabs', () => {
  it('includes universal domains', () => {
    const keys = SEARCH_TABS.map((t) => t.key);
    for (const required of [
      'all',
      'person',
      'post',
      'company',
      'job',
      'freelancer',
      'service',
      'marketplace_listing',
      'product',
      'discussion',
      'community',
      'group'
    ]) {
      assert.ok(keys.includes(required as any), `missing tab ${required}`);
    }
  });

  it('maps tabs to domains', () => {
    assert.equal(TAB_TO_DOMAINS.all, null);
    assert.deepEqual(TAB_TO_DOMAINS.person, ['person']);
    assert.deepEqual(TAB_TO_DOMAINS.job, ['job']);
  });

  it('shows commerce filters only for commerce tabs', () => {
    const job = filtersRelevantToTab('job');
    assert.ok(job.includes('salaryMin'));
    const service = filtersRelevantToTab('service');
    assert.ok(service.includes('priceMin'));
    const post = filtersRelevantToTab('post');
    assert.ok(!post.includes('priceMin'));
  });
});

describe('highlight helpers', () => {
  it('escapes regex specials', () => {
    assert.equal(escapeRegExp('a+b'), 'a\\+b');
    assert.equal(escapeRegExp('(x)'), '\\(x\\)');
  });

  it('has trending defaults', () => {
    assert.ok(DEFAULT_TRENDING.length >= 4);
  });
});
