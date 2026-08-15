import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('member-feed request identity separates viewer and page semantics', async () => {
  const { buildMemberFeedRequestKey } = await import('../../src/services/memberFeed.ts');
  const base = {
    surface: 'member_home' as const,
    viewerKey: 'viewer-a',
    mode: 'for_you',
    limit: 12,
    topic: 'engineering',
    region: 'sg'
  };

  assert.equal(buildMemberFeedRequestKey(base), buildMemberFeedRequestKey({ ...base, limit: 12 }));
  assert.notEqual(buildMemberFeedRequestKey(base), buildMemberFeedRequestKey({ ...base, viewerKey: 'viewer-b' }));
  assert.notEqual(buildMemberFeedRequestKey(base), buildMemberFeedRequestKey({ ...base, surface: 'community' }));
  assert.notEqual(buildMemberFeedRequestKey(base), buildMemberFeedRequestKey({ ...base, cursor: 'cursor-2' }));
});

test('member-home lifecycle rejects overlapping soft/initial feed loads', async () => {
  const source = await read('src/components/sections/MemberHomeSection.tsx');
  assert.match(
    source,
    /if \(feedLoadingRef\.current && !options\?\.hardReset\) \{\s*return;/s
  );
  assert.match(source, /feedAbortRef\.current\?\.abort\(\);/);
  assert.match(source, /scheduleFeedSoftRefresh/);
});

test('shared mobile lifecycle passes the viewer identity to the transport', async () => {
  const source = await read('src/hooks/useSurfaceFeedLifecycle.ts');
  assert.match(source, /surface,\s*viewerKey,\s*isMobile,\s*dataSaver/s);
});

test('mobile recovery refresh is keyed by recovery transitions, not loader identity', async () => {
  const source = await read('src/mobile/home/components/MobileFeed.tsx');
  assert.match(source, /const loadRef = useRef\(load\);/);
  assert.match(source, /loadRef\.current\(USE_SHARED_FEED_LIFECYCLE \? 'soft_refresh' : 'initial'\)/g);
  assert.match(source, /\}, \[isOnline, recoveryTick\]\);/);
  assert.doesNotMatch(source, /\}, \[isOnline, recoveryTick, load\]\);/);
});

test('recovery lifecycle model demonstrates the fixed 60-second idle bound', () => {
  const run = (includeLoaderIdentity: boolean) => {
    let requests = 0;
    let now = 0;
    let loaderIdentity = 0;
    let previous: [boolean, number, number] | null = null;
    const recoveryTick = 1;
    const isOnline = true;
    while (now <= 60_000) {
      const deps: [boolean, number, number] = [isOnline, recoveryTick, includeLoaderIdentity ? loaderIdentity : 0];
      const changed = !previous || deps.some((value, index) => value !== previous?.[index]);
      if (!changed) break;
      previous = deps;
      requests += 1;
      loaderIdentity += 1;
      now += 333;
    }
    return requests;
  };

  assert.equal(run(true), 181);
  assert.equal(run(false), 1);
});
