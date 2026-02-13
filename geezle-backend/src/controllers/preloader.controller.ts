import { Request, Response } from 'express';
import {
  PreloaderBackgroundType,
  PreloaderLoaderType,
  PreloaderPosition,
  PreloaderStatus
} from '@prisma/client';
import prisma from '../utils/prismaClient';

type LoaderTypeClient = 'spinner' | 'progress' | 'logoPulse' | 'dots' | 'skeleton' | 'lottie';
type BackgroundTypeClient = 'solid' | 'gradient';
type PositionTypeClient = 'center' | 'bottom';

const DEFAULT_PRELOADER = {
  id: 'default-preloader',
  name: 'Default Loader',
  status: 'active',
  isActive: true,
  minDurationMs: 800,
  maxDurationMs: 5000,
  showOnInitialLoad: true,
  showOnRouteChange: true,
  showOnApiLoading: false,
  headlineText: 'Loading Scrolith...',
  subText: 'Please wait while we prepare your experience.',
  loaderType: 'spinner' as LoaderTypeClient,
  logoFileId: null as string | null,
  logoUrl: null as string | null,
  backgroundType: 'solid' as BackgroundTypeClient,
  backgroundColor: '#0f172a',
  gradientFrom: '#0f172a',
  gradientTo: '#1d4ed8',
  overlayOpacity: 0.85,
  blurPx: 0,
  accentColor: '#3b82f6',
  textColor: '#ffffff',
  animationSpeed: 1,
  position: 'center' as PositionTypeClient,
  customCss: null as string | null
};

const hasOwn = (obj: any, key: string) => Object.prototype.hasOwnProperty.call(obj || {}, key);

const pickFirst = (obj: any, keys: string[]) => {
  for (const key of keys) {
    if (hasOwn(obj, key)) return obj[key];
  }
  return undefined;
};

const toBoolean = (value: any, fallback: boolean) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const toNumber = (value: any, fallback: number, min: number, max: number) => {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
};

const toStringValue = (value: any, fallback: string | null = null, maxLen = 500) => {
  if (value === undefined) return fallback;
  if (value === null) return null;
  const text = String(value).trim();
  if (!text) return '';
  return text.slice(0, maxLen);
};

const toColor = (value: any, fallback: string) => {
  const raw = toStringValue(value, fallback, 20);
  if (!raw) return fallback;
  const normalized = raw.startsWith('#') ? raw : `#${raw}`;
  return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(normalized) ? normalized : fallback;
};

const CSS_WHITELIST = new Set([
  'font-size',
  'font-weight',
  'letter-spacing',
  'text-transform',
  'border-radius',
  'box-shadow',
  'opacity',
  'padding',
  'margin',
  'gap',
  'line-height',
  'width',
  'max-width'
]);

const sanitizeCustomCss = (value: any, fallback: string | null = null) => {
  if (value === undefined) return fallback;
  if (value === null) return null;
  const input = String(value).trim().slice(0, 4000);
  if (!input) return null;
  if (/@import|url\(|expression\(|javascript:|<script|<\/script>/i.test(input)) return null;
  const declarations = input
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const parts = chunk.split(':');
      if (parts.length < 2) return null;
      const property = parts[0]?.trim().toLowerCase();
      const cssValue = parts.slice(1).join(':').trim();
      if (!property || !cssValue) return null;
      if (!CSS_WHITELIST.has(property)) return null;
      if (/[{}<>]/.test(cssValue)) return null;
      return `${property}: ${cssValue}`;
    })
    .filter(Boolean) as string[];
  return declarations.length ? declarations.join('; ') : null;
};

const toLoaderType = (value: any, fallback: PreloaderLoaderType) => {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!normalized) return fallback;
  if (normalized === 'spinner') return PreloaderLoaderType.SPINNER;
  if (normalized === 'progress') return PreloaderLoaderType.PROGRESS;
  if (normalized === 'logopulse') return PreloaderLoaderType.LOGO_PULSE;
  if (normalized === 'dots') return PreloaderLoaderType.DOTS;
  if (normalized === 'skeleton') return PreloaderLoaderType.SKELETON;
  if (normalized === 'lottie') return PreloaderLoaderType.LOTTIE;
  return fallback;
};

