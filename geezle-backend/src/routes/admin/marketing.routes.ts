import express from 'express';
import { randomUUID } from 'crypto';
import prisma from '../../utils/prismaClient';
import { dispatchMessageReceiptNotifications } from '../../services/messageNotifications';
import {
  approveAffiliateApplication,
  getAffiliateProgramSettings,
  listAffiliateApplications,
  listAffiliatePartners,
  rejectAffiliateApplication,
  saveAffiliateProgramSettings,
  updateAffiliatePartnerStatus
} from '../../services/affiliateProgram.service';
import { requireAnyPermission, requirePermission } from '../../middleware/rbac.middleware';

const router = express.Router();

type SubscriberRecord = {
  id: string;
  email: string;
  name?: string;
  source: string;
  status: string;
  subscribed_at: string;
  verified_at?: string;
  unsubscribed_at?: string;
};

type MarketingCampaignRecord = {
  id: string;
  name: string;
  type: string;
  status: string;
  targetAudience?: string;
  target_audience?: string;
  stats?: { sent: number; opened: number; clicked: number };
  createdAt?: string;
  created_at?: string;
  scheduledAt?: string;
  scheduled_at?: string;
  subject?: string;
  content?: string;
  bannerTitle?: string;
  bannerBody?: string;
  imageUrl?: string;
  ctaText?: string;
  ctaUrl?: string;
  delaySeconds?: number;
  cooldownHours?: number;
  meta?: any;
};

const CAMPAIGNS_SCOPE = 'marketing_campaigns';
const SUBSCRIBERS_SCOPE = 'marketing_subscribers';
const POPUP_SUBSCRIBE_SCOPE = 'marketing_popup_subscribe';

const asDate = (value?: string) => (value ? new Date(value).getTime() : 0);
const daysAgo = (days: number) => Date.now() - days * 24 * 60 * 60 * 1000;

const loadSetting = async <T>(scope: string, fallback: T): Promise<T> => {
  try {
    const record = await prisma.appSetting.findUnique({ where: { scope } });
    if (!record || record.data === null || record.data === undefined) return fallback;
    return record.data as T;
  } catch (e) {
    return fallback;
  }
};

const saveSetting = async <T>(scope: string, data: T): Promise<T> => {
  await prisma.appSetting.upsert({
    where: { scope },
    create: { scope, data: data as any },
    update: { data: data as any }
  });
  return data;
};

const getSubscribers = async (): Promise<SubscriberRecord[]> => {
  const list = await loadSetting<SubscriberRecord[]>(SUBSCRIBERS_SCOPE, []);
  return Array.isArray(list) ? list : [];
};

const saveSubscribers = async (list: SubscriberRecord[]) => saveSetting(SUBSCRIBERS_SCOPE, list);

const normalizeCampaign = (payload: Partial<MarketingCampaignRecord>, existing?: MarketingCampaignRecord) => {
  const nowIso = new Date().toISOString();
  const id = payload.id || existing?.id || randomUUID();
  const createdAt = payload.createdAt || payload.created_at || existing?.createdAt || existing?.created_at || nowIso;
  const scheduledAt = payload.scheduledAt || payload.scheduled_at || existing?.scheduledAt || existing?.scheduled_at;
  const stats = payload.stats || existing?.stats || { sent: 0, opened: 0, clicked: 0 };
  const targetAudience = payload.targetAudience || payload.target_audience || existing?.targetAudience || existing?.target_audience || 'all';
  const status = payload.status || existing?.status || (scheduledAt ? 'scheduled' : 'draft');

  return {
    ...existing,
    ...payload,
    id,
    createdAt,
    created_at: createdAt,
    scheduledAt,
    scheduled_at: scheduledAt,
    targetAudience,
    target_audience: targetAudience,
    status,
    stats,
    type: payload.type || existing?.type || 'email'
  } as MarketingCampaignRecord;
};

