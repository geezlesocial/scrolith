import express from 'express';

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

const subscribers: SubscriberRecord[] = [];

const asDate = (value?: string) => (value ? new Date(value).getTime() : 0);
const daysAgo = (days: number) => Date.now() - days * 24 * 60 * 60 * 1000;

router.get('/subscribers', (_req, res) => {
  res.json({ success: true, data: subscribers });
});

router.get('/subscribers/analytics', (_req, res) => {
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

router.delete('/subscribers/:id', (req, res) => {
  const id = req.params.id;
  const index = subscribers.findIndex(s => s.id === id);
  if (index < 0) {
    res.status(404).json({ success: false, error: 'Subscriber not found' });
    return;
  }
  subscribers.splice(index, 1);
  res.json({ success: true, message: 'Subscriber removed' });
});

export default router;
