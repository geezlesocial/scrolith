/**
 * Phase 21.1.2S — voice waveform stability + interest survey candidate policy.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  clearWaveformCacheForTests,
  getDeterministicWaveform,
  waveformCacheSize
} from '../voiceWaveform';
import {
  pickInterestSurveyCandidateIds,
  pickInterestSurveyCandidateId
} from '../../components/recommendation/ContentInterestSurvey';

test('waveform is deterministic for the same seed', () => {
  clearWaveformCacheForTests();
  const a = getDeterministicWaveform('att-voice-1', 28);
  const b = getDeterministicWaveform('att-voice-1', 28);
  assert.equal(a.length, 28);
  assert.deepEqual(a, b);
  assert.ok(a.every((h) => h >= 0.28 && h <= 1));
});

test('waveform differs across seeds', () => {
  clearWaveformCacheForTests();
  const a = getDeterministicWaveform('seed-a', 28);
  const b = getDeterministicWaveform('seed-b', 28);
  assert.notDeepEqual(a, b);
});

test('waveform is cached (no regeneration)', () => {
  clearWaveformCacheForTests();
  getDeterministicWaveform('cache-me', 28);
  getDeterministicWaveform('cache-me', 28);
  assert.equal(waveformCacheSize(), 1);
});

test('interest survey skips own posts and prior signals', () => {
  const ids = pickInterestSurveyCandidateIds(
    [
      { id: 'p1', authorId: 'me', initialSignal: null },
      { id: 'p2', authorId: 'other', initialSignal: 'INTERESTED' },
      { id: 'p3', authorId: 'other', initialSignal: null },
      { id: 'p4', authorId: 'other2', initialSignal: null }
    ],
    'me',
    'post',
    4
  );
  assert.ok(!ids.includes('p1'));
  assert.ok(!ids.includes('p2'));
  assert.ok(ids.includes('p3') || ids.includes('p4'));
  assert.ok(ids.length <= 4);
});

test('interest survey returns empty without viewer', () => {
  assert.deepEqual(
    pickInterestSurveyCandidateIds([{ id: 'p1', authorId: 'x' }], null, 'post', 4),
    []
  );
  assert.equal(pickInterestSurveyCandidateId([{ id: 'p1' }], ''), null);
});

test('interest survey is stable for the same viewer/session hash ranking', () => {
  const items = [
    { id: 'a', authorId: 'u1' },
    { id: 'b', authorId: 'u2' },
    { id: 'c', authorId: 'u3' },
    { id: 'd', authorId: 'u4' }
  ];
  const first = pickInterestSurveyCandidateIds(items, 'viewer-9', 'post', 2);
  const second = pickInterestSurveyCandidateIds(items, 'viewer-9', 'post', 2);
  assert.deepEqual(first, second);
});
