import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import fs from 'fs';
import path from 'path';
import {
  createEmailTransporter,
  normalizeEmailSettings,
  validateEmailSettings
} from '../services/email.service';
import {
  DEFAULT_RUNTIME_OPTIMIZATION_CONFIG,
  normalizeRuntimeOptimizationConfig,
  serializeRuntimeOptimizationConfig
} from '../services/runtimeOptimization.service';

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
  optimization: serializeRuntimeOptimizationConfig(DEFAULT_RUNTIME_OPTIMIZATION_CONFIG),
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

const hydrateSystemSettings = (raw: any) => {
  const merged = deepMergeReplaceArrays(DEFAULT_SYSTEM, raw || {});
  const normalizedOptimization = normalizeRuntimeOptimizationConfig(merged?.optimization);
  merged.optimization = serializeRuntimeOptimizationConfig(normalizedOptimization);
  return merged;
};

const pickFirstDefined = (source: Record<string, any>, keys: string[]) => {
  for (const key of keys) {
    if (source[key] !== undefined) return source[key];
  }
  return undefined;
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

  if (obj.optimization !== undefined) {
    if (!isPlainObject(obj.optimization)) {
      errors.push('optimization must be an object');
    } else {
      const optimization = obj.optimization as Record<string, any>;
      const booleanRules: Array<{ key: string; aliases?: string[] }> = [
        { key: 'enabled' },
        { key: 'compressionEnabled', aliases: ['compression_enabled'] },
        { key: 'apiResponseCachingEnabled', aliases: ['api_response_caching_enabled'] },
        { key: 'staticAssetCachingEnabled', aliases: ['static_asset_caching_enabled'] },
        { key: 'htmlMinifyEnabled', aliases: ['html_minify_enabled'] },
        { key: 'htmlCollapseWhitespace', aliases: ['html_collapse_whitespace'] },
        { key: 'htmlRemoveComments', aliases: ['html_remove_comments'] },
        { key: 'jsonMinifyEnabled', aliases: ['json_minify_enabled'] },
        { key: 'speedHintsEnabled', aliases: ['speed_hints_enabled'] }
      ];
      for (const rule of booleanRules) {
        const value = pickFirstDefined(optimization, [rule.key, ...(rule.aliases || [])]);
        if (value === undefined) continue;
        if (typeof value !== 'boolean') {
          errors.push(`optimization.${rule.key} must be boolean`);
        }
      }

      const numericRules: Array<{ key: string; aliases?: string[]; min: number; max: number }> = [
        { key: 'compressionLevel', aliases: ['compression_level'], min: 1, max: 9 },
        { key: 'compressionThresholdKb', aliases: ['compression_threshold_kb'], min: 0, max: 2048 },
        { key: 'apiResponseCacheSeconds', aliases: ['api_response_cache_seconds'], min: 5, max: 3600 },
        { key: 'apiResponseCacheMaxEntries', aliases: ['api_response_cache_max_entries'], min: 50, max: 5000 },
        { key: 'staticAssetCacheSeconds', aliases: ['static_asset_cache_seconds'], min: 60, max: 31536000 }
      ];
      for (const rule of numericRules) {
        const value = pickFirstDefined(optimization, [rule.key, ...(rule.aliases || [])]);
        if (value === undefined) continue;
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) {
          errors.push(`optimization.${rule.key} must be a number`);
          continue;
        }
        if (numeric < rule.min || numeric > rule.max) {
          errors.push(`optimization.${rule.key} must be between ${rule.min} and ${rule.max}`);
        }
      }

      const preconnect = pickFirstDefined(optimization, ['preconnectOrigins', 'preconnect_origins']);
      if (preconnect !== undefined) {
        const origins = Array.isArray(preconnect)
          ? preconnect
          : String(preconnect || '')
              .split(/[,\n]/g)
              .map((entry) => String(entry || '').trim())
              .filter(Boolean);
        if (origins.length > 20) {
          errors.push('optimization.preconnectOrigins supports at most 20 entries');
        }
        const invalidOrigin = origins.find((origin) => !/^https?:\/\//i.test(String(origin || '').trim()));
        if (invalidOrigin) {
          errors.push('optimization.preconnectOrigins must contain valid http(s) URLs');
        }
      }

      const apiCacheExcludePaths = pickFirstDefined(optimization, ['apiCacheExcludePaths', 'api_cache_exclude_paths']);
      if (apiCacheExcludePaths !== undefined) {
        const paths = Array.isArray(apiCacheExcludePaths)
          ? apiCacheExcludePaths
          : String(apiCacheExcludePaths || '')
              .split(/[,\n]/g)
              .map((entry) => String(entry || '').trim())
              .filter(Boolean);
        if (paths.length > 100) {
          errors.push('optimization.apiCacheExcludePaths supports at most 100 entries');
        }
      }
    }
  }

  return errors;
};

export const getSystemSettings = async (req: Request, res: Response) => {
  // Try DB first; if DB unavailable, fall back to file persistence used in admin routes
  const SETTINGS_DIR = path.resolve(__dirname, '../../../data');
  const SETTINGS_FILE = path.join(SETTINGS_DIR, 'platform-system-settings.json');

  try {
    const record = await prisma.appSetting.findUnique({ where: { scope: 'system' } });
    const data = hydrateSystemSettings(record?.data ?? DEFAULT_SYSTEM);
    (req.app as any)?.set?.('runtime:systemSettings', data);
    (req.app as any)?.set?.('runtime:systemSettingsVersion', Date.now());
    (req.app as any)?.set?.('runtime:optimizationConfig', normalizeRuntimeOptimizationConfig((data as any)?.optimization));
    return res.json({ success: true, data });
  } catch (error) {
    console.warn('getSystemSettings DB error, attempting file fallback', error);
    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed.system) {
          const data = hydrateSystemSettings(parsed.system);
          (req.app as any)?.set?.('runtime:systemSettings', data);
          (req.app as any)?.set?.('runtime:systemSettingsVersion', Date.now());
          (req.app as any)?.set?.('runtime:optimizationConfig', normalizeRuntimeOptimizationConfig((data as any)?.optimization));
          return res.json({ success: true, data });
        }
        if (parsed && parsed.platform) {
          // older platform-only file; return defaults merged
          const data = hydrateSystemSettings(DEFAULT_SYSTEM);
          (req.app as any)?.set?.('runtime:systemSettings', data);
          (req.app as any)?.set?.('runtime:systemSettingsVersion', Date.now());
          (req.app as any)?.set?.('runtime:optimizationConfig', normalizeRuntimeOptimizationConfig((data as any)?.optimization));
          return res.json({ success: true, data });
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
    const existing = hydrateSystemSettings(record?.data ?? DEFAULT_SYSTEM);

    // Merge safely
    merged = deepMergeReplaceArrays(existing, payload);
    merged = hydrateSystemSettings(merged);

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
    (req.app as any)?.set?.('runtime:systemSettings', merged);
    (req.app as any)?.set?.('runtime:systemSettingsVersion', Date.now());
    (req.app as any)?.set?.('runtime:optimizationConfig', normalizeRuntimeOptimizationConfig((merged as any)?.optimization));

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
      (req.app as any)?.set?.('runtime:systemSettings', merged);
      (req.app as any)?.set?.('runtime:systemSettingsVersion', Date.now());
      (req.app as any)?.set?.('runtime:optimizationConfig', normalizeRuntimeOptimizationConfig((merged as any)?.optimization));
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