const emitToUser = (req: express.Request, userId: string, event: string, payload: any) => {
  try {
    const ns = req.app.get('communityNs');
    if (ns && typeof ns.to === 'function') {
      ns.to(`community:user:${userId}`).emit(event, payload);
    }
  } catch (e) {
    console.warn('Marketing emit failed:', e);
  }
};

const resolveAudience = (campaign: MarketingCampaignRecord) => {
  const audience = (campaign.targetAudience || campaign.target_audience || 'all').toString().toLowerCase();
  return audience || 'all';
};

const pickSenderId = async (req: express.Request) => {
  const senderId = req.user?.id;
  if (senderId) return senderId;
  const fallback = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
  return fallback?.id || '';
};

const buildAudienceFilter = (audience: string) => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  if (audience === 'freelancers') {
    return { role: { in: ['FREELANCER'] } };
  }
  if (audience === 'employers') {
    return { role: { in: ['EMPLOYER', 'CLIENT'] } };
  }
  if (audience === 'inactive') {
    return {
      role: { notIn: ['ADMIN', 'MODERATOR'] },
      OR: [
        { lastLoginAt: { lt: thirtyDaysAgo } },
        { lastLoginAt: null },
        { lastSeenAt: { lt: thirtyDaysAgo } },
        { lastSeenAt: null }
      ]
    };
  }
  return { role: { notIn: ['ADMIN', 'MODERATOR'] } };
};

const ensureDirectConversation = async (senderId: string, receiverId: string) => {
  const existing = await prisma.conversation.findFirst({
    where: {
      type: 'DIRECT',
      AND: [
        { participants: { some: { userId: senderId } } },
        { participants: { some: { userId: receiverId } } }
      ]
    },
    include: { participants: true }
  });

  if (existing && existing.participants?.length === 2) {
    return existing;
  }

  const created = await prisma.conversation.create({
    data: {
      type: 'DIRECT',
      participants: {
        create: [{ userId: senderId }, { userId: receiverId }]
      }
    },
    include: { participants: true }
  });

  return created;
};

const sendCampaignToInbox = async (
  req: express.Request,
  campaign: MarketingCampaignRecord,
  audience: string
) => {
  const senderId = await pickSenderId(req);
  if (!senderId) {
    return { success: false, error: 'No admin sender available' };
  }

  const where = {
    isActive: true,
    ...buildAudienceFilter(audience)
  } as any;

  const recipients = await prisma.user.findMany({
    where,
    select: { id: true }
  });

  let sentCount = 0;

  for (const user of recipients) {
    if (user.id === senderId) continue;
    const conversation = await ensureDirectConversation(senderId, user.id);
    const messageText = campaign.subject
      ? `${campaign.subject}\n\n${campaign.content || ''}`.trim()
      : (campaign.content || campaign.name || '');
    const safeText = messageText || 'Marketing update';

    const message = await prisma.directMessage.create({
      data: {
        conversationId: conversation.id,
        senderId,
        text: safeText,
        isSystem: true
      }
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageText: message.text,
        lastMessageAt: message.createdAt,
        lastMessageSenderId: senderId
      }
    });

    const payload = {
      id: message.id,
      conversation_id: conversation.id,
      sender_id: senderId,
      receiver_id: user.id,
      text: message.text,
      timestamp: message.createdAt.toISOString(),
      is_read: false,
      reactions: [],
      attachments: [],
      attachment_ids: []
    };

    emitToUser(req, user.id, 'messages:new', payload);
    emitToUser(req, senderId, 'messages:sent', payload);
    void dispatchMessageReceiptNotifications({
      receiverIds: [user.id],
      senderId,
      conversationId: conversation.id,
      messageId: message.id,
      preview: message.text,
      fallbackPreview: 'Marketing update',
      messageType: 'system'
    }).catch((notifyError) => {
      console.warn('[marketing] failed to send message notifications', notifyError);
    });
    sentCount += 1;
  }

  return { success: true, sent: sentCount };
};

router.get(
  '/subscribers',
  requireAnyPermission('marketing.subscribers.read', 'marketing.subscribers.manage', 'users.read'),
  async (_req, res) => {
  const subscribers = await getSubscribers();
  res.json({ success: true, data: subscribers });
});

