/**
 * Phase 21.1.2 — production voice-note helpers (MIME, permission mapping, blob checks).
 */

export const VOICE_RECORDING_VERSION = '21.1.2';

export const pickSupportedAudioMimeType = (): string => {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/aac',
    'audio/mpeg'
  ];
  for (const type of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      // ignore
    }
  }
  return '';
};

export const extensionForAudioMime = (mimeType: string): string => {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) return 'm4a';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  return 'webm';
};

export const mapMicrophoneError = (error: any): string => {
  const name = String(error?.name || error?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  if (name.includes('notallowed') || name.includes('permissiondenied') || message.includes('permission')) {
    return 'Microphone permission is blocked. Enable the microphone for Scrolith in your browser or device settings, then try again.';
  }
  if (name.includes('notfound') || message.includes('not found') || message.includes('no device')) {
    return 'No microphone was found. Connect a mic and try again.';
  }
  if (name.includes('notreadable') || message.includes('track start') || message.includes('could not start')) {
    return 'The microphone is busy or unavailable. Close other apps using the mic and retry.';
  }
  if (name.includes('overconstrained')) {
    return 'This device cannot use the requested microphone settings. Try again with default settings.';
  }
  if (name.includes('security') || message.includes('secure')) {
    return 'Microphone access requires a secure (HTTPS) context.';
  }
  if (typeof MediaRecorder === 'undefined') {
    return 'Voice recording is not supported in this browser.';
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return 'Voice recording is not supported on this device.';
  }
  return error?.message || 'Unable to start voice recording.';
};

export const isUsableVoiceBlob = (blob: Blob | null | undefined, minBytes = 256): boolean => {
  if (!blob) return false;
  return Number(blob.size || 0) >= minBytes;
};

export const formatVoiceDuration = (ms: number): string => {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

export const createVoiceFile = (blob: Blob, mimeHint = ''): File => {
  const type = String(blob.type || mimeHint || 'audio/webm').split(';')[0] || 'audio/webm';
  const ext = extensionForAudioMime(type);
  return new File([blob], `voice-note-${Date.now()}.${ext}`, { type });
};
