import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const src = (...parts: string[]) => join(root, 'src', ...parts);

test('global ErrorBoundary exposes retry recovery UX', () => {
  const app = readFileSync(src('App.tsx'), 'utf8');
  assert.match(app, /global-error-boundary/);
  assert.match(app, /Something went wrong/);
  assert.match(app, /window\.location\.reload/);
  assert.match(app, /Go home/);
});

test('search results include SEO title, retry, and loading skeleton', () => {
  const search = readFileSync(src('pages/SearchResults.tsx'), 'utf8');
  assert.match(search, /document\.title/);
  assert.match(search, /search-error-state/);
  assert.match(search, /Retry search/);
  assert.match(search, /search-loading-skeleton/);
  assert.match(search, /retryToken/);
});

test('report acknowledgement surfaces reportId when available', () => {
  const options = readFileSync(src('community/components/post-options/usePostOptions.tsx'), 'utf8');
  assert.match(options, /reportId/);
  assert.match(options, /reviewState/);
  assert.match(options, /Reference:/);
});

test('nginx security headers present for static hosting', () => {
  const nginx = readFileSync(join(root, 'nginx.conf'), 'utf8');
  assert.match(nginx, /X-Content-Type-Options/);
  assert.match(nginx, /X-Frame-Options/);
  assert.match(nginx, /Referrer-Policy/);
  assert.match(nginx, /Permissions-Policy/);
});

test('API client attaches x-request-id correlation header', () => {
  const api = readFileSync(src('services/api.ts'), 'utf8');
  assert.match(api, /x-request-id/);
  assert.match(api, /createRequestId|randomUUID/);
});

test('dashboard EmptyState a11y parity (status + focus ring)', () => {
  const empty = readFileSync(src('dashboard/shared/EmptyState.tsx'), 'utf8');
  assert.match(empty, /role=\"status\"/);
  assert.match(empty, /aria-live=\"polite\"/);
  assert.match(empty, /focus-visible:outline/);
  assert.match(empty, /aria-hidden=\"true\"/);
});

test('PYMK and creator analytics expose retry on failure', () => {
  const pymk = readFileSync(src('components/discovery/PeopleYouMayKnowRail.tsx'), 'utf8');
  assert.match(pymk, /loadError/);
  assert.match(pymk, /Retry/);
  const analytics = readFileSync(src('components/insights/CreatorAnalyticsCard.tsx'), 'utf8');
  assert.match(analytics, /retryToken/);
  assert.match(analytics, /Retry/);
});

test('a11y modules still present for certification baseline', () => {
  assert.equal(existsSync(src('components/a11y/SkipLink.tsx')), true);
  assert.equal(existsSync(src('components/a11y/RouteAnnouncer.tsx')), true);
});
