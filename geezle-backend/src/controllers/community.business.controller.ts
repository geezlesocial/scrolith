import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import realtime from '../utils/realtime';
import { addFileUsage, removeUsage, syncFileUsages } from '../utils/fileUsage';
import jwt from 'jsonwebtoken';

const PAGE_STATUS_ALIASES: Record<string, string> = {
  active: 'active',
  inactive: 'inactive',
  paused: 'inactive',
  disabled: 'inactive',
  restricted: 'restricted',
  suspended: 'restricted',
  banned: 'banned',
  blocked: 'banned',
  deleted: 'deleted'
};

const PUBLIC_PAGE_STATUSES = new Set(['active']);

const defaultBusinessConfig = {
  businessPagesEnabled: true,
  businessPageUserCreationEnabled: true,
  businessPagePostingEnabled: true,
  businessPageFollowEnabled: true
};

const getBaseFileUrl = (req?: Request) => {
  const envBase =
    process.env.FILE_BASE_URL ||
    process.env.BACKEND_URL ||
    process.env.API_BASE_URL ||
    process.env.APP_URL;
  if (envBase) return envBase.replace(/\/$/, '');

  if (req?.headers?.host) {
    const proto = req.headers['x-forwarded-proto']?.toString().split(',')[0] || req.protocol || 'http';
    return `${proto}://${req.headers.host}`;
  }

  const host = process.env.HOST || 'localhost';
  const port = process.env.PORT || '5000';
  return `http://${host}:${port}`;
};

const buildFileContentUrl = (fileId: string, req?: Request) =>
  `${getBaseFileUrl(req)}/api/files/content/${encodeURIComponent(fileId)}`;

const parseLimit = (value: unknown, fallback = 6, max = 24) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(parsed)));
};

const parseCookieHeader = (cookieHeader?: string): Record<string, string> => {
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

const resolveOptionalUserFromRequest = async (req: Request): Promise<{ id: string; role?: string } | null> => {
  const middlewareUserId = String(req.user?.id || '').trim();
  if (middlewareUserId) {
    return { id: middlewareUserId, role: req.user?.role };
  }

  let authHeader = req.headers.authorization as string | undefined;
  if (!authHeader) {
    const cookies = parseCookieHeader(req.headers.cookie as string | undefined);
    const cookieToken = cookies['Scrolith_token'] || cookies['token'];
    if (cookieToken) authHeader = `Bearer ${cookieToken}`;
  }
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.split(' ')[1];
  if (!token) return null;

  try {
    const secret = process.env.JWT_SECRET || 'dev_jwt_secret';
    const decoded = jwt.verify(token, secret) as { id?: string };
    const userId = String(decoded?.id || '').trim();
    if (!userId) return null;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isActive: true }
    });
    if (!user || user.isActive === false) return null;
    return { id: user.id, role: user.role };
  } catch {
    return null;
  }
};
const toLowerTrim = (value: unknown) => String(value || '').trim().toLowerCase();

const normalizeStatus = (value: unknown, fallback = 'active') => {
  const normalized = toLowerTrim(value);
  if (!normalized) return fallback;
  return PAGE_STATUS_ALIASES[normalized] || '';
};

const slugify = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 64);

const cleanText = (value: unknown, max = 400) => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return text.slice(0, max);
};

const cleanOptionalUrl = (value: unknown) => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return text.slice(0, 400);
};

const cleanOptionalEmail = (value: unknown) => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const normalized = text.toLowerCase();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
  if (!valid) throw new Error('Invalid business email');
  return normalized.slice(0, 160);
};

const cleanOptionalPhone = (value: unknown) => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return text.replace(/\s+/g, ' ').slice(0, 60);
};


const toAttachmentIds = (value: unknown) =>
  Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((entry) => String((entry as any)?.id || (entry as any)?.fileId || entry || '').trim())
            .filter(Boolean)
        )
      )
    : [];

const looksLikeDirectMediaUrl = (value: string) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('/uploads/') ||
    normalized.startsWith('uploads/') ||
    normalized.includes('.png') ||
    normalized.includes('.jpg') ||
    normalized.includes('.jpeg') ||
    normalized.includes('.webp') ||
    normalized.includes('.gif') ||
    normalized.includes('.mp4') ||
    normalized.includes('.webm') ||
    normalized.includes('.mov') ||
    normalized.includes('.pdf')
  );
};

const normalizeUploadsPath = (value: string) => {
  const normalized = String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  const withoutPrefix = normalized.replace(/^uploads\//, '');
  return `/uploads/${withoutPrefix}`;
};

const normalizeDirectMediaUrl = (value?: string | null) => {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) return normalized;
  if (normalized.startsWith('data:') || normalized.startsWith('blob:')) return normalized;
  if (normalized.startsWith('/api/files/content/') || normalized.startsWith('api/files/content/')) {
    return normalized.startsWith('/') ? normalized : `/${normalized}`;
  }
  if (normalized.startsWith('/uploads/') || normalized.startsWith('uploads/')) {
    return normalizeUploadsPath(normalized);
  }
  return null;
};