const toBackgroundType = (value: any, fallback: PreloaderBackgroundType) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'solid') return PreloaderBackgroundType.SOLID;
  if (normalized === 'gradient') return PreloaderBackgroundType.GRADIENT;
  return fallback;
};

const toPosition = (value: any, fallback: PreloaderPosition) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'center') return PreloaderPosition.CENTER;
  if (normalized === 'bottom') return PreloaderPosition.BOTTOM;
  return fallback;
};

const toStatus = (value: any, fallback: PreloaderStatus) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'active') return PreloaderStatus.ACTIVE;
  if (normalized === 'inactive') return PreloaderStatus.INACTIVE;
  if (normalized === 'draft') return PreloaderStatus.DRAFT;
  return fallback;
};

const loaderTypeToClient = (value: PreloaderLoaderType): LoaderTypeClient => {
  if (value === PreloaderLoaderType.PROGRESS) return 'progress';
  if (value === PreloaderLoaderType.LOGO_PULSE) return 'logoPulse';
  if (value === PreloaderLoaderType.DOTS) return 'dots';
  if (value === PreloaderLoaderType.SKELETON) return 'skeleton';
  if (value === PreloaderLoaderType.LOTTIE) return 'lottie';
  return 'spinner';
};

const backgroundTypeToClient = (value: PreloaderBackgroundType): BackgroundTypeClient =>
  value === PreloaderBackgroundType.GRADIENT ? 'gradient' : 'solid';

const positionToClient = (value: PreloaderPosition): PositionTypeClient =>
  value === PreloaderPosition.BOTTOM ? 'bottom' : 'center';

const statusToClient = (value: PreloaderStatus, isActive: boolean) =>
  (isActive ? 'active' : String(value).toLowerCase());

const serializeConfig = (config: any, logoUrlById?: Map<string, string>) => ({
  id: config.id,
  name: config.name,
  status: statusToClient(config.status, Boolean(config.isActive)),
  isActive: Boolean(config.isActive),
  minDurationMs: Number(config.minDurationMs ?? DEFAULT_PRELOADER.minDurationMs),
  maxDurationMs: Number(config.maxDurationMs ?? DEFAULT_PRELOADER.maxDurationMs),
  showOnInitialLoad: Boolean(config.showOnInitialLoad),
  showOnRouteChange: Boolean(config.showOnRouteChange),
  showOnApiLoading: Boolean(config.showOnApiLoading),
  headlineText: config.headlineText ?? null,
  subText: config.subText ?? null,
  loaderType: loaderTypeToClient(config.loaderType),
  logoFileId: config.logoFileId ?? null,
  logoUrl: config.logoFileId ? logoUrlById?.get(config.logoFileId) ?? null : null,
  backgroundType: backgroundTypeToClient(config.backgroundType),
  backgroundColor: config.backgroundColor ?? DEFAULT_PRELOADER.backgroundColor,
  gradientFrom: config.gradientFrom ?? null,
  gradientTo: config.gradientTo ?? null,
  overlayOpacity: Number(config.overlayOpacity ?? DEFAULT_PRELOADER.overlayOpacity),
  blurPx: Number(config.blurPx ?? DEFAULT_PRELOADER.blurPx),
  accentColor: config.accentColor ?? DEFAULT_PRELOADER.accentColor,
  textColor: config.textColor ?? DEFAULT_PRELOADER.textColor,
  animationSpeed: Number(config.animationSpeed ?? DEFAULT_PRELOADER.animationSpeed),
  position: positionToClient(config.position),
  customCss: config.customCss ?? null,
  createdAt: config.createdAt,
  updatedAt: config.updatedAt,
  updatedByAdmin: config.updatedByAdmin
    ? {
        id: config.updatedByAdmin.id,
        name: config.updatedByAdmin.name ?? null,
        email: config.updatedByAdmin.email ?? null
      }
    : null
});

const fallbackPreloader = () => ({ ...DEFAULT_PRELOADER });

