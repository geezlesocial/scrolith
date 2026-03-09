import { Request, Response } from 'express';
import { CmsTarget } from '@prisma/client';
import { defaultAuthPagesConfig, normalizeAuthPagesConfig, sanitizeAuthPagesConfig } from '../utils/authPagesConfig';
import prisma from '../utils/prismaClient';

const getOrCreateCMSConfig = async (target: CmsTarget, defaultData: any) => {
  let config = await prisma.cMSConfig.findFirst({
    where: { target },
    orderBy: { version: 'desc' }
  });

  if (!config) {
    config = await prisma.cMSConfig.create({
      data: {
        target,
        version: 1,
        data: defaultData
      }
    });
  }

  return config;
};

const saveCMSConfig = async (target: CmsTarget, data: any, userId?: string) => {
  const existing = await prisma.cMSConfig.findFirst({
    where: { target },
    orderBy: { version: 'desc' }
  });

  const version = existing ? existing.version + 1 : 1;

  return prisma.cMSConfig.create({
    data: {
      target,
      version,
      data,
      updatedById: userId || null
    }
  });
};

export const getAuthPagesConfig = async (req: Request, res: Response) => {
  try {
    const config = await getOrCreateCMSConfig(CmsTarget.GLOBAL, { auth_pages: defaultAuthPagesConfig });
    const data = config.data as Record<string, unknown> | undefined;
    const authPages =
      (data && (data['auth_pages'] ?? data['authPages'])) ||
      (data && data['id'] === defaultAuthPagesConfig.id ? data : null) ||
      defaultAuthPagesConfig;

    const normalized = normalizeAuthPagesConfig(authPages);
    res.json(sanitizeAuthPagesConfig(normalized));
  } catch (error) {
    console.error('Error fetching auth pages config:', error);
    res.json(sanitizeAuthPagesConfig(normalizeAuthPagesConfig(defaultAuthPagesConfig)));
  }
};

export const saveAuthPagesConfig = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const existingConfig = await getOrCreateCMSConfig(CmsTarget.GLOBAL, { auth_pages: defaultAuthPagesConfig });
    const existingData = existingConfig.data as Record<string, unknown> | undefined;
    const existingAuth =
      (existingData && (existingData['auth_pages'] ?? existingData['authPages'])) ||
      (existingData && existingData['id'] === defaultAuthPagesConfig.id ? existingData : null) ||
      defaultAuthPagesConfig;
    const normalized = normalizeAuthPagesConfig(req.body || {}, existingAuth);

    const updatedData = {
      ...(existingData || {}),
      auth_pages: normalized
    } as Record<string, unknown>;

    await saveCMSConfig(CmsTarget.GLOBAL, updatedData, userId);

    res.json({
      success: true,
      data: sanitizeAuthPagesConfig(normalized)
    });
  } catch (error) {
    console.error('Error saving auth pages config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