const resolveStoredFileUrl = (file: {
  id?: string;
  url?: string | null;
  storageKey?: string | null;
  storageProvider?: string | null;
}, req?: Request) => {
  const storageProvider = String(file.storageProvider || '').trim().toLowerCase();
  const directUrl = normalizeDirectMediaUrl(file.url);
  if (storageProvider === 'azure_blob') {
    if (file.id) return buildFileContentUrl(file.id, req);
    return file.url || directUrl || null;
  }
  if (directUrl) return directUrl;
  if (file.storageKey) return normalizeUploadsPath(file.storageKey);
  return file.url || null;
};

const resolveLogoUrlMap = async (logoRefs: Array<string | null | undefined>, req?: Request) => {
  const ids = Array.from(
    new Set(
      logoRefs
        .map((value) => String(value || '').trim())
        .filter((value) => value && !normalizeDirectMediaUrl(value))
    )
  );
  if (!ids.length) return new Map<string, string>();

  const files = await prisma.file.findMany({
    where: { id: { in: ids } },
    select: { id: true, url: true, storageKey: true, storageProvider: true }
  });
  const map = new Map<string, string>();
  files.forEach((file) => {
    const url = resolveStoredFileUrl(file, req);
    if (url) map.set(file.id, url);
  });
  return map;
};

const resolveLogoUrl = (
  logoRef: string | null | undefined,
  logoMap: Map<string, string>
) => {
  const normalized = String(logoRef || '').trim();
  if (!normalized) return null;
  const direct = normalizeDirectMediaUrl(normalized);
  if (direct) return direct;
  return logoMap.get(normalized) || null;
};

const resolveValidatedAttachmentIds = async (
  raw: unknown,
  actor: { userId: string; role?: string | null }
) => {
  const ids = toAttachmentIds(raw);
  if (!ids.length) return [] as string[];
  if (ids.some((id) => looksLikeDirectMediaUrl(id))) {
    throw new Error('Attachments must be file IDs from Uploaded Files');
  }

  const files = await prisma.file.findMany({
    where: { id: { in: ids } },
    select: { id: true, ownerId: true }
  });
  const byId = new Map<string, { id: string; ownerId: string | null }>(
    files.map((file) => [file.id, file])
  );
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) throw new Error('One or more attachments were not found in Uploaded Files');

  const role = String(actor.role || '').toLowerCase();
  const isPrivileged = role.includes('admin');
  if (!isPrivileged) {
    const invalid = ids.filter((id) => byId.get(id)?.ownerId !== actor.userId);
    if (invalid.length) throw new Error('You can only attach files from your Uploaded Files library');
  }

  return ids;
};

const resolvePostAttachments = async (attachments: any[], req?: Request) => {
  const ids = toAttachmentIds(attachments);
  if (!ids.length) return [];

  const files = (await prisma.file.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      url: true,
      storageKey: true,
      storageProvider: true,
      mimeType: true,
      originalName: true,
      thumbnailUrl: true,
      width: true,
      height: true,
      duration: true
    }
  })) as Array<{
    id: string;
    url: string | null;
    storageKey?: string | null;
    storageProvider?: string | null;
    mimeType: string | null;
    originalName: string | null;
    thumbnailUrl?: string | null;
    width?: number | null;
    height?: number | null;
    duration?: number | null;
  }>;
  const map = new Map<
    string,
    {
      id: string;
      url: string | null;
      storageKey?: string | null;
      storageProvider?: string | null;
      mimeType: string | null;
      originalName: string | null;
      thumbnailUrl?: string | null;
      width?: number | null;
      height?: number | null;
      duration?: number | null;
    }
  >(
    files.map((file) => [file.id, file])
  );
  return ids.map((id) => {
    const file = map.get(id);
    return {
      id,
      url: (file && resolveStoredFileUrl(file, req)) || id,
      name: file?.originalName || undefined,
      mimeType: file?.mimeType || undefined,
      thumbnailUrl: file?.thumbnailUrl || undefined,
      width: file?.width ?? undefined,
      height: file?.height ?? undefined,
      duration: file?.duration ?? undefined
    };
  });
};
const resolvePostAuthorIdentity = (
  post: { authorId: string; businessPageId?: string | null },
  author: { id: string; type: 'user' | 'business' }
) => {
  const isBusinessAuthor = author.type === 'business' && Boolean(post.businessPageId);
  return {
    authorId: isBusinessAuthor ? author.id : post.authorId,
    authorUserId: post.authorId
  };
};
const resolvePageMedia = async (fileId?: string | null, req?: Request) => {
  if (!fileId) return null;
  const directUrl = normalizeDirectMediaUrl(fileId);
  if (directUrl) {
    return { id: fileId, url: directUrl, mimeType: null, name: null };
  }
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: { id: true, url: true, storageKey: true, storageProvider: true, mimeType: true, originalName: true }
  });
  if (!file) return null;
  return {
    id: file.id,
    url: resolveStoredFileUrl(file, req),
    mimeType: file.mimeType,
    name: file.originalName
  };
};

const getIo = (req: Request) => {
  const app = req.app as any;
  return app?.get?.('communityIo') || app?.get?.('io');
};

