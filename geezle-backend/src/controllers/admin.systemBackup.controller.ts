import { Request, Response } from 'express';
import fs from 'fs';
import {
  deleteSystemBackups,
  getSystemBackupDownload,
  getSystemBackupSections,
  importSystemBackup,
  listSystemBackupJobs,
  listSystemBackups,
  queueSystemBackupCreation,
  restoreSystemBackup,
  runSystemBackupCreationJob
} from '../services/systemBackup.service';
import { downloadBlobBufferByName } from '../services/storage/blobStorage';

const parseCsvOrArray = (value: unknown): string[] => {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[\n,]/g);
  return Array.from(
    new Set(
      raw
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
    )
  );
};

const emitAdminSystemBackupUpdate = (req: Request, payload: Record<string, any>) => {
  try {
    const io = req.app.get('io');
    const communityNs = req.app.get('communityNs');
    const eventName = 'admin:system_backup_updated';
    io?.emit?.(eventName, payload);
    communityNs?.emit?.(eventName, payload);
  } catch (error) {
    console.warn('[system-backup] realtime emit failed:', (error as any)?.message || error);
  }
};

const toErrorResponse = (res: Response, error: any, fallbackMessage: string) => {
  const statusCode = Number(error?.statusCode || 500);
  return res.status(statusCode).json({
    success: false,
    code: error?.code || 'SYSTEM_BACKUP_ERROR',
    error: error?.message || fallbackMessage
  });
};

export const getAdminSystemBackupMeta = async (_req: Request, res: Response) => {
  try {
    return res.json({
      success: true,
      data: {
        sections: getSystemBackupSections()
      }
    });
  } catch (error: any) {
    return toErrorResponse(res, error, 'Failed to load system backup metadata.');
  }
};

export const getAdminSystemBackups = async (_req: Request, res: Response) => {
  try {
    const rows = await listSystemBackups();
    return res.json({ success: true, data: rows });
  } catch (error: any) {
    return toErrorResponse(res, error, 'Failed to load system backups.');
  }
};

export const getAdminSystemBackupJobs = async (_req: Request, res: Response) => {
  try {
    const rows = await listSystemBackupJobs();
    return res.json({ success: true, data: rows });
  } catch (error: any) {
    return toErrorResponse(res, error, 'Failed to load system backup jobs.');
  }
};

export const createAdminSystemBackup = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }
    const mode: 'full' | 'partial' = req.body?.mode === 'partial' ? 'partial' : 'full';
    const input = {
      adminId: req.user.id,
      adminEmail: req.user.email || null,
      mode,
      sections: parseCsvOrArray(req.body?.sections) as any,
      customTables: parseCsvOrArray(req.body?.customTables),
      includeFiles: req.body?.includeFiles !== false,
      notes: req.body?.notes
    };
    const job = await queueSystemBackupCreation(input);

    emitAdminSystemBackupUpdate(req, {
      action: 'job_queued',
      jobId: job.id,
      status: job.status,
      requestedAt: job.createdAt
    });

    void runSystemBackupCreationJob(job.id, input, {
      onUpdate: async (payload) => {
        emitAdminSystemBackupUpdate(req, payload);
      }
    });

    return res.status(202).json({
      success: true,
      data: {
        job
      }
    });
  } catch (error: any) {
    return toErrorResponse(res, error, 'Failed to create system backup.');
  }
};

export const downloadAdminSystemBackup = async (req: Request, res: Response) => {
  try {
    const backupId = String(req.params.id || '').trim();
    const download = await getSystemBackupDownload(backupId);
    if (download.storage === 'azure_blob') {
      const buffer = await downloadBlobBufferByName(download.blobName);
      res.setHeader('Content-Type', 'application/gzip');
      res.setHeader('Content-Disposition', `attachment; filename="${download.record.fileName}"`);
      res.setHeader('Content-Length', String(buffer.length || 0));
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      return res.end(buffer);
    }
    return res.download(download.absolutePath, download.record.fileName);
  } catch (error: any) {
    return toErrorResponse(res, error, 'Failed to download system backup.');
  }
};

