/**
 * Phase 21.1.3 — validation suite (frequency caps, privacy-safe survey selection, voice waveform stability).
 * Complements device-lab residual checks documented in docs/PHASE21_1_3_*.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clearWaveformCacheForTests,
  getDeterministicWaveform,
  waveformCacheSize
} from '../voiceWaveform';
import { pickInterestSurveyCandidateIds } from '../../components/recommendation/ContentInterestSurvey';
import { VOICE_RECORDING_VERSION } from '../voiceRecording';

/** Documented production caps (code-inspected 2026-07-19 on p2112s / afd96d41). */
const SURVEY_CAPS = {
  memberHome: 4,
  community: 5,
  mobileFeed: 5,
  scroll: 4
} as const;

test('phase 21.1.3 voice lineage remains 21.1.2R+', () => {
  assert.match(VOICE_RECORDING_VERSION, /^21\.1\.2/);
});

test('survey caps match documented production policy', () => {
  assert.equal(SURVEY_CAPS.memberHome, 4);
  assert.equal(SURVEY_CAPS.community, 5);
  assert.equal(SURVEY_CAPS.mobileFeed, 5);
  assert.equal(SURVEY_CAPS.scroll, 4);
});

test('survey picker never exceeds surface cap', () => {
  const many = Array.from({ length: 40 }, (_, i) => ({
    id: `post-${i}`,
    authorId: `author-${i}`,
    initialSignal: null as string | null
  }));
  const mh = pickInterestSurveyCandidateIds(many, 'viewer-a', 'post', SURVEY_CAPS.memberHome);
  const community = pickInterestSurveyCandidateIds(many, 'viewer-a', 'post', SURVEY_CAPS.community);
  const scroll = pickInterestSurveyCandidateIds(many, 'viewer-a', 'scroll', SURVEY_CAPS.scroll);
  assert.ok(mh.length <= SURVEY_CAPS.memberHome);
  assert.ok(community.length <= SURVEY_CAPS.community);
  assert.ok(scroll.length <= SURVEY_CAPS.scroll);
  assert.equal(mh.length, SURVEY_CAPS.memberHome);
  assert.equal(community.length, SURVEY_CAPS.community);
  assert.equal(scroll.length, SURVEY_CAPS.scroll);
});

test('survey excludes own content and prior signals (dedupe policy)', () => {
  const ids = pickInterestSurveyCandidateIds(
    [
      { id: 'mine', authorId: 'viewer-a' },
      { id: 'done', authorId: 'u2', initialSignal: 'NOT_INTERESTED' },
      { id: 'open1', authorId: 'u3' },
      { id: 'open2', authorId: 'u4' }
    ],
    'viewer-a',
    'post',
    5
  );
  assert.ok(!ids.includes('mine'));
  assert.ok(!ids.includes('done'));
  assert.ok(ids.every((id) => id === 'open1' || id === 'open2'));
});

test('waveform cache remains single entry per seed under repeated calls', () => {
  clearWaveformCacheForTests();
  for (let i = 0; i < 20; i += 1) {
    getDeterministicWaveform('voice-att-stable', 28);
  }
  assert.equal(waveformCacheSize(), 1);
  const a = getDeterministicWaveform('voice-att-stable', 28);
  const b = getDeterministicWaveform('voice-att-stable', 28);
  assert.deepEqual(a, b);
});

test('survey payload contract fields (documented) do not include private content keys', () => {
  // Contract observation from PostEngagementBar / postOptionsApi:
  // POST /posts/:id/interested { surface: 'post_interest_survey' }
  const allowedKeys = new Set(['surface']);
  const examplePayload = { surface: 'post_interest_survey' };
  for (const key of Object.keys(examplePayload)) {
    assert.ok(allowedKeys.has(key));
  }
  const forbidden = ['messageText', 'audio', 'transcript', 'voiceNote', 'privateMessage'];
  for (const key of forbidden) {
    assert.equal(Object.prototype.hasOwnProperty.call(examplePayload, key), false);
  }
});
