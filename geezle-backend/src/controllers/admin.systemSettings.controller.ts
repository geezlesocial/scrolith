import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import fs from 'fs';
import path from 'path';
import {
  createEmailTransporter,
  normalizeEmailSettings,
  validateEmailSettings
} from '../services/email.service';

const DEFAULT_SYSTEM = {
  maintenanceMode: false,
  registrationsEnabled: true,
  kycEnforced: false,
  admin2FA: false,
  listings: {
    autoApproveGigs: false,
    autoApproveJobs: false,
    featurePolicy: {
      freeFeaturedGigsPerMonth: 1,
      freeFeaturedJobsPerMonth: 1,
      feedCardEveryPosts: 2,
      maxListingCardsPerFeed: 8,
      recommendedPoolLimit: 20
    }
  },
  currency: {
    autoExchangeRate: true,
    baseCurrency: 'USD',
    provider: 'openexchangerates'
  },
  currencies: []
};

const isPlainObject = (v: any) => v && typeof v === 'object' && !Array.isArray(v);

// Merge rules: objects = deep merge, arrays = replace if provided, scalars = replace
export const deepMergeReplaceArrays = (existing: any, incoming: any): any => {
  if (incoming === undefined) return existing;
  if (Array.isArray(incoming)) return incoming;
  if (!isPlainObject(incoming)) return incoming;
  const out: any = { ...(isPlainObject(existing) ? existing : {}) };
  for (const key of Object.keys(incoming)) {
    out[key] = deepMergeReplaceArrays(existing ? existing[key] : undefined, incoming[key]);
  }
  return out;
};

export const validateSystem = (obj: any) => {
  const errors: string[] = [];
  if (obj.maintenanceMode !== undefined && typeof obj.maintenanceMode !== 'boolean') errors.push('maintenanceMode must be boolean');
  if (obj.registrationsEnabled !== undefined && typeof obj.registrationsEnabled !== 'boolean') errors.push('registrationsEnabled must be boolean');
  if (obj.kycEnforced !== undefined && typeof obj.kycEnforced !== 'boolean') errors.push('kycEnforced must be boolean');
  if (obj.admin2FA !== undefined && typeof obj.admin2FA !== 'boolean') errors.push('admin2FA must be boolean');
  if (obj.listings?.featurePolicy) {
    const policy = obj.listings.featurePolicy;
    const numericRules: Array<{ key: string; min?: number; max?: number }> = [
      { key: 'freeFeaturedGigsPerMonth', min: 0, max: 500 },
      { key: 'freeFeaturedJobsPerMonth', min: 0, max: 500 },
      { key: 'feedCardEveryPosts', min: 2, max: 20 },
      { key: 'maxListingCardsPerFeed', min: 1, max: 50 },
      { key: 'recommendedPoolLimit', min: 4, max: 200 }
    ];
    numericRules.forEach(({ key, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER }) => {
      if (policy[key] === undefined) return;
      const numeric = Number(policy[key]);
      if (!Number.isFinite(numeric)) {
        errors.push(`listings.featurePolicy.${key} must be a number`);
        return;
      }
      if (numeric < min || numeric > max) {
        errors.push(`listings.featurePolicy.${key} must be between ${min} and ${max}`);
      }
    });
  }

  // currency checks
  const currency = obj.currency;
  if (currency) {
    if (currency.baseCurrency && obj.currencies && Array.isArray(obj.currencies)) {
      const exists = obj.currencies.some((c: any) => c.code === currency.baseCurrency && c.isActive !== false);
      if (!exists) errors.push('currency.baseCurrency must exist in active currencies');
    }
  }

  // currencies uniqueness
  if (obj.currencies && Array.isArray(obj.currencies)) {
    const codes = obj.currencies.map((c: any) => (c.code || '').toString().toUpperCase());
    const dup = codes.find((c: any, i: number) => codes.indexOf(c) !== i);
    if (dup) errors.push(`duplicate currency code: ${dup}`);
  }

  // email.port if present
  if (obj.email && obj.email.port !== undefined && typeof obj.email.port !== 'number') errors.push('email.port must be a number');
  if (obj.email && obj.email.provider !== undefined) {
    const provider = String(obj.email.provider).trim().toLowerCase();
    if (!['smtp', 'ses', 'sendgrid', 'mailgun'].includes(provider)) {
      errors.push('email.provider must be one of smtp, ses, sendgrid, mailgun');
    }
  }
  if (obj.email && obj.email.encryption !== undefined) {
    const encryption = String(obj.email.encryption).trim().toLowerCase();
    if (!['tls', 'ssl', 'none'].includes(encryption)) {
      errors.push('email.encryption must be one of tls, ssl, none');
    }
  }

  // aiConfig.safety.maxTokens
  if (obj.aiConfig && obj.aiConfig.safety && obj.aiConfig.safety.maxTokens !== undefined && typeof obj.aiConfig.safety.maxTokens !== 'number') errors.push('aiConfig.safety.maxTokens must be a number');

  return errors;
};

