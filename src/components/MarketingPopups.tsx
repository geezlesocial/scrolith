import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Mail, ExternalLink } from 'lucide-react';
import { MarketingService } from '../services/marketing';
import { MarketingCampaign, MarketingPopupSubscribeConfig } from '../types';
import { useUser } from '../context/UserContext';

const nowMs = () => Date.now();

const readCooldown = (key: string) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
};

const writeCooldown = (key: string) => {
  try {
    localStorage.setItem(key, String(nowMs()));
  } catch {
    // ignore storage errors
  }
};

const bannerCooldownKey = (id: string) => `marketing.popup.banner.${id}.dismissedAt`;
const subscribeCooldownKey = 'marketing.popup.subscribe.dismissedAt';
const subscribeSuccessKey = 'marketing.popup.subscribe.successAt';

const isCooldownActive = (key: string, cooldownHours?: number) => {
  if (!cooldownHours || cooldownHours <= 0) return false;
  const last = readCooldown(key);
  if (!last) return false;
  const diffHours = (nowMs() - last) / (1000 * 60 * 60);
  return diffHours < cooldownHours;
};

const selectActiveBanner = (campaigns: MarketingCampaign[]) => {
  if (!Array.isArray(campaigns) || campaigns.length === 0) return null;
  const list = [...campaigns].sort((a, b) => {
    const aTime = new Date(a.scheduledAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.scheduledAt || b.createdAt || 0).getTime();
    return bTime - aTime;
  });
  return list[0];
};

const defaultSubscribeConfig: MarketingPopupSubscribeConfig = {
  enabled: false,
  title: 'Join our newsletter',
  subtitle: 'Get the latest product updates, offers, and insights.',
  placeholder: 'Enter your email',
  buttonText: 'Subscribe',
  successMessage: 'Thanks for subscribing!',
  delaySeconds: 6,
  cooldownHours: 24
};

