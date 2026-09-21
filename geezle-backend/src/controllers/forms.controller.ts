import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import prisma from '../utils/prismaClient';
import { writeFileAtomicallySync } from '../utils/atomicFile';

const SETTINGS_DIR = path.resolve(__dirname, '../../data');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'platform-system-settings.json');

const DEFAULT_FORMS = {
  gig: {
    layout: {
      titleCreate: 'Create New Gig',
      titleEdit: 'Edit Gig',
      sectionGap: 24,
      cardPadding: 32
    },
    steps: [
      { id: 'overview', label: 'Overview', enabled: true },
      { id: 'pricing', label: 'Scope & Pricing', enabled: true },
      { id: 'description', label: 'Description', enabled: true },
      { id: 'requirements', label: 'Requirements', enabled: true },
      { id: 'gallery', label: 'Gallery', enabled: true },
      { id: 'publish', label: 'Publish', enabled: true }
    ],
    labels: {
      titleLabel: 'Gig Title',
      categoryLabel: 'Category',
      subcategoryLabel: 'Subcategory',
      pricingTitle: 'Scope & Pricing',
      extrasTitle: 'Gig Extras',
      faqTitle: 'FAQs',
      descriptionLabel: 'Gig Description',
      requirementsTitle: 'Requirements',
      galleryTitle: 'Gallery'
    },
    controls: {
      showAI: true,
      showPackages: true,
      showPackageFeatures: true,
      showExtras: true,
      showFAQs: true,
      showRequirements: true,
      showGalleryImages: true,
      showGalleryVideos: true,
      showGalleryDocs: true
    },
    customBlocks: {},
    customFields: {}
  },
  job: {
    layout: {
      titleCreate: 'Create Job Post',
      titleEdit: 'Edit Job Post',
      sectionGap: 24,
      cardPadding: 32
    },
    steps: [
      { id: 'overview', label: 'Job Overview', enabled: true },
      { id: 'budget', label: 'Budget & Timeline', enabled: true },
      { id: 'description', label: 'Description', enabled: true },
      { id: 'attachments', label: 'Attachments', enabled: true },
      { id: 'plan', label: 'Plan', enabled: true },
      { id: 'review', label: 'Review', enabled: true }
    ],
    labels: {
      titleLabel: 'Job Title',
      categoryLabel: 'Category',
      subcategoryLabel: 'Subcategory',
      budgetTitle: 'Budget & Timeline',
      descriptionLabel: 'Job Description',
      attachmentsTitle: 'Attachments',
      planTitle: 'Plan Selection'
    },
    controls: {
      showBudgetAdvice: true,
      showAttachments: true,
      showPlanStep: true
    },
    customBlocks: {},
    customFields: {}
  },
  updatedAt: new Date().toISOString()
};

const isPlainObject = (v: any) => v && typeof v === 'object' && !Array.isArray(v);

const deepMergeReplaceArrays = (existing: any, incoming: any): any => {
  if (incoming === undefined) return existing;
  if (Array.isArray(incoming)) return incoming;
  if (!isPlainObject(incoming)) return incoming;
  const out: any = { ...(isPlainObject(existing) ? existing : {}) };
  for (const key of Object.keys(incoming)) {
    out[key] = deepMergeReplaceArrays(existing ? existing[key] : undefined, incoming[key]);
  }
  return out;
};

const readFileFallback = () => {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return null;
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed?.forms || null;
  } catch (e) {
    console.warn('[forms] Failed to read fallback settings', e);
    return null;
  }
};

const writeFileFallback = (payload: any) => {
  try {
    fs.mkdirSync(SETTINGS_DIR, { recursive: true });
    const existingRaw = fs.existsSync(SETTINGS_FILE) ? fs.readFileSync(SETTINGS_FILE, 'utf-8') : '{}';
    let existing: Record<string, unknown> = {};
    try {
      existing = existingRaw ? JSON.parse(existingRaw) : {};
    } catch (e) {
      existing = {};
    }
    existing['forms'] = payload;
    writeFileAtomicallySync(SETTINGS_FILE, JSON.stringify(existing, null, 2));
    return true;
  } catch (e) {
    console.warn('[forms] Failed to write fallback settings', e);
    return false;
  }
};

export const getFormsConfig = async (_req: Request, res: Response) => {
  try {
    const record = await prisma.appSetting.findUnique({ where: { scope: 'forms' } });
    const data = record?.data ?? DEFAULT_FORMS;
    return res.json({ success: true, data });
  } catch (error) {
    const fallback = readFileFallback();
    return res.json({ success: true, data: fallback || DEFAULT_FORMS });
  }
};

export const getFormsConfigAdmin = async (_req: Request, res: Response) => {
  return getFormsConfig(_req, res);
};

export const updateFormsConfig = async (req: Request, res: Response) => {
  const payload = req.body || {};
  try {
    const record = await prisma.appSetting.findUnique({ where: { scope: 'forms' } });
    const existing = record?.data ?? DEFAULT_FORMS;
    const merged = deepMergeReplaceArrays(existing, payload);
    const updated = await prisma.appSetting.upsert({
      where: { scope: 'forms' },
      create: { scope: 'forms', data: merged },
      update: { data: merged }
    });
    const io = (req.app as unknown as { get?: (k: string) => unknown }).get?.('io') as { emit?: (ev: string, payload: unknown) => void } | undefined;
    io?.emit?.('forms:config_updated', { settings: merged, timestamp: Date.now() });
    return res.json({ success: true, data: updated?.data ?? merged });
  } catch (error) {
    const fallback = deepMergeReplaceArrays(DEFAULT_FORMS, payload);
    writeFileFallback(fallback);
    const io = (req.app as unknown as { get?: (k: string) => unknown }).get?.('io') as { emit?: (ev: string, payload: unknown) => void } | undefined;
    io?.emit?.('forms:config_updated', { settings: fallback, timestamp: Date.now() });
    return res.json({ success: true, data: fallback, fallback: 'file' });
  }
};

export default {
  getFormsConfig,
  getFormsConfigAdmin,
  updateFormsConfig
};
