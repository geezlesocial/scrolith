/**
 * WebRTC media constraints for voice + Phase 1 video.
 * Adaptive presets prepare for bandwidth estimation without SFU.
 */

export type VideoQualityPreset = 'low' | 'medium' | 'high';

export const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: { ideal: true },
  noiseSuppression: { ideal: true },
  autoGainControl: { ideal: true },
  channelCount: { ideal: 1, max: 1 },
  sampleRate: { ideal: 48000 },
  sampleSize: { ideal: 16 }
};

const QUALITY_MAP: Record<
  VideoQualityPreset,
  { width: number; height: number; frameRate: number }
> = {
  low: { width: 640, height: 360, frameRate: 15 },
  medium: { width: 960, height: 540, frameRate: 24 },
  high: { width: 1280, height: 720, frameRate: 24 }
};

export const resolveVideoConstraints = (options?: {
  quality?: VideoQualityPreset;
  facingMode?: 'user' | 'environment';
  enabled?: boolean;
}): boolean | MediaTrackConstraints => {
  if (options?.enabled === false) return false;
  const preset = QUALITY_MAP[options?.quality || 'medium'] || QUALITY_MAP.medium;
  return {
    facingMode: options?.facingMode || 'user',
    width: { ideal: preset.width, max: preset.width },
    height: { ideal: preset.height, max: preset.height },
    frameRate: { ideal: preset.frameRate, max: preset.frameRate },
    aspectRatio: { ideal: 16 / 9 }
  };
};

export const buildCallMediaConstraints = (options?: {
  video?: boolean;
  quality?: VideoQualityPreset;
  facingMode?: 'user' | 'environment';
}): MediaStreamConstraints => ({
  audio: AUDIO_CONSTRAINTS,
  video: resolveVideoConstraints({
    enabled: Boolean(options?.video),
    quality: options?.quality || 'medium',
    facingMode: options?.facingMode || 'user'
  })
});

export const buildCallMediaFallbackConstraints = (wantVideo = false): MediaStreamConstraints => ({
  audio: AUDIO_CONSTRAINTS,
  video: wantVideo ? resolveVideoConstraints({ enabled: true, quality: 'low', facingMode: 'user' }) : false
});

/** Apply sender-side bitrate cap when platform maxBitrateKbps > 0. */
export const applySenderBitrateCap = (
  peer: RTCPeerConnection,
  maxBitrateKbps: number
): void => {
  if (!maxBitrateKbps || maxBitrateKbps <= 0) return;
  const maxBps = Math.trunc(maxBitrateKbps * 1000);
  peer.getSenders().forEach((sender) => {
    if (sender.track?.kind !== 'video') return;
    try {
      const params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) {
        params.encodings = [{}];
      }
      params.encodings = params.encodings.map((enc) => ({
        ...enc,
        maxBitrate: maxBps
      }));
      void sender.setParameters(params);
    } catch {
      // Browser may reject mid-call parameter changes.
    }
  });
};

export const streamHasLiveVideo = (stream: MediaStream | null | undefined): boolean => {
  if (!stream) return false;
  return stream.getVideoTracks().some((track) => track.readyState === 'live' && track.enabled);
};
