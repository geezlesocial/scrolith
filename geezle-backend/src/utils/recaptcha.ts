import fs from 'fs';
import path from 'path';
import prisma from './prismaClient';

type RecaptchaConfig = {
  enabled: boolean;
  version: 'v2' | 'v3';
  scoreThreshold: number;
  secretKey: string;
};

const SETTINGS_FILE = path.resolve(__dirname, '../../data/platform-system-settings.json');

const readSettingsFile = (): { platform?: any; system?: any } | null => {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return null;
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
};

const getSystemSettings = async () => {
  try {
    const record = await prisma.appSetting.findUnique({ where: { scope: 'system' } });
    if (record?.data) return record.data;
  } catch (e) {
    // ignore and fall back to file
  }
  const file = readSettingsFile();
  return file?.system ?? null;
};

const getPlatformSettings = async () => {
  try {
    const record = await prisma.appSetting.findUnique({ where: { scope: 'platform' } });
    if (record?.data) return record.data;
  } catch (e) {
    // ignore and fall back to file
  }
  const file = readSettingsFile();
  return file?.platform ?? null;
};

const resolveRecaptchaConfig = async (): Promise<RecaptchaConfig> => {
  const [system, platform] = await Promise.all([getSystemSettings(), getPlatformSettings()]);
  const recaptcha = platform?.integrations?.recaptcha || {};
  const enabled = Boolean(recaptcha?.enabled);
  const version = (recaptcha?.version || 'v3') === 'v2' ? 'v2' : 'v3';
  const scoreThreshold = typeof recaptcha?.scoreThreshold === 'number' ? recaptcha.scoreThreshold : 0.5;
  const secretKey = system?.integrations?.recaptchaSecretKey || process.env.RECAPTCHA_SECRET_KEY || '';
  return { enabled, version, scoreThreshold, secretKey };
};

const getFetch = async () => {
  if (typeof fetch === 'function') return fetch;
  const mod = await import('node-fetch');
  return (mod as any).default || mod;
};

export const verifyRecaptcha = async (token?: string, reqIp?: string) => {
  const config = await resolveRecaptchaConfig();
  if (!config.enabled) {
    return { enforced: false, success: true };
  }

  if (!config.secretKey) {
    return { enforced: true, success: false, error: 'reCAPTCHA secret key is not configured.' };
  }

  if (!token) {
    return { enforced: true, success: false, error: 'Missing reCAPTCHA token.' };
  }

  try {
    const params = new URLSearchParams();
    params.append('secret', config.secretKey);
    params.append('response', token);
    if (reqIp) params.append('remoteip', reqIp);

    const doFetch = await getFetch();
    const resp = await doFetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    const data = await resp.json().catch(() => ({}));

    if (!data?.success) {
      return { enforced: true, success: false, error: 'reCAPTCHA validation failed.', codes: data?.['error-codes'] };
    }

    if (config.version === 'v3' && typeof data?.score === 'number' && data.score < config.scoreThreshold) {
      return { enforced: true, success: false, error: `reCAPTCHA score too low (${data.score}).` };
    }

    return { enforced: true, success: true, score: data?.score, action: data?.action };
  } catch (e: any) {
    return { enforced: true, success: false, error: e?.message || 'reCAPTCHA verification failed.' };
  }
};
