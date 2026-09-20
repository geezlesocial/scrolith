import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { createDeveloperAuditLog, emitDeveloperEvent } from '../services/developerPlatform.service';

const DEV_DOCS_SCOPE = 'developer_docs';

type DocsPage = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  order: number;
  isPublished: boolean;
  updatedAt: string;
  updatedByAdminId: string | null;
};

type DocsConfig = {
  portalHomeUrl: string;
  docsHomeUrl: string;
  landingTitle: string;
  landingSubtitle: string;
  pages: DocsPage[];
  updatedAt: string;
  updatedByAdminId: string | null;
};

const nowIso = () => new Date().toISOString();

const toSlug = (value: unknown) =>
  String(value || '').slice(0, 256)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const normalizeUrlPath = (value: unknown, fallback: string) => {
  const raw = String(value || '').slice(0, 2048).trim();
  if (!raw) return fallback;
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const parsed = new URL(raw);
      return `${parsed.pathname || '/'}`.replace(/\/+$/, '') || '/';
    } catch {
      return fallback;
    }
  }
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  return withSlash.replace(/\/+$/, '') || '/';
};

const defaultDocsConfig = (): DocsConfig => ({
  portalHomeUrl: '/developer',
  docsHomeUrl: '/developer/docs',
  landingTitle: 'Scrolith Developer Docs',
  landingSubtitle: 'OAuth, app approval flow, rate limits, and production integration guidance.',
  pages: [
    {
      id: 'getting-started',
      slug: 'getting-started',
      title: 'Getting Started',
      summary: 'Create apps, connect your Scrolith account, and move through approval.',
      content:
        '1. Link your Scrolith account in Developer Portal.\n2. Create an app and configure scopes, platform URLs, and redirect URIs.\n3. Wait for admin approval if your scope set requires manual review.\n4. Use your client credentials only from approved platform URLs.',
      order: 1,
      isPublished: true,
      updatedAt: nowIso(),
      updatedByAdminId: null
    },
    {
      id: 'oauth',
      slug: 'oauth',
      title: 'OAuth Flow',
      summary: 'Authorization code and token exchange sequence.',
      content:
        'Authorization endpoint: POST /api/oauth/authorize\nToken endpoint: POST /api/oauth/token\nUser info endpoint: GET /api/oauth/userinfo\nRevoke endpoint: POST /api/oauth/revoke',
      order: 2,
      isPublished: true,
      updatedAt: nowIso(),
      updatedByAdminId: null
    },
    {
      id: 'security',
      slug: 'security-best-practices',
      title: 'Security Best Practices',
      summary: 'Protect client secrets and restrict integrations to trusted origins.',
      content:
        'Never expose client secrets in browser bundles.\nRotate secrets immediately after any suspected leak.\nKeep redirect URIs exact and HTTPS-only.\nUse platform URL restrictions to limit token usage sources.',
      order: 3,
      isPublished: true,
      updatedAt: nowIso(),
      updatedByAdminId: null
    },
    {
      id: 'rate-limits',
      slug: 'rate-limits',
      title: 'Rate Limits & Reliability',
      summary: 'Understand API throughput and production safeguards.',
      content:
        'Respect per-minute limits from admin config.\nImplement retries with exponential backoff for 429/5xx responses.\nLog request IDs and response codes for audit traceability.',
      order: 4,
      isPublished: true,
      updatedAt: nowIso(),
      updatedByAdminId: null
    },
    {
      id: 'products',
      slug: 'products',
      title: 'Products & Scopes',
      summary: 'Available scope products and advanced approval requirements.',
      content:
        'Developer products:\n- openid\n- username\n- avatar\n- followers.read\n- posts.read\n- jobs.read\n- gigs.read\n- notifications.read\n\nAdvanced scopes require admin approval before activation based on Developer Platform policy.',
      order: 5,
      isPublished: true,
      updatedAt: nowIso(),
      updatedByAdminId: null
    }
  ],
  updatedAt: nowIso(),
  updatedByAdminId: null
});