const buildLogoUrlMap = async (configs: any[]) => {
  const logoIds = Array.from(
    new Set(
      (configs || [])
        .map((row) => row?.logoFileId)
        .filter((id): id is string => Boolean(id))
    )
  );
  if (!logoIds.length) return new Map<string, string>();
  const files = await prisma.file.findMany({
    where: { id: { in: logoIds } },
    select: { id: true, url: true }
  });
  const pairs: Array<[string, string]> = files
    .map((row: any) => [String(row.id), String(row.url || '').trim()] as [string, string])
    .filter(([, url]) => Boolean(url));
  return new Map<string, string>(pairs);
};

const emitRealtimeUpdate = async (req: Request) => {
  try {
    const active = await prisma.preloaderConfig.findFirst({
      where: { isActive: true },
      include: { updatedByAdmin: { select: { id: true, name: true, email: true } } },
      orderBy: { updatedAt: 'desc' }
    });
    const logoUrlById = active ? await buildLogoUrlMap([active]) : new Map<string, string>();
    const payload = {
      active: active ? serializeConfig(active, logoUrlById) : null,
      timestamp: new Date().toISOString()
    };
    const io = req.app.get('io');
    const communityIo = req.app.get('communityIo');
    try { io?.emit?.('preloader:updated', payload); } catch (e) {}
    try { communityIo?.emit?.('preloader:updated', payload); } catch (e) {}
    try { io?.emit?.('settings:updated', { scope: 'preloader', settings: payload.active }); } catch (e) {}
  } catch (error) {
    console.warn('[preloader] failed to emit realtime update', error);
  }
};

const normalizeConfigInput = (payload: any, fallback?: any) => {
  const current = fallback || {};
  const name = toStringValue(pickFirst(payload, ['name']), current.name ?? '', 120) || '';
  const minDurationMs = Math.round(
    toNumber(
      pickFirst(payload, ['minDurationMs', 'min_duration_ms']),
      current.minDurationMs ?? DEFAULT_PRELOADER.minDurationMs,
      0,
      60000
    )
  );
  let maxDurationMs = Math.round(
    toNumber(
      pickFirst(payload, ['maxDurationMs', 'max_duration_ms']),
      current.maxDurationMs ?? DEFAULT_PRELOADER.maxDurationMs,
      300,
      120000
    )
  );
  if (maxDurationMs < minDurationMs) maxDurationMs = minDurationMs;
  const isActive = toBoolean(pickFirst(payload, ['isActive', 'is_active']), Boolean(current.isActive ?? false));
  let status = toStatus(pickFirst(payload, ['status']), current.status ?? PreloaderStatus.DRAFT);
  if (isActive) status = PreloaderStatus.ACTIVE;
  if (!isActive && status === PreloaderStatus.ACTIVE) status = PreloaderStatus.INACTIVE;

  return {
    name,
    status,
    isActive,
    minDurationMs,
    maxDurationMs,
    showOnInitialLoad: toBoolean(
      pickFirst(payload, ['showOnInitialLoad', 'show_on_initial_load']),
      Boolean(current.showOnInitialLoad ?? DEFAULT_PRELOADER.showOnInitialLoad)
    ),
    showOnRouteChange: toBoolean(
      pickFirst(payload, ['showOnRouteChange', 'show_on_route_change']),
      Boolean(current.showOnRouteChange ?? DEFAULT_PRELOADER.showOnRouteChange)
    ),
    showOnApiLoading: toBoolean(
      pickFirst(payload, ['showOnApiLoading', 'show_on_api_loading']),
      Boolean(current.showOnApiLoading ?? DEFAULT_PRELOADER.showOnApiLoading)
    ),
    headlineText: toStringValue(
      pickFirst(payload, ['headlineText', 'headline_text']),
      current.headlineText ?? null,
      200
    ),
    subText: toStringValue(
      pickFirst(payload, ['subText', 'sub_text']),
      current.subText ?? null,
      500
    ),
    loaderType: toLoaderType(pickFirst(payload, ['loaderType', 'loader_type']), current.loaderType ?? PreloaderLoaderType.SPINNER),
    logoFileId: toStringValue(pickFirst(payload, ['logoFileId', 'logo_file_id']), current.logoFileId ?? null, 80),
    backgroundType: toBackgroundType(
      pickFirst(payload, ['backgroundType', 'background_type']),
      current.backgroundType ?? PreloaderBackgroundType.SOLID
    ),
    backgroundColor: toColor(pickFirst(payload, ['backgroundColor', 'background_color']), current.backgroundColor ?? DEFAULT_PRELOADER.backgroundColor),
    gradientFrom: toColor(pickFirst(payload, ['gradientFrom', 'gradient_from']), current.gradientFrom ?? DEFAULT_PRELOADER.gradientFrom),
    gradientTo: toColor(pickFirst(payload, ['gradientTo', 'gradient_to']), current.gradientTo ?? DEFAULT_PRELOADER.gradientTo),
    overlayOpacity: Number(
      toNumber(
        pickFirst(payload, ['overlayOpacity', 'overlay_opacity']),
        current.overlayOpacity ?? DEFAULT_PRELOADER.overlayOpacity,
        0,
        1
      ).toFixed(3)
    ),
    blurPx: Math.round(
      toNumber(
        pickFirst(payload, ['blurPx', 'blur_px']),
        current.blurPx ?? DEFAULT_PRELOADER.blurPx,
        0,
        40
      )
    ),
    accentColor: toColor(pickFirst(payload, ['accentColor', 'accent_color']), current.accentColor ?? DEFAULT_PRELOADER.accentColor),
    textColor: toColor(pickFirst(payload, ['textColor', 'text_color']), current.textColor ?? DEFAULT_PRELOADER.textColor),
    animationSpeed: Number(
      toNumber(
        pickFirst(payload, ['animationSpeed', 'animation_speed']),
        current.animationSpeed ?? DEFAULT_PRELOADER.animationSpeed,
        0.2,
        4
      ).toFixed(2)
    ),
    position: toPosition(pickFirst(payload, ['position']), current.position ?? PreloaderPosition.CENTER),
    customCss: sanitizeCustomCss(pickFirst(payload, ['customCss', 'custom_css']), current.customCss ?? null)
  };
};

