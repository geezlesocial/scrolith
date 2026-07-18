import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCROLITHA_CAREER_PROMPTS,
  buildScrolithaCareerPath,
  careerQuickActions
} from '../../src/services/scrolithaCareer';

test('career continuity prompts remain complete', () => {
  const ids = SCROLITHA_CAREER_PROMPTS.map((p) => p.id);
  assert.ok(ids.includes('resume-summary'));
  assert.ok(ids.includes('resume-review'));
  assert.ok(ids.includes('cover-letter'));
  assert.ok(ids.includes('skill-gap'));
  assert.ok(ids.includes('interview-prep'));
  assert.ok(buildScrolithaCareerPath('cover-letter').includes('career'));
  assert.ok(careerQuickActions().length >= 5);
});
