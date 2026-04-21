import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import fs from 'fs';
import path from 'path';
import { buildCommunityAdActivationReadiness } from '../services/communityAdActivation.service';

const CONFIG_FALLBACK_PATH = path.join(__dirname, '..', '..', 'data', 'community_config.json');
const EVENT_LOG_DIR = path.join(__dirname, '..', '..', 'data', 'logs');
const EVENT_LOG_PATH = path.join(EVENT_LOG_DIR, 'admin_config_events.log');

const appendEventLog = (entry: any) => {
  try {
    if (!fs.existsSync(EVENT_LOG_DIR)) fs.mkdirSync(EVENT_LOG_DIR, { recursive: true });
    const line = `[${new Date().toISOString()}] ${typeof entry === 'string' ? entry : JSON.stringify(entry)}\n`;
    fs.appendFileSync(EVENT_LOG_PATH, line, 'utf8');
  } catch (e) {
    console.warn('Failed to write admin config event log', e);
  }
};

const readFallback = async () => {
  try {
    if (!fs.existsSync(CONFIG_FALLBACK_PATH)) return null;
    const raw = fs.readFileSync(CONFIG_FALLBACK_PATH, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    console.warn('Failed to read fallback community config', e);
    return null;
  }
};

const writeFallback = async (obj: any) => {
  try {
    const dir = path.dirname(CONFIG_FALLBACK_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CONFIG_FALLBACK_PATH, JSON.stringify(obj, null, 2), 'utf8');
    return obj;
  } catch (e) {
    console.warn('Failed to write fallback community config', e);
    throw e;
  }
};

const toSnakeCase = (settings: any) => ({
  community_enabled: settings.communityEnabled,
  stories_enabled: settings.storiesEnabled,
  ads_enabled: settings.adsEnabled,
  gcoin_enabled: settings.gcoinEnabled,
  business_pages_enabled: settings.businessPagesEnabled,
  business_page_user_creation_enabled: settings.businessPageUserCreationEnabled,
  business_page_posting_enabled: settings.businessPagePostingEnabled,
  business_page_follow_enabled: settings.businessPageFollowEnabled,
  max_images_per_post: settings.maxImagesPerPost,
  max_video_size_mb: settings.maxVideoSizeMb,
  story_expiry_hours: settings.storyExpiryHours
});

const toSnakeCommunityPolicy = (settings: any) => ({
  require_login_to_view: settings?.requireLoginToView ?? false,
  allow_guest_comments: settings?.allowGuestComments ?? true,
  allow_media_uploads: settings?.allowMediaUploads ?? true,
  enable_reposts: settings?.enableReposts ?? true,
  allow_external_links: settings?.allowExternalLinks ?? true,
  auto_moderate_content: settings?.autoModerateContent ?? false,
  sentiment_analysis: settings?.sentimentAnalysis ?? true,
  enable_clubs: settings?.enableClubs ?? true,
  enable_events: settings?.enableEvents ?? true
});

const getOrCreatePlatformSettings = async () => {
  let settings = await prisma.settings.findFirst({ orderBy: { updatedAt: 'desc' } });
  if (!settings) {
    settings = await prisma.settings.create({ data: {} as any });
  }
  return settings;
};

export const getAdminConfig = async (_req: Request, res: Response) => {
  try {
    // If Prisma model `communityConfig` is not available, fall back to a local JSON file (dev-only)
    if (!prisma || typeof (prisma as any).communityConfig === 'undefined') {
      const fallback = await readFallback();
      if (!fallback) {
        const initial = {
          community_enabled: true,
          stories_enabled: true,
          ads_enabled: true,
          gcoin_enabled: false,
          require_login_to_view: false,
          auto_moderate_content: false,
          business_pages_enabled: true,
          business_page_user_creation_enabled: true,
          business_page_posting_enabled: true,
          business_page_follow_enabled: true,
          max_images_per_post: 5,
          max_video_size_mb: 50,
          story_expiry_hours: 24
        };
        await writeFallback(initial);
        return res.json({ success: true, data: initial });
      }
      return res.json({ success: true, data: fallback });
    }

    let cfg = await prisma.communityConfig.findFirst({ orderBy: { updatedAt: 'desc' } });
    if (!cfg) {
      cfg = await prisma.communityConfig.create({ data: {} as any });
    }

    const platformSettings = await getOrCreatePlatformSettings();
    return res.json({
      success: true,
      data: {
        ...toSnakeCase(cfg),
        ...toSnakeCommunityPolicy(platformSettings)
      }
    });
  } catch (error: any) {
    console.error('Get admin config error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load admin config' });
  }
};