const getBusinessConfig = async () => {
  try {
    if (!prisma || typeof (prisma as any).communityConfig === 'undefined') {
      return defaultBusinessConfig;
    }
    const config = await prisma.communityConfig.findFirst({ orderBy: { updatedAt: 'desc' } });
    if (!config) return defaultBusinessConfig;
    return {
      businessPagesEnabled: config.businessPagesEnabled !== false,
      businessPageUserCreationEnabled: config.businessPageUserCreationEnabled !== false,
      businessPagePostingEnabled: config.businessPagePostingEnabled !== false,
      businessPageFollowEnabled: config.businessPageFollowEnabled !== false
    };
  } catch {
    return defaultBusinessConfig;
  }
};

const ensureUniqueHandleAndSlug = async (params: { handle?: string | null; slug?: string | null; excludeId?: string }) => {
  const { handle, slug, excludeId } = params;

  if (handle) {
    const existingHandle = await prisma.communityBusinessPage.findFirst({
      where: {
        id: excludeId ? { not: excludeId } : undefined,
        handle: { equals: handle, mode: 'insensitive' }
      },
      select: { id: true }
    });
    if (existingHandle) {
      throw new Error('Page handle already taken');
    }
  }

  if (slug) {
    const existingSlug = await prisma.communityBusinessPage.findFirst({
      where: {
        id: excludeId ? { not: excludeId } : undefined,
        slug: { equals: slug, mode: 'insensitive' }
      },
      select: { id: true }
    });
    if (existingSlug) {
      throw new Error('Page slug already taken');
    }
  }
};

const serializeBusinessPage = async (
  page: any,
  opts?: {
    followersCount?: number;
    isFollowing?: boolean;
    followId?: string | null;
    includeOwner?: boolean;
    postsCount?: number;
  },
  req?: Request
) => ({
  id: page.id,
  ownerId: page.ownerId,
  ownerName: page.owner?.name || null,
  name: page.name,
  handle: page.handle,
  slug: page.slug,
  tagline: page.tagline,
  category: page.category,
  description: page.description,
  website: page.website,
  email: page.email,
  phone: page.phone,
  industry: page.industry,
  orgSize: page.orgSize,
  orgType: page.orgType,
  location: page.location,
  logoFileId: page.logoFileId,
  coverFileId: page.coverFileId,
  logo: await resolvePageMedia(page.logoFileId, req),
  cover: await resolvePageMedia(page.coverFileId, req),
  followersCount: Number(opts?.followersCount ?? page?._count?.followers ?? page?.followers?.length ?? 0),
  postsCount: Number(opts?.postsCount ?? page?._count?.posts ?? 0),
  isFollowing: Boolean(opts?.isFollowing),
  followId: opts?.followId || null,
  status: String(page.status || 'active').toLowerCase(),
  statusReason: page.statusReason || null,
  statusUpdatedBy: page.statusUpdatedBy || null,
  statusUpdatedAt: page.statusUpdatedAt ? page.statusUpdatedAt.toISOString() : null,
  createdAt: page.createdAt.toISOString(),
  updatedAt: page.updatedAt.toISOString()
});

const buildPageUpdateData = (
  payload: any,
  page: any,
  options: { isAdmin: boolean; actorId: string; isCreate?: boolean }
) => {
  const data: Record<string, any> = {};
  const isCreate = Boolean(options.isCreate);

  const nextName = cleanText(payload.name, 120);
  if (isCreate || payload.name !== undefined) {
    if (!nextName) throw new Error('Name is required');
    data.name = nextName;
  }

  const rawHandle = payload.handle ?? payload.username ?? page?.handle ?? nextName ?? '';
  const handle = slugify(rawHandle);
  if (isCreate || payload.handle !== undefined || payload.username !== undefined) {
    if (!handle) throw new Error('Handle is required');
    data.handle = handle;
  }

  const rawSlug = payload.slug ?? page?.slug ?? nextName ?? handle;
  const slug = slugify(rawSlug);
  if (isCreate || payload.slug !== undefined) {
    if (!slug) throw new Error('Slug is required');
    data.slug = slug;
  }

  if (isCreate || payload.tagline !== undefined) data.tagline = cleanText(payload.tagline, 220);
  if (isCreate || payload.category !== undefined) data.category = cleanText(payload.category, 120);
  if (isCreate || payload.description !== undefined) data.description = cleanText(payload.description, 2500);
  if (isCreate || payload.website !== undefined) data.website = cleanOptionalUrl(payload.website);
  if (isCreate || payload.email !== undefined) data.email = cleanOptionalEmail(payload.email);
  if (isCreate || payload.phone !== undefined) data.phone = cleanOptionalPhone(payload.phone);
  if (isCreate || payload.industry !== undefined) data.industry = cleanText(payload.industry, 120);
  if (isCreate || payload.orgSize !== undefined) data.orgSize = cleanText(payload.orgSize, 80);
  if (isCreate || payload.orgType !== undefined) data.orgType = cleanText(payload.orgType, 80);
  if (isCreate || payload.location !== undefined) data.location = cleanText(payload.location, 140);

  if (isCreate || payload.logoFileId !== undefined) data.logoFileId = cleanText(payload.logoFileId, 120);
  if (isCreate || payload.coverFileId !== undefined) data.coverFileId = cleanText(payload.coverFileId, 120);

  if (options.isAdmin && payload.status !== undefined) {
    const status = normalizeStatus(payload.status, String(page?.status || 'active').toLowerCase());
    if (!status) throw new Error('Invalid page status');
    data.status = status;
    data.statusUpdatedAt = new Date();
    data.statusUpdatedBy = options.actorId;
  }

  if (options.isAdmin && payload.statusReason !== undefined) {
    data.statusReason = cleanText(payload.statusReason, 500);
    data.statusUpdatedAt = new Date();
    data.statusUpdatedBy = options.actorId;
  }

  return data;
};

