import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { FileService } from '../services/files';
import { UploadedFile } from '../types';

type CaptureOptions = {
  source?: CameraSource;
  category?: UploadedFile['category'];
  role?: string;
  visibility?: 'public' | 'private';
  userId?: string;
  /** JPEG quality 1–100. Lower on constrained networks. */
  quality?: number;
  /** Soft client-side size guard before upload (bytes). */
  maxBytes?: number;
  allowEditing?: boolean;
  onProgress?: (percent: number, event: ProgressEvent) => void;
};

export type CaptureQualityHint = {
  level: 'ok' | 'warn' | 'fail';
  code: 'too_small' | 'too_large' | 'empty' | 'ok';
  message: string;
};

const blobToFile = (blob: Blob, filename: string) =>
  new File([blob], filename, { type: blob.type || 'image/jpeg' });

const inferExtension = (mime: string) => {
  if (!mime) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('heic') || mime.includes('heif')) return 'heic';
  return 'jpg';
};

/** Non-destructive client heuristics for capture quality guidance (no AI model). */
export const assessCaptureQuality = (blob: Blob, maxBytes = 12 * 1024 * 1024): CaptureQualityHint => {
  if (!blob || blob.size <= 0) {
    return { level: 'fail', code: 'empty', message: 'No media was captured. Please try again.' };
  }
  if (blob.size < 8 * 1024) {
    return {
      level: 'warn',
      code: 'too_small',
      message: 'This image looks very small. Retake with better lighting or move closer.'
    };
  }
  if (blob.size > maxBytes) {
    return {
      level: 'fail',
      code: 'too_large',
      message: 'This file is too large to upload. Choose a smaller photo or lower quality.'
    };
  }
  return { level: 'ok', code: 'ok', message: 'Capture looks ready to upload.' };
};

const resolveSource = (source?: CameraSource) => source || CameraSource.Camera;

export const captureAndUpload = async (options: CaptureOptions = {}) => {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Camera capture is only available on native platforms.');
  }

  const quality = Math.max(40, Math.min(95, Number(options.quality ?? 85) || 85));
  const maxBytes = Math.max(256 * 1024, Number(options.maxBytes ?? 12 * 1024 * 1024) || 12 * 1024 * 1024);

  const photo = await Camera.getPhoto({
    quality,
    allowEditing: Boolean(options.allowEditing),
    resultType: CameraResultType.Uri,
    source: resolveSource(options.source),
    // Prefer system Photo Picker / gallery path when source is Photos.
    correctOrientation: true,
    saveToGallery: false
  });

  if (!photo.webPath) {
    throw new Error('Unable to access captured media.');
  }

  const response = await fetch(photo.webPath);
  const blob = await response.blob();
  const qualityHint = assessCaptureQuality(blob, maxBytes);
  if (qualityHint.level === 'fail') {
    throw new Error(qualityHint.message);
  }

  const extension = inferExtension(blob.type);
  const fileName = `capture-${Date.now()}.${extension}`;
  const file = blobToFile(blob, fileName);

  const category = options.category || (blob.type.startsWith('video/') ? 'portfolio' : 'portfolio');
  const uploaded = await FileService.uploadFile(options.userId || '', file, category, {
    role: options.role,
    visibility: options.visibility,
    onProgress: options.onProgress
  });
  return { ...uploaded, qualityHint };
};

/** Gallery / Photo Picker path (native only). */
export const pickAndUpload = async (options: Omit<CaptureOptions, 'source'> = {}) =>
  captureAndUpload({ ...options, source: CameraSource.Photos });

