/**
 * Phase 21.1.2R — production voice-note helpers.
 * Precise error categories; MIME probing; blob validation; privacy-safe diagnostics.
 */

export const VOICE_RECORDING_VERSION = '21.1.2R';

export type VoiceErrorCategory =
  | 'permission_denied'
  | 'permission_dismissed'
  | 'no_microphone'
  | 'microphone_busy'
  | 'overconstrained'
  | 'insecure_context'
  | 'unsupported'
  | 'webview_bridge'
  | 'empty_blob'
  | 'too_short'
  | 'upload_failed'
  | 'playback_failed'
  | 'codec_failed'
  | 'unknown';

export type VoiceErrorInfo = {
  category: VoiceErrorCategory;
  message: string;
  technical?: string;
  retryable: boolean;
};

const AUDIO_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4',
  'audio/aac',
  'audio/mpeg'
];

export const isSecureVoiceContext = (): boolean => {
  try {
    if (typeof window !== 'undefined' && window.isSecureContext === false) return false;
  } catch {
    // ignore
  }
  if (typeof location !== 'undefined') {
    const protocol = String(location.protocol || '');
    if (protocol === 'https:') return true;
    if (protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/i.test(location.hostname || '')) return true;
  }
  return typeof window !== 'undefined' ? Boolean(window.isSecureContext) : true;
};

export const isVoiceRecordingSupported = (): boolean => {
  if (!isSecureVoiceContext()) return false;
  if (typeof MediaRecorder === 'undefined') return false;
  if (typeof navigator === 'undefined') return false;
  return Boolean(navigator.mediaDevices?.getUserMedia);
};

export const pickSupportedAudioMimeType = (): string => {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const type of AUDIO_MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      // ignore
    }
  }
  return '';
};

export const extensionForAudioMime = (mimeType: string): string => {
  const mime = String(mimeType || '').toLowerCase().split(';')[0].trim();
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'm4a';
  if (mime.includes('aac')) return 'aac';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'mp3';
  if (mime.includes('wav')) return 'wav';
  return 'webm';
};

/**
 * Classify getUserMedia / MediaRecorder failures precisely.
 * Do NOT map every failure to permission blocked.
 */
export const classifyMicrophoneError = (error: any): VoiceErrorInfo => {
  const name = String(error?.name || error?.code || '').trim();
  const nameLc = name.toLowerCase();
  const message = String(error?.message || '').trim();
  const messageLc = message.toLowerCase();
  const technical = [name, message].filter(Boolean).join(': ') || undefined;

  // Classify by DOMException name first — independent of environment (unit tests, SSR).
  if (
    nameLc === 'notallowederror' ||
    nameLc === 'permissiondeniederror' ||
    nameLc === 'permissiondenied' ||
    name === 'PermissionDeniedError'
  ) {
    return {
      category: 'permission_denied',
      message:
        'Microphone access is blocked. Enable the microphone for Scrolith in browser or device settings, then tap Retry.',
      technical,
      retryable: true
    };
  }

  if (
    nameLc === 'notfounderror' ||
    nameLc === 'devicesnotfounderror' ||
    messageLc.includes('requested device not found') ||
    messageLc.includes('no audio device')
  ) {
    return {
      category: 'no_microphone',
      message: 'No microphone was found. Connect a mic and try again.',
      technical,
      retryable: true
    };
  }

  if (
    nameLc === 'notreadableerror' ||
    nameLc === 'trackstarterror' ||
    messageLc.includes('could not start audio source') ||
    messageLc.includes('failed to allocate') ||
    messageLc.includes('device in use')
  ) {
    return {
      category: 'microphone_busy',
      message: 'The microphone is busy or unavailable. Close other apps using the mic and retry.',
      technical,
      retryable: true
    };
  }

  if (nameLc === 'overconstrainederror' || nameLc === 'constraintnotsatisfiederror') {
    return {
      category: 'overconstrained',
      message: 'This device cannot use the requested microphone settings. Retrying with defaults…',
      technical,
      retryable: true
    };
  }

  if (nameLc === 'aborterror') {
    return {
      category: 'permission_dismissed',
      message: 'Microphone request was cancelled. Tap the mic to try again.',
      technical,
      retryable: true
    };
  }

  if (nameLc.includes('security') || messageLc.includes('secure context')) {
    return {
      category: 'insecure_context',
      message: 'Microphone access requires a secure (HTTPS) connection.',
      technical,
      retryable: false
    };
  }

  // WebView / Capacitor bridge patterns
  if (
    messageLc.includes('permission not granted') ||
    messageLc.includes('webview') ||
    messageLc.includes('not implemented') ||
    messageLc.includes('denied by system')
  ) {
    return {
      category: 'webview_bridge',
      message: 'Microphone could not be opened in the app. Allow microphone for Scrolith and retry.',
      technical,
      retryable: true
    };
  }

  // Loose "permission" only when paired with deny/block language — not every DOMException.
  if (
    (messageLc.includes('permission') || messageLc.includes('not allowed')) &&
    (messageLc.includes('denied') || messageLc.includes('blocked') || messageLc.includes('dismissed'))
  ) {
    return {
      category: 'permission_denied',
      message:
        'Microphone access is blocked. Enable the microphone for Scrolith in browser or device settings, then tap Retry.',
      technical,
      retryable: true
    };
  }

  if (nameLc === 'unsupported' || nameLc.includes('notsupported')) {
    return {
      category: 'unsupported',
      message: 'Voice recording is not supported in this browser.',
      technical,
      retryable: false
    };
  }

  // Environment capability (only when no specific error name was matched).
  if (typeof MediaRecorder === 'undefined' || (typeof navigator !== 'undefined' && !navigator.mediaDevices?.getUserMedia)) {
    if (!name && !message) {
      return {
        category: 'unsupported',
        message: 'Voice recording is not supported in this browser.',
        technical,
        retryable: false
      };
    }
  }

  if (!isSecureVoiceContext() && typeof window !== 'undefined') {
    return {
      category: 'insecure_context',
      message: 'Microphone access requires a secure (HTTPS) connection.',
      technical,
      retryable: false
    };
  }

  return {
    category: 'unknown',
    message: message || 'Unable to start voice recording. Tap Retry to try again.',
    technical,
    retryable: true
  };
};

