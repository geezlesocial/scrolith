import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { tokenStore } from '../services/tokenStore';
import { resolveAssetUrl } from './assetUrl';

type DownloadToDeviceOptions = {
  url: string;
  fileName?: string | null;
  mimeType?: string | null;
  subdirectory?: string;
  preferDownloadsRoot?: boolean;
};

type DownloadToDeviceResult = {
  fileName: string;
  native: boolean;
  path?: string;
  uri?: string;
};

const sanitizeFileName = (value: string) => {
  const normalized = String(value || '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || `download-${Date.now()}`;
};

const inferExtension = (mimeType?: string | null) => {
  const mime = String(mimeType || '').trim().toLowerCase();
  if (!mime) return '';
  if (mime.includes('jpeg')) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('quicktime')) return 'mov';
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('msword')) return 'doc';
  if (mime.includes('wordprocessingml')) return 'docx';
  if (mime.includes('spreadsheetml')) return 'xlsx';
  if (mime.includes('presentationml')) return 'pptx';
  if (mime.includes('csv')) return 'csv';
  if (mime.includes('plain')) return 'txt';
  return '';
};

const buildFileName = (url: string, fileName?: string | null, mimeType?: string | null) => {
  const preferred = String(fileName || '').trim();
  if (preferred) return sanitizeFileName(preferred);

  try {
    const parsed = new URL(url);
    const tail = decodeURIComponent(parsed.pathname.split('/').pop() || '').trim();
    if (tail && tail.includes('.')) return sanitizeFileName(tail);
  } catch {}

  const ext = inferExtension(mimeType);
  return sanitizeFileName(`download-${Date.now()}${ext ? `.${ext}` : ''}`);
};

const triggerBrowserDownload = (url: string, fileName: string) => {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noreferrer';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
};

const downloadOnWeb = async (url: string, fileName: string, token: string | null) => {
  try {
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });
    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}`);
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    triggerBrowserDownload(objectUrl, fileName);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    return;
  } catch {
    triggerBrowserDownload(url, fileName);
  }
};

const ensureNativeDocumentsPermission = async () => {
  try {
    const current = await Filesystem.checkPermissions();
    if (current?.publicStorage === 'granted') return;
  } catch {}

  try {
    const requested = await Filesystem.requestPermissions();
    if (requested?.publicStorage === 'denied') {
      throw new Error('Storage permission was denied.');
    }
  } catch (error: any) {
    throw new Error(error?.message || 'Storage permission was denied.');
  }
};

const ensureNativeDirectory = async (directory: Directory, path: string) => {
  const normalizedPath = String(path || '').trim();
  if (!normalizedPath) return;

  try {
    await Filesystem.mkdir({
      directory,
      path: normalizedPath,
      recursive: true
    });
  } catch {}
};

export const downloadToDevice = async ({
  url,
  fileName,
  mimeType,
  preferDownloadsRoot = false
}: DownloadToDeviceOptions): Promise<DownloadToDeviceResult> => {
  const normalizedUrl = resolveAssetUrl(url);
  if (!normalizedUrl) throw new Error('Download URL is missing.');

  const normalizedName = buildFileName(normalizedUrl, fileName, mimeType);
  const token = await tokenStore.get();

  if (!Capacitor.isNativePlatform()) {
    await downloadOnWeb(normalizedUrl, normalizedName, token);
    return { fileName: normalizedName, native: false };
  }

  await ensureNativeDocumentsPermission();
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  const savedName = sanitizeFileName(normalizedName);
  const nativeTargets = preferDownloadsRoot
    ? [
        { directory: Directory.ExternalStorage, path: `Download/Scrolith/${savedName}` },
        { directory: Directory.Documents, path: `Scrolith/Downloads/${savedName}` }
      ]
    : [
        { directory: Directory.Documents, path: `Scrolith/Downloads/${savedName}` },
        { directory: Directory.ExternalStorage, path: `Download/Scrolith/${savedName}` }
      ];

  let lastError: unknown = null;
  for (const target of nativeTargets) {
    try {
      const parentPath = target.path.includes('/') ? target.path.split('/').slice(0, -1).join('/') : '';
      if (parentPath) {
        await ensureNativeDirectory(target.directory, parentPath);
      }
      await Filesystem.downloadFile({
        url: normalizedUrl,
        path: target.path,
        directory: target.directory,
        recursive: true,
        headers
      });
      const uriResult = await Filesystem.getUri({
        path: target.path,
        directory: target.directory
      }).catch(() => null);
      return {
        fileName: normalizedName,
        native: true,
        path: target.path,
        uri: uriResult?.uri
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to save the file on this device.');
};
