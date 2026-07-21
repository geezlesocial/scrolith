import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prismaClient';

type MaintenanceCache = {
  enabled: boolean;
  expiresAt: number;
};

const cache: MaintenanceCache = {
  enabled: false,
  expiresAt: 0
};

const CACHE_TTL_MS = Number(process.env.MAINTENANCE_CACHE_TTL_MS || 5000);
let lastReadErrorAt = 0;

const ALWAYS_ALLOW_PREFIXES = [
  '/api/admin',
  '/api/auth',
  '/api/cms',
  '/api/intelligence/feedback',
  '/api/marketing',
  '/api/public/preloader'
];

const ALWAYS_ALLOW_EXACT = new Set<string>([
  '/api/health',
  '/api/currencies/active'
]);

const ALWAYS_ALLOW_FILES_PREFIX = '/api/files/content/';

const normalizeBoolean = (value: unknown, fallback = false): boolean => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  if (typeof value === 'number') return value !== 0;
  return Boolean(value);
};

const parseCookies = (cookieHeader?: string): Record<string, string> => {
  const jar: Record<string, string> = {};
  if (!cookieHeader) return jar;
  cookieHeader.split(';').forEach((part) => {
    const [rawKey, ...rest] = part.trim().split('=');
    if (!rawKey) return;
    const key = rawKey.trim();
    const value = rest.join('=').trim();
    if (!key) return;
    try {
      jar[key] = decodeURIComponent(value);
    } catch {
      jar[key] = value;
    }
  });
  return jar;
};

const getTokenFromRequest = (req: Request): string | null => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }

  const cookies = parseCookies(req.headers.cookie as string | undefined);
  const cookieToken = cookies['Scrolith_token'] || cookies['token'];
  return cookieToken || null;
};

const isPrivilegedRole = (role?: string | null): boolean => {
  const normalized = String(role || '').toLowerCase();
  return normalized.includes('admin') || normalized.includes('staff');
};

const hasPrivilegedAccess = (req: Request): boolean => {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return false;
    const secret = process.env.JWT_SECRET || 'dev_jwt_secret';
    const decoded = jwt.verify(token, secret) as { role?: string };
    return isPrivilegedRole(decoded?.role);
  } catch {
    return false;
  }
};

const isAlwaysAllowedPath = (fullPath: string): boolean => {
  if (ALWAYS_ALLOW_EXACT.has(fullPath)) return true;
  if (fullPath.startsWith(ALWAYS_ALLOW_FILES_PREFIX)) return true;
  return ALWAYS_ALLOW_PREFIXES.some((prefix) => fullPath.startsWith(prefix));
};

const readMaintenanceMode = async (): Promise<boolean> => {
  const now = Date.now();
  if (cache.expiresAt > now) {
    return cache.enabled;
  }

  try {
    const record = await prisma.appSetting.findUnique({
      where: { scope: 'system' },
      select: { data: true }
    });

    const raw = record?.data as Record<string, unknown> | null | undefined;
    const enabled = normalizeBoolean(raw?.maintenanceMode ?? raw?.maintenance_mode, false);
    cache.enabled = enabled;
    cache.expiresAt = now + CACHE_TTL_MS;
    return enabled;
  } catch (error) {
    // Fail-open to avoid accidental platform-wide outages if settings storage is unavailable.
    if (now - lastReadErrorAt > 60000) {
      lastReadErrorAt = now;
      console.warn('[maintenance] Failed to read system settings; skipping maintenance enforcement.', error);
    }
    cache.enabled = false;
    cache.expiresAt = now + CACHE_TTL_MS;
    return false;
  }
};

export const maintenanceModeMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const fullPath = `${req.baseUrl || ''}${req.path || ''}`;

    if (req.method === 'OPTIONS') {
      return next();
    }

    if (isAlwaysAllowedPath(fullPath)) {
      return next();
    }

    if (hasPrivilegedAccess(req)) {
      return next();
    }

    const maintenanceEnabled = await readMaintenanceMode();
    if (!maintenanceEnabled) {
      return next();
    }

    // Include CMS-managed maintenance page payload for clients.
    let page: Record<string, unknown> | undefined;
    try {
      const { getSystemControls } = await import('../services/systemControls.service');
      const controls = await getSystemControls();
      page = controls.maintenancePage as unknown as Record<string, unknown>;
    } catch {
      page = undefined;
    }

    return res.status(503).json({
      success: false,
      code: 'MAINTENANCE_MODE',
      message:
        (page?.message as string) ||
        'Scrolith is temporarily unavailable due to scheduled maintenance. Please try again shortly.',
      maintenancePage: page || null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    // Fail-open for unexpected middleware errors.
    return next();
  }
};

export default maintenanceModeMiddleware;