export const updateAdminConfig = async (req: Request, res: Response) => {
  try {
    const payload = req.body || {};
    console.log('updateAdminConfig invoked', { user: (req as any).user, payload });
    try { appendEventLog({ event: 'update_invoked', user: (req as any).user, payload }); } catch (_) {}
    // If Prisma model is not available, update fallback JSON store (dev)
    if (!prisma || typeof (prisma as any).communityConfig === 'undefined') {
      const existing = (await readFallback()) || {};
      const updatesFallback: any = {};
      if (typeof payload.community_enabled !== 'undefined') updatesFallback.community_enabled = Boolean(payload.community_enabled);
      if (typeof payload.stories_enabled !== 'undefined') updatesFallback.stories_enabled = Boolean(payload.stories_enabled);
      if (typeof payload.ads_enabled !== 'undefined') updatesFallback.ads_enabled = Boolean(payload.ads_enabled);
      if (typeof payload.gcoin_enabled !== 'undefined') updatesFallback.gcoin_enabled = Boolean(payload.gcoin_enabled);
      if (typeof payload.require_login_to_view !== 'undefined' || typeof payload.requireLoginToView !== 'undefined') {
        updatesFallback.require_login_to_view = Boolean(
          typeof payload.require_login_to_view !== 'undefined'
            ? payload.require_login_to_view
            : payload.requireLoginToView
        );
      }
      if (typeof payload.auto_moderate_content !== 'undefined' || typeof payload.autoModerateContent !== 'undefined') {
        updatesFallback.auto_moderate_content = Boolean(
          typeof payload.auto_moderate_content !== 'undefined'
            ? payload.auto_moderate_content
            : payload.autoModerateContent
        );
      }
      if (typeof payload.business_pages_enabled !== 'undefined') updatesFallback.business_pages_enabled = Boolean(payload.business_pages_enabled);
      if (typeof payload.business_page_user_creation_enabled !== 'undefined') updatesFallback.business_page_user_creation_enabled = Boolean(payload.business_page_user_creation_enabled);
      if (typeof payload.business_page_posting_enabled !== 'undefined') updatesFallback.business_page_posting_enabled = Boolean(payload.business_page_posting_enabled);
      if (typeof payload.business_page_follow_enabled !== 'undefined') updatesFallback.business_page_follow_enabled = Boolean(payload.business_page_follow_enabled);
      if (typeof payload.max_images_per_post !== 'undefined') updatesFallback.max_images_per_post = Number(payload.max_images_per_post);
      if (typeof payload.max_video_size_mb !== 'undefined') updatesFallback.max_video_size_mb = Number(payload.max_video_size_mb);
      if (typeof payload.story_expiry_hours !== 'undefined') updatesFallback.story_expiry_hours = Number(payload.story_expiry_hours);
      const merged = { ...existing, ...updatesFallback };
      await writeFallback(merged);
      // Emit socket event
      try {
        const communityIo = (global as any).appCommunityIo;
        const io = (global as any).appIo;
        if (communityIo && typeof communityIo.emit === 'function') {
          communityIo.emit('community:admin_config_updated', { data: merged });
          appendEventLog({ emittedTo: '/community', data: merged });
        } else if (io && typeof io.emit === 'function') {
          io.emit('community:admin_config_updated', { data: merged });
          appendEventLog({ emittedTo: 'root', data: merged });
        }
      } catch (e) {
        console.warn('Failed to emit admin_config_updated socket event (fallback)', e);
        appendEventLog({ emitError: String(e) });
      }
      return res.json({ success: true, data: merged });
    }

    let cfg = await prisma.communityConfig.findFirst({ orderBy: { updatedAt: 'desc' } });
    if (!cfg) {
      cfg = await prisma.communityConfig.create({ data: {} as any });
    }

    const updates: any = {};
    const policyUpdates: any = {};
    if (typeof payload.community_enabled !== 'undefined') updates.communityEnabled = Boolean(payload.community_enabled);
    if (typeof payload.stories_enabled !== 'undefined') updates.storiesEnabled = Boolean(payload.stories_enabled);
    if (typeof payload.ads_enabled !== 'undefined') updates.adsEnabled = Boolean(payload.ads_enabled);
    if (typeof payload.gcoin_enabled !== 'undefined') updates.gcoinEnabled = Boolean(payload.gcoin_enabled);
    if (typeof payload.require_login_to_view !== 'undefined' || typeof payload.requireLoginToView !== 'undefined') {
      policyUpdates.requireLoginToView = Boolean(
        typeof payload.require_login_to_view !== 'undefined'
          ? payload.require_login_to_view
          : payload.requireLoginToView
      );
    }
    if (typeof payload.allow_guest_comments !== 'undefined' || typeof payload.allowGuestComments !== 'undefined') {
      policyUpdates.allowGuestComments = Boolean(
        typeof payload.allow_guest_comments !== 'undefined'
          ? payload.allow_guest_comments
          : payload.allowGuestComments
      );
    }
    if (typeof payload.allow_media_uploads !== 'undefined' || typeof payload.allowMediaUploads !== 'undefined') {
      policyUpdates.allowMediaUploads = Boolean(
        typeof payload.allow_media_uploads !== 'undefined'
          ? payload.allow_media_uploads
          : payload.allowMediaUploads
      );
    }
    if (typeof payload.enable_reposts !== 'undefined' || typeof payload.enableReposts !== 'undefined') {
      policyUpdates.enableReposts = Boolean(
        typeof payload.enable_reposts !== 'undefined'
          ? payload.enable_reposts
          : payload.enableReposts
      );
    }
    if (typeof payload.allow_external_links !== 'undefined' || typeof payload.allowExternalLinks !== 'undefined') {
      policyUpdates.allowExternalLinks = Boolean(
        typeof payload.allow_external_links !== 'undefined'
          ? payload.allow_external_links
          : payload.allowExternalLinks
      );
    }
    if (typeof payload.auto_moderate_content !== 'undefined' || typeof payload.autoModerateContent !== 'undefined') {
      policyUpdates.autoModerateContent = Boolean(
        typeof payload.auto_moderate_content !== 'undefined'
          ? payload.auto_moderate_content
          : payload.autoModerateContent
      );
    }
    if (typeof payload.sentiment_analysis !== 'undefined' || typeof payload.sentimentAnalysis !== 'undefined') {
      policyUpdates.sentimentAnalysis = Boolean(
        typeof payload.sentiment_analysis !== 'undefined'
          ? payload.sentiment_analysis
          : payload.sentimentAnalysis
      );
    }
    if (typeof payload.enable_clubs !== 'undefined' || typeof payload.enableClubs !== 'undefined') {
      policyUpdates.enableClubs = Boolean(
        typeof payload.enable_clubs !== 'undefined'
          ? payload.enable_clubs
          : payload.enableClubs
      );
    }
    if (typeof payload.enable_events !== 'undefined' || typeof payload.enableEvents !== 'undefined') {
      policyUpdates.enableEvents = Boolean(
        typeof payload.enable_events !== 'undefined'
          ? payload.enable_events
          : payload.enableEvents
      );
    }
    if (typeof payload.business_pages_enabled !== 'undefined') updates.businessPagesEnabled = Boolean(payload.business_pages_enabled);
    if (typeof payload.business_page_user_creation_enabled !== 'undefined') updates.businessPageUserCreationEnabled = Boolean(payload.business_page_user_creation_enabled);
    if (typeof payload.business_page_posting_enabled !== 'undefined') updates.businessPagePostingEnabled = Boolean(payload.business_page_posting_enabled);
    if (typeof payload.business_page_follow_enabled !== 'undefined') updates.businessPageFollowEnabled = Boolean(payload.business_page_follow_enabled);
    if (typeof payload.max_images_per_post !== 'undefined') updates.maxImagesPerPost = Number(payload.max_images_per_post);
    if (typeof payload.max_video_size_mb !== 'undefined') updates.maxVideoSizeMb = Number(payload.max_video_size_mb);
    if (typeof payload.story_expiry_hours !== 'undefined') updates.storyExpiryHours = Number(payload.story_expiry_hours);

    let updated = cfg;
    if (Object.keys(updates).length > 0) {
      updated = await prisma.communityConfig.update({ where: { id: cfg.id }, data: updates });
      await prisma.communityConfig.updateMany({
        where: { id: { not: cfg.id } },
        data: updates
      });
    }

    let platformSettings = await getOrCreatePlatformSettings();
    if (Object.keys(policyUpdates).length > 0) {
      platformSettings = await prisma.settings.update({
        where: { id: platformSettings.id },
        data: policyUpdates
      });
      await prisma.settings.updateMany({
        where: { id: { not: platformSettings.id } },
        data: policyUpdates
      });
    }

    const responseData = {
      ...toSnakeCase(updated),
      ...toSnakeCommunityPolicy(platformSettings)
    };

    // Emit socket event for admin config update
    try {
      const communityIo = (global as any).appCommunityIo;
      const io = (global as any).appIo;
      if (communityIo && typeof communityIo.emit === 'function') {
        communityIo.emit('community:admin_config_updated', { data: responseData });
        appendEventLog({ emittedTo: '/community', data: responseData });
      } else if (io && typeof io.emit === 'function') {
        io.emit('community:admin_config_updated', { data: responseData });
        appendEventLog({ emittedTo: 'root', data: responseData });
      }
    } catch (e) {
      console.warn('Failed to emit admin_config_updated socket event', e);
      appendEventLog({ emitError: String(e) });
    }

    return res.json({ success: true, data: responseData });
  } catch (error: any) {
    console.error('Update admin config error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update admin config' });
  }
};