export const importAdminSystemBackup = async (req: Request, res: Response) => {
  const uploadFile = req.file;
  let loadedFromPath = false;
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    const fromMemory = uploadFile?.buffer;
    const fromDisk =
      !fromMemory?.length && uploadFile?.path && fs.existsSync(uploadFile.path)
        ? fs.readFileSync(uploadFile.path)
        : null;
    const fileBuffer = fromMemory?.length ? fromMemory : fromDisk || undefined;
    loadedFromPath = Boolean(fromDisk?.length);

    if (!fileBuffer?.length) {
      return res.status(400).json({
        success: false,
        code: 'BACKUP_IMPORT_FILE_REQUIRED',
        error: 'Backup file is required.'
      });
    }

    const result = await importSystemBackup({
      adminId: req.user.id,
      adminEmail: req.user.email || null,
      fileName: uploadFile.originalname || uploadFile.filename || 'imported-backup.scrolith-backup.json.gz',
      fileBuffer,
      notes: req.body?.notes
    });

    emitAdminSystemBackupUpdate(req, {
      action: 'imported',
      backupId: result.backup.id,
      importedAt: result.backup.importedAt
    });

    return res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    console.warn('[system-backup] import failed:', {
      code: error?.code || 'SYSTEM_BACKUP_ERROR',
      message: error?.message || 'Unknown error',
      hasFile: Boolean(uploadFile),
      fileName: uploadFile?.originalname || uploadFile?.filename || null
    });
    return toErrorResponse(res, error, 'Failed to import backup file.');
  } finally {
    if (loadedFromPath && uploadFile?.path) {
      try {
        fs.unlinkSync(uploadFile.path);
      } catch {
        // temp file cleanup best effort
      }
    }
  }
};

export const restoreAdminSystemBackup = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    const backupId = String(req.params.id || '').trim();
    const result = await restoreSystemBackup({
      backupId,
      adminId: req.user.id,
      adminEmail: String(req.body?.adminEmail || '').trim().toLowerCase(),
      adminPassword: String(req.body?.adminPassword || ''),
      scrolithLicense: String(req.body?.scrolithLicense || ''),
      mode: req.body?.mode === 'append' ? 'append' : 'replace',
      sections: parseCsvOrArray(req.body?.sections) as any,
      customTables: parseCsvOrArray(req.body?.customTables),
      includeFiles: req.body?.includeFiles !== false
    });

    emitAdminSystemBackupUpdate(req, {
      action: 'restored',
      backupId: result.backupId,
      restoredAt: result.restoredAt
    });

    return res.json({ success: true, data: result });
  } catch (error: any) {
    console.warn('[system-backup] restore failed:', {
      code: error?.code || 'SYSTEM_BACKUP_ERROR',
      message: error?.message || 'Unknown error',
      backupId: String(req.params?.id || '').trim() || null
    });
    return toErrorResponse(res, error, 'Failed to restore backup.');
  }
};

export const deleteAdminSystemBackup = async (req: Request, res: Response) => {
  try {
    const backupId = String(req.params.id || '').trim();
    const deleted = await deleteSystemBackups([backupId]);

    emitAdminSystemBackupUpdate(req, {
      action: 'deleted',
      backupIds: deleted.map((entry) => entry.id)
    });

    return res.json({
      success: true,
      data: {
        deletedCount: deleted.length,
        deleted
      }
    });
  } catch (error: any) {
    return toErrorResponse(res, error, 'Failed to delete backup.');
  }
};

export const deleteAdminSystemBackupBatch = async (req: Request, res: Response) => {
  try {
    const backupIds = parseCsvOrArray(req.body?.backupIds);
    const deleted = await deleteSystemBackups(backupIds);

    emitAdminSystemBackupUpdate(req, {
      action: 'deleted_batch',
      backupIds: deleted.map((entry) => entry.id)
    });

    return res.json({
      success: true,
      data: {
        deletedCount: deleted.length,
        deleted
      }
    });
  } catch (error: any) {
    return toErrorResponse(res, error, 'Failed to delete selected backups.');
  }
};