router.get(
  '/subscribers/analytics',
  requireAnyPermission('marketing.analytics.read', 'marketing.subscribers.read', 'users.read'),
  async (_req, res) => {
  const subscribers = await getSubscribers();
  const total = subscribers.length;
  const verified = subscribers.filter(s => s.status === 'verified' || s.status === 'active').length;
  const pending = subscribers.filter(s => s.status === 'pending').length;
  const unsubscribed = subscribers.filter(s => s.status === 'unsubscribed').length;

  const sources = subscribers.reduce(
    (acc, s) => {
      const key = (s.source || 'other').toLowerCase();
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const popupCount = sources.popup || 0;
  const footerCount = sources.footer || 0;

  const growth = {
    today: subscribers.filter(s => asDate(s.subscribed_at) >= daysAgo(1)).length,
    week: subscribers.filter(s => asDate(s.subscribed_at) >= daysAgo(7)).length,
    month: subscribers.filter(s => asDate(s.subscribed_at) >= daysAgo(30)).length
  };

  const conversion = {
    popup: popupCount ? Math.round((verified / popupCount) * 100) : 0,
    footer: footerCount ? Math.round((verified / footerCount) * 100) : 0
  };

  res.json({
    success: true,
    data: {
      total,
      verified,
      pending,
      unsubscribed,
      sources: {
        popup: popupCount,
        footer: footerCount,
        other: total - popupCount - footerCount
      },
      growth,
      conversion
    }
  });
});

router.delete(
  '/subscribers/:id',
  requirePermission('marketing.subscribers.manage'),
  async (req, res) => {
  const id = req.params.id;
  const subscribers = await getSubscribers();
  const index = subscribers.findIndex(s => s.id === id);
  if (index < 0) {
    res.status(404).json({ success: false, error: 'Subscriber not found' });
    return;
  }
  subscribers.splice(index, 1);
  await saveSubscribers(subscribers);
  res.json({ success: true, message: 'Subscriber removed' });
});

router.get('/campaigns', async (_req, res) => {
  const campaigns = await loadSetting<MarketingCampaignRecord[]>(CAMPAIGNS_SCOPE, []);
  res.json({ success: true, data: Array.isArray(campaigns) ? campaigns : [] });
});

router.post('/campaigns', async (req, res) => {
  try {
    const payload = (req.body || {}) as Partial<MarketingCampaignRecord>;
    const campaigns = await loadSetting<MarketingCampaignRecord[]>(CAMPAIGNS_SCOPE, []);
    const list = Array.isArray(campaigns) ? campaigns : [];
    const index = payload.id ? list.findIndex(c => c.id === payload.id) : -1;
    const existing = index >= 0 ? list[index] : undefined;
    const normalized = normalizeCampaign(payload, existing);

    if (index >= 0) {
      list[index] = normalized;
    } else {
      list.unshift(normalized);
    }

    await saveSetting(CAMPAIGNS_SCOPE, list);
    res.json({ success: true, data: normalized });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e?.message || 'Failed to save campaign' });
  }
});

router.delete('/campaigns/:id', async (req, res) => {
  const id = req.params.id;
  const campaigns = await loadSetting<MarketingCampaignRecord[]>(CAMPAIGNS_SCOPE, []);
  const list = Array.isArray(campaigns) ? campaigns : [];
  const next = list.filter(c => c.id !== id);
  await saveSetting(CAMPAIGNS_SCOPE, next);
  res.json({ success: true, message: 'Campaign removed' });
});

