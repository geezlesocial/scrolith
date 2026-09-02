import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const source = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), 'utf8');

test('hiring recommendation is loaded asynchronously and mounted only by the signed-in home shell', () => {
  const app = source('src/App.tsx');
  const slot = source('src/components/hiring/HiringRecommendationSlot.tsx');
  assert.match(app, /const HiringRecommendationSlot = React\.lazy/);
  assert.match(app, /<HiringRecommendationSlot \/>/);
  assert.match(slot, /MEMBER_HOME_PATHS/);
  assert.match(slot, /HiringRecommendationsService\.get\(accountType\)/);
});

test('recommendation CTA routes through the existing profile activation views', () => {
  const slot = source('src/components/hiring/HiringRecommendationSlot.tsx');
  assert.match(slot, /freelancer\/dashboard\?tab=profile&as=freelancer/);
  assert.match(slot, /freelancer\/dashboard\?tab=profile&as=employer/);
});

test('recommendation actions use the new user-scoped API and never activate status directly', () => {
  const service = source('src/services/hiringRecommendations.ts');
  assert.match(service, /recommendations\/hiring\/impression/);
  assert.match(service, /recommendations\/hiring\/dismiss/);
  assert.match(service, /recommendations\/hiring\/click/);
  assert.doesNotMatch(service, /updateMyAvailability|updateMyClientHiringStatus/);
});
