/**
 * Admin API for Phase 2 historical media recovery.
 *
 * POST /audit  — always dry-run (ignores repair flags)
 * POST /repair — requires confirm=true
 * POST /run    — mode=dry-run|repair; repair requires confirm=true
 *
 * Mounted under /api/admin/* which applies authMiddleware + adminMiddleware.
 * No GET handlers. Responses are redacted (no full keys, no signed URLs, no file bytes).
 */
import { Request, Response } from 'express';
import {
  runMediaRecovery,
  toPublicRecoveryReport,
  isSafeCursor,
  clampLimit,
  clampBatchSize,
  sanitizeOrphanPrefix,
  MAX_LIMIT,
  MAX_BATCH,
  MAX_ORPHAN_LIMIT,
  MAX_DETAILS,
  type MediaRecoveryMode
} from '../services/storage/mediaRecovery.service';
import { writeAdminAuditEvent, extractRequestAuditMeta } from '../services/adminAudit.service';

const parseMode = (value: unknown): MediaRecoveryMode =>
  String(value || '').trim().toLowerCase() === 'repair' ? 'repair' : 'dry-run';

const requireConfirm = (body: Record<string, unknown>) =>
  body.confirm === true || String(body.confirm || '').toLowerCase() === 'true';

const parseCursor = (value: unknown): { ok: true; cursor: string | null } | { ok: false; error: string } => {
  if (value === undefined || value === null || value === '') {
    return { ok: true, cursor: null };
  }
  if (!isSafeCursor(value)) {
    return { ok: false, error: 'Invalid cursor' };
  }
  return { ok: true, cursor: String(value).trim() };
};

const writeRecoveryAudit = async (
  req: Request,
  params: {
    actionKey: string;
    mode: MediaRecoveryMode;
    status: 'success' | 'error' | 'denied';
    message: string;
    metadata?: Record<string, unknown>;
  }
) => {
  try {
    const meta = await extractRequestAuditMeta(req);
    await writeAdminAuditEvent({
      actorUserId: meta.actorUserId,
      actorStaffId: meta.actorStaffId,
      actorRole: meta.actorRole,
      moduleKey: 'media_recovery',
      actionKey: params.actionKey,
      entityType: 'media_recovery_job',
      entityId: params.mode,
      severity: params.mode === 'repair' ? 'warning' : 'info',
      status: params.status,
      message: params.message,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      metadata: {
        mode: params.mode,
        adminId: meta.actorUserId,
        timestamp: new Date().toISOString(),
        // Never log signed URLs, credentials, or full media contents
        ...params.metadata
      }
    });
  } catch (error) {
    console.error('[media-recovery] audit log write failed (non-fatal)', {
      actionKey: params.actionKey,
      mode: params.mode
    });
  }
};

/**
 * POST /api/admin/media-recovery/audit
 * Always dry-run. Repair flags in body are ignored/rejected for mutation.
 */
export const postMediaRecoveryAudit = async (req: Request, res: Response) => {
  try {
    const body = (req.body || {}) as Record<string, unknown>;

    // Explicitly ignore/reject repair triggers on audit route
    if (
      String(body.mode || '').toLowerCase() === 'repair' ||
      body.repair === true ||
      requireConfirm(body)
    ) {
      // Do not repair — force dry-run; log attempt
      await writeRecoveryAudit(req, {
        actionKey: 'media_recovery_audit_repair_flag_ignored',
        mode: 'dry-run',
        status: 'denied',
        message: 'Repair flags ignored on audit endpoint; dry-run only'
      });
    }

    const cursorParsed = parseCursor(body.cursor);
    if (cursorParsed.ok === false) {
      return res.status(400).json({ success: false, error: cursorParsed.error });
    }

    const report = await runMediaRecovery({
      mode: 'dry-run',
      limit: clampLimit(body.limit, 500, MAX_LIMIT),
      cursor: cursorParsed.cursor,
      batchSize: clampBatchSize(body.batchSize, 100, MAX_BATCH),
      includeOrphanScan: Boolean(body.includeOrphanScan),
      orphanScanLimit: clampLimit(body.orphanScanLimit, 1000, MAX_ORPHAN_LIMIT),
      orphanPrefix: sanitizeOrphanPrefix(body.orphanPrefix),
      maxResultDetails: clampLimit(body.maxResultDetails, 200, MAX_DETAILS)
    });

    const publicReport = toPublicRecoveryReport(report);

    await writeRecoveryAudit(req, {
      actionKey: 'media_recovery_audit',
      mode: 'dry-run',
      status: 'success',
      message: 'Media recovery dry-run audit completed',
      metadata: {
        scanned: report.statistics.scannedFiles,
        healthy: report.statistics.healthy,
        recoverable: report.statistics.recoverable,
        unrecoverable: report.statistics.unrecoverable,
        orphaned: report.statistics.orphaned,
        mutations: report.mutations
      }
    });

    return res.json({ success: true, data: publicReport });
  } catch (error: any) {
    console.error('Media recovery audit failed:', error?.message || error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Media recovery audit failed'
    });
  }
};