export const getBusinessPageFeatureConfig = async (_req: Request, res: Response) => {
  const config = await getBusinessConfig();
  return res.json({ success: true, data: config });
};

export const getMyBusinessPages = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const pages = await prisma.communityBusinessPage.findMany({
      where: { ownerId: userId, status: { not: 'deleted' } },
      include: { _count: { select: { followers: true, posts: true } } },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }]
    });

    const data = await Promise.all(
      pages.map((page) =>
        serializeBusinessPage(page, {
          followersCount: page._count.followers,
          postsCount: page._count.posts
        }, req)
      )
    );

    return res.json({ success: true, data });
  } catch (error: any) {
    console.error('Get my business pages error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load pages' });
  }
};

export const createBusinessPage = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const config = await getBusinessConfig();
    if (!config.businessPagesEnabled || !config.businessPageUserCreationEnabled) {
      return res.status(403).json({ success: false, error: 'Business page creation is currently disabled' });
    }

    const payload = req.body || {};
    const data = buildPageUpdateData(payload, null, { isAdmin: false, actorId: userId, isCreate: true });
    await ensureUniqueHandleAndSlug({ handle: data.handle, slug: data.slug });

    const page = await prisma.communityBusinessPage.create({
      data: {
        ownerId: userId,
        ...data,
        status: 'active',
        statusReason: null,
        statusUpdatedBy: null,
        statusUpdatedAt: null
      },
      include: { _count: { select: { followers: true, posts: true } } }
    });

    if (page.logoFileId) {
      try {
        await addFileUsage({ fileId: page.logoFileId, usageType: 'business_page_logo', usageId: page.id, label: 'Business Page Logo' });
      } catch {}
    }
    if (page.coverFileId) {
      try {
        await addFileUsage({ fileId: page.coverFileId, usageType: 'business_page_cover', usageId: page.id, label: 'Business Page Cover' });
      } catch {}
    }

    const response = await serializeBusinessPage(page, {
      followersCount: page._count.followers,
      postsCount: page._count.posts
    }, req);

    const io = getIo(req);
    try {
      io?.emit('community:business_page_created', { page: response });
      io?.emit('community:business_page_updated', { page: response });
    } catch {}

    return res.json({ success: true, data: response });
  } catch (error: any) {
    console.error('Create business page error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to create page' });
  }
};

export const updateBusinessPage = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const config = await getBusinessConfig();
    if (!config.businessPagesEnabled) {
      return res.status(403).json({ success: false, error: 'Business pages are currently disabled' });
    }

    const pageId = req.params.id;
    const page = await prisma.communityBusinessPage.findUnique({ where: { id: pageId }, include: { _count: { select: { followers: true, posts: true } } } });
    if (!page) return res.status(404).json({ success: false, error: 'Page not found' });

    const role = (req.user?.role || '').toString().toLowerCase();
    const isAdmin = role.includes('admin');
    if (page.ownerId !== userId && !isAdmin) return res.status(403).json({ success: false, error: 'Forbidden' });

    const normalizedStatus = normalizeStatus(page.status, 'active');
    if (!isAdmin && (normalizedStatus === 'banned' || normalizedStatus === 'deleted')) {
      return res.status(403).json({ success: false, error: 'This page is locked and cannot be edited' });
    }

    const payload = req.body || {};
    const data = buildPageUpdateData(payload, page, { isAdmin, actorId: userId });

    if (data.handle || data.slug) {
      await ensureUniqueHandleAndSlug({
        handle: data.handle || page.handle,
        slug: data.slug || page.slug,
        excludeId: page.id
      });
    }

    if (!isAdmin) {
      delete data.status;
      delete data.statusReason;
      delete data.statusUpdatedBy;
      delete data.statusUpdatedAt;
    }

    const updated = await prisma.communityBusinessPage.update({
      where: { id: pageId },
      data,
      include: { _count: { select: { followers: true, posts: true } } }
    });

    try {
      await syncFileUsages('business_page_logo', updated.id, updated.logoFileId ? [updated.logoFileId] : [], 'Business Page Logo');
    } catch {}
    try {
      await syncFileUsages('business_page_cover', updated.id, updated.coverFileId ? [updated.coverFileId] : [], 'Business Page Cover');
    } catch {}

    const response = await serializeBusinessPage(updated, {
      followersCount: updated._count.followers,
      postsCount: updated._count.posts
    }, req);

    const io = getIo(req);
    try {
      io?.emit('community:business_page_updated', { page: response });
    } catch {}

    return res.json({ success: true, data: response });
  } catch (error: any) {
    console.error('Update business page error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update page' });
  }
};

