/**
 * Phase 21.1.2R — avatar source integrity + precise voice permission classification.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyMicrophoneError,
  extensionForAudioMime,
  isUsableVoiceBlob,
  mapMicrophoneError,
  VOICE_RECORDING_VERSION
} from '../voiceRecording';
import {
  isUsablePhotoCandidate,
  resolveProfilePhotoCandidates,
  resolveProfilePhotoCandidate
} from '../profilePhoto';

test('VOICE_RECORDING_VERSION is 21.1.2R', () => {
  assert.equal(VOICE_RECORDING_VERSION, '21.1.2R');
});

test('isUsablePhotoCandidate rejects invalid values', () => {
  assert.equal(isUsablePhotoCandidate(null), false);
  assert.equal(isUsablePhotoCandidate(undefined), false);
  assert.equal(isUsablePhotoCandidate(''), false);
  assert.equal(isUsablePhotoCandidate('null'), false);
  assert.equal(isUsablePhotoCandidate('[object Object]'), false);
  assert.equal(isUsablePhotoCandidate({}), false);
  assert.equal(isUsablePhotoCandidate([]), false);
  assert.equal(isUsablePhotoCandidate('https://cdn.example.com/a.jpg'), true);
  assert.equal(isUsablePhotoCandidate('/uploads/avatar.png'), true);
});

test('resolveProfilePhotoCandidates prefers real photo fields', () => {
  const candidates = resolveProfilePhotoCandidates({
    user: {
      id: 'u1',
      name: 'Ada Lovelace',
      avatarUrl: 'https://cdn.example.com/ada.jpg',
      username: 'ada'
    }
  });
  assert.ok(candidates.length >= 1);
  assert.match(candidates[0], /ada\.jpg|cdn\.example/);
});

test('resolveProfilePhotoCandidate empty when no photo', () => {
  assert.equal(
    resolveProfilePhotoCandidate({ user: { id: 'x', name: 'No Photo User' } }),
    ''
  );
});

test('resolveProfilePhotoCandidates does not invent photos from name', () => {
  const candidates = resolveProfilePhotoCandidates({
    user: { displayName: 'Only Name', username: 'only' }
  });
  assert.equal(candidates.length, 0);
});

test('classifyMicrophoneError does not map every error to permission blocked', () => {
  const busy = classifyMicrophoneError({ name: 'NotReadableError', message: 'Could not start audio source' });
  assert.equal(busy.category, 'microphone_busy');
  assert.doesNotMatch(busy.message, /permission is blocked/i);

  const notFound = classifyMicrophoneError({ name: 'NotFoundError' });
  assert.equal(notFound.category, 'no_microphone');

  const denied = classifyMicrophoneError({ name: 'NotAllowedError' });
  assert.equal(denied.category, 'permission_denied');
  assert.match(denied.message, /blocked|settings|Retry/i);

  const over = classifyMicrophoneError({ name: 'OverconstrainedError' });
  assert.equal(over.category, 'overconstrained');

  const generic = classifyMicrophoneError({ name: 'TypeError', message: 'Failed unexpectedly' });
  assert.equal(generic.category, 'unknown');
  assert.doesNotMatch(generic.message, /permission is blocked/i);
});

test('mapMicrophoneError remains string-compatible', () => {
  assert.equal(typeof mapMicrophoneError({ name: 'NotFoundError' }), 'string');
});

test('isUsableVoiceBlob accepts small valid blobs', () => {
  assert.equal(isUsableVoiceBlob(new Blob([new Uint8Array(40)]), { minBytes: 32 }), true);
  assert.equal(isUsableVoiceBlob(new Blob([new Uint8Array(10)]), { minBytes: 32 }), false);
  assert.equal(
    isUsableVoiceBlob(new Blob([new Uint8Array(100)]), { minBytes: 32, minDurationMs: 350, durationMs: 100 }),
    false
  );
  assert.equal(
    isUsableVoiceBlob(new Blob([new Uint8Array(100)]), { minBytes: 32, minDurationMs: 350, durationMs: 800 }),
    true
  );
});

test('extensionForAudioMime stays consistent', () => {
  assert.equal(extensionForAudioMime('audio/webm;codecs=opus'), 'webm');
  assert.equal(extensionForAudioMime('audio/mp4'), 'm4a');
  assert.equal(extensionForAudioMime('audio/ogg'), 'ogg');
});
