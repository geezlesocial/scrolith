import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildScrolithaCareerPath,
  careerQuickActions,
  SCROLITHA_CAREER_PROMPTS
} from '../../src/services/scrolithaCareer';

test('scrolitha career prompts cover resume marketplace groups blogs', () => {
  assert.ok(SCROLITHA_CAREER_PROMPTS.length >= 5);
  const labels = SCROLITHA_CAREER_PROMPTS.map((p) => p.label.toLowerCase()).join(' ');
  assert.ok(labels.includes('resume'));
  assert.ok(buildScrolithaCareerPath('resume-review').includes('intent=career'));
  const actions = careerQuickActions();
  assert.ok(actions.some((a) => a.path.includes('resume-builder')));
  assert.ok(actions.some((a) => a.path.includes('marketplace')));
  assert.ok(actions.some((a) => a.path.includes('clubs') || a.path.includes('blog')));
});

test('career quick actions expose resume reviewer and scrolitha', () => {
  const actions = careerQuickActions();
  assert.ok(actions.some((a) => a.id === 'resume-reviewer'));
  assert.ok(actions.some((a) => a.id === 'scrolitha-career'));
});