export const deleteBusinessPage = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const pageId = req.params.id;
    const page = await prisma.communityBusinessPage.findUnique({ where: { id: pageId } });
    if (!page) return res.status(404).json({ success: false, error: 'Page not found' });

    const role = (req.user?.role || '').toString().toLowerCase();
    const isAdmin = role.includes('admin');
    if (page.ownerId !== userId && !isAdmin) return res.status(403).json({ success: false, error: 'Forbidden' });

    await prisma.communityBusinessPage.delete({ where: { id: pageId } });
    try { await removeUsage('business_page_logo', pageId); } catch {}
    try { await removeUsage('business_page_cover', pageId); } catch {}

    const io = getIo(req);
    try {
      io?.emit('community:business_page_updated', { pageId, deleted: true });
    } catch {}

    return res.json({ success: true });
  } catch (error: any) {
    console.error('Delete business page error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to delete page' });
  }
};

export const getBusinessPageBySlug = async (req: Request, res: Response) => {
  try {
    const slug = slugify(req.params.slug);
    if (!slug) return res.status(404).json({ success: false, error: 'Page not found' });
    const viewer = await resolveOptionalUserFromRequest(req);
    const viewerId = viewer?.id;
    const page = await prisma.communityBusinessPage.findFirst({
      where: { slug },
      include: {
        _count: { select: { followers: true, posts: true } },
        followers: viewerId
          ? {
              where: { userId: viewerId },
              select: { id: true, userId: true }
            }
          : false
      }
    });

    if (!page) return res.status(404).json({ success: false, error: 'Page not found' });

    const normalizedStatus = normalizeStatus(page.status, 'active');
    if (!PUBLIC_PAGE_STATUSES.has(normalizedStatus)) {
      return res.status(404).json({ success: false, error: 'Page not found' });
    }

    const viewerFollow = viewerId && Array.isArray((page as any).followers)
      ? (page as any).followers.find((entry: any) => entry.userId === viewerId)
      : null;

    const data = await serializeBusinessPage(page as any, {
      followersCount: page._count.followers,
      postsCount: page._count.posts,
      isFollowing: Boolean(viewerFollow),
      followId: viewerFollow?.id || null
    }, req);

    return res.json({ success: true, data });
  } catch (error: any) {
    console.error('Get business page error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load page' });
  }
};

export const getRecommendedBusinessPages = async (req: Request, res: Response) => {
  try {
    const config = await getBusinessConfig();
    if (!config.businessPagesEnabled) {
      return res.json({ success: true, data: [] });
    }

    const limit = parseLimit(req.query.limit, 6, 30);
    const viewerId = req.user?.id;

    const pages = await prisma.communityBusinessPage.findMany({
      where: {
        status: 'active',
        ...(viewerId ? { ownerId: { not: viewerId } } : {})
      },
      include: {
        owner: { select: { id: true, name: true, username: true, avatar: true } },
        _count: { select: { followers: true, posts: true } },
        followers: viewerId
          ? {
              where: { userId: viewerId },
              select: { id: true, userId: true }
            }
          : false
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: limit
    });

    const data = await Promise.all(
      pages.map(async (page: any) => {
        const viewerFollow = viewerId && Array.isArray(page.followers)
          ? page.followers.find((entry: any) => entry.userId === viewerId)
          : null;

        return serializeBusinessPage(page, {
          followersCount: page._count.followers,
          postsCount: page._count.posts,
          isFollowing: Boolean(viewerFollow),
          followId: viewerFollow?.id || null,
          includeOwner: true
        }, req);
      })
    );

    return res.json({ success: true, data });
  } catch (error: any) {
    console.error('Get recommended business pages error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load recommended pages' });
  }
};