const validateLogoFile = async (logoFileId: string | null | undefined) => {
  if (!logoFileId) return true;
  const file = await prisma.file.findUnique({
    where: { id: logoFileId },
    select: { id: true }
  });
  return Boolean(file);
};

export const getActivePreloaderPublic = async (_req: Request, res: Response) => {
  try {
    const active = await prisma.preloaderConfig.findFirst({
      where: { isActive: true },
      include: { updatedByAdmin: { select: { id: true, name: true, email: true } } },
      orderBy: { updatedAt: 'desc' }
    });
    const logoUrlById = active ? await buildLogoUrlMap([active]) : new Map<string, string>();
    return res.json({
      success: true,
      data: active ? serializeConfig(active, logoUrlById) : fallbackPreloader()
    });
  } catch (error: any) {
    console.error('[preloader] getActivePreloaderPublic failed', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load active preloader' });
  }
};

export const adminListPreloaders = async (_req: Request, res: Response) => {
  try {
    const rows = await prisma.preloaderConfig.findMany({
      include: { updatedByAdmin: { select: { id: true, name: true, email: true } } },
      orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }]
    });
    const logoUrlById = await buildLogoUrlMap(rows);
    return res.json({ success: true, data: rows.map((row) => serializeConfig(row, logoUrlById)) });
  } catch (error: any) {
    console.error('[preloader] adminListPreloaders failed', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load preloaders' });
  }
};

