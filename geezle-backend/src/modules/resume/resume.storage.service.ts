import fs from 'fs';
import path from 'path';
import { ResumeGcsService } from './resume.gcs-storage.service';

const safeSegment = (value: string) =>
  String(value || 'file').slice(0, 256)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'file';

const localRoot = path.resolve(process.cwd(), 'storage', 'resumes');

const writeLocal = async (key: string, buffer: Buffer) => {
  const target = path.resolve(localRoot, key);
  if (!target.startsWith(localRoot)) throw new Error('Invalid storage key');
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  await fs.promises.writeFile(target, buffer);
};

const readLocal = async (key: string) => {
  const target = path.resolve(localRoot, key);
  if (!target.startsWith(localRoot)) throw new Error('Invalid storage key');
  return fs.promises.readFile(target);
};

const deleteLocal = async (key?: string | null) => {
  if (!key) return;
  const target = path.resolve(localRoot, key);
  if (!target.startsWith(localRoot)) return;
  await fs.promises.rm(target, { force: true });
};

export const ResumeStorageService = {
  /**
   * Generates a storage key following the patterns:
   * - PDF: resumes/{userId}/{id}.pdf
   * - Uploads: resume-reviews/{userId}/uploads/{fileName}
   */
  makeKey(params: { userId: string; kind: 'uploads' | 'pdf'; fileName: string }) {
    const userId = safeSegment(params.userId);
    if (params.kind === 'pdf') {
      // Use a timestamp-based ID to ensure uniqueness for generated PDFs.
      const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
      return `resumes/${userId}/${stamp}.pdf`;
    }
    // Pattern: resume-reviews/{clientId}/uploads/{safeFileName}
    return `resume-reviews/${userId}/uploads/${safeSegment(params.fileName)}`;
  },

  async saveBuffer(params: { key: string; buffer: Buffer; contentType: string }) {
    if (ResumeGcsService.isConfigured()) {
      await ResumeGcsService.uploadBuffer({
        buffer: params.buffer,
        contentType: params.contentType,
        fileName: params.key
      });
      return { storageKey: params.key, url: `/api/resume/public/files/${encodeURIComponent(params.key)}` };
    }

    await writeLocal(params.key, params.buffer);
    return { storageKey: params.key, url: `/api/resume/public/files/${encodeURIComponent(params.key)}` };
  },

  async readBuffer(key: string) {
    if (ResumeGcsService.isConfigured()) {
      return ResumeGcsService.downloadBuffer(key);
    }
    return readLocal(key);
  },

  createReadStream(key: string) {
    if (ResumeGcsService.isConfigured()) {
      return ResumeGcsService.createReadStream(key);
    }
    const target = path.resolve(localRoot, key);
    if (!target.startsWith(localRoot)) throw new Error('Invalid storage key');
    return fs.createReadStream(target);
  },

  async delete(key?: string | null) {
    if (!key) return;
    if (ResumeGcsService.isConfigured()) {
      await ResumeGcsService.delete(key);
      return;
    }
    await deleteLocal(key);
  }
};