export const createBusinessPagePost = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const config = await getBusinessConfig();
    if (!config.businessPagesEnabled || !config.businessPagePostingEnabled) {
      return res.status(403).json({ success: false, error: 'Posting from business pages is currently disabled' });
    }

    const pageId = req.params.id;
    const page = await prisma.communityBusinessPage.findUnique({ where: { id: pageId } });
    if (!page) return res.status(404).json({ success: false, error: 'Page not found' });

    const normalizedStatus = normalizeStatus(page.status, 'active');
    if (normalizedStatus !== 'active') {
      return res.status(403).json({ success: false, error: 'Only active pages can publish posts' });
    }

    const role = (req.user?.role || '').toString().toLowerCase();
    const isAdmin = role.includes('admin');
    if (page.ownerId !== userId && !isAdmin) return res.status(403).json({ success: false, error: 'Forbidden' });

    const { content, attachments, attachmentFileIds, visibility = 'public', title } = req.body || {};
    const attachmentIds = await resolveValidatedAttachmentIds(
      attachmentFileIds !== undefined ? attachmentFileIds : attachments,
      { userId, role: req.user?.role }
    );
    const normalizedContent = String(content || '').trim();
    if (!normalizedContent && !attachmentIds.length) {
      return res.status(400).json({ success: false, error: 'Add text or at least one attachment' });
    }

    const post = await prisma.communityPost.create({
      data: {
        authorId: userId,
        businessPageId: pageId,
        content: normalizedContent,
        title: cleanText(title, 180),
        visibility,
        attachments: attachmentIds
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            username: true,
            avatar: true,
            role: true,
            isVerified: true,
            freelancerPlanActive: true,
            employerPlanActive: true
          }
        },
        businessPage: {
          select: {
            id: true,
            name: true,
            handle: true,
            slug: true,
            logoFileId: true
          }
        }
      }
    });

    if (attachmentIds.length) {
      try { await syncFileUsages('community_post', post.id, attachmentIds, 'Community Post Media'); } catch {}
    }

    const logoUrlMap = await resolveLogoUrlMap([post.businessPage?.logoFileId], req);
    const businessLogoUrl = resolveLogoUrl(post.businessPage?.logoFileId, logoUrlMap);

    const author = {
      id: post.businessPage?.id || post.author?.id || userId,
      username: post.businessPage?.handle || post.businessPage?.slug || post.author?.username || null,
      displayName: post.businessPage?.name || post.author?.name || 'Business page',
      avatarUrl:
        businessLogoUrl ||
        post.author?.avatar ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(post.businessPage?.name || post.author?.name || 'Business')}`,
      type: post.businessPage ? 'business' : 'user',
      businessSlug: post.businessPage?.slug || null,
      isVerified: Boolean(post.author?.isVerified),
      isPro: Boolean(post.author?.freelancerPlanActive || post.author?.employerPlanActive)
    };
    const authorIdentity = resolvePostAuthorIdentity(
      { authorId: post.authorId, businessPageId: post.businessPageId },
      author as { id: string; type: 'user' | 'business' }
    );

    const responsePost = {
      id: post.id,
      authorId: authorIdentity.authorId,
      authorUserId: authorIdentity.authorUserId,
      authorName: author.displayName,
      authorUsername: author.username,
      authorAvatar: author.avatarUrl,
      author,
      viewer: {
        isFollowingAuthor: false
      },
      title: post.title,
      content: post.content,
      attachmentFileIds: post.attachments || [],
      attachments: await resolvePostAttachments(post.attachments || [], req),
      tags: post.tags || [],
      mentions: post.mentions || [],
      topic: post.topic || null,
      location: post.location || null,
      visibility: post.visibility || 'public',
      commentPolicy: post.commentPolicy || 'everyone',
      businessPage: post.businessPage
        ? {
            id: post.businessPage.id,
            name: post.businessPage.name,
            handle: post.businessPage.handle,
            slug: post.businessPage.slug,
            logoFileId: post.businessPage.logoFileId || null
          }
        : null,
      viewsCount: post.viewsCount || 0,
      likesCount: post.likesCount || 0,
      sharesCount: post.sharesCount || 0,
      repostsCount: post.repostsCount || 0,
      status: post.status,
      isPinned: post.isPinned,
      isHighlighted: post.isHighlighted,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
      interactions: {
        views: post.viewsCount || 0,
        likes: post.likesCount || 0,
        shares: post.sharesCount || 0,
        reposts: post.repostsCount || 0,
        comments: 0,
        reactions: {}
      },
      userState: {
        liked: false,
        reposted: false,
        reaction: null
      }
    };

    const io = getIo(req);
    try { io?.emit('community:post_created', { post: responsePost }); } catch {}
    try { realtime.emitToPost(post.id, 'community:post_created', { post: responsePost }); } catch {}

    return res.json({ success: true, data: responsePost });
  } catch (error: any) {
    console.error('Create business page post error:', error);
    const message = String(error?.message || 'Failed to create post');
    const status = message.includes('not found')
      ? 400
      : message.includes('only attach') || message.includes('Attachments must')
        ? 403
        : 500;
    return res.status(status).json({ success: false, error: message });
  }
};

export const getBusinessPageFeed = async (req: Request, res: Response) => {
  try {
    const slug = slugify(req.params.slug);
    if (!slug) return res.status(404).json({ success: false, error: 'Page not found' });

    const viewer = await resolveOptionalUserFromRequest(req);
    const viewerId = viewer?.id;

    const page = await prisma.communityBusinessPage.findFirst({
      where: { slug },
      include: { _count: { select: { followers: true, posts: true } } }
    });
    if (!page) return res.status(404).json({ success: false, error: 'Page not found' });

    const status = normalizeStatus(page.status, 'active');
    if (!PUBLIC_PAGE_STATUSES.has(status)) {
      return res.status(404).json({ success: false, error: 'Page not found' });
    }

    const viewerPageFollow = viewerId
      ? await prisma.communityBusinessPageFollower.findFirst({
          where: { pageId: page.id, userId: viewerId },
          select: { id: true }
        })
      : null;

    const limit = parseLimit(req.query.limit, 20, 100);
    const cursor = String(req.query.cursor || '').trim();
    const where: any = {
      status: 'active',
      businessPageId: page.id
    };
    if (cursor) {
      where.createdAt = { lt: new Date(cursor) };
    }

    const posts = await prisma.communityPost.findMany({
      where,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true,
            username: true,
            isVerified: true,
            freelancerPlanActive: true,
            employerPlanActive: true
          }
        },
        businessPage: {
          select: {
            id: true,
            name: true,
            handle: true,
            slug: true,
            logoFileId: true
          }
        }
      },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      take: limit
    });

    const postIds = posts.map((post) => post.id);
    const [reactionRows, commentRows, userReactions] = await Promise.all([
      postIds.length
        ? prisma.communityPostReaction.groupBy({
            by: ['postId', 'type'],
            where: { postId: { in: postIds } },
            _count: { _all: true }
          })
        : Promise.resolve([]),
      postIds.length
        ? prisma.communityPostComment.groupBy({
            by: ['postId'],
            where: { postId: { in: postIds }, status: 'active' },
            _count: { _all: true }
          })
        : Promise.resolve([]),
      viewerId && postIds.length
        ? prisma.communityPostReaction.findMany({ where: { postId: { in: postIds }, userId: viewerId } })
        : Promise.resolve([])
    ]);

    const reactionsByPost = new Map<string, Record<string, number>>();
    (reactionRows as any[]).forEach((row: any) => {
      const existing = reactionsByPost.get(row.postId) || {};
      existing[row.type] = Number(row?._count?._all || 0);
      reactionsByPost.set(row.postId, existing);
    });

    const commentsByPost = new Map<string, number>();
    (commentRows as any[]).forEach((row: any) => {
      commentsByPost.set(row.postId, Number(row?._count?._all || 0));
    });

    const userReactionByPost = new Map(
      (userReactions as any[]).map((reaction: any) => [reaction.postId, reaction.type])
    );
    const logoUrlMap = await resolveLogoUrlMap(posts.map((post) => post.businessPage?.logoFileId), req);

    const items = await Promise.all(
      posts.map(async (post) => {
        const businessLogoUrl = resolveLogoUrl(post.businessPage?.logoFileId, logoUrlMap);
        const author = {
          id: post.businessPage?.id || post.author?.id || post.authorId,
          username: post.businessPage?.handle || post.businessPage?.slug || post.author?.username || null,
          displayName: post.businessPage?.name || post.author?.name || 'Business page',
          avatarUrl:
            businessLogoUrl ||
            post.author?.avatar ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(post.businessPage?.name || post.author?.name || 'Business')}`,
          type: post.businessPage ? 'business' : 'user',
          businessSlug: post.businessPage?.slug || null,
          isVerified: Boolean(post.author?.isVerified),
          isPro: Boolean(post.author?.freelancerPlanActive || post.author?.employerPlanActive)
        };
        const authorIdentity = resolvePostAuthorIdentity(
          { authorId: post.authorId, businessPageId: post.businessPageId },
          author as { id: string; type: 'user' | 'business' }
        );
        return {
          id: post.id,
          authorId: authorIdentity.authorId,
          authorUserId: authorIdentity.authorUserId,
          authorName: author.displayName,
          authorUsername: author.username,
          authorAvatar: author.avatarUrl,
          author,
          viewer: {
            isFollowingAuthor: Boolean(viewerPageFollow)
          },
          title: post.title,
          content: post.content,
          attachments: await resolvePostAttachments(post.attachments || [], req),
          tags: post.tags || [],
          mentions: post.mentions || [],
          topic: post.topic || null,
          location: post.location || null,
          visibility: post.visibility || 'public',
          commentPolicy: post.commentPolicy || 'everyone',
          businessPage: post.businessPage
            ? {
                id: post.businessPage.id,
                name: post.businessPage.name,
                handle: post.businessPage.handle,
                slug: post.businessPage.slug,
                logoFileId: post.businessPage.logoFileId || null
              }
            : null,
          viewsCount: post.viewsCount || 0,
          likesCount: post.likesCount || 0,
          sharesCount: post.sharesCount || 0,
          repostsCount: post.repostsCount || 0,
          status: post.status,
          isPinned: post.isPinned,
          isHighlighted: post.isHighlighted,
          createdAt: post.createdAt.toISOString(),
          updatedAt: post.updatedAt.toISOString(),
          interactions: {
            views: post.viewsCount || 0,
            likes: post.likesCount || 0,
            shares: post.sharesCount || 0,
            reposts: post.repostsCount || 0,
            comments: commentsByPost.get(post.id) || 0,
            reactions: reactionsByPost.get(post.id) || {}
          },
          userState: {
            liked: false,
            reposted: false,
            reaction: userReactionByPost.get(post.id) || null
          }
        };
      })
    );

    const nextCursor = posts.length ? posts[posts.length - 1].createdAt.toISOString() : null;
    return res.json({
      success: true,
      data: {
        page: await serializeBusinessPage(page, {
          followersCount: page._count.followers,
          postsCount: page._count.posts,
          isFollowing: Boolean(viewerPageFollow),
          followId: viewerPageFollow?.id || null
        }, req),
        items,
        nextCursor
      }
    });
  } catch (error: any) {
    console.error('Get business page feed error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load page feed' });
  }
};