export const getAdsReviewQueue = async (_req: Request, res: Response) => {
  try {
    const queue = await prisma.communityAd.findMany({ where: { status: 'SUBMITTED_FOR_REVIEW' }, orderBy: { createdAt: 'desc' }, take: 50 });
    return res.json({ success: true, data: queue });
  } catch (error: any) {
    console.error('Get ads review queue error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load review queue' });
  }
};

export const approveAd = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const existing = await prisma.communityAd.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Ad not found' });

    const readiness = await buildCommunityAdActivationReadiness(existing);
    if (!readiness.canActivate) {
      return res.status(400).json({
        success: false,
        code: 'AD_NOT_READY_FOR_DELIVERY',
        error: 'Campaign cannot go live yet.',
        data: { blockers: readiness.blockers, readiness }
      });
    }

    const ad = await prisma.communityAd.update({ where: { id }, data: { status: 'ACTIVE' } });
    try {
      const communityIo = (global as any).appCommunityIo;
      const io = (global as any).appIo;
      if (communityIo && typeof communityIo.emit === 'function') {
        communityIo.emit('community:ad_status_updated', { adId: id, status: 'ACTIVE' });
        appendEventLog({ emittedTo: '/community', adId: id, status: 'ACTIVE' });
      } else if (io && typeof io.emit === 'function') {
        io.emit('community:ad_status_updated', { adId: id, status: 'ACTIVE' });
        appendEventLog({ emittedTo: 'root', adId: id, status: 'ACTIVE' });
      }
    } catch (e) {
      console.warn('Failed to emit ad_status_updated (approve)', e);
      appendEventLog({ emitError: String(e) });
    }
    return res.json({ success: true, data: ad });
  } catch (error: any) {
    console.error('Approve ad error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to approve ad' });
  }
};

export const rejectAd = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const { reason } = req.body || {};
    const ad = await prisma.communityAd.update({ where: { id }, data: { status: 'REJECTED', adminReviewNotes: reason || null } });
    try {
      const communityIo = (global as any).appCommunityIo;
      const io = (global as any).appIo;
      if (communityIo && typeof communityIo.emit === 'function') {
        communityIo.emit('community:ad_status_updated', { adId: id, status: 'REJECTED' });
        appendEventLog({ emittedTo: '/community', adId: id, status: 'REJECTED' });
      } else if (io && typeof io.emit === 'function') {
        io.emit('community:ad_status_updated', { adId: id, status: 'REJECTED' });
        appendEventLog({ emittedTo: 'root', adId: id, status: 'REJECTED' });
      }
    } catch (e) {
      console.warn('Failed to emit ad_status_updated (reject)', e);
      appendEventLog({ emitError: String(e) });
    }
    return res.json({ success: true, data: ad });
  } catch (error: any) {
    console.error('Reject ad error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to reject ad' });
  }
};
