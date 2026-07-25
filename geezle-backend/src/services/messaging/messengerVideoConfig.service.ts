/**
 * Enterprise video calling platform flags (Phase 1).
 *
 * No Prisma migration: flags come from environment with safe defaults,
 * merged into MessengerVoice runtime config responses.
 * VoiceCall.metadata.mediaMode stores per-call media kind (audio|video).
 */

export type VideoQualityPreset = 'low' | 'medium' | 'high';

export type MessengerVideoPlatformFlags = {
  enabledVideoCalls: boolean;
  enabledScreenSharing: boolean;
  maxVideoParticipants: number;
  defaultVideoQuality: VideoQualityPreset;
  maxResolution: string;
  maxFrameRate: number;
  /** Policy string for future recording product; enforced client+server later. */
  cameraRecordingPolicy: 'disabled' | 'consent_required' | 'allowed';
  /** Soft bandwidth guidance for clients (kbps, 0 = unlimited guidance). */
  maxBitrateKbps: number;
  /** Future-ready: background effects allowed (architecture only). */
  allowVirtualBackground: boolean;
};

const isTruthy = (raw: string | undefined | null) =>
  ['1', 'true', 'yes', 'on'].includes(String(raw || '').trim().toLowerCase());

const isFalsey = (raw: string | undefined | null) =>
  ['0', 'false', 'no', 'off'].includes(String(raw || '').trim().toLowerCase());

const parseBoolEnv = (name: string, fallback: boolean): boolean => {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
  if (isTruthy(raw)) return true;
  if (isFalsey(raw)) return false;
  return fallback;
};

const parseIntEnv = (name: string, fallback: number, min: number, max: number): number => {
  const n = Number(process.env[name]);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
};

const parseQuality = (raw: string | undefined): VideoQualityPreset => {
  const v = String(raw || '')
    .trim()
    .toLowerCase();
  if (v === 'low' || v === 'medium' || v === 'high') return v;
  return 'medium';
};

const parseRecordingPolicy = (
  raw: string | undefined
): MessengerVideoPlatformFlags['cameraRecordingPolicy'] => {
  const v = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (v === 'allowed' || v === 'enable' || v === 'enabled') return 'allowed';
  if (v === 'consent_required' || v === 'consent') return 'consent_required';
  return 'disabled';
};

/** Defaults: video ON for candidate labs; production can set VOICE_ENABLED_VIDEO_CALLS=false. */
export const getMessengerVideoPlatformFlags = (): MessengerVideoPlatformFlags => {
  return {
    enabledVideoCalls: parseBoolEnv('VOICE_ENABLED_VIDEO_CALLS', true),
    enabledScreenSharing: parseBoolEnv('VOICE_ENABLED_SCREEN_SHARING', true),
    maxVideoParticipants: parseIntEnv('VOICE_MAX_VIDEO_PARTICIPANTS', 6, 2, 12),
    defaultVideoQuality: parseQuality(process.env.VOICE_DEFAULT_VIDEO_QUALITY),
    maxResolution: String(process.env.VOICE_MAX_VIDEO_RESOLUTION || '1280x720').trim() || '1280x720',
    maxFrameRate: parseIntEnv('VOICE_MAX_VIDEO_FRAME_RATE', 30, 8, 60),
    cameraRecordingPolicy: parseRecordingPolicy(process.env.VOICE_CAMERA_RECORDING_POLICY),
    maxBitrateKbps: parseIntEnv('VOICE_MAX_VIDEO_BITRATE_KBPS', 0, 0, 20000),
    allowVirtualBackground: parseBoolEnv('VOICE_ALLOW_VIRTUAL_BACKGROUND', false)
  };
};

export const normalizeMediaMode = (raw: unknown): 'audio' | 'video' => {
  const v = String(raw || '')
    .trim()
    .toLowerCase();
  if (v === 'video' || v === 'av' || v === 'audio_video' || v === 'audiovideo') return 'video';
  return 'audio';
};

/** Client-safe subset for runtime config (no secrets). */
export const getMessengerVideoClientPayload = () => {
  const flags = getMessengerVideoPlatformFlags();
  return {
    enabledVideoCalls: flags.enabledVideoCalls,
    enabledScreenSharing: flags.enabledScreenSharing,
    maxVideoParticipants: flags.maxVideoParticipants,
    defaultVideoQuality: flags.defaultVideoQuality,
    maxResolution: flags.maxResolution,
    maxFrameRate: flags.maxFrameRate,
    cameraRecordingPolicy: flags.cameraRecordingPolicy,
    maxBitrateKbps: flags.maxBitrateKbps,
    allowVirtualBackground: flags.allowVirtualBackground,
    /** Architecture flag — effects pipeline not enabled in Phase 1. */
    virtualBackgroundReady: false,
    backgroundBlurReady: false,
    /** Mesh topology Phase 1; SFU reserved. */
    mediaTopology: 'mesh' as const,
    sfuReady: false
  };
};