router.post('/campaigns/:id/send', async (req, res) => {
  const id = req.params.id;
  const campaigns = await loadSetting<MarketingCampaignRecord[]>(CAMPAIGNS_SCOPE, []);
  const list = Array.isArray(campaigns) ? campaigns : [];
  const index = list.findIndex(c => c.id === id);
  if (index < 0) return res.status(404).json({ success: false, error: 'Campaign not found' });

  const campaign = list[index];
  const audience = resolveAudience(campaign);

  if ((campaign.type || '').toLowerCase() === 'popup_banner') {
    const updated = normalizeCampaign({ ...campaign, status: 'active' }, campaign);
    list[index] = updated;
    await saveSetting(CAMPAIGNS_SCOPE, list);
    return res.json({ success: true, data: updated, message: 'Popup banner activated' });
  }

  const result = await sendCampaignToInbox(req, campaign, audience);
  if (!result.success) {
    return res.status(500).json({ success: false, error: result.error || 'Failed to send campaign' });
  }

  const stats = campaign.stats || { sent: 0, opened: 0, clicked: 0 };
  const updated = normalizeCampaign(
    {
      ...campaign,
      status: 'completed',
      stats: {
        sent: stats.sent + (result.sent || 0),
        opened: stats.opened || 0,
        clicked: stats.clicked || 0
      }
    },
    campaign
  );
  list[index] = updated;
  await saveSetting(CAMPAIGNS_SCOPE, list);
  return res.json({ success: true, data: updated, message: `Delivered to ${result.sent || 0} inboxes` });
});

router.get('/popup-subscribe', async (_req, res) => {
  const config = await loadSetting<any>(POPUP_SUBSCRIBE_SCOPE, null);
  res.json({
    success: true,
    data: config || {
      enabled: false,
      title: 'Join our newsletter',
      subtitle: 'Get the latest product updates, offers, and insights.',
      placeholder: 'Enter your email',
      buttonText: 'Subscribe',
      successMessage: 'Thanks for subscribing!',
      delaySeconds: 6,
      cooldownHours: 24
    }
  });
});

router.post('/popup-subscribe', async (req, res) => {
  const payload = req.body || {};
  const saved = await saveSetting(POPUP_SUBSCRIBE_SCOPE, payload);
  res.json({ success: true, data: saved });
});

router.get('/affiliates/settings', async (_req, res) => {
  const settings = await getAffiliateProgramSettings();
  res.json({ success: true, data: settings });
});

router.put('/affiliates/settings', async (req, res) => {
  try {
    const saved = await saveAffiliateProgramSettings(req.body || {});
    res.json({ success: true, data: saved, message: 'Affiliate settings updated' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Failed to update affiliate settings' });
  }
});

router.get('/affiliates/applications', async (_req, res) => {
  const applications = await listAffiliateApplications();
  res.json({ success: true, data: applications });
});

router.post('/affiliates/applications/:id/approve', async (req, res) => {
  try {
    const reviewerId = req.user?.id;
    const reviewNote = String(req.body?.reviewNote || '').trim() || undefined;
    const result = await approveAffiliateApplication(req.params.id, reviewerId, reviewNote);
    res.json({ success: true, data: result, message: 'Application approved' });
  } catch (error: any) {
    const message = error?.message || 'Failed to approve application';
    const status = message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: message });
  }
});

router.post('/affiliates/applications/:id/reject', async (req, res) => {
  try {
    const reviewerId = req.user?.id;
    const reviewNote = String(req.body?.reviewNote || '').trim() || undefined;
    const result = await rejectAffiliateApplication(req.params.id, reviewerId, reviewNote);
    res.json({ success: true, data: result, message: 'Application rejected' });
  } catch (error: any) {
    const message = error?.message || 'Failed to reject application';
    const status = message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: message });
  }
});

router.get('/affiliates', async (_req, res) => {
  const affiliates = await listAffiliatePartners();
  res.json({ success: true, data: affiliates });
});

router.patch('/affiliates/:id/status', async (req, res) => {
  try {
    const status = String(req.body?.status || '').toLowerCase();
    if (!['active', 'inactive'].includes(status)) {
      res.status(400).json({ success: false, error: 'Invalid status' });
      return;
    }
    const updated = await updateAffiliatePartnerStatus(req.params.id, status as 'active' | 'inactive');
    res.json({ success: true, data: updated, message: 'Affiliate status updated' });
  } catch (error: any) {
    const message = error?.message || 'Failed to update status';
    const status = message.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: message });
  }
});

export default router;
