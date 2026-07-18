import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const src = (...parts: string[]) => join(root, 'src', ...parts);

test('growth intelligence client and pulse card exist', () => {
  assert.equal(existsSync(src('services/growthIntelligence.ts')), true);
  assert.equal(existsSync(src('components/growth/GrowthPulseCard.tsx')), true);
  const service = readFileSync(src('services/growthIntelligence.ts'), 'utf8');
  assert.match(service, /growth-pulse/);
  assert.match(service, /GrowthIntelligenceService/);
});

test('Member Home and owner profile surface GrowthPulseCard', () => {
  const mh = readFileSync(src('components/sections/MemberHomeSection.tsx'), 'utf8');
  assert.match(mh, /GrowthPulseCard/);
  const profile = readFileSync(src('profile/FreelancerProfile.tsx'), 'utf8');
  assert.match(profile, /GrowthPulseCard/);
});

test('post options dual-write IFF for hide / not_interested / report', () => {
  const options = readFileSync(src('community/components/post-options/usePostOptions.tsx'), 'utf8');
  assert.match(options, /intelligenceFeedback/);
  assert.match(options, /not_interested/);
  assert.match(options, /action: 'hide'/);
  assert.match(options, /action: 'report'/);
});

test('PYMK supports dismiss feedback and IFF dual-write', () => {
  const pymk = readFileSync(src('components/discovery/PeopleYouMayKnowRail.tsx'), 'utf8');
  assert.match(pymk, /handleDismiss/);
  assert.match(pymk, /dismiss_recommendation/);
  assert.match(pymk, /Dismiss/);
});

test('creator analytics includes posting windows and growth plan CTA', () => {
  const card = readFileSync(src('components/insights/CreatorAnalyticsCard.tsx'), 'utf8');
  assert.match(card, /GrowthIntelligenceService/);
  assert.match(card, /creator-posting-tip/);
  assert.match(card, /intent=growth/);
});

test('Scrolitha career prompts include growth plan', () => {
  const career = readFileSync(src('services/scrolithaCareer.ts'), 'utf8');
  assert.match(career, /weekly-growth/);
  assert.match(career, /profile-optimize/);
});