/** @deprecated Use classifyMicrophoneError — kept for callers expecting a string. */
export const mapMicrophoneError = (error: any): string => classifyMicrophoneError(error).message;

export const isUsableVoiceBlob = (
  blob: Blob | null | undefined,
  options?: { minBytes?: number; minDurationMs?: number; durationMs?: number }
): boolean => {
  if (!blob) return false;
  const minBytes = options?.minBytes ?? 32;
  const size = Number(blob.size || 0);
  if (!Number.isFinite(size) || size < minBytes) return false;
  if (options?.minDurationMs != null && options?.durationMs != null) {
    if (Number(options.durationMs) < Number(options.minDurationMs)) return false;
  }
  return true;
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

/** Privacy-safe diagnostics for operators (no audio content). */
export const buildVoiceDiagnostic = (partial: {
  stage: string;
  category?: VoiceErrorCategory | string;
  mimeType?: string;
  recorderState?: string;
  secureContext?: boolean;
  blobSize?: number;
  durationMs?: number;
}): Record<string, string | number | boolean | undefined> => {
  let browser = 'unknown';
  try {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
    if (/wv|WebView/i.test(ua) || (/\bAndroid\b/i.test(ua) && /\bVersion\/\d/i.test(ua))) browser = 'android-webview';
    else if (/Android/i.test(ua) && /Chrome/i.test(ua)) browser = 'android-chrome';
    else if (/Edg\//i.test(ua)) browser = 'edge';
    else if (/Chrome/i.test(ua)) browser = 'chrome';
    else if (/Firefox/i.test(ua)) browser = 'firefox';
    else if (/Safari/i.test(ua)) browser = 'safari';
  } catch {
    // ignore
  }
  return {
    phase: VOICE_RECORDING_VERSION,
    stage: partial.stage,
    category: partial.category,
    mimeType: partial.mimeType,
    recorderState: partial.recorderState,
    secureContext: partial.secureContext ?? isSecureVoiceContext(),
    browser,
    blobSize: partial.blobSize,
    durationMs: partial.durationMs
  };
};

export const logVoiceDiagnostic = (partial: Parameters<typeof buildVoiceDiagnostic>[0]) => {
  try {
    const payload = buildVoiceDiagnostic(partial);
    // eslint-disable-next-line no-console
    console.info('[scrolith:voice]', payload);
  } catch {
    // ignore
  }
};

/** Acquire mic with progressive constraint fallback (user-gesture call site required). */
export const acquireMicrophoneStream = async (): Promise<MediaStream> => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error('getUserMedia unavailable'), { name: 'Unsupported' });
  }
  if (!isSecureVoiceContext()) {
    throw Object.assign(new Error('Insecure context'), { name: 'SecurityError' });
  }

  const attempts: MediaStreamConstraints[] = [
    { audio: true },
    {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    }
  ];

  let lastError: any = null;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      lastError = error;
      const classified = classifyMicrophoneError(error);
      // Only try next constraint set for overconstrained / unknown hardware issues
      if (classified.category !== 'overconstrained' && classified.category !== 'unknown') {
        throw error;
      }
    }
  }
  throw lastError || Object.assign(new Error('Unable to open microphone'), { name: 'NotReadableError' });
};