export const adminCreatePreloader = async (req: Request, res: Response) => {
  try {
    const normalized = normalizeConfigInput(req.body || {});
    if (!normalized.name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }
    if (!(await validateLogoFile(normalized.logoFileId))) {
      return res.status(400).json({ success: false, error: 'Selected logo file does not exist' });
    }

    const adminId = (req as any).user?.id || null;

    const created = await prisma.$transaction(async (tx) => {
      if (normalized.isActive) {
        await tx.preloaderConfig.updateMany({
          where: { isActive: true },
          data: { isActive: false, status: PreloaderStatus.INACTIVE }
        });
      }
      return tx.preloaderConfig.create({
        data: {
          ...normalized,
          status: normalized.isActive ? PreloaderStatus.ACTIVE : normalized.status,
          updatedByAdminId: adminId
        },
        include: { updatedByAdmin: { select: { id: true, name: true, email: true } } }
      });
    });

    const logoUrlById = await buildLogoUrlMap([created]);
    await emitRealtimeUpdate(req);
    return res.status(201).json({ success: true, data: serializeConfig(created, logoUrlById), message: 'Preloader created' });
  } catch (error: any) {
    console.error('[preloader] adminCreatePreloader failed', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to create preloader' });
  }
};

export const adminUpdatePreloader = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '');
    if (!id) return res.status(400).json({ success: false, error: 'Preloader id is required' });

    const existing = await prisma.preloaderConfig.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Preloader not found' });

    const normalized = normalizeConfigInput(req.body || {}, existing);
    if (!normalized.name) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }
    if (!(await validateLogoFile(normalized.logoFileId))) {
      return res.status(400).json({ success: false, error: 'Selected logo file does not exist' });
    }

    const adminId = (req as any).user?.id || null;

    const updated = await prisma.$transaction(async (tx) => {
      if (normalized.isActive) {
        await tx.preloaderConfig.updateMany({
          where: { isActive: true, id: { not: id } },
          data: { isActive: false, status: PreloaderStatus.INACTIVE }
        });
      }
      return tx.preloaderConfig.update({
        where: { id },
        data: {
          ...normalized,
          status: normalized.isActive ? PreloaderStatus.ACTIVE : normalized.status,
          updatedByAdminId: adminId
        },
        include: { updatedByAdmin: { select: { id: true, name: true, email: true } } }
      });
    });

    const logoUrlById = await buildLogoUrlMap([updated]);
    await emitRealtimeUpdate(req);
    return res.json({ success: true, data: serializeConfig(updated, logoUrlById), message: 'Preloader updated' });
  } catch (error: any) {
    console.error('[preloader] adminUpdatePreloader failed', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update preloader' });
  }
};

export const adminActivatePreloader = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '');
    if (!id) return res.status(400).json({ success: false, error: 'Preloader id is required' });

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.preloaderConfig.findUnique({ where: { id } });
      if (!existing) return null;
      await tx.preloaderConfig.updateMany({
        where: { isActive: true, id: { not: id } },
        data: { isActive: false, status: PreloaderStatus.INACTIVE }
      });
      return tx.preloaderConfig.update({
        where: { id },
        data: {
          isActive: true,
          status: PreloaderStatus.ACTIVE,
          updatedByAdminId: (req as any).user?.id || null
        },
        include: { updatedByAdmin: { select: { id: true, name: true, email: true } } }
      });
    });

    if (!updated) return res.status(404).json({ success: false, error: 'Preloader not found' });

    const logoUrlById = await buildLogoUrlMap([updated]);
    await emitRealtimeUpdate(req);
    return res.json({ success: true, data: serializeConfig(updated, logoUrlById), message: 'Preloader activated' });
  } catch (error: any) {
    console.error('[preloader] adminActivatePreloader failed', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to activate preloader' });
  }
};

export const adminDeactivatePreloader = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '');
    if (!id) return res.status(400).json({ success: false, error: 'Preloader id is required' });
    const existing = await prisma.preloaderConfig.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Preloader not found' });

    const updated = await prisma.preloaderConfig.update({
      where: { id },
      data: {
        isActive: false,
        status: PreloaderStatus.INACTIVE,
        updatedByAdminId: (req as any).user?.id || null
      },
      include: { updatedByAdmin: { select: { id: true, name: true, email: true } } }
    });

    const logoUrlById = await buildLogoUrlMap([updated]);
    await emitRealtimeUpdate(req);
    return res.json({ success: true, data: serializeConfig(updated, logoUrlById), message: 'Preloader deactivated' });
  } catch (error: any) {
    console.error('[preloader] adminDeactivatePreloader failed', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to deactivate preloader' });
  }
};

export const adminDeletePreloader = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '');
    if (!id) return res.status(400).json({ success: false, error: 'Preloader id is required' });
    const existing = await prisma.preloaderConfig.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Preloader not found' });

    await prisma.preloaderConfig.delete({ where: { id } });
    await emitRealtimeUpdate(req);
    return res.json({ success: true, message: 'Preloader deleted' });
  } catch (error: any) {
    console.error('[preloader] adminDeletePreloader failed', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to delete preloader' });
  }
};
