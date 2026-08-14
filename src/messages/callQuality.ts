export type CallQualityState = 'EXCELLENT' | 'GOOD' | 'DEGRADED' | 'POOR' | 'RECOVERING';

export type CallQualityMetrics = {
  packetsSent: number;
  packetsReceived: number;
  packetsLost: number;
  packetLossRatio: number;
  jitterMs: number;
  roundTripTimeMs: number;
  jitterBufferDelayMs: number;
  concealmentRatio: number;
  localAudioLevel: number;
  remoteAudioLevel: number;
  availableBitrate?: number;
  codec?: string;
  opusFec?: boolean;
  selectedCandidateType?: string;
};

export type CallQualitySnapshot = CallQualityMetrics & {
  state: CallQualityState;
  possibleAcousticFeedback: boolean;
};

const emptyMetrics = (): CallQualityMetrics => ({
  packetsSent: 0,
  packetsReceived: 0,
  packetsLost: 0,
  packetLossRatio: 0,
  jitterMs: 0,
  roundTripTimeMs: 0,
  jitterBufferDelayMs: 0,
  concealmentRatio: 0,
  localAudioLevel: 0,
  remoteAudioLevel: 0
});

const severity = (state: CallQualityState): number => {
  if (state === 'POOR') return 3;
  if (state === 'DEGRADED') return 2;
  if (state === 'RECOVERING') return 1;
  if (state === 'GOOD') return 0;
  return 0;
};

export const classifyCallQuality = (metrics: CallQualityMetrics): CallQualityState => {
  const loss = Number(metrics.packetLossRatio || 0);
  const jitter = Number(metrics.jitterMs || 0);
  const rtt = Number(metrics.roundTripTimeMs || 0);
  const concealment = Number(metrics.concealmentRatio || 0);
  if (loss >= 0.08 || jitter >= 80 || rtt >= 500 || concealment >= 0.2) return 'POOR';
  if (loss >= 0.03 || jitter >= 40 || rtt >= 300 || concealment >= 0.08) return 'DEGRADED';
  if (loss <= 0.01 && jitter <= 20 && rtt <= 150 && concealment <= 0.03) return 'EXCELLENT';
  return 'GOOD';
};

export class CallQualityController {
  private state: CallQualityState = 'GOOD';
  private pending: CallQualityState | null = null;
  private pendingSamples = 0;

  reset(): void {
    this.state = 'GOOD';
    this.pending = null;
    this.pendingSamples = 0;
  }

  update(metrics: CallQualityMetrics): CallQualitySnapshot {
    const target = classifyCallQuality(metrics);
    if (target === this.state) {
      this.pending = null;
      this.pendingSamples = 0;
    } else {
      if (this.pending === target) this.pendingSamples += 1;
      else {
        this.pending = target;
        this.pendingSamples = 1;
      }

      const worsening = severity(target) > severity(this.state);
      const requiredSamples = worsening ? 2 : 3;
      if (this.pendingSamples >= requiredSamples) {
        this.state = !worsening && severity(this.state) >= 2 ? 'RECOVERING' : target;
        this.pending = null;
        this.pendingSamples = 0;
      }
    }

    return {
      ...metrics,
      state: this.state,
      possibleAcousticFeedback: metrics.localAudioLevel >= 0.65 && metrics.remoteAudioLevel >= 0.65
    };
  }
}

