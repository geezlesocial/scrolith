import { Camera } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

type LiveMediaResult = {
  stream: MediaStream;
  audioLimited: boolean;
};

let primedLiveMedia: LiveMediaResult | null = null;

const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: 'user',
  width: { ideal: 1280 },
  height: { ideal: 720 }
};

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true
};

const toLower = (value: any) => String(value || '').trim().toLowerCase();

const isPermissionLikeError = (error: any) => {
  const name = toLower(error?.name);
  const message = toLower(error?.message);
  return (
    name.includes('notallowed') ||
    name.includes('permission') ||
    message.includes('not allowed') ||
    message.includes('permission') ||
    message.includes('denied')
  );
};

const ensureNativeCameraPermission = async () => {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const current = await Camera.checkPermissions();
    const cameraState = toLower((current as any)?.camera);
    if (cameraState === 'granted' || cameraState === 'limited') return;

    const requested = await Camera.requestPermissions({ permissions: ['camera'] as any });
    const nextState = toLower((requested as any)?.camera);
    if (nextState !== 'granted' && nextState !== 'limited') {
      const denied = new Error('Camera permission was denied by Android.');
      (denied as any).name = 'NotAllowedError';
      throw denied;
    }
  } catch (error: any) {
    if (isPermissionLikeError(error)) throw error;
  }
};

export const stopStreamTracks = (stream: MediaStream | null | undefined) => {
  if (!stream) return;
  stream.getTracks().forEach((track) => track.stop());
};

export const primeLiveMediaStream = (result: LiveMediaResult | null | undefined) => {
  if (primedLiveMedia?.stream && primedLiveMedia.stream !== result?.stream) {
    stopStreamTracks(primedLiveMedia.stream);
  }
  primedLiveMedia = result
    ? {
        stream: result.stream,
        audioLimited: Boolean(result.audioLimited)
      }
    : null;
};

export const consumePrimedLiveMediaStream = (): LiveMediaResult | null => {
  if (!primedLiveMedia) return null;
  const next = primedLiveMedia;
  primedLiveMedia = null;
  return next;
};

export const clearPrimedLiveMediaStream = () => {
  if (!primedLiveMedia?.stream) {
    primedLiveMedia = null;
    return;
  }
  stopStreamTracks(primedLiveMedia.stream);
  primedLiveMedia = null;
};

const warmupNativeMicrophonePermission = async (): Promise<boolean> => {
  if (!Capacitor.isNativePlatform()) return true;
  if (!navigator.mediaDevices?.getUserMedia) return false;
  try {
    const micStream = await navigator.mediaDevices.getUserMedia({
      video: false,
      audio: AUDIO_CONSTRAINTS
    });
    stopStreamTracks(micStream);
    return true;
  } catch (error: any) {
    // Android WebView can report a transient permission-style error on the
    // first audio-only probe even when the combined camera+mic request would
    // succeed moments later. Treat the warmup as best-effort and let the main
    // capture request decide whether audio is actually available.
    if (isPermissionLikeError(error)) return false;
    return false;
  }
};

export const requestLiveMediaStream = async (): Promise<LiveMediaResult> => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('This device/browser does not support live camera capture.');
  }

  await ensureNativeCameraPermission();
  await warmupNativeMicrophonePermission();

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: VIDEO_CONSTRAINTS,
      audio: AUDIO_CONSTRAINTS
    });
    return { stream, audioLimited: false };
  } catch (primaryError: any) {
    // On some Android WebView builds, camera+mic can be denied together
    // even when camera is granted. Fall back to camera-only to unblock video.
    if (!Capacitor.isNativePlatform()) throw primaryError;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: VIDEO_CONSTRAINTS,
        audio: false
      });
      return { stream, audioLimited: true };
    } catch {
      throw primaryError;
    }
  }
};
