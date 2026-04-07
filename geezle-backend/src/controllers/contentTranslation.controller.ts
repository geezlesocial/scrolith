import type { Request, Response } from 'express';
import {
  createContentTranslationGlossaryEntry,
  deleteContentTranslationGlossaryEntry,
  getContentTranslationOverview,
  listContentTranslationAuditLogs,
  listContentTranslationGlossary,
  runContentTranslationTest,
  updateContentTranslationConfig,
  updateContentTranslationGlossaryEntry
} from '../services/contentTranslation.service';

const success = (res: Response, data: any, message = '') =>
  res.json({ success: true, data, message });

const fail = (res: Response, status: number, message: string, data: any = null) =>
  res.status(status).json({ success: false, data, message });

const asString = (value: unknown) => String(value ?? '').trim();

export const getAdminContentTranslationConfig = async (_req: Request, res: Response) => {
  try {
    return success(res, await getContentTranslationOverview());
  } catch (error: any) {
    return fail(res, 500, error?.message || 'Failed to load content translation configuration');
  }
};

export const updateAdminContentTranslationConfig = async (req: Request, res: Response) => {
  try {
    const updated = await updateContentTranslationConfig(req.body || {}, req.user?.id || null);
    return success(res, updated, 'Content translation configuration updated');
  } catch (error: any) {
    return fail(res, 400, error?.message || 'Failed to update content translation configuration');
  }
};

export const listAdminContentTranslationGlossary = async (_req: Request, res: Response) => {
  try {
    return success(res, { items: await listContentTranslationGlossary() });
  } catch (error: any) {
    return fail(res, 500, error?.message || 'Failed to load content translation glossary');
  }
};

export const createAdminContentTranslationGlossaryEntry = async (req: Request, res: Response) => {
  try {
    const entry = await createContentTranslationGlossaryEntry(req.body || {}, req.user?.id || null);
    return success(res, entry, 'Glossary entry created');
  } catch (error: any) {
    return fail(res, 400, error?.message || 'Failed to create glossary entry');
  }
};

export const updateAdminContentTranslationGlossaryEntry = async (req: Request, res: Response) => {
  try {
    const id = asString(req.params.id);
    if (!id) return fail(res, 400, 'Glossary entry ID is required');
    const entry = await updateContentTranslationGlossaryEntry(id, req.body || {}, req.user?.id || null);
    return success(res, entry, 'Glossary entry updated');
  } catch (error: any) {
    return fail(res, 400, error?.message || 'Failed to update glossary entry');
  }
};

export const deleteAdminContentTranslationGlossaryEntry = async (req: Request, res: Response) => {
  try {
    const id = asString(req.params.id);
    if (!id) return fail(res, 400, 'Glossary entry ID is required');
    await deleteContentTranslationGlossaryEntry(id, req.user?.id || null);
    return success(res, { deleted: true }, 'Glossary entry deleted');
  } catch (error: any) {
    return fail(res, 400, error?.message || 'Failed to delete glossary entry');
  }
};

export const listAdminContentTranslationAuditLogs = async (req: Request, res: Response) => {
  try {
    const limit = Number.parseInt(String(req.query.limit || '40'), 10);
    return success(res, { items: await listContentTranslationAuditLogs(limit) });
  } catch (error: any) {
    return fail(res, 500, error?.message || 'Failed to load content translation audit logs');
  }
};

export const runAdminContentTranslationTest = async (req: Request, res: Response) => {
  try {
    const result = await runContentTranslationTest({
      text: req.body?.text,
      sourceLocale: req.body?.sourceLocale,
      targetLocale: req.body?.targetLocale
    });
    return success(res, result, 'Translation test completed');
  } catch (error: any) {
    return fail(res, 400, error?.message || 'Failed to run translation test');
  }
};