export const summarizeRtcStats = (report: { forEach: (callback: (stat: any) => void) => void }): CallQualityMetrics => {
  const metrics = emptyMetrics();
  let concealedSamples = 0;
  let emittedSamples = 0;
  const candidateTypes = new Map<string, string>();
  let selectedLocalCandidateId = '';
  let selectedRemoteCandidateId = '';
  report.forEach((stat: any) => {
    const type = String(stat?.type || '').toLowerCase();
    const kind = String(stat?.kind || stat?.mediaType || '').toLowerCase();
    if (type === 'local-candidate' || type === 'remote-candidate') {
      const id = String(stat?.id || '').trim();
      const candidateType = String(stat?.candidateType || '').trim().toLowerCase();
      if (id && candidateType) candidateTypes.set(id, candidateType);
    }
    if (type === 'inbound-rtp' && kind === 'audio') {
      metrics.packetsReceived += Number(stat.packetsReceived || 0);
      metrics.packetsLost += Number(stat.packetsLost || 0);
      metrics.jitterMs = Math.max(metrics.jitterMs, Number(stat.jitter || 0) * 1000);
      metrics.remoteAudioLevel = Math.max(metrics.remoteAudioLevel, Number(stat.audioLevel || 0));
      metrics.jitterBufferDelayMs = Math.max(metrics.jitterBufferDelayMs, Number(stat.jitterBufferDelay || 0) * 1000);
      concealedSamples += Number(stat.concealedSamples || 0);
      emittedSamples += Number(stat.jitterBufferEmittedCount || 0);
    }
    if (type === 'outbound-rtp' && kind === 'audio') {
      metrics.packetsSent += Number(stat.packetsSent || 0);
      metrics.localAudioLevel = Math.max(metrics.localAudioLevel, Number(stat.audioLevel || 0));
    }
    if (type === 'candidate-pair' && (stat.nominated || stat.selected)) {
      metrics.roundTripTimeMs = Math.max(metrics.roundTripTimeMs, Number(stat.currentRoundTripTime || 0) * 1000);
      metrics.availableBitrate = Number(stat.availableOutgoingBitrate || stat.availableIncomingBitrate || 0) || undefined;
      selectedLocalCandidateId = String(stat.localCandidateId || '').trim();
      selectedRemoteCandidateId = String(stat.remoteCandidateId || '').trim();
    }
    if (type === 'codec' && String(stat.mimeType || '').toLowerCase() === 'audio/opus') {
      metrics.codec = 'audio/opus';
      metrics.opusFec = /(?:^|;)\s*useinbandfec=1(?:;|$)/i.test(String(stat.sdpFmtpLine || ''));
    }
    if (type === 'remote-inbound-rtp' && kind === 'audio') {
      metrics.roundTripTimeMs = Math.max(metrics.roundTripTimeMs, Number(stat.roundTripTime || 0) * 1000);
    }
  });
  const totalPackets = metrics.packetsReceived + metrics.packetsLost;
  metrics.packetLossRatio = totalPackets > 0 ? metrics.packetsLost / totalPackets : 0;
  metrics.concealmentRatio = concealedSamples + emittedSamples > 0
    ? concealedSamples / (concealedSamples + emittedSamples)
    : 0;
  const localType = candidateTypes.get(selectedLocalCandidateId);
  const remoteType = candidateTypes.get(selectedRemoteCandidateId);
  if (localType || remoteType) {
    metrics.selectedCandidateType = `${localType || 'unknown'}/${remoteType || 'unknown'}`;
  }
  return metrics;
};

export const mergeCallQualityMetrics = (samples: CallQualityMetrics[]): CallQualityMetrics => {
  if (!samples.length) return emptyMetrics();
  const merged = emptyMetrics();
  let concealedWeight = 0;
  let emittedWeight = 0;
  for (const sample of samples) {
    merged.packetsSent += sample.packetsSent;
    merged.packetsReceived += sample.packetsReceived;
    merged.packetsLost += sample.packetsLost;
    merged.jitterMs = Math.max(merged.jitterMs, sample.jitterMs);
    merged.roundTripTimeMs = Math.max(merged.roundTripTimeMs, sample.roundTripTimeMs);
    merged.jitterBufferDelayMs = Math.max(merged.jitterBufferDelayMs, sample.jitterBufferDelayMs);
    merged.localAudioLevel = Math.max(merged.localAudioLevel, sample.localAudioLevel);
    merged.remoteAudioLevel = Math.max(merged.remoteAudioLevel, sample.remoteAudioLevel);
    merged.availableBitrate = Math.min(
      merged.availableBitrate || Number.POSITIVE_INFINITY,
      sample.availableBitrate || Number.POSITIVE_INFINITY
    );
    merged.codec ||= sample.codec;
    merged.opusFec = merged.opusFec || sample.opusFec;
    merged.selectedCandidateType ||= sample.selectedCandidateType;
    // The controller consumes a ratio; preserve the worst observed stream.
    merged.concealmentRatio = Math.max(merged.concealmentRatio, sample.concealmentRatio);
    concealedWeight += sample.concealmentRatio;
    emittedWeight += 1;
  }
  const totalPackets = merged.packetsReceived + merged.packetsLost;
  merged.packetLossRatio = totalPackets > 0 ? merged.packetsLost / totalPackets : 0;
  if (!merged.concealmentRatio && emittedWeight) merged.concealmentRatio = concealedWeight / emittedWeight;
  if (!Number.isFinite(merged.availableBitrate)) merged.availableBitrate = undefined;
  return merged;
};

export const callQualityNotice = (snapshot: CallQualitySnapshot): string | null => {
  if (snapshot.possibleAcousticFeedback) {
    return 'High speaker volume may cause echo. Lower the volume or use headphones.';
  }
  if (snapshot.state === 'POOR') return 'Connection is unstable. Audio is being prioritized.';
  if (snapshot.state === 'DEGRADED') return 'Audio quality is adapting to the network.';
  if (snapshot.state === 'RECOVERING') return 'Audio quality is recovering.';
  return null;
};