export const getPageMentions = async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ success: true, data: [] });

    const pages = await prisma.communityBusinessPage.findMany({
      where: {
        status: 'active',
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { handle: { contains: q, mode: 'insensitive' } },
          { slug: { contains: q, mode: 'insensitive' } }
        ]
      },
      take: 10,
      orderBy: { updatedAt: 'desc' }
    });

    const data = pages.map((p) => ({ id: p.id, name: p.name, handle: p.handle, slug: p.slug }));
    return res.json({ success: true, data });
  } catch (error: any) {
    console.error('Get page mentions error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to search pages' });
  }
};

export const adminListBusinessPages = async (req: Request, res: Response) => {
  try {
    const pages = await prisma.communityBusinessPage.findMany({
      include: {
        owner: { select: { id: true, name: true, username: true, avatar: true } },
        _count: { select: { followers: true, posts: true } }
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }]
    });

    const data = await Promise.all(
      pages.map((page) =>
        serializeBusinessPage(page, {
          followersCount: page._count.followers,
          postsCount: page._count.posts,
          includeOwner: true
        }, req)
      )
    );

    return res.json({ success: true, data });
  } catch (error: any) {
    console.error('Admin list business pages error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load pages' });
  }
};

export const adminUpdateBusinessPage = async (req: Request, res: Response) => {
  try {
    const pageId = req.params.id;
    const actorId = req.user?.id || '';
    const page = await prisma.communityBusinessPage.findUnique({ where: { id: pageId }, include: { _count: { select: { followers: true, posts: true } } } });
    if (!page) return res.status(404).json({ success: false, error: 'Page not found' });

    const payload = req.body || {};
    const data = buildPageUpdateData(payload, page, { isAdmin: true, actorId });

    if (data.handle || data.slug) {
      await ensureUniqueHandleAndSlug({
        handle: data.handle || page.handle,
        slug: data.slug || page.slug,
        excludeId: page.id
      });
    }

    const updated = await prisma.communityBusinessPage.update({
      where: { id: pageId },
      data,
      include: {
        owner: { select: { id: true, name: true, username: true, avatar: true } },
        _count: { select: { followers: true, posts: true } }
      }
    });

    try {
      await syncFileUsages('business_page_logo', updated.id, updated.logoFileId ? [updated.logoFileId] : [], 'Business Page Logo');
    } catch {}
    try {
      await syncFileUsages('business_page_cover', updated.id, updated.coverFileId ? [updated.coverFileId] : [], 'Business Page Cover');
    } catch {}

    const response = await serializeBusinessPage(updated, {
      followersCount: updated._count.followers,
      postsCount: updated._count.posts,
      includeOwner: true
    }, req);

    const io = getIo(req);
    try { io?.emit('community:business_page_updated', { page: response }); } catch {}

    return res.json({ success: true, data: response });
  } catch (error: any) {
    console.error('Admin update business page error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update page' });
  }
};

