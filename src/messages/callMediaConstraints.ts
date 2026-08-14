/**
 * WebRTC media constraints for voice + video.
 *
 * Speech processing is expressed as an ideal profile so browsers can
 * gracefully fall back when a device does not expose every capability.
 */

export type VideoQualityPreset = 'low' | 'medium' | 'high';

export const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: { ideal: true },
  noiseSuppression: { ideal: true },
  autoGainControl: { ideal: true },
  channelCount: { ideal: 1 },
  sampleRate: { ideal: 48000 },
  sampleSize: { ideal: 16 }
};

const AUDIO_CAPABILITY_KEYS: Array<keyof MediaTrackSupportedConstraints> = [
  'echoCancellation',
  'noiseSuppression',
  'autoGainControl',
  'channelCount',
  'sampleRate',
  'sampleSize',
  'latency'
];

/** Return only optional audio controls advertised by this browser/device. */
export const resolveAudioConstraints = (
  supported?: MediaTrackSupportedConstraints | null
): MediaTrackConstraints => {
  const advertised =
    supported ||
    (typeof navigator !== 'undefined' && navigator.mediaDevices?.getSupportedConstraints
      ? navigator.mediaDevices.getSupportedConstraints()
      : null);
  if (!advertised) return { ...AUDIO_CONSTRAINTS };

  const resolved: MediaTrackConstraints = {};
  for (const key of AUDIO_CAPABILITY_KEYS) {
    if (advertised[key] !== true) continue;
    const value = AUDIO_CONSTRAINTS[key as keyof MediaTrackConstraints];
    if (value !== undefined) {
      (resolved as any)[key] = value;
    }
  }
  if (advertised.latency === true) {
    (resolved as any).latency = { ideal: 0.02 };
  }
  return resolved;
};

export type SanitizedAudioSettings = {
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  channelCount?: number;
  sampleRate?: number;
  sampleSize?: number;
  latency?: number;
};

export type SanitizedAudioCapabilities = {
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
  channelCount?: { min?: number; max?: number };
  sampleRate?: { min?: number; max?: number };
};

/** Read only bounded audio capability metadata; never return device identifiers. */
export const readSanitizedAudioCapabilities = (
  track: MediaStreamTrack | null | undefined
): SanitizedAudioCapabilities => {
  if (!track || typeof track.getCapabilities !== 'function') return {};
  const capabilities = track.getCapabilities() as MediaTrackCapabilities;
  const result: SanitizedAudioCapabilities = {};
  for (const key of ['echoCancellation', 'noiseSuppression', 'autoGainControl'] as const) {
    const value = (capabilities as any)[key];
    if (typeof value === 'boolean') result[key] = value;
  }
  for (const key of ['channelCount', 'sampleRate'] as const) {
    const value = (capabilities as any)[key];
    if (!value || typeof value !== 'object') continue;
    const min = Number(value.min);
    const max = Number(value.max);
    const range: { min?: number; max?: number } = {};
    if (Number.isFinite(min)) range.min = min;
    if (Number.isFinite(max)) range.max = max;
    if (Object.keys(range).length) result[key] = range;
  }
  return result;
};

/** Read processing settings without exposing device IDs or private metadata. */
export const readSanitizedAudioSettings = (
  track: MediaStreamTrack | null | undefined
): SanitizedAudioSettings => {
  if (!track || typeof track.getSettings !== 'function') return {};
  const settings = track.getSettings() as MediaTrackSettings;
  const result: SanitizedAudioSettings = {};
  for (const key of [
    'echoCancellation',
    'noiseSuppression',
    'autoGainControl',
    'channelCount',
    'sampleRate',
    'sampleSize',
    'latency'
  ] as const) {
    const value = (settings as any)[key];
    if (typeof value === 'boolean' || typeof value === 'number') {
      (result as any)[key] = value;
    }
  }
  return result;
};

/** Prefer Opus through the standards API, retaining every browser fallback codec. */
export const preferOpusAudioCodecs = (peer: RTCPeerConnection): boolean => {
  try {
    if (typeof RTCRtpSender === 'undefined') return false;
    const capabilities = RTCRtpSender.getCapabilities?.('audio');
    const codecs = capabilities?.codecs || [];
    const opus = codecs.filter((codec) => String(codec.mimeType || '').toLowerCase() === 'audio/opus');
    if (!opus.length) return false;
    const rest = codecs.filter((codec) => !opus.includes(codec));
    peer
      .getTransceivers()
      .filter((transceiver) => transceiver.sender?.track?.kind === 'audio')
      .forEach((transceiver) => {
        try {
          transceiver.setCodecPreferences?.([...opus, ...rest]);
        } catch {
          // Codec preference is an enhancement; negotiation remains compatible.
        }
      });
    return true;
  } catch {
    return false;
  }
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
  audio: resolveAudioConstraints(),
  video: resolveVideoConstraints({
    enabled: Boolean(options?.video),
    quality: options?.quality || 'medium',
    facingMode: options?.facingMode || 'user'
  })
});

export const buildCallMediaFallbackConstraints = (wantVideo = false): MediaStreamConstraints => ({
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: 1
  },
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
