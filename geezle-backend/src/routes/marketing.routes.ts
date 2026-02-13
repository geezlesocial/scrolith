import express from 'express';
import { randomUUID } from 'crypto';
import prisma from '../utils/prismaClient';

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

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const isValidEmail = (value: string) => {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

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

router.post('/subscribe', async (req, res) => {
  const email = normalizeEmail(String(req.body?.email || ''));
  const name = (req.body?.name || '').toString().trim();
  const source = (req.body?.source || 'popup').toString().trim() || 'popup';

  if (!isValidEmail(email)) {
    return res.status(400).json({ success: false, error: 'Valid email is required' });
  }

  const subscribers = await getSubscribers();
  const nowIso = new Date().toISOString();
  const index = subscribers.findIndex(s => normalizeEmail(s.email) === email);

  if (index >= 0) {
    const existing = subscribers[index];
    subscribers[index] = {
      ...existing,
      email,
      name: name || existing.name,
      source: source || existing.source || 'popup',
      status: existing.status === 'unsubscribed' ? 'active' : existing.status || 'active',
      subscribed_at: nowIso,
      unsubscribed_at: existing.status === 'unsubscribed' ? undefined : existing.unsubscribed_at
    };
  } else {
    subscribers.unshift({
      id: randomUUID(),
      email,
      name: name || undefined,
      source,
      status: 'active',
      subscribed_at: nowIso
    });
  }

  await saveSubscribers(subscribers);
  return res.json({ success: true, message: 'Subscribed successfully' });
});

router.get('/popup-banners', async (req, res) => {
  const campaigns = await loadSetting<MarketingCampaignRecord[]>(CAMPAIGNS_SCOPE, []);
  const list = Array.isArray(campaigns) ? campaigns : [];
  const now = Date.now();
  const role = (req.query.role || '').toString().toLowerCase();

  const audienceMatches = (campaign: MarketingCampaignRecord) => {
    const audience = (campaign.targetAudience || campaign.target_audience || 'all').toString().toLowerCase();
    if (!audience || audience === 'all') return true;
    if (!role) return true;
    if (audience === 'freelancers') return role.includes('freelancer');
    if (audience === 'employers') return role.includes('employer') || role.includes('client');
    if (audience === 'inactive') return true;
    return true;
  };

  const isActive = (campaign: MarketingCampaignRecord) => {
    const status = (campaign.status || '').toString().toLowerCase();
    const scheduledAt = campaign.scheduledAt || campaign.scheduled_at;
    if (status === 'completed') return false;
    if (status === 'draft') return false;
    if (status === 'scheduled' && scheduledAt) {
      return new Date(scheduledAt).getTime() <= now;
    }
    return status === 'active' || status === 'scheduled';
  };

  const filtered = list.filter(c => (c.type || '').toLowerCase() === 'popup_banner' && isActive(c) && audienceMatches(c));

  res.json({ success: true, data: filtered });
});

export default router;
