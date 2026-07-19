/**
 * Phase 21.1.2 — voice recording helpers + avatar safety regression tests.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createVoiceFile,
  extensionForAudioMime,
  formatVoiceDuration,
  isUsableVoiceBlob,
  mapMicrophoneError,
  pickSupportedAudioMimeType,
  VOICE_RECORDING_VERSION
} from '../voiceRecording';
import {
  SafeAvatarColor,
  SafeAvatarInitials,
  SafeAvatarName,
  SafeText
} from '../safeRender';

test('VOICE_RECORDING_VERSION is 21.1.2R lineage', () => {
  assert.match(VOICE_RECORDING_VERSION, /^21\.1\.2/);
});

test('extensionForAudioMime maps common types', () => {
  assert.equal(extensionForAudioMime('audio/webm;codecs=opus'), 'webm');
  assert.equal(extensionForAudioMime('audio/ogg'), 'ogg');
  assert.equal(extensionForAudioMime('audio/mp4'), 'm4a');
  assert.equal(extensionForAudioMime('audio/mpeg'), 'mp3');
  assert.equal(extensionForAudioMime(''), 'webm');
});

test('formatVoiceDuration pads seconds', () => {
  assert.equal(formatVoiceDuration(0), '0:00');
  assert.equal(formatVoiceDuration(1500), '0:01');
  assert.equal(formatVoiceDuration(65_000), '1:05');
  assert.equal(formatVoiceDuration(600_000), '10:00');
});

test('isUsableVoiceBlob rejects empty/short blobs', () => {
  assert.equal(isUsableVoiceBlob(null), false);
  assert.equal(isUsableVoiceBlob(undefined), false);
  assert.equal(isUsableVoiceBlob(new Blob([new Uint8Array(10)]), 256), false);
  assert.equal(isUsableVoiceBlob(new Blob([new Uint8Array(300)]), 256), true);
});

test('createVoiceFile produces named File with mime', () => {
  const blob = new Blob([new Uint8Array(400)], { type: 'audio/webm' });
  const file = createVoiceFile(blob, 'audio/webm');
  assert.ok(file.name.startsWith('voice-note-'));
  assert.ok(file.name.endsWith('.webm'));
  assert.equal(file.type, 'audio/webm');
  assert.ok(file.size >= 400);
});

test('mapMicrophoneError explains permission denial', () => {
  const msg = mapMicrophoneError({ name: 'NotAllowedError' });
  assert.match(msg, /permission|microphone/i);
  const notFound = mapMicrophoneError({ name: 'NotFoundError' });
  assert.match(notFound, /microphone|found/i);
  const secure = mapMicrophoneError({ name: 'SecurityError', message: 'secure context required' });
  assert.match(secure, /secure|HTTPS/i);
});

test('pickSupportedAudioMimeType returns string (empty if MediaRecorder missing)', () => {
  const mime = pickSupportedAudioMimeType();
  assert.equal(typeof mime, 'string');
});

test('SafeAvatarInitials from name parts', () => {
  assert.equal(SafeAvatarInitials('Jane Doe'), 'JD');
  assert.equal(SafeAvatarInitials({ firstName: 'Ada', lastName: 'Lovelace' }), 'AL');
  assert.equal(SafeAvatarInitials({ displayName: 'Scrolith Member' }), 'SM');
  assert.equal(SafeAvatarInitials({ username: 'builder99' }), 'BU');
  assert.ok(SafeAvatarInitials(null, 'M').length >= 1);
});

test('SafeAvatarName prefers display fields', () => {
  assert.equal(SafeAvatarName({ name: 'Alex' }, 'Member'), 'Alex');
  assert.equal(SafeAvatarName({ displayName: 'Taylor' }, 'Member'), 'Taylor');
  assert.ok(SafeText(SafeAvatarName(null, 'Member')).length > 0);
});

test('SafeAvatarColor is deterministic and accessible pair', () => {
  const a = SafeAvatarColor('user-123');
  const b = SafeAvatarColor('user-123');
  const c = SafeAvatarColor('user-999');
  assert.equal(a.bg, b.bg);
  assert.equal(a.fg, b.fg);
  assert.ok(a.bg);
  assert.ok(a.fg);
  // Different seeds usually differ (not guaranteed for all pairs, but these should).
  assert.notEqual(a.bg + a.fg, c.bg + c.fg);
});
