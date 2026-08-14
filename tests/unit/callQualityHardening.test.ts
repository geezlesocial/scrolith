import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CallQualityController,
  callQualityNotice,
  mergeCallQualityMetrics,
  summarizeRtcStats,
  type CallQualityMetrics
} from '../../src/messages/callQuality';
import {
  buildCallMediaFallbackConstraints,
  resolveAudioConstraints
} from '../../src/messages/callMediaConstraints';

const metrics = (overrides: Partial<CallQualityMetrics> = {}): CallQualityMetrics => ({
  packetsSent: 100,
  packetsReceived: 100,
  packetsLost: 0,
  packetLossRatio: 0,
  jitterMs: 10,
  roundTripTimeMs: 100,
  jitterBufferDelayMs: 0,
  concealmentRatio: 0,
  localAudioLevel: 0.1,
  remoteAudioLevel: 0.1,
  ...overrides
});

test('audio constraints retain supported speech processing and omit unsupported controls', () => {
  const resolved = resolveAudioConstraints({
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: false,
    channelCount: true,
    sampleRate: false,
    sampleSize: false,
    latency: true
  });
  assert.deepEqual(resolved.echoCancellation, { ideal: true });
  assert.deepEqual(resolved.noiseSuppression, { ideal: true });
  assert.equal(resolved.autoGainControl, undefined);
  assert.deepEqual(resolved.channelCount, { ideal: 1 });
  assert.deepEqual(resolved.latency, { ideal: 0.02 });
  assert.equal(resolved.sampleRate, undefined);
  assert.equal(resolved.sampleSize, undefined);
});

test('media fallback remains compatible with mobile microphone stacks', () => {
  const fallback = buildCallMediaFallbackConstraints(false);
  assert.deepEqual(fallback.audio, {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1
  });
  assert.equal(fallback.video, false);
});

test('quality controller requires stable samples and avoids flapping', () => {
  const controller = new CallQualityController();
  const degraded = metrics({ packetLossRatio: 0.04, jitterMs: 45 });
  assert.equal(controller.update(degraded).state, 'GOOD');
  assert.equal(controller.update(degraded).state, 'DEGRADED');
  assert.equal(controller.update(metrics()).state, 'DEGRADED');
  assert.equal(controller.update(metrics()).state, 'DEGRADED');
  assert.equal(controller.update(metrics()).state, 'RECOVERING');
  assert.equal(controller.update(metrics()).state, 'RECOVERING');
  assert.equal(controller.update(metrics()).state, 'RECOVERING');
  assert.equal(controller.update(metrics()).state, 'EXCELLENT');
});

test('RTC stats expose sanitized quality signals and selected candidate types', () => {
  const report = {
    forEach(callback: (stat: any) => void) {
      [
        { type: 'local-candidate', id: 'local-1', candidateType: 'relay', address: '192.0.2.1' },
        { type: 'remote-candidate', id: 'remote-1', candidateType: 'srflx', address: '198.51.100.2' },
        {
          type: 'candidate-pair',
          nominated: true,
          localCandidateId: 'local-1',
          remoteCandidateId: 'remote-1',
          currentRoundTripTime: 0.12,
          availableOutgoingBitrate: 640000
        },
        {
          type: 'inbound-rtp',
          kind: 'audio',
          packetsReceived: 95,
          packetsLost: 5,
          jitter: 0.02,
          concealedSamples: 4,
          jitterBufferEmittedCount: 100,
          audioLevel: 0.7
        },
        { type: 'codec', mimeType: 'audio/opus', sdpFmtpLine: 'minptime=10;useinbandfec=1' }
      ].forEach(callback);
    }
  };
  const result = summarizeRtcStats(report);
  assert.equal(result.selectedCandidateType, 'relay/srflx');
  assert.equal(result.codec, 'audio/opus');
  assert.equal(result.opusFec, true);
  assert.equal(result.packetLossRatio, 0.05);
  assert.equal('address' in result, false);
  assert.equal('ip' in result, false);
});

test('quality merge preserves worst stream and warns about acoustic feedback', () => {
  const merged = mergeCallQualityMetrics([
    metrics({ localAudioLevel: 0.7, remoteAudioLevel: 0.72 }),
    metrics({ packetsLost: 5, jitterMs: 45, selectedCandidateType: 'host/relay' })
  ]);
  assert.equal(merged.packetLossRatio, 5 / 205);
  assert.equal(merged.jitterMs, 45);
  assert.equal(merged.selectedCandidateType, 'host/relay');
  assert.match(
    callQualityNotice({ ...merged, state: 'DEGRADED', possibleAcousticFeedback: true }) || '',
    /speaker volume/i
  );
});