export const adminModerateBusinessPage = async (req: Request, res: Response) => {
  try {
    const pageId = req.params.id;
    const actorId = req.user?.id || '';
    const page = await prisma.communityBusinessPage.findUnique({ where: { id: pageId }, include: { _count: { select: { followers: true, posts: true } } } });
    if (!page) return res.status(404).json({ success: false, error: 'Page not found' });

    const action = toLowerTrim(req.body?.action || req.body?.status);
    const reason = cleanText(req.body?.reason ?? req.body?.statusReason, 500);

    const actionMap: Record<string, string> = {
      activate: 'active',
      active: 'active',
      restrict: 'restricted',
      restricted: 'restricted',
      ban: 'banned',
      banned: 'banned',
      deactivate: 'inactive',
      inactive: 'inactive',
      delete: 'deleted',
      deleted: 'deleted'
    };

    const nextStatus = actionMap[action] || '';
    if (!nextStatus) {
      return res.status(400).json({ success: false, error: 'Invalid moderation action' });
    }

    const updated = await prisma.communityBusinessPage.update({
      where: { id: pageId },
      data: {
        status: nextStatus,
        statusReason: reason,
        statusUpdatedBy: actorId || null,
        statusUpdatedAt: new Date()
      },
      include: {
        owner: { select: { id: true, name: true, username: true, avatar: true } },
        _count: { select: { followers: true, posts: true } }
      }
    });

    const response = await serializeBusinessPage(updated, {
      followersCount: updated._count.followers,
      postsCount: updated._count.posts,
      includeOwner: true
    }, req);

    const io = getIo(req);
    try { io?.emit('community:business_page_updated', { page: response }); } catch {}

    return res.json({ success: true, data: response });
  } catch (error: any) {
    console.error('Admin moderate business page error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to moderate page' });
  }
};

export const adminDeleteBusinessPage = async (req: Request, res: Response) => {
  try {
    const pageId = req.params.id;
    const page = await prisma.communityBusinessPage.findUnique({ where: { id: pageId } });
    if (!page) return res.status(404).json({ success: false, error: 'Page not found' });

    await prisma.communityBusinessPage.delete({ where: { id: pageId } });
    try { await removeUsage('business_page_logo', pageId); } catch {}
    try { await removeUsage('business_page_cover', pageId); } catch {}

    const io = getIo(req);
    try { io?.emit('community:business_page_updated', { pageId, deleted: true }); } catch {}

    return res.json({ success: true });
  } catch (error: any) {
    console.error('Admin delete business page error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to delete page' });
  }
};



