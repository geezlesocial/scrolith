import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const src = (...parts: string[]) => join(root, 'src', ...parts);

test('skip link + route announcer + keyboard help modules exist', () => {
  assert.equal(existsSync(src('components/a11y/SkipLink.tsx')), true);
  assert.equal(existsSync(src('components/a11y/RouteAnnouncer.tsx')), true);
  assert.equal(existsSync(src('components/a11y/KeyboardShortcutsHelp.tsx')), true);
  assert.equal(existsSync(src('components/a11y/index.ts')), true);
});

test('App shell wires skip link, main landmark, and keyboard help', () => {
  const app = readFileSync(src('App.tsx'), 'utf8');
  assert.match(app, /SkipLink/);
  assert.match(app, /RouteAnnouncer/);
  assert.match(app, /KeyboardShortcutsHelp/);
  assert.match(app, /id=\"main-content\"/);
  assert.match(app, /tabIndex=\{-1\}/);
});

test('global reduced-motion policy is present', () => {
  const css = readFileSync(src('index.css'), 'utf8');
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /scrolith-skip-link/);
  assert.match(css, /animation-duration:\s*0\.01ms/);
});

test('people you may know + creator analytics cards exist', () => {
  assert.equal(existsSync(src('components/discovery/PeopleYouMayKnowRail.tsx')), true);
  assert.equal(existsSync(src('components/insights/CreatorAnalyticsCard.tsx')), true);
  const network = readFileSync(src('mobile/home/screens/MobileNetworkScreen.tsx'), 'utf8');
  assert.match(network, /PeopleYouMayKnowRail/);
  assert.match(network, /EmptyState/);
  const profile = readFileSync(src('profile/FreelancerProfile.tsx'), 'utf8');
  assert.match(profile, /CreatorAnalyticsCard/);
  assert.match(profile, /ProfessionalIntegrationStrip/);
});

test('post detail sets SEO title/meta for public share surfaces', () => {
  const postDetail = readFileSync(src('pages/PostDetailView.tsx'), 'utf8');
  assert.match(postDetail, /document\.title/);
  assert.match(postDetail, /og:title/);
  assert.match(postDetail, /meta\[name='description'\]/);
});

test('offline banner exposes polite status live region', () => {
  const offline = readFileSync(src('components/OfflineBanner.tsx'), 'utf8');
  assert.match(offline, /role=\"status\"/);
  assert.match(offline, /aria-live=\"polite\"/);
});

test('report transparency message improved', () => {
  const options = readFileSync(src('community/components/post-options/usePostOptions.tsx'), 'utf8');
  assert.match(options, /moderation team will review/i);
});
