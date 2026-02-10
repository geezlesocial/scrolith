import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';

const COMMUNITY_KEY_MAP: Record<string, string> = {
  require_login_to_view: 'requireLoginToView',
  requireLoginToView: 'requireLoginToView',
  allow_guest_comments: 'allowGuestComments',
  allowGuestComments: 'allowGuestComments',
  allow_media_uploads: 'allowMediaUploads',
  allowMediaUploads: 'allowMediaUploads',
  enable_reposts: 'enableReposts',
  enableReposts: 'enableReposts',
  allow_external_links: 'allowExternalLinks',
  allowExternalLinks: 'allowExternalLinks',
  auto_moderate_content: 'autoModerateContent',
  autoModerateContent: 'autoModerateContent',
  sentiment_analysis: 'sentimentAnalysis',
  sentimentAnalysis: 'sentimentAnalysis',
  enable_clubs: 'enableClubs',
  enableClubs: 'enableClubs',
  enable_events: 'enableEvents',
  enableEvents: 'enableEvents'
};

const toSnakeCase = (settings: any) => ({
  require_login_to_view: settings.requireLoginToView,
  allow_guest_comments: settings.allowGuestComments,
  allow_media_uploads: settings.allowMediaUploads,
  enable_reposts: settings.enableReposts,
  allow_external_links: settings.allowExternalLinks,
  auto_moderate_content: settings.autoModerateContent,
  sentiment_analysis: settings.sentimentAnalysis,
  enable_clubs: settings.enableClubs,
  enable_events: settings.enableEvents
});

const getOrCreateSettings = async () => {
  let settings = await prisma.settings.findFirst({ orderBy: { updatedAt: 'desc' } });
  if (!settings) {
    settings = await prisma.settings.create({ data: {} });
  }
  return settings;
};

const normalizePayload = (payload: any) => {
  const updates: Record<string, any> = {};
  Object.keys(payload || {}).forEach((key) => {
    const mapped = COMMUNITY_KEY_MAP[key];
    if (mapped) {
      updates[mapped] = payload[key];
    }
  });
  return updates;
};

export const getCommunitySettings = async (_req: Request, res: Response) => {
  try {
    const settings = await getOrCreateSettings();
    return res.json({ success: true, data: toSnakeCase(settings) });
  } catch (error: any) {
    console.error('Get community settings error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load settings' });
  }
};

export const updateCommunitySettings = async (req: Request, res: Response) => {
  try {
    const settings = await getOrCreateSettings();
    const updates = normalizePayload(req.body || {});

    const updated = await prisma.settings.update({
      where: { id: settings.id },
      data: updates
    });
    await prisma.settings.updateMany({
      where: { id: { not: settings.id } },
      data: updates
    });

    return res.json({ success: true, data: toSnakeCase(updated) });
  } catch (error: any) {
    console.error('Update community settings error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update settings' });
  }
};

export const toggleCommunitySetting = async (req: Request, res: Response) => {
  try {
    const { settingName, value } = req.body || {};
    const mapped = COMMUNITY_KEY_MAP[settingName];
    if (!mapped) {
      return res.status(400).json({ success: false, error: 'Invalid setting name' });
    }

    const settings = await getOrCreateSettings();
    const updated = await prisma.settings.update({
      where: { id: settings.id },
      data: { [mapped]: Boolean(value) }
    });
    await prisma.settings.updateMany({
      where: { id: { not: settings.id } },
      data: { [mapped]: Boolean(value) }
    });

    return res.json({ success: true, data: toSnakeCase(updated) });
  } catch (error: any) {
    console.error('Toggle community setting error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to toggle setting' });
  }
};
