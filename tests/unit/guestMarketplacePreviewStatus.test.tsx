import React from 'react';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import GuestMarketplacePreviewStatus from '../../src/components/sections/GuestMarketplacePreviewStatus';

const showcaseSource = readFileSync(
  fileURLToPath(new URL('../../src/components/sections/GuestSections.tsx', import.meta.url)),
  'utf8'
);

const renderStatus = (error: boolean) => renderToStaticMarkup(
  <MemoryRouter>
    <GuestMarketplacePreviewStatus error={error} onRetry={() => undefined} />
  </MemoryRouter>
);

test('marketplace API failure is presented as unavailable, not as a successful empty result', () => {
  const markup = renderStatus(true);
  assert.match(markup, /Marketplace preview is temporarily unavailable/);
  assert.match(markup, /Retry preview/);
  assert.doesNotMatch(markup, /No live marketplace listings available/);
  assert.doesNotMatch(markup, /production listings/);
});

test('successful empty marketplace response keeps the truthful empty state without sample data', () => {
  const markup = renderStatus(false);
  assert.match(markup, /No live marketplace listings available right now/);
  assert.match(markup, /We never show placeholder listings/);
  assert.match(markup, /Create free account/);
  assert.doesNotMatch(markup, /Retry preview|production listings/);
  assert.match(markup, /min-h-\[12rem\]/);
});

test('marketplace request failures stay distinct, retain fallback attempts, and retry resets loading', () => {
  assert.match(showcaseSource, /sort: 'recommended'[\s\S]*?catch \{\s*requestFailed = true;\s*\}/);
  assert.match(showcaseSource, /sort: 'popular'/);
  assert.match(showcaseSource, /fetchGuestJson\("\/homepage\/guest"\)/);
  assert.match(showcaseSource, /requestFailed && previewItems\.length === 0/);
  assert.match(showcaseSource, /setMarketplacePreview\(\{ loading: false, loaded: true, gigs: \[\], error: true \}\)/);
  assert.match(showcaseSource, /error=\{marketplacePreview\.error\}/);
  assert.match(showcaseSource, /loaded: false, gigs: \[\], error: false/);
  assert.match(showcaseSource, /min-h-\[13rem\][\s\S]*?sm:min-h-\[16rem\]/);
});
