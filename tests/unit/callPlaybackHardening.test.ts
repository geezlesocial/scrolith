import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('remote playback uses one audible sink and keeps video elements muted', () => {
  const modal = read('src/messages/VoiceCallModal.tsx');
  assert.ok(modal.includes('remoteAudioSinkRegistry'));
  assert.ok(modal.includes('data-call-audio-sink'));
  assert.ok(modal.includes('el.muted = Boolean(muted)'));
  assert.ok(modal.includes('stream={remoteEntries[0][1]}'));
  assert.ok(modal.includes('          muted'));
  assert.equal(modal.includes('muted={!speakerOn}'), false);
  assert.ok(modal.includes('el.volume = speakerOn ? 0.82 : 0'));
});

test('call quality monitor and recovery are bounded and sanitized', () => {
  const provider = read('src/messages/VoiceCallProvider.tsx');
  assert.ok(provider.includes('peer.getStats()'));
  assert.ok(provider.includes('setInterval(() => void sampleQuality(), 2500)'));
  assert.ok(provider.includes("emitVoiceLifecycleEvent('quality_changed'"));
  assert.ok(provider.includes('readSanitizedAudioSettings'));
  assert.ok(provider.includes("peer.oniceconnectionstatechange"));
  assert.ok(provider.includes('runtime.recoveryAttempt >= 3'));
  assert.ok(provider.includes("track.addEventListener('ended'"));
  assert.ok(provider.includes("devicechange"));
  assert.equal(provider.includes('approvalToken'), false);
});

test('global call shell forwards quality state to the shared modal', () => {
  const shell = read('src/messages/GlobalVoiceCallShell.tsx');
  assert.ok(shell.includes('qualityState'));
  assert.ok(shell.includes('qualityNotice'));
  assert.ok(shell.includes('qualityState={qualityState}'));
  assert.ok(shell.includes('qualityNotice={qualityNotice}'));
});