const normalizeDocsConfig = (value: any, actorAdminId?: string | null): DocsConfig => {
  const fallback = defaultDocsConfig();
  const source = value && typeof value === 'object' ? value : {};
  const pagesInput = Array.isArray(source.pages) ? source.pages : fallback.pages;
  const usedSlugs = new Set<string>();

  const pages: DocsPage[] = pagesInput
    .map((entry: any, index: number) => {
      const title = String(entry?.title || '').trim() || `Doc Page ${index + 1}`;
      const baseSlug = toSlug(entry?.slug || title) || `doc-page-${index + 1}`;
      let slug = baseSlug;
      let suffix = 2;
      while (usedSlugs.has(slug)) {
        slug = `${baseSlug}-${suffix}`;
        suffix += 1;
      }
      usedSlugs.add(slug);
      return {
        id: String(entry?.id || '').trim() || randomUUID(),
        slug,
        title,
        summary: String(entry?.summary || '').trim(),
        content: String(entry?.content || '').trim(),
        order: Number.isFinite(Number(entry?.order)) ? Number(entry.order) : index + 1,
        isPublished: entry?.isPublished !== false,
        updatedAt: String(entry?.updatedAt || nowIso()),
        updatedByAdminId: String(entry?.updatedByAdminId || actorAdminId || '').trim() || null
      };
    })
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

  const isWriteOperation = Boolean(actorAdminId);
  const resolvedUpdatedAt = isWriteOperation ? nowIso() : String(source.updatedAt || nowIso());

  return {
    portalHomeUrl: normalizeUrlPath(source.portalHomeUrl, fallback.portalHomeUrl),
    docsHomeUrl: normalizeUrlPath(source.docsHomeUrl, fallback.docsHomeUrl),
    landingTitle: String(source.landingTitle || '').trim() || fallback.landingTitle,
    landingSubtitle: String(source.landingSubtitle || '').trim() || fallback.landingSubtitle,
    pages,
    updatedAt: resolvedUpdatedAt,
    updatedByAdminId: String(actorAdminId || source.updatedByAdminId || '').trim() || null
  };
};

const readDocsConfig = async (): Promise<DocsConfig> => {
  const existing = await prisma.appSetting.findUnique({ where: { scope: DEV_DOCS_SCOPE } });
  if (!existing?.data) return defaultDocsConfig();
  return normalizeDocsConfig(existing.data);
};

const saveDocsConfig = async (config: DocsConfig) => {
  const saved = await prisma.appSetting.upsert({
    where: { scope: DEV_DOCS_SCOPE },
    create: { scope: DEV_DOCS_SCOPE, data: config as any },
    update: { data: config as any }
  });
  return normalizeDocsConfig(saved.data);
};

const emitDocsUpdate = (req: Request, config: DocsConfig) => {
  emitDeveloperEvent(req, 'dev:docs_updated', {
    updatedAt: config.updatedAt,
    pageCount: config.pages.length
  });
};