const MarketingPopups: React.FC = () => {
  const { user } = useUser();
  const [subscribeConfig, setSubscribeConfig] = useState<MarketingPopupSubscribeConfig>(defaultSubscribeConfig);
  const [banners, setBanners] = useState<MarketingCampaign[]>([]);
  const [showBanner, setShowBanner] = useState(false);
  const [showSubscribe, setShowSubscribe] = useState(false);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const bannerTimerRef = useRef<number | null>(null);
  const subscribeTimerRef = useRef<number | null>(null);

  const activeBanner = useMemo(() => selectActiveBanner(banners), [banners]);

  useEffect(() => {
    const load = async () => {
      try {
        const [popupConfig, popupBanners] = await Promise.all([
          MarketingService.getPublicPopupSubscribeConfig(),
          MarketingService.getPopupBanners(user?.role)
        ]);
        setSubscribeConfig({ ...defaultSubscribeConfig, ...(popupConfig || {}) });
        setBanners(Array.isArray(popupBanners) ? popupBanners : []);
      } catch (e) {
        // fail silently for public popups
      }
    };
    load();
  }, [user?.role]);

  const clearTimers = () => {
    if (bannerTimerRef.current) {
      window.clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = null;
    }
    if (subscribeTimerRef.current) {
      window.clearTimeout(subscribeTimerRef.current);
      subscribeTimerRef.current = null;
    }
  };

  useEffect(() => {
    clearTimers();

    const banner = activeBanner;
    const canShowBanner =
      banner &&
      !isCooldownActive(bannerCooldownKey(banner.id), banner.cooldownHours ?? 24);

    if (canShowBanner) {
      const delayMs = Math.max(0, Number(banner.delaySeconds || 0)) * 1000;
      bannerTimerRef.current = window.setTimeout(() => {
        setShowBanner(true);
      }, delayMs);
      return () => clearTimers();
    }

    if (subscribeConfig?.enabled) {
      const cooldown = subscribeConfig.cooldownHours ?? 24;
      const shouldShow =
        !isCooldownActive(subscribeCooldownKey, cooldown) &&
        !readCooldown(subscribeSuccessKey);

      if (shouldShow) {
        const delayMs = Math.max(0, Number(subscribeConfig.delaySeconds || 0)) * 1000;
        subscribeTimerRef.current = window.setTimeout(() => {
          setShowSubscribe(true);
        }, delayMs);
      }
    }

    return () => clearTimers();
  }, [activeBanner, subscribeConfig]);

  const handleCloseBanner = () => {
    if (activeBanner) {
      writeCooldown(bannerCooldownKey(activeBanner.id));
    }
    setShowBanner(false);
    if (subscribeConfig?.enabled) {
      const cooldown = subscribeConfig.cooldownHours ?? 24;
      if (!isCooldownActive(subscribeCooldownKey, cooldown) && !readCooldown(subscribeSuccessKey)) {
        const delayMs = Math.max(0, Number(subscribeConfig.delaySeconds || 0)) * 1000;
        subscribeTimerRef.current = window.setTimeout(() => {
          setShowSubscribe(true);
        }, delayMs);
      }
    }
  };

  const handleBannerClick = () => {
    if (!activeBanner?.ctaUrl) return;
    window.open(activeBanner.ctaUrl, '_blank', 'noopener,noreferrer');
    handleCloseBanner();
  };

  const handleCloseSubscribe = () => {
    writeCooldown(subscribeCooldownKey);
    setShowSubscribe(false);
  };

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await MarketingService.subscribeToNewsletter({ email: email.trim(), source: 'popup' });
      setSubmitSuccess(true);
      writeCooldown(subscribeSuccessKey);
      setTimeout(() => {
        setShowSubscribe(false);
      }, 1200);
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.message || 'Subscription failed';
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {showBanner && activeBanner && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <ExternalLink className="w-4 h-4 text-purple-600" />
                {activeBanner.name}
              </div>
              <button onClick={handleCloseBanner} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            {activeBanner.imageUrl && (
              <img src={activeBanner.imageUrl} alt={activeBanner.bannerTitle || activeBanner.name} className="w-full h-48 object-cover" />
            )}
            <div className="p-6 space-y-3">
              <h3 className="text-xl font-bold text-gray-900">{activeBanner.bannerTitle || activeBanner.name}</h3>
              {activeBanner.bannerBody && (
                <p className="text-sm text-gray-600">{activeBanner.bannerBody}</p>
              )}
              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  onClick={handleCloseBanner}
                  className="px-4 py-2 rounded-lg border text-sm font-semibold text-gray-600 hover:bg-gray-50"
                >
                  Maybe Later
                </button>
                <button
                  onClick={handleBannerClick}
                  className="px-4 py-2 rounded-lg bg-purple-600 text-white text-sm font-semibold hover:bg-purple-700"
                >
                  {activeBanner.ctaText || 'Learn More'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSubscribe && subscribeConfig?.enabled && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <Mail className="w-4 h-4 text-blue-600" />
                Email Updates
              </div>
              <button onClick={handleCloseSubscribe} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <h3 className="text-xl font-bold text-gray-900">{subscribeConfig.title}</h3>
                <p className="text-sm text-gray-600 mt-1">{subscribeConfig.subtitle}</p>
              </div>
              <form onSubmit={handleSubscribe} className="space-y-3">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={subscribeConfig.placeholder}
                  className="w-full border rounded-lg p-3 text-sm"
                />
                {submitError && <div className="text-xs text-red-600">{submitError}</div>}
                {submitSuccess && <div className="text-xs text-green-600">{subscribeConfig.successMessage}</div>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full px-4 py-3 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-70"
                >
                  {submitting ? 'Subscribing...' : subscribeConfig.buttonText}
                </button>
              </form>
              <p className="text-[11px] text-gray-400">
                You can unsubscribe anytime in your account settings.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default MarketingPopups;
