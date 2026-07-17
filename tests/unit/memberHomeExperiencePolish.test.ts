/**
 * Phase 20.2.1 — Member Home experience polish contracts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')),
  '../..'
);
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

const highlights = () => read('src/components/member-home/MemberHomeHighlightsBoard.tsx');
const memberHome = () => read('src/components/sections/MemberHomeSection.tsx');
const insights = () => read('src/components/insights/InsightsQuickPanel.tsx');

test('marketplace recommendation images are large square (~100–112px)', () => {
  const src = memberHome();
  assert.match(src, /member-home-marketplace-reco-card/);
  // Card markup pairs the test id with a large square image frame (title sits above image).
  assert.match(
    src,
    /member-home-marketplace-reco-card[\s\S]{0,1600}h-24 w-24[\s\S]{0,160}sm:h-28 sm:w-28/
  );
  assert.match(src, /96px, 112px/);
});

test('marketplace reco card: title above image, Recommended below image, 2-line title clamp', () => {
  const src = memberHome();
  const cardIdx = src.indexOf('member-home-marketplace-reco-card');
  assert.ok(cardIdx >= 0);
  // Include preceding className (vertical flex-col card).
  const slice = src.slice(Math.max(0, cardIdx - 280), cardIdx + 2800);
  assert.match(slice, /flex flex-col/);
  // Title uses ~30ch max width and line-clamp-2 for truncation.
  assert.match(slice, /max-w-\[30ch\]/);
  assert.match(slice, /line-clamp-2/);
  assert.match(slice, /break-words/);
  const titleIdx = slice.search(/<strong[\s\S]{0,240}line-clamp-2/);
  const imageIdx = slice.search(/h-24 w-24/);
  const badgeIdx = slice.search(/>[\s\r\n]*Recommended[\s\r\n]*</);
  assert.ok(titleIdx >= 0 && imageIdx >= 0 && badgeIdx >= 0, 'title, image, badge present');
  assert.ok(titleIdx < imageIdx, 'title appears above image markup');
  assert.ok(imageIdx < badgeIdx, 'Recommended badge appears below image markup');
  // Badge is centered under the image.
  assert.match(slice, /items-center[\s\S]{0,400}Recommended/);
});

test('series highlight includes videoUrl and posterUrl for previews', () => {
  const src = memberHome();
  assert.match(src, /videoUrl:\s*looksLikeVideo \? videoCandidate/);
  assert.match(src, /posterUrl:\s*poster/);
  assert.match(src, /desktop-series:/);
});

test('discovery board supports series hover preview and single active preview', () => {
  const src = highlights();
  assert.match(src, /setActivePreviewToken|activePreviewToken/);
  assert.match(src, /280/);
  assert.match(src, /hoverPreview/);
  assert.match(src, /isSeriesPlaylistHighlight/);
  assert.match(src, /InlineAutoplayVideo/);
  assert.match(src, /member-home-module-thumb-large|member-home-series-preview-thumb/);
  // Muted loop preview; no native controls.
  assert.match(src, /muted/);
  assert.match(src, /loop/);
  assert.match(src, /controls=\{false\}|controls={false}/);
  assert.match(src, /handlePointerLeave|onMouseLeave/);
  assert.match(src, /onBlur=\{handlePointerLeave\}/);
  // Unmount cleanup clears timers and active token.
  assert.match(src, /clearTimeout|window\.clearTimeout/);
  assert.match(src, /previewListeners\.delete/);
});

test('module thumbs for listings use large media sizes', () => {
  const src = highlights();
  assert.match(src, /isMarketplaceOrListingHighlight/);
  assert.match(src, /h-24 w-24.*sm:h-28 sm:w-28|large \? \(compact \? 96 : 112\)/);
});

test('Open Coach uses SPA navigation, not full page reload', () => {
  const src = memberHome();
  assert.match(src, /openScrolithaFromMemberHome/);
  assert.match(src, /Open coach/);
  assert.doesNotMatch(src, /window\.location\.href\s*=\s*['"`].*coach/i);
  assert.doesNotMatch(src, /location\.assign\(/);
  // Coach action must still focus insights section without document navigation.
  assert.match(src, /openInsightsSection\('scrolitha-coach'/);
});

test('Open Coach action surface prevents default and uses type=button', () => {
  const src = highlights();
  assert.match(src, /member-home-open-coach-action/);
  assert.match(src, /type="button"/);
  assert.match(src, /event\.preventDefault\(\)/);
  assert.match(src, /Link\s+to=\{item\.href\}/);
});

test('Insights panel listens for open_section without hard navigation', () => {
  const src = insights();
  assert.match(src, /insights:open_section/);
  assert.match(src, /scrollIntoView/);
  assert.doesNotMatch(src, /window\.location\.href\s*=/);
});

test('Inline autoplay uses IntersectionObserver and muted playback defaults', () => {
  const video = read('src/components/media/InlineAutoplayVideo.tsx');
  assert.match(video, /IntersectionObserver/);
  assert.match(video, /defaultMuted = true/);
  assert.match(video, /preload/);
  assert.match(video, /playsInline/);
});

test('discovery card spacing is tightened (reduced whitespace)', () => {
  const src = highlights();
  assert.match(src, /gap-2\.5 sm:gap-3|gap-2 sm:gap-2\.5/);
  assert.match(src, /p-2\.5 shadow-sm.*sm:p-3|p-2\.5/);
});