export const getDeveloperDocs = async (req: Request, res: Response) => {
  try {
    const config = await readDocsConfig();
    const slug = String(req.query.slug || '').trim().toLowerCase();
    const publishedPages = config.pages.filter((page) => page.isPublished !== false);
    if (slug) {
      const page = publishedPages.find((entry) => entry.slug === slug || entry.id === slug);
      if (!page) return res.status(404).json({ success: false, error: 'Documentation page not found.' });
      return res.json({ success: true, data: { ...config, pages: publishedPages, page } });
    }
    return res.json({ success: true, data: { ...config, pages: publishedPages } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load developer docs.' });
  }
};

export const getAdminDeveloperDocs = async (_req: Request, res: Response) => {
  try {
    const config = await readDocsConfig();
    return res.json({ success: true, data: config });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load developer docs admin config.' });
  }
};

export const updateAdminDeveloperDocs = async (req: Request, res: Response) => {
  try {
    const current = await readDocsConfig();
    const payload = req.body?.data ?? req.body ?? {};
    const merged = {
      ...current,
      ...(payload && typeof payload === 'object' ? payload : {}),
      pages: Array.isArray(payload?.pages) ? payload.pages : current.pages
    };
    const next = normalizeDocsConfig(merged, req.user?.id || null);
    const saved = await saveDocsConfig(next);

    await createDeveloperAuditLog({
      actorUserId: req.user?.id || null,
      action: 'ADMIN_DEV_DOCS_UPDATED',
      status: 'SUCCESS',
      metadata: { pageCount: saved.pages.length }
    });

    emitDocsUpdate(req, saved);
    return res.json({ success: true, data: saved });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to update developer docs.' });
  }
};

export const createAdminDeveloperDocPage = async (req: Request, res: Response) => {
  try {
    const current = await readDocsConfig();
    const newPage = {
      id: randomUUID(),
      title: String(req.body?.title || '').trim() || 'Untitled Page',
      slug: String(req.body?.slug || '').trim(),
      summary: String(req.body?.summary || '').trim(),
      content: String(req.body?.content || '').trim(),
      order: Number.isFinite(Number(req.body?.order)) ? Number(req.body.order) : current.pages.length + 1,
      isPublished: req.body?.isPublished !== false
    };
    const next = normalizeDocsConfig(
      { ...current, pages: [...current.pages, newPage] },
      req.user?.id || null
    );
    const saved = await saveDocsConfig(next);
    const created = saved.pages.find((page) => page.id === newPage.id) || saved.pages[saved.pages.length - 1];

    await createDeveloperAuditLog({
      actorUserId: req.user?.id || null,
      action: 'ADMIN_DEV_DOC_PAGE_CREATED',
      status: 'SUCCESS',
      metadata: { pageId: created?.id, slug: created?.slug }
    });

    emitDocsUpdate(req, saved);
    return res.status(201).json({ success: true, data: created, config: saved });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to create developer docs page.' });
  }
};

export const updateAdminDeveloperDocPage = async (req: Request, res: Response) => {
  try {
    const pageId = String(req.params.id || '').trim();
    if (!pageId) return res.status(400).json({ success: false, error: 'Page id is required.' });

    const current = await readDocsConfig();
    const index = current.pages.findIndex((page) => page.id === pageId);
    if (index < 0) return res.status(404).json({ success: false, error: 'Documentation page not found.' });

    const updatedPages = current.pages.map((page) =>
      page.id === pageId
        ? {
            ...page,
            title: req.body?.title !== undefined ? String(req.body.title || '').trim() : page.title,
            slug: req.body?.slug !== undefined ? String(req.body.slug || '').trim() : page.slug,
            summary: req.body?.summary !== undefined ? String(req.body.summary || '').trim() : page.summary,
            content: req.body?.content !== undefined ? String(req.body.content || '').trim() : page.content,
            order: req.body?.order !== undefined ? Number(req.body.order) : page.order,
            isPublished: req.body?.isPublished !== undefined ? Boolean(req.body.isPublished) : page.isPublished,
            updatedAt: nowIso(),
            updatedByAdminId: req.user?.id || null
          }
        : page
    );

    const next = normalizeDocsConfig({ ...current, pages: updatedPages }, req.user?.id || null);
    const saved = await saveDocsConfig(next);
    const updated = saved.pages.find((page) => page.id === pageId);

    await createDeveloperAuditLog({
      actorUserId: req.user?.id || null,
      action: 'ADMIN_DEV_DOC_PAGE_UPDATED',
      status: 'SUCCESS',
      metadata: { pageId }
    });

    emitDocsUpdate(req, saved);
    return res.json({ success: true, data: updated, config: saved });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to update developer docs page.' });
  }
};

export const deleteAdminDeveloperDocPage = async (req: Request, res: Response) => {
  try {
    const pageId = String(req.params.id || '').trim();
    if (!pageId) return res.status(400).json({ success: false, error: 'Page id is required.' });

    const current = await readDocsConfig();
    const exists = current.pages.some((page) => page.id === pageId);
    if (!exists) return res.status(404).json({ success: false, error: 'Documentation page not found.' });

    const next = normalizeDocsConfig(
      { ...current, pages: current.pages.filter((page) => page.id !== pageId) },
      req.user?.id || null
    );
    const saved = await saveDocsConfig(next);

    await createDeveloperAuditLog({
      actorUserId: req.user?.id || null,
      action: 'ADMIN_DEV_DOC_PAGE_DELETED',
      status: 'SUCCESS',
      metadata: { pageId }
    });

    emitDocsUpdate(req, saved);
    return res.json({ success: true, data: { id: pageId }, config: saved });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to delete developer docs page.' });
  }
};
