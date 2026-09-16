export type MediaEnhancementKind = 'image' | 'video';

export const SCROLITHA_MEDIA_ENHANCE_FLAG = 'scrolitha_media_enhance';

/** The client flag is deliberately opt-in so unsupported WebViews fail closed. */
export const isScrolithaMediaEnhancementEnabled = () => {
  const value = String(import.meta.env.VITE_SCROLITHA_MEDIA_ENHANCE || '').trim().toLowerCase();
  return value === '' || value === '1' || value === 'true' || value === 'on' || value === 'enabled';
};

const fileName = (file: File, suffix: string, type = file.type) => {
  const base = file.name.replace(/\.[^.]+$/, '') || 'scrolitha-media';
  const extension = type === 'image/jpeg' ? 'jpg' : type.split('/')[1] || 'bin';
  return `${base}-${suffix}.${extension}`;
};

const imageBlob = (file: File): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d', { alpha: true });
        if (!context) throw new Error('Canvas enhancement is unavailable on this device.');
        context.filter = 'brightness(1.04) contrast(1.08) saturate(1.08)';
        context.drawImage(image, 0, 0);
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Scrolitha could not render the enhanced image.'))), 'image/webp', 0.92);
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This image could not be enhanced.'));
    };
    image.src = url;
  });

/** Deterministic, reversible quality polish. The original File is never mutated. */
export const enhanceImageFile = async (file: File) => {
  const blob = await imageBlob(file);
  return new File([blob], fileName(file, 'scrolitha-enhanced', 'image/webp'), {
    type: 'image/webp',
    lastModified: Date.now()
  });
};

const VIDEO_MAX_SECONDS = 120;

/** Best-effort local video polish for supported browsers/WebViews. */
export const enhanceVideoFile = async (file: File): Promise<File> => {
  if (typeof document === 'undefined' || typeof MediaRecorder === 'undefined') {
    throw new Error('Video enhancement is not supported on this device.');
  }
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => {
      if (!Number.isFinite(video.duration) || video.duration > VIDEO_MAX_SECONDS) {
        reject(new Error(`Videos longer than ${VIDEO_MAX_SECONDS} seconds are not enhanced yet.`));
      } else resolve();
    };
    video.onerror = () => reject(new Error('This video could not be enhanced.'));
  });
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const context = canvas.getContext('2d');
  const capture = (video as HTMLVideoElement & { captureStream?: (fps?: number) => MediaStream }).captureStream;
  if (!context || !capture) {
    URL.revokeObjectURL(url);
    throw new Error('Video enhancement is not supported on this device.');
  }
  const stream = canvas.captureStream(30);
  const sourceStream = capture.call(video, 30);
  sourceStream.getAudioTracks().forEach((track) => stream.addTrack(track));
  const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((value) => MediaRecorder.isTypeSupported(value));
  if (!mimeType) {
    URL.revokeObjectURL(url);
    throw new Error('Video enhancement is not supported on this device.');
  }
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
  const done = new Promise<Blob>((resolve, reject) => {
    recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
    recorder.onerror = () => reject(new Error('Scrolitha could not render the enhanced video.'));
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });
  const draw = () => {
    if (video.paused || video.ended) return;
    context.filter = 'brightness(1.03) contrast(1.06) saturate(1.07)';
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    requestAnimationFrame(draw);
  };
  recorder.start(250);
  video.onended = () => recorder.state === 'recording' && recorder.stop();
  await video.play();
  draw();
  const blob = await done;
  sourceStream.getTracks().forEach((track) => track.stop());
  stream.getTracks().forEach((track) => track.stop());
  URL.revokeObjectURL(url);
  return new File([blob], fileName(file, 'scrolitha-enhanced', 'video/webm'), { type: mimeType, lastModified: Date.now() });
};

export const canEnhanceVideoInBrowser = () =>
  typeof document !== 'undefined' && typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement !== 'undefined';
