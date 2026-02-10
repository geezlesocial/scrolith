import { Request, Response } from 'express';
import { CmsTarget } from '@prisma/client';
import prisma from '../utils/prismaClient';
import {
  defaultSystemMessagesConfig,
  normalizeSystemMessagesConfig,
  sanitizeSystemMessagesConfig,
  validateSystemMessagesConfig,
  getSystemMessagesVariableMap
} from '../utils/systemMessagesConfig';

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

export const getSystemMessagesConfig = async (_req: Request, res: Response) => {
  try {
    const config = await getOrCreateCMSConfig(CmsTarget.GLOBAL, {
      system_messages: defaultSystemMessagesConfig
    });
    const data = config.data as Record<string, unknown> | undefined;
    const systemMessages =
      (data && (data['system_messages'] ?? data['systemMessages'])) ||
      (data && (data as any)['id'] === defaultSystemMessagesConfig.id ? data : null) ||
      defaultSystemMessagesConfig;

    const normalized = normalizeSystemMessagesConfig(systemMessages);
    return res.json({
      success: true,
      data: sanitizeSystemMessagesConfig(normalized),
      variables: getSystemMessagesVariableMap()
    });
  } catch (error) {
    console.error('Error fetching system messages config:', error);
    return res.json({
      success: true,
      data: sanitizeSystemMessagesConfig(normalizeSystemMessagesConfig(defaultSystemMessagesConfig)),
      variables: getSystemMessagesVariableMap()
    });
  }
};

export const saveSystemMessagesConfig = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const existingConfig = await getOrCreateCMSConfig(CmsTarget.GLOBAL, {
      system_messages: defaultSystemMessagesConfig
    });
    const existingData = existingConfig.data as Record<string, unknown> | undefined;
    const existingSystem =
      (existingData && (existingData['system_messages'] ?? existingData['systemMessages'])) ||
      (existingData && (existingData as any)['id'] === defaultSystemMessagesConfig.id ? existingData : null) ||
      defaultSystemMessagesConfig;

    const normalized = normalizeSystemMessagesConfig(req.body || {}, existingSystem as any);
    const errors = validateSystemMessagesConfig(normalized);
    if (errors.length) {
      return res.status(400).json({ success: false, error: errors.join('; ') });
    }

    const updatedData = {
      ...(existingData || {}),
      system_messages: normalized
    } as Record<string, unknown>;

    await saveCMSConfig(CmsTarget.GLOBAL, updatedData, userId);

    return res.json({
      success: true,
      data: sanitizeSystemMessagesConfig(normalized),
      variables: getSystemMessagesVariableMap()
    });
  } catch (error) {
    console.error('Error saving system messages config:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

