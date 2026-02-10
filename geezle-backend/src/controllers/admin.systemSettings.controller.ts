import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import fs from 'fs';
import path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nodemailer = require('nodemailer');

const DEFAULT_SYSTEM = {
  maintenanceMode: false,
  registrationsEnabled: true,
  kycEnforced: false,
  admin2FA: false,
  listings: {
    autoApproveGigs: false,
    autoApproveJobs: false
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

    const host = config.host || '';
    const port = Number(config.port) || 0;
    const username = config.username || '';
    const password = config.password || '';
    const fromName = config.fromName || config.from_name || 'Scrolith';
    const fromEmail = config.fromEmail || config.from_email || 'noreply@Scrolith.com';

    if (!host || !port) {
      return res.status(400).json({ success: false, error: 'SMTP host and port are required' });
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: username ? { user: username, pass: password } : undefined
    });

    await transporter.sendMail({
      from: `${fromName} <${fromEmail}>`,
      to,
      subject: 'Scrolith SMTP Test',
      text: 'This is a test email from Scrolith System Settings. If you received this, your SMTP configuration is working.'
    });

    return res.json({ success: true, message: `Test email sent to ${to}` });
  } catch (error: any) {
    console.error('SMTP test failed', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to send test email' });
  }
};

export default { getSystemSettings, updateSystemSettings, testEmailSettings };

