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
  onProgress?: (percent: number, event: ProgressEvent) => void;
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

export const captureAndUpload = async (options: CaptureOptions = {}) => {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('Camera capture is only available on native platforms.');
  }

  const photo = await Camera.getPhoto({
    quality: 85,
    allowEditing: false,
    resultType: CameraResultType.Uri,
    source: options.source || CameraSource.Camera
  });

  if (!photo.webPath) {
    throw new Error('Unable to access captured media.');
  }

  const response = await fetch(photo.webPath);
  const blob = await response.blob();
  const extension = inferExtension(blob.type);
  const fileName = `capture-${Date.now()}.${extension}`;
  const file = blobToFile(blob, fileName);

  const category = options.category || (blob.type.startsWith('video/') ? 'portfolio' : 'portfolio');
  return FileService.uploadFile(options.userId || '', file, category, {
    role: options.role,
    visibility: options.visibility,
    onProgress: options.onProgress
  });
};