export const getSystemSettings = async (req: Request, res: Response) => {
  // Try DB first; if DB unavailable, fall back to file persistence used in admin routes
  const SETTINGS_DIR = path.resolve(__dirname, '../../../data');
  const SETTINGS_FILE = path.join(SETTINGS_DIR, 'platform-system-settings.json');

  try {
    const record = await prisma.appSetting.findUnique({ where: { scope: 'system' } });
    const data = record?.data ?? DEFAULT_SYSTEM;
    return res.json({ success: true, data });
  } catch (error) {
    console.warn('getSystemSettings DB error, attempting file fallback', error);
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed.system) {
          return res.json({ success: true, data: parsed.system });
        }
        if (parsed && parsed.platform) {
          // older platform-only file; return defaults merged
          return res.json({ success: true, data: DEFAULT_SYSTEM });
        }
      }
    } catch (fsErr) {
      console.warn('Failed to read persisted settings file', fsErr);
    }
    return res.json({ success: true, data: DEFAULT_SYSTEM });
  }
};

export const updateSystemSettings = async (req: Request, res: Response) => {
  let merged: any;
  try {
    const payload = req.body || {};

    // Load existing
    const record = await prisma.appSetting.findUnique({ where: { scope: 'system' } });
    const existing = record?.data ?? DEFAULT_SYSTEM;

    // Merge safely
    merged = deepMergeReplaceArrays(existing, payload);

    // Validation
    const errors = validateSystem(merged);
    if (errors.length) {
      return res.status(400).json({ success: false, error: errors.join('; '), timestamp: new Date().toISOString() });
    }

    // Upsert
    const upserted = await prisma.appSetting.upsert({
      where: { scope: 'system' },
      create: { scope: 'system', data: merged },
      update: { data: merged }
    });

    // Emit socket event
    const io = (req.app as unknown as { get?: (k: string) => unknown }).get?.('io') as { emit?: (ev: string, payload: unknown) => void } | undefined;
    io?.emit?.('settings:updated', { scope: 'system', settings: merged });

    return res.json({ success: true, data: merged });
  } catch (error) {
    console.error('updateSystemSettings DB error, attempting file fallback', error);
    // Attempt file-based persistence as a fallback (use same file as admin router)
    try {
      const SETTINGS_DIR = path.resolve(__dirname, '../../../data');
      const SETTINGS_FILE = path.join(SETTINGS_DIR, 'platform-system-settings.json');
      fs.mkdirSync(SETTINGS_DIR, { recursive: true });
      const existingRaw = fs.existsSync(SETTINGS_FILE) ? fs.readFileSync(SETTINGS_FILE, 'utf-8') : '{}';
      let existing: Record<string, unknown> = {};
      try { existing = existingRaw ? JSON.parse(existingRaw) : {}; } catch (e) { existing = {}; }
      existing['system'] = merged;
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(existing, null, 2), 'utf-8');
      const io = (req.app as unknown as { get?: (k: string) => unknown }).get?.('io') as { emit?: (ev: string, payload: unknown) => void } | undefined;
      io?.emit?.('settings:updated', { scope: 'system', settings: merged });
      console.log('[admin] Persisted system settings to', SETTINGS_FILE);
      return res.json({ success: true, data: merged, fallback: 'file' });
    } catch (fsErr) {
      console.error('Failed to write fallback settings file', fsErr);
      return res.status(500).json({ success: false, error: 'Failed to save system settings', timestamp: new Date().toISOString() });
    }
  }
};

export const testEmailSettings = async (req: Request, res: Response) => {
  try {
    const payload = req.body || {};
    const to = payload.to || payload.email || payload.recipient;
    if (!to) {
      return res.status(400).json({ success: false, error: 'Recipient email is required' });
    }

    const providedConfig = payload.config || payload.emailConfig || payload.smtp || null;
    let config = providedConfig;

    if (!config) {
      const record = await prisma.appSetting.findUnique({ where: { scope: 'system' } });
      const data = record?.data as any;
      config = data?.email || null;
    }

    if (!config) {
      return res.status(400).json({ success: false, error: 'Email configuration not found' });
    }

    const normalized = normalizeEmailSettings(config);
    const validationErrors = validateEmailSettings(normalized);
    if (validationErrors.length || !normalized) {
      return res.status(400).json({ success: false, error: validationErrors[0] || 'Invalid email configuration' });
    }

    const transporter = createEmailTransporter(normalized);
    if (typeof transporter.verify === 'function') {
      await transporter.verify();
    }

    await transporter.sendMail({
      from: `${normalized.fromName} <${normalized.fromEmail}>`,
      to,
      subject: `Scrolith Email Test (${normalized.provider.toUpperCase()})`,
      text: `This is a test email from Scrolith System Settings using ${normalized.provider.toUpperCase()}. If you received this, your email provider configuration is working.`
    });

    return res.json({ success: true, message: `Test email sent to ${to}`, provider: normalized.provider });
  } catch (error: any) {
    console.error('SMTP test failed', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to send test email' });
  }
};

export default { getSystemSettings, updateSystemSettings, testEmailSettings };