/**
 * POST /api/admin/media-recovery/repair
 * Requires confirm=true. Never available via GET.
 */
export const postMediaRecoveryRepair = async (req: Request, res: Response) => {
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    if (!requireConfirm(body)) {
      await writeRecoveryAudit(req, {
        actionKey: 'media_recovery_repair_denied',
        mode: 'repair',
        status: 'denied',
        message: 'Repair rejected: confirm=true required'
      });
      return res.status(400).json({
        success: false,
        error: 'Repair mode requires confirm=true. Use /audit for dry-run reports.'
      });
    }

    const cursorParsed = parseCursor(body.cursor);
    if (cursorParsed.ok === false) {
      return res.status(400).json({ success: false, error: cursorParsed.error });
    }

    const report = await runMediaRecovery({
      mode: 'repair',
      limit: clampLimit(body.limit, 50, 500), // conservative default batch for repair
      cursor: cursorParsed.cursor,
      batchSize: clampBatchSize(body.batchSize, 25, 100),
      includeOrphanScan: Boolean(body.includeOrphanScan),
      orphanScanLimit: clampLimit(body.orphanScanLimit, 1000, MAX_ORPHAN_LIMIT),
      orphanPrefix: sanitizeOrphanPrefix(body.orphanPrefix),
      maxResultDetails: clampLimit(body.maxResultDetails, 200, MAX_DETAILS)
    });

    const publicReport = toPublicRecoveryReport(report);

    await writeRecoveryAudit(req, {
      actionKey: 'media_recovery_repair',
      mode: 'repair',
      status: 'success',
      message: 'Media recovery repair run completed',
      metadata: {
        scanned: report.statistics.scannedFiles,
        recovered: report.statistics.recovered,
        healthy: report.statistics.healthy,
        unrecoverable: report.statistics.unrecoverable,
        orphaned: report.statistics.orphaned,
        mutations: report.mutations,
        cleanupRequired: report.results.filter((r) => r.cleanupRequired).length
      }
    });

    return res.json({ success: true, data: publicReport });
  } catch (error: any) {
    console.error('Media recovery repair failed:', error?.message || error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Media recovery repair failed'
    });
  }
};

/**
 * POST /api/admin/media-recovery/run
 */
export const postMediaRecoveryRun = async (req: Request, res: Response) => {
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const mode = parseMode(body.mode);

    if (mode === 'repair' && !requireConfirm(body)) {
      await writeRecoveryAudit(req, {
        actionKey: 'media_recovery_run_denied',
        mode: 'repair',
        status: 'denied',
        message: 'Repair via /run rejected: confirm=true required'
      });
      return res.status(400).json({
        success: false,
        error: 'Repair mode requires confirm=true'
      });
    }

    const cursorParsed = parseCursor(body.cursor);
    if (cursorParsed.ok === false) {
      return res.status(400).json({ success: false, error: cursorParsed.error });
    }

    const report = await runMediaRecovery({
      mode,
      limit: clampLimit(body.limit, mode === 'repair' ? 50 : 500, mode === 'repair' ? 500 : MAX_LIMIT),
      cursor: cursorParsed.cursor,
      batchSize: clampBatchSize(body.batchSize, mode === 'repair' ? 25 : 100, mode === 'repair' ? 100 : MAX_BATCH),
      includeOrphanScan: Boolean(body.includeOrphanScan),
      orphanScanLimit: clampLimit(body.orphanScanLimit, 1000, MAX_ORPHAN_LIMIT),
      orphanPrefix: sanitizeOrphanPrefix(body.orphanPrefix),
      maxResultDetails: clampLimit(body.maxResultDetails, 200, MAX_DETAILS)
    });

    const publicReport = toPublicRecoveryReport(report);

    await writeRecoveryAudit(req, {
      actionKey: mode === 'repair' ? 'media_recovery_run_repair' : 'media_recovery_run_audit',
      mode,
      status: 'success',
      message: `Media recovery ${mode} completed`,
      metadata: {
        scanned: report.statistics.scannedFiles,
        recovered: report.statistics.recovered,
        recoverable: report.statistics.recoverable,
        mutations: report.mutations
      }
    });

    return res.json({ success: true, data: publicReport });
  } catch (error: any) {
    console.error('Media recovery run failed:', error?.message || error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Media recovery run failed'
    });
  }
};
