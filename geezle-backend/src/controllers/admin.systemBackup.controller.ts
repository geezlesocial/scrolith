import { Request, Response } from 'express';
import {
  createSystemBackup,
  deleteSystemBackups,
  getSystemBackupDownload,
  getSystemBackupSections,
  importSystemBackup,
  listSystemBackups,
  restoreSystemBackup
} from '../services/systemBackup.service';

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
    const rows = listSystemBackups();
    return res.json({ success: true, data: rows });
  } catch (error: any) {
    return toErrorResponse(res, error, 'Failed to load system backups.');
  }
};

export const createAdminSystemBackup = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }
    const result = await createSystemBackup({
      adminId: req.user.id,
      adminEmail: req.user.email || null,
      mode: req.body?.mode === 'partial' ? 'partial' : 'full',
      sections: parseCsvOrArray(req.body?.sections) as any,
      customTables: parseCsvOrArray(req.body?.customTables),
      includeFiles: req.body?.includeFiles !== false,
      notes: req.body?.notes
    });

    emitAdminSystemBackupUpdate(req, {
      action: 'created',
      backupId: result.backup.id,
      createdAt: result.backup.createdAt
    });

    return res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    return toErrorResponse(res, error, 'Failed to create system backup.');
  }
};

export const downloadAdminSystemBackup = async (req: Request, res: Response) => {
  try {
    const backupId = String(req.params.id || '').trim();
    const { record, absolutePath } = getSystemBackupDownload(backupId);
    return res.download(absolutePath, record.fileName);
  } catch (error: any) {
    return toErrorResponse(res, error, 'Failed to download system backup.');
  }
};

export const importAdminSystemBackup = async (req: Request, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    const uploadFile = req.file;
    if (!uploadFile?.buffer?.length) {
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
      fileBuffer: uploadFile.buffer,
      notes: req.body?.notes
    });

    emitAdminSystemBackupUpdate(req, {
      action: 'imported',
      backupId: result.backup.id,
      importedAt: result.backup.importedAt
    });

    return res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    return toErrorResponse(res, error, 'Failed to import backup file.');
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
    return toErrorResponse(res, error, 'Failed to restore backup.');
  }
};

export const deleteAdminSystemBackup = async (req: Request, res: Response) => {
  try {
    const backupId = String(req.params.id || '').trim();
    const deleted = deleteSystemBackups([backupId]);

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
    const deleted = deleteSystemBackups(backupIds);

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
