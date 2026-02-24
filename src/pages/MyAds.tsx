import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AdService } from '../services/ads';
import AdCard from '../components/AdCard';
import { AdCampaign } from '../types';
import { useNotification } from '../context/NotificationContext';
import { useCurrency } from '../context/CurrencyContext';
import { useUser } from '../context/UserContext';
import FilePickerModal from '../dashboard/shared/FilePickerModal';
import { PaymentService } from '../services/payment';
import { PaymentGateway } from '../types';
import { getUserFacingPaymentMethodName } from '../utils/paymentGatewayDisplay';

const toNumber = (value: any): number => {
  const n = typeof value === 'number' ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const formatCurrency = (amount: number, code?: string) => {
  const currency = code || 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch (e) {
    return `${currency} ${amount.toFixed(2)}`;
  }
};

const DEFAULT_ALLOWED_PLACEMENTS = [
  'homepage',
  'homepage_feed',
  'community_feed',
  'forum_listing',
  'thread_detail',
  'chat_sidebar'
];

const PLACEMENT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'homepage', label: 'Homepage' },
  { value: 'homepage_feed', label: 'Homepage Feed' },
  { value: 'community_feed', label: 'Community Feed' },
  { value: 'forum_listing', label: 'Forum Listing' },
  { value: 'thread_detail', label: 'Thread Detail' },
  { value: 'chat_sidebar', label: 'Chat Side Bar' }
];

const DEFAULT_TARGET_COUNTRIES = [
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'New Zealand',
  'Germany',
  'France',
  'Netherlands',
  'Sweden',
  'Norway',
  'Denmark',
  'Ireland',
  'Spain',
  'Italy',
  'United Arab Emirates',
  'Saudi Arabia',
  'India',
  'Nigeria',
  'South Africa',
  'Brazil',
  'Mexico',
  'Singapore',
  'Malaysia',
  'Philippines'
];

const GuideTip: React.FC<{ text: string }> = ({ text }) => (
  <details className="group relative shrink-0">
    <summary className="list-none cursor-pointer rounded-full border border-gray-300 px-2 py-0.5 text-[10px] font-bold text-gray-600 hover:bg-gray-100">
      ?
    </summary>
    <div className="absolute right-0 z-20 mt-1 w-64 rounded-lg border border-gray-200 bg-white p-2 text-[11px] font-normal text-gray-600 shadow-lg">
      {text}
    </div>
  </details>
);

const FieldLabel: React.FC<{ label: string; help: string }> = ({ label, help }) => (
  <div className="mb-1 flex items-center justify-between gap-2">
    <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{label}</span>
    <GuideTip text={help} />
  </div>
);

const normalizePlacement = (value: any): string => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return 'community_feed';
  if (raw === 'feed') return 'community_feed';
  if (raw === 'chat') return 'chat_sidebar';
  if (raw === 'forum_top') return 'forum_listing';
  return raw;
};

const normalizePricingModel = (value: any): 'CPM' | 'CPC' =>
  String(value || '').toUpperCase() === 'CPC' ? 'CPC' : 'CPM';

type AdFormState = {
  title: string;
  body: string;
  objective: 'traffic' | 'messages';
  destinationType: 'url' | 'messages';
  destinationUrl: string;
  ctaText: string;
  placements: string[];
  pricingModel: 'CPM' | 'CPC';
  targetCountries: string[];
  targetAudience: 'users' | 'businesses' | 'all';
  dailySpend: number;
  budget: number;
  currency: string;
  durationDays: number;
  media: { id: string; url?: string; name?: string; mimeType?: string; type?: string }[];
};

const buildEmptyForm = (currency: string): AdFormState => ({
  title: '',
  body: '',
  objective: 'traffic',
  destinationType: 'url',
  destinationUrl: '',
  ctaText: '',
  placements: ['community_feed'],
  pricingModel: 'CPM',
  targetCountries: [],
  targetAudience: 'users',
  dailySpend: 0,
  budget: 120,
  currency: currency || 'USD',
  durationDays: 7,
  media: []
});

const PENDING_AD_SUBMIT_KEY = 'scrolith:my_ads:pending_submit_after_checkout';
const CHECKOUT_STATUS_SUCCESS = 'success';
const CHECKOUT_STATUS_CANCEL = 'cancel';
const CHECKOUT_STATUS_FAILED = 'failed';

const MyAds = () => {
  const location = useLocation();
  const { showNotification } = useNotification();
  const { availableCurrencies, currency: selectedCurrency } = useCurrency();
  const { user } = useUser();
  const [ads, setAds] = useState<AdCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formActionMode, setFormActionMode] = useState<'draft' | 'submit' | 'pay' | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editingAdId, setEditingAdId] = useState<string | null>(null);
  const [form, setForm] = useState<AdFormState>(buildEmptyForm(selectedCurrency.code));
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [paymentGateways, setPaymentGateways] = useState<PaymentGateway[]>([]);
  const [gatewayLoading, setGatewayLoading] = useState(false);
  const [adGatewaySelections, setAdGatewaySelections] = useState<Record<string, string>>({});
  const [formGatewayId, setFormGatewayId] = useState('');
  const [adsConfig, setAdsConfig] = useState<any>(null);

  const [performanceOpen, setPerformanceOpen] = useState(false);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [performanceAd, setPerformanceAd] = useState<AdCampaign | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<any[]>([]);

  const currencyOptions = useMemo(
    () => availableCurrencies.filter((c) => c.isActive ?? true),
    [availableCurrencies]
  );

  const placementOptions = useMemo(() => {
    const configured = Array.isArray(adsConfig?.allowedPlacements)
      ? adsConfig.allowedPlacements.map((entry: any) => normalizePlacement(entry))
      : DEFAULT_ALLOWED_PLACEMENTS;
    const configuredSet = new Set(configured);
    const selected = PLACEMENT_OPTIONS.filter((option) => configuredSet.has(option.value));
    return selected.length ? selected : PLACEMENT_OPTIONS;
  }, [adsConfig]);

  const availableTargetCountries = useMemo(() => {
    const configured = Array.isArray(adsConfig?.targetCountries)
      ? adsConfig.targetCountries
          .map((entry: any) => String(entry || '').trim())
          .filter(Boolean)
      : DEFAULT_TARGET_COUNTRIES;
    const selected = Array.isArray(form.targetCountries)
      ? form.targetCountries.map((entry) => String(entry || '').trim()).filter(Boolean)
      : [];
    return Array.from(new Set([...configured, ...selected]));
  }, [adsConfig, form.targetCountries]);

  const maxPlacements = Math.max(1, Math.min(3, Number(adsConfig?.maxPlacementsPerAd ?? 3)));
  const maxImageAssets = Math.max(1, Math.min(12, Number(adsConfig?.maxImageAssets ?? 6)));
  const maxVideoAssets = Math.max(1, Math.min(3, Number(adsConfig?.maxVideoAssets ?? 1)));
  const minBudget = Math.max(0, Number(adsConfig?.minBudget ?? 10));
  const maxBudget = Math.max(minBudget, Number(adsConfig?.maxBudget ?? 10000));

  const normalizeStatus = (status?: string) =>
    (status || '').toString().toLowerCase().replace(/-/g, '_');

  const extractCheckoutUrl = (payload: any): string => {
    if (!payload || typeof payload !== 'object') return '';
    const direct =
      payload.redirect_url ||
      payload.redirectUrl ||
      payload.checkout_url ||
      payload.checkoutUrl ||
      payload.url;
    return typeof direct === 'string' ? direct : '';
  };

  const rememberPendingSubmitAfterCheckout = (adId: string) => {
    try {
      sessionStorage.setItem(
        PENDING_AD_SUBMIT_KEY,
        JSON.stringify({ adId, createdAt: Date.now() })
      );
    } catch (e) {}
  };

  const consumePendingSubmitAfterCheckout = (adId: string): boolean => {
    try {
      const raw = sessionStorage.getItem(PENDING_AD_SUBMIT_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw || '{}');
      sessionStorage.removeItem(PENDING_AD_SUBMIT_KEY);
      return String(parsed?.adId || '') === adId;
    } catch (e) {
      return false;
    }
  };

  const clearCheckoutQuery = () => {
    try {
      const params = new URLSearchParams(location.search);
      const keys = ['ad_payment', 'ad_payment_status', 'ad_id', 'adId'];
      let changed = false;
      keys.forEach((key) => {
        if (params.has(key)) {
          params.delete(key);
          changed = true;
        }
      });
      if (!changed) return;
      const next = `${location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
      window.history.replaceState({}, '', next);
    } catch (e) {}
  };

  const resolveGatewaySelection = (adId?: string, fallback?: string) => {
    if (adId) {
      const fromRow = adGatewaySelections[adId];
      if (fromRow) return fromRow;
    }
    if (formGatewayId) return formGatewayId;
    if (fallback) return fallback;
    return paymentGateways[0]?.id || '';
  };

  const requestAdPayment = async (
    adId: string,
    options: { gatewayId?: string; currency?: string; pendingSubmit?: boolean } = {}
  ): Promise<{ redirected: boolean; paid: boolean }> => {
    const gatewayId = options.gatewayId || '';
    const currency = options.currency || form.currency || 'USD';
    const pendingSubmit = Boolean(options.pendingSubmit);
    if (!gatewayId) {
      showNotification('warning', 'Payment method', 'Select a payment method before paying.');
      return { redirected: false, paid: false };
    }

    const paymentResult = await AdService.payAd(adId, { paymentMethodId: gatewayId, currency });
    if (paymentResult?.success === false) {
      showNotification('error', 'Payment failed', paymentResult?.message || 'Unable to process payment.');
      return { redirected: false, paid: false };
    }

    const checkoutUrl = extractCheckoutUrl(paymentResult?.data || paymentResult);
    if (checkoutUrl) {
      if (pendingSubmit) rememberPendingSubmitAfterCheckout(adId);
      showNotification('info', 'Redirecting', 'Opening checkout to complete payment.');
      window.location.assign(checkoutUrl);
      return { redirected: true, paid: false };
    }

    showNotification('success', 'Paid', paymentResult?.message || 'Payment completed successfully.');
    return { redirected: false, paid: true };
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await AdService.getMyAds();
      setAds(Array.isArray(data) ? data : []);
    } catch (e: any) {
      showNotification('error', 'Load failed', e?.message || 'Unable to load your ads.');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const paymentState = String(
      params.get('ad_payment') || params.get('ad_payment_status') || ''
    ).toLowerCase();
    const adId = String(params.get('ad_id') || params.get('adId') || '').trim();
    if (!paymentState) return;

    const run = async () => {
      if (paymentState === CHECKOUT_STATUS_CANCEL || paymentState === CHECKOUT_STATUS_FAILED) {
        showNotification('warning', 'Payment not completed', 'Checkout was cancelled. You can retry payment from My Ads.');
        await load();
        clearCheckoutQuery();
        return;
      }

      if (paymentState === CHECKOUT_STATUS_SUCCESS) {
        let submittedAfterPayment = false;
        if (adId && consumePendingSubmitAfterCheckout(adId)) {
          const submitResult = await AdService.submitAd(adId);
          if (submitResult?.success === false) {
            showNotification('warning', 'Paid, not submitted', submitResult?.message || 'Payment succeeded but auto-submit could not complete.');
          } else {
            submittedAfterPayment = true;
            showNotification('success', 'Submitted', 'Payment completed and campaign submitted for review.');
          }
        }
        if (!submittedAfterPayment) {
          showNotification('success', 'Payment completed', 'Your ad payment is complete.');
        }
        await load();
        clearCheckoutQuery();
      }
    };

    run();
  }, [location.search, load, showNotification]);

  useEffect(() => {
    const loadGateways = async () => {
      setGatewayLoading(true);
      try {
        const gateways = await PaymentService.getActivePaymentMethods();
        const active = Array.isArray(gateways) ? gateways : [];
        const supported = active.filter((gateway: any) => String(gateway?.id || '').toLowerCase() === 'stripe');
        const walletGateway = {
          id: 'wallet',
          name: 'Wallet Balance',
          is_enabled: true,
          isEnabled: true,
          supported_currencies: [],
          supportedCurrencies: []
        } as PaymentGateway;
        setPaymentGateways([walletGateway, ...supported]);
      } catch (e: any) {
        setPaymentGateways([
          {
            id: 'wallet',
            name: 'Wallet Balance',
            is_enabled: true,
            isEnabled: true,
            supported_currencies: [],
            supportedCurrencies: []
          } as PaymentGateway
        ]);
      } finally {
        setGatewayLoading(false);
      }
    };
    loadGateways();
  }, []);

  useEffect(() => {
    const loadAdsConfig = async () => {
      try {
        const config = await AdService.getConfig();
        setAdsConfig(config || null);
      } catch (e) {
        setAdsConfig(null);
      }
    };
    loadAdsConfig();
  }, []);

  useEffect(() => {
    if (paymentGateways.length === 0) {
      setAdGatewaySelections({});
      return;
    }
    setAdGatewaySelections((prev) => {
      const next: Record<string, string> = {};
      ads.forEach((ad) => {
        next[ad.id] = prev[ad.id] || paymentGateways[0].id;
      });
      return next;
    });
  }, [ads, paymentGateways]);

  useEffect(() => {
    if (!formOpen) return;
    if (paymentGateways.length === 0) {
      setFormGatewayId('');
      return;
    }
    setFormGatewayId((prev) => {
      if (prev && paymentGateways.some((gateway) => gateway.id === prev)) return prev;
      return paymentGateways[0].id;
    });
  }, [formOpen, paymentGateways]);

  useEffect(() => {
    const handleAdEvents = () => {
      load();
      if (performanceOpen && performanceAd?.id) {
        refreshPerformance(performanceAd.id);
      }
    };
    const events = [
      'community:ad_status_updated',
      'community:ad_created',
      'community:ad_deleted',
      'community:ad_metrics_updated'
    ];
    events.forEach((ev) => window.addEventListener(ev, handleAdEvents as EventListener));
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleAdEvents as EventListener));
    };
  }, [load, performanceOpen, performanceAd?.id]);

  useEffect(() => {
    if (!formOpen) return;
    if (!form.currency) {
      setForm((prev) => ({ ...prev, currency: selectedCurrency.code || 'USD' }));
    }
  }, [formOpen, form.currency, selectedCurrency.code]);

  const getPlacementRate = useCallback(
    (placement: string, kind: 'cpmByPlacement' | 'cpcByPlacement') => {
      const normalized = normalizePlacement(placement);
      const source = (adsConfig?.[kind] || {}) as Record<string, any>;
      const aliases = [normalized];
      if (normalized === 'community_feed') aliases.push('feed');
      if (normalized === 'chat_sidebar') aliases.push('chat');
      for (const key of aliases) {
        const value = Number(source[key]);
        if (Number.isFinite(value) && value >= 0) return value;
      }
      return 0;
    },
    [adsConfig]
  );

  const primaryPlacement = form.placements[0] || placementOptions[0]?.value || 'community_feed';
  const activeRates = useMemo(() => {
    return {
      cpm: getPlacementRate(primaryPlacement, 'cpmByPlacement'),
      cpc: getPlacementRate(primaryPlacement, 'cpcByPlacement')
    };
  }, [getPlacementRate, primaryPlacement]);

  const estimatedOutcomes = useMemo(() => {
    const budget = toNumber(form.budget);
    if (form.pricingModel === 'CPM') {
      return {
        impressions: activeRates.cpm > 0 ? Math.floor((budget / activeRates.cpm) * 1000) : 0,
        clicks: 0
      };
    }
    return {
      impressions: 0,
      clicks: activeRates.cpc > 0 ? Math.floor(budget / activeRates.cpc) : 0
    };
  }, [form.budget, form.pricingModel, activeRates.cpm, activeRates.cpc]);

  const mediaCounts = useMemo(() => {
    return form.media.reduce(
      (acc, media) => {
        const mime = String(media.mimeType || media.type || '').toLowerCase();
        if (mime.startsWith('video/')) acc.videos += 1;
        else acc.images += 1;
        return acc;
      },
      { images: 0, videos: 0 }
    );
  }, [form.media]);

  const openCreate = () => {
    setFormMode('create');
    setEditingAdId(null);
    setForm(buildEmptyForm(selectedCurrency.code));
    setFormGatewayId(paymentGateways[0]?.id || '');
    setFormOpen(true);
  };

  const openEdit = (ad: AdCampaign) => {
    const targeting =
      ad.targeting && typeof ad.targeting === 'object' && !Array.isArray(ad.targeting)
        ? (ad.targeting as Record<string, any>)
        : {};
    const placements = Array.from(
      new Set(
        (
          Array.isArray(targeting.placements) && targeting.placements.length > 0
            ? targeting.placements
            : [ad.placement || 'community_feed']
        )
          .map((placement: any) => normalizePlacement(placement))
          .filter(Boolean)
      )
    ).slice(0, maxPlacements);
    const mediaFromAd = Array.isArray(ad.media) && ad.media.length > 0
      ? ad.media.map((m: any) => ({ id: m.id || '', url: m.url, name: m.name, mimeType: m.mimeType }))
      : (ad.mediaFileIds || []).map((id) => ({ id } as any));
    setFormMode('edit');
    setEditingAdId(ad.id);
    setFormGatewayId(adGatewaySelections[ad.id] || paymentGateways[0]?.id || '');
    setForm({
      title: ad.title || '',
      body: ad.body || '',
      objective: (ad.objective || 'traffic') as 'traffic' | 'messages',
      destinationType: (ad.destinationType || (ad.objective === 'messages' ? 'messages' : 'url')) as 'url' | 'messages',
      destinationUrl: ad.destinationUrl || '',
      ctaText: ad.ctaText || '',
      placements: placements.length ? placements : ['community_feed'],
      pricingModel: normalizePricingModel(targeting.pricingModel || (ad as any).pricingModel || 'CPM'),
      targetCountries: Array.from(
        new Set(
          (
            Array.isArray(targeting.targetCountries)
              ? targeting.targetCountries
              : typeof targeting.targetCountries === 'string'
                ? targeting.targetCountries.split(',')
                : []
          )
            .map((entry: any) => String(entry || '').trim())
            .filter(Boolean)
        )
      ),
      targetAudience: (() => {
        const audience = String(targeting.targetAudience || '').toLowerCase();
        if (audience === 'businesses' || audience === 'all') return audience as 'businesses' | 'all';
        return 'users';
      })(),
      dailySpend: toNumber(targeting.dailySpend),
      budget: toNumber(ad.budget),
      currency: ad.currency || selectedCurrency.code || 'USD',
      durationDays: toNumber(ad.durationDays || 7) || 7,
      media: mediaFromAd
    });
    setFormOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this ad?')) return;
    try {
      await AdService.deleteCampaign(id);
      showNotification('success', 'Deleted', 'Ad removed.');
      setAds((prev) => prev.filter((a) => a.id !== id));
    } catch (e: any) {
      showNotification('error', 'Delete failed', e?.message || 'Unable to delete ad.');
    }
  };

  const handlePay = async (ad: AdCampaign, gatewayId?: string) => {
    const adId = ad.id;
    const currency = ad.currency || form.currency;
    if (!confirm('Proceed to pay for this ad?')) return;
    setPayingId(adId);
    try {
      const selectedGateway = resolveGatewaySelection(adId, gatewayId);
      const paymentState = await requestAdPayment(adId, {
        gatewayId: selectedGateway,
        currency
      });
      if (paymentState.redirected) return;
      if (paymentState.paid) await load();
    } catch (e: any) {
      showNotification('error', 'Payment error', e?.message || 'Unable to process payment.');
    } finally {
      setPayingId(null);
    }
  };

  const handleSubmit = async (adId: string) => {
    if (!confirm('Submit this ad for review?')) return;
    setSubmittingId(adId);
    try {
      const submitResult = await AdService.submitAd(adId);
      if (submitResult?.success === false) {
        const submitMessage = submitResult?.message || 'Unable to submit ad.';
        const requiresPayment = submitMessage.toLowerCase().includes('must be paid before submission');
        if (!requiresPayment) {
          showNotification('error', 'Submit failed', submitMessage);
          return;
        }

        const ad = ads.find((entry) => entry.id === adId);
        const selectedGateway = resolveGatewaySelection(adId);
        const paymentState = await requestAdPayment(adId, {
          gatewayId: selectedGateway,
          currency: ad?.currency || form.currency,
          pendingSubmit: true
        });
        if (paymentState.redirected) return;
        if (!paymentState.paid) return;

        const secondSubmit = await AdService.submitAd(adId);
        if (secondSubmit?.success === false) {
          showNotification('error', 'Submit failed', secondSubmit?.message || 'Unable to submit ad.');
          return;
        }
        showNotification('success', 'Submitted', secondSubmit?.message || 'Ad submitted for review.');
        await load();
        return;
      }

      showNotification('success', 'Submitted', submitResult?.message || 'Ad submitted for review.');
      await load();
    } catch (e: any) {
      showNotification('error', 'Submit failed', e?.message || 'Unable to submit ad.');
    } finally {
      setSubmittingId(null);
    }
  };

  const handlePause = async (adId: string) => {
    if (!confirm('Pause this ad?')) return;
    try {
      await AdService.pauseOwnAd(adId);
      showNotification('success', 'Paused', 'Ad paused successfully.');
      await load();
    } catch (e: any) {
      showNotification('error', 'Pause failed', e?.message || 'Unable to pause ad.');
    }
  };

  const handleResume = async (adId: string) => {
    if (!confirm('Resume this ad?')) return;
    try {
      await AdService.resumeOwnAd(adId);
      showNotification('success', 'Resumed', 'Ad resumed successfully.');
      await load();
    } catch (e: any) {
      showNotification('error', 'Resume failed', e?.message || 'Unable to resume ad.');
    }
  };

  const handleFormAction = async (mode: 'draft' | 'submit' | 'pay') => {
    if (!form.title.trim()) {
      showNotification('warning', 'Missing title', 'Please add a title for your ad.');
      return;
    }
    if (form.objective === 'traffic' && form.destinationType === 'url' && !form.destinationUrl.trim()) {
      showNotification('warning', 'Missing URL', 'Please add a destination URL for traffic ads.');
      return;
    }
    if (!Array.isArray(form.placements) || form.placements.length === 0) {
      showNotification('warning', 'Missing placement', 'Select at least one ad placement.');
      return;
    }
    if (form.placements.length > maxPlacements) {
      showNotification('warning', 'Placement limit', `You can select up to ${maxPlacements} placements.`);
      return;
    }
    if (toNumber(form.budget) < minBudget) {
      showNotification('warning', 'Budget too low', `Minimum ad budget is ${minBudget} ${form.currency}.`);
      return;
    }
    if (toNumber(form.budget) > maxBudget) {
      showNotification('warning', 'Budget too high', `Maximum ad budget is ${maxBudget} ${form.currency}.`);
      return;
    }
    if (toNumber(form.dailySpend) > 0 && toNumber(form.dailySpend) > toNumber(form.budget)) {
      showNotification('warning', 'Daily spend', 'Daily spend cannot exceed total budget.');
      return;
    }
    if (mediaCounts.images > maxImageAssets || mediaCounts.videos > maxVideoAssets) {
      showNotification(
        'warning',
        'Media limit',
        `Max media per ad: ${maxImageAssets} images and ${maxVideoAssets} video.`
      );
      return;
    }
    if (mode === 'pay' && !formGatewayId) {
      showNotification('warning', 'Payment method', 'Select a payment method before paying.');
      return;
    }

    setFormActionMode(mode);
    setSaving(true);
    try {
      const targetCountries = Array.from(
        new Set(
          (Array.isArray(form.targetCountries) ? form.targetCountries : [])
            .map((entry) => entry.trim())
            .filter(Boolean)
        )
      );
      const pricingModel = normalizePricingModel(form.pricingModel);
      const destinationType = form.objective === 'messages' ? 'messages' : form.destinationType;
      const normalizedPlacements = Array.from(
        new Set((form.placements || []).map((placement) => normalizePlacement(placement)).filter(Boolean))
      ).slice(0, maxPlacements);
      const primaryPlacement = normalizedPlacements[0] || 'community_feed';
      const targetAudience = form.targetAudience || 'users';
      const dailySpend = toNumber(form.dailySpend) > 0 ? toNumber(form.dailySpend) : undefined;
      const payload = {
        title: form.title,
        body: form.body,
        objective: form.objective,
        destinationType,
        destinationUrl: destinationType === 'messages' ? null : form.destinationUrl,
        ctaText: form.ctaText,
        placement: primaryPlacement as any,
        placements: normalizedPlacements,
        pricingModel,
        computeOption: pricingModel,
        targetCountries,
        targetAudience,
        dailySpend,
        budget: form.budget,
        currency: form.currency,
        durationDays: form.durationDays,
        mediaFileIds: form.media.map((m) => m.id).filter(Boolean),
        targeting: {
          placements: normalizedPlacements,
          pricingModel,
          targetCountries,
          targetAudience,
          dailySpend: dailySpend ?? null,
          estimated:
            pricingModel === 'CPM'
              ? { pricingModel, estimatedImpressions: estimatedOutcomes.impressions, estimatedClicks: 0 }
              : { pricingModel, estimatedImpressions: 0, estimatedClicks: estimatedOutcomes.clicks }
        }
      } as Partial<AdCampaign>;

      let adId = editingAdId || '';
      if (formMode === 'create') {
        const created = await AdService.createAdDraft(payload);
        if (!created?.id) throw new Error('Unable to create ad draft.');
        adId = created.id;
        setFormMode('edit');
        setEditingAdId(created.id);
        if (mode === 'draft') {
          showNotification('success', 'Draft created', 'Ad draft saved.');
        }
      } else if (editingAdId) {
        const updated = await AdService.updateAd(editingAdId, payload);
        if (!updated) throw new Error('Unable to update ad.');
        adId = updated.id || editingAdId;
        if (mode === 'draft') {
          showNotification('success', 'Updated', 'Ad updated successfully.');
        }
      }

      if (!adId) {
        throw new Error('Unable to resolve ad campaign id.');
      }

      if (mode === 'submit') {
        const submitResult = await AdService.submitAd(adId);
        if (submitResult?.success === false) {
          const submitMessage = submitResult?.message || 'Unable to submit ad.';
          const requiresPayment = submitMessage.toLowerCase().includes('must be paid before submission');
          if (!requiresPayment) {
            showNotification('error', 'Submit failed', submitMessage);
            await load();
            return;
          }

          const selectedGateway = resolveGatewaySelection(adId, formGatewayId);
          const paymentState = await requestAdPayment(adId, {
            gatewayId: selectedGateway,
            currency: form.currency,
            pendingSubmit: true
          });
          if (paymentState.redirected) return;
          if (!paymentState.paid) {
            await load();
            return;
          }

          const secondSubmit = await AdService.submitAd(adId);
          if (secondSubmit?.success === false) {
            showNotification('error', 'Submit failed', secondSubmit?.message || 'Unable to submit ad.');
            await load();
            return;
          }
          showNotification('success', 'Submitted', secondSubmit?.message || 'Ad submitted for review.');
          setFormOpen(false);
          setEditingAdId(null);
          await load();
          return;
        }
        showNotification('success', 'Submitted', submitResult?.message || 'Ad submitted for review.');
      }

      if (mode === 'pay') {
        const paymentState = await requestAdPayment(adId, {
          gatewayId: resolveGatewaySelection(adId, formGatewayId),
          currency: form.currency
        });
        if (paymentState.redirected) return;
        if (!paymentState.paid) {
          await load();
          return;
        }
      }

      setFormOpen(false);
      setEditingAdId(null);
      await load();
    } catch (e: any) {
      showNotification('error', 'Save failed', e?.message || 'Unable to save ad.');
    } finally {
      setFormActionMode(null);
      setSaving(false);
    }
  };

  const refreshPerformance = async (adId: string) => {
    setPerformanceLoading(true);
    try {
      const data = await AdService.getAdPerformance(adId);
      setPerformanceAd((prev) => (data?.ad as AdCampaign) || prev || null);
      setPerformanceMetrics(Array.isArray(data?.metrics) ? data.metrics : Array.isArray(data?.daily) ? data.daily : []);
    } catch (e: any) {
      showNotification('error', 'Performance', e?.message || 'Unable to load performance.');
    } finally {
      setPerformanceLoading(false);
    }
  };

  const openPerformance = (ad: AdCampaign) => {
    setPerformanceAd(ad);
    setPerformanceMetrics([]);
    setPerformanceOpen(true);
    refreshPerformance(ad.id);
  };

  const appendMediaToForm = (files: Array<{ id: string; url?: string; name?: string; mimeType?: string; type?: string }>) => {
    if (!Array.isArray(files) || files.length === 0) return;
    let blockedImages = 0;
    let blockedVideos = 0;
    setForm((prev) => {
      const nextMedia = [...prev.media];
      let imageCount = nextMedia.reduce((count, media) => {
        const mime = String(media.mimeType || media.type || '').toLowerCase();
        return mime.startsWith('video/') ? count : count + 1;
      }, 0);
      let videoCount = nextMedia.reduce((count, media) => {
        const mime = String(media.mimeType || media.type || '').toLowerCase();
        return mime.startsWith('video/') ? count + 1 : count;
      }, 0);

      for (const file of files) {
        if (!file?.id || nextMedia.some((media) => media.id === file.id)) continue;
        const mime = String(file.mimeType || file.type || '').toLowerCase();
        const isVideo = mime.startsWith('video/');
        if (isVideo) {
          if (videoCount >= maxVideoAssets) {
            blockedVideos += 1;
            continue;
          }
          videoCount += 1;
        } else {
          if (imageCount >= maxImageAssets) {
            blockedImages += 1;
            continue;
          }
          imageCount += 1;
        }
        nextMedia.push(file);
      }

      return { ...prev, media: nextMedia };
    });
    if (blockedImages > 0 || blockedVideos > 0) {
      showNotification(
        'warning',
        'Media limit',
        `Only ${maxImageAssets} images and ${maxVideoAssets} video are allowed per ad campaign.`
      );
    }
  };

  const performanceTotals = useMemo(() => {
    const totals = performanceMetrics.reduce(
      (acc, item) => {
        acc.impressions += toNumber(item.impressions);
        acc.clicks += toNumber(item.clicks);
        acc.spend += toNumber(item.spend);
        return acc;
      },
      { impressions: 0, clicks: 0, spend: 0 }
    );
    const ctr = totals.impressions ? (totals.clicks / totals.impressions) * 100 : 0;
    return { ...totals, ctr };
  }, [performanceMetrics]);

  const sortedMetrics = useMemo(() => {
    return [...performanceMetrics].sort((a, b) => {
      const da = new Date(a.date || a.day || 0).getTime();
      const db = new Date(b.date || b.day || 0).getTime();
      return db - da;
    });
  }, [performanceMetrics]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">My Ads</h2>
          <p className="text-sm text-gray-500">Create, manage, and track your ad campaigns.</p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold"
        >
          Create Ad Campaign
        </button>
      </div>
      {!gatewayLoading && paymentGateways.length === 0 && (
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-xs text-yellow-700">
          No active payment gateways are configured. Ask an admin to enable one.
        </div>
      )}

      {loading ? (
        <div className="p-6 bg-white rounded-xl">Loading...</div>
      ) : ads.length === 0 ? (
        <div className="p-6 bg-white rounded-xl space-y-3">
          <p>You have no ads yet.</p>
          <button
            onClick={openCreate}
            className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold"
          >
            Create your first ad
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {ads.map((ad) => {
            const status = normalizeStatus(ad.status);
            const budget = toNumber(ad.budget);
            const remaining = toNumber(ad.remainingBudget ?? budget);
            const spent = Math.max(0, budget - remaining);
            const progress = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;
            const canEdit = ['draft', 'rejected', 'awaiting_payment'].includes(status);
            const canPay = ['draft', 'rejected', 'awaiting_payment'].includes(status);
            const canSubmit = status === 'paid';
            const canDelete = ['draft', 'rejected'].includes(status);
            const canPause = status === 'active';
            const canResume = status === 'paused';

            return (
              <div key={ad.id} className="bg-white p-4 rounded-xl border">
                <AdCard ad={ad} showDonate={false} />
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Budget: {formatCurrency(budget, ad.currency)}</span>
                    <span>Remaining: {formatCurrency(remaining, ad.currency)}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-2 bg-blue-500" style={{ width: `${progress}%` }} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => openPerformance(ad)}
                    className="px-3 py-1 rounded bg-gray-100 text-gray-700 text-sm"
                  >
                    View Progress
                  </button>
                  {canEdit && (
                    <button
                      onClick={() => openEdit(ad)}
                      className="px-3 py-1 rounded bg-blue-600 text-white text-sm"
                    >
                      Edit
                    </button>
                  )}
                  {canPay && (
                    <select
                      value={adGatewaySelections[ad.id] || ''}
                      onChange={(e) => setAdGatewaySelections((prev) => ({ ...prev, [ad.id]: e.target.value }))}
                      className="px-2 py-1 rounded border border-gray-200 text-sm"
                      disabled={gatewayLoading || paymentGateways.length === 0}
                    >
                      {gatewayLoading ? (
                        <option value="">Loading...</option>
                      ) : paymentGateways.length === 0 ? (
                        <option value="">No active gateways</option>
                      ) : (
                        paymentGateways.map((gateway) => (
                          <option key={gateway.id} value={gateway.id}>
                            {getUserFacingPaymentMethodName(gateway)}
                          </option>
                        ))
                      )}
                    </select>
                  )}
                  {canPay && (
                    <button
                      onClick={() => handlePay(ad, adGatewaySelections[ad.id])}
                      disabled={payingId === ad.id || !adGatewaySelections[ad.id]}
                      className={`px-3 py-1 rounded text-white text-sm ${payingId === ad.id ? 'bg-gray-400' : 'bg-emerald-600'}`}
                    >
                      {payingId === ad.id ? 'Processing...' : 'Pay'}
                    </button>
                  )}
                  {canSubmit && (
                    <button
                      onClick={() => handleSubmit(ad.id)}
                      disabled={submittingId === ad.id}
                      className={`px-3 py-1 rounded text-white text-sm ${submittingId === ad.id ? 'bg-gray-400' : 'bg-indigo-600'}`}
                    >
                      {submittingId === ad.id ? 'Submitting...' : 'Submit'}
                    </button>
                  )}
                  {canPause && (
                    <button
                      onClick={() => handlePause(ad.id)}
                      className="px-3 py-1 rounded bg-amber-500 text-white text-sm"
                    >
                      Pause
                    </button>
                  )}
                  {canResume && (
                    <button
                      onClick={() => handleResume(ad.id)}
                      className="px-3 py-1 rounded bg-emerald-600 text-white text-sm"
                    >
                      Resume
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => handleDelete(ad.id)}
                      className="px-3 py-1 rounded bg-red-600 text-white text-sm"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <h3 className="text-lg font-bold">{formMode === 'create' ? 'Create Ad Campaign' : 'Edit Ad Campaign'}</h3>
                <p className="text-xs text-gray-500">Drafts can be edited until payment is submitted.</p>
              </div>
              <button
                onClick={() => setFormOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                Close
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <FieldLabel label="Ad title" help="A short headline users see first. Keep it clear and specific to your offer." />
                  <input
                    value={form.title}
                    onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="Ad title"
                    className="rounded-xl border border-gray-200 px-4 py-3 text-sm w-full"
                  />
                </div>
                <div>
                  <FieldLabel label="Objective" help="Traffic sends users to a URL. Messages opens direct conversation with you." />
                  <select
                    value={form.objective}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        objective: e.target.value as 'traffic' | 'messages',
                        destinationType: e.target.value === 'messages' ? 'messages' : prev.destinationType
                      }))
                    }
                    className="rounded-xl border border-gray-200 px-4 py-3 text-sm w-full"
                  >
                    <option value="traffic">Objective: Traffic</option>
                    <option value="messages">Objective: Messages</option>
                  </select>
                </div>
              </div>
              <div>
                <FieldLabel label="Ad copy" help="Main message shown in the ad. Explain the value and include a clear call to action." />
                <textarea
                  value={form.body}
                  onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
                  placeholder="Ad copy"
                  className="rounded-xl border border-gray-200 px-4 py-3 text-sm w-full"
                  rows={3}
                />
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">Where should this ad appear?</p>
                    <GuideTip text="Choose up to the configured limit. The first selected placement is used as the primary placement for pricing." />
                  </div>
                  <span className="text-xs text-gray-500">Select up to {maxPlacements}</span>
                </div>
                <div className="grid gap-2 md:grid-cols-3">
                  {placementOptions.map((option) => {
                    const selected = form.placements.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          if (selected) {
                            setForm((prev) => ({
                              ...prev,
                              placements: prev.placements.filter((placement) => placement !== option.value)
                            }));
                            return;
                          }
                          if (form.placements.length >= maxPlacements) {
                            showNotification(
                              'warning',
                              'Placement limit',
                              `You can choose up to ${maxPlacements} placements.`
                            );
                            return;
                          }
                          setForm((prev) => ({
                            ...prev,
                            placements: [...prev.placements, option.value]
                          }));
                        }}
                        className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                          selected
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <FieldLabel label="Destination type" help="Choose whether clicks go to your URL or open direct messages." />
                  <select
                    value={form.destinationType}
                    onChange={(e) => setForm((prev) => ({ ...prev, destinationType: e.target.value as 'url' | 'messages' }))}
                    disabled={form.objective === 'messages'}
                    className="rounded-xl border border-gray-200 px-4 py-3 text-sm w-full"
                  >
                    <option value="url">Send users to URL</option>
                    <option value="messages">Receive messages</option>
                  </select>
                </div>
                <div>
                  <FieldLabel label="Billing model" help="CPM charges per 1,000 impressions. CPC charges per click." />
                  <select
                    value={form.pricingModel}
                    onChange={(e) => setForm((prev) => ({ ...prev, pricingModel: normalizePricingModel(e.target.value) }))}
                    className="rounded-xl border border-gray-200 px-4 py-3 text-sm w-full"
                  >
                    <option value="CPM">Cost Per Mille (CPM)</option>
                    <option value="CPC">Cost Per Click (CPC)</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <FieldLabel label="Destination URL" help="Where users are sent when they click. Required for URL destination ads." />
                  <input
                    value={form.destinationUrl}
                    onChange={(e) => setForm((prev) => ({ ...prev, destinationUrl: e.target.value }))}
                    placeholder="Destination URL (https://...)"
                    disabled={form.destinationType === 'messages'}
                    className="rounded-xl border border-gray-200 px-4 py-3 text-sm w-full"
                  />
                </div>
                <div>
                  <FieldLabel label="CTA text" help="Optional button label displayed on the ad, such as Learn More or Send Message." />
                  <input
                    value={form.ctaText}
                    onChange={(e) => setForm((prev) => ({ ...prev, ctaText: e.target.value }))}
                    placeholder="CTA text (optional)"
                    className="rounded-xl border border-gray-200 px-4 py-3 text-sm w-full"
                  />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <FieldLabel label="Target countries" help="Select one or more countries to limit where your ad is served." />
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      const nextCountry = String(e.target.value || '').trim();
                      if (!nextCountry) return;
                      setForm((prev) => ({
                        ...prev,
                        targetCountries: Array.from(new Set([...(prev.targetCountries || []), nextCountry]))
                      }));
                      e.currentTarget.value = '';
                    }}
                    className="rounded-xl border border-gray-200 px-4 py-3 text-sm w-full"
                  >
                    <option value="" disabled>
                      Choose country
                    </option>
                    {availableTargetCountries.map((country) => (
                      <option key={country} value={country}>
                        {country}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {form.targetCountries.map((country) => (
                      <span key={country} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">
                        {country}
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              targetCountries: prev.targetCountries.filter((entry) => entry !== country)
                            }))
                          }
                          className="rounded px-1 text-blue-700 hover:bg-blue-100"
                        >
                          x
                        </button>
                      </span>
                    ))}
                  </div>
                  {form.targetCountries.length === 0 && (
                    <p className="mt-1 text-xs text-gray-500">No country selected. Your ad can run in all allowed regions.</p>
                  )}
                </div>
                <div>
                  <FieldLabel label="Target audience" help="Choose whether to target individual users, businesses, or everyone." />
                  <select
                    value={form.targetAudience}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        targetAudience: e.target.value as 'users' | 'businesses' | 'all'
                      }))
                    }
                    className="rounded-xl border border-gray-200 px-4 py-3 text-sm w-full"
                  >
                    <option value="users">Target audience: Users</option>
                    <option value="businesses">Target audience: Company/Businesses</option>
                    <option value="all">Target audience: All</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-4">
                <div>
                  <FieldLabel label="Total budget" help="Total campaign spend. Minimum and maximum are controlled by admin rules." />
                  <input
                    type="number"
                    min={0}
                    value={form.budget}
                    onChange={(e) => setForm((prev) => ({ ...prev, budget: toNumber(e.target.value) }))}
                    placeholder={`Budget (min ${minBudget})`}
                    className="rounded-xl border border-gray-200 px-4 py-3 text-sm w-full"
                  />
                </div>
                <div>
                  <FieldLabel label="Currency" help="Billing currency for this campaign and estimated outcomes." />
                  <select
                    value={form.currency}
                    onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value }))}
                    className="rounded-xl border border-gray-200 px-4 py-3 text-sm w-full"
                  >
                    {currencyOptions.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} - {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel label="Duration" help="Number of days the campaign should run once approved and active." />
                  <input
                    type="number"
                    min={1}
                    value={form.durationDays}
                    onChange={(e) => setForm((prev) => ({ ...prev, durationDays: toNumber(e.target.value || 1) }))}
                    placeholder="Duration (days)"
                    className="rounded-xl border border-gray-200 px-4 py-3 text-sm w-full"
                  />
                </div>
                <div>
                  <FieldLabel label="Daily spend cap" help="Optional daily cap. Leave 0 to let spend distribute naturally over campaign duration." />
                  <input
                    type="number"
                    min={0}
                    value={form.dailySpend}
                    onChange={(e) => setForm((prev) => ({ ...prev, dailySpend: toNumber(e.target.value || 0) }))}
                    placeholder="Daily spend"
                    className="rounded-xl border border-gray-200 px-4 py-3 text-sm w-full"
                  />
                </div>
              </div>
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs text-blue-800">
                <div className="flex flex-wrap items-center gap-4">
                  <span>
                    Primary placement: <strong>{placementOptions.find((option) => option.value === primaryPlacement)?.label || primaryPlacement}</strong>
                  </span>
                  <span>
                    Rate: <strong>{form.pricingModel === 'CPM' ? `${activeRates.cpm || 0} ${form.currency}/1,000 views` : `${activeRates.cpc || 0} ${form.currency}/click`}</strong>
                  </span>
                  <span>
                    Estimated {form.pricingModel === 'CPM' ? 'views' : 'clicks'}:{' '}
                    <strong>{form.pricingModel === 'CPM' ? estimatedOutcomes.impressions : estimatedOutcomes.clicks}</strong>
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">Media</p>
                      <GuideTip text="Upload visual assets for your ad. Limits are enforced by admin policy and shown below." />
                    </div>
                    <p className="text-xs text-gray-500">
                      Upload up to {maxImageAssets} images and {maxVideoAssets} video.
                    </p>
                  </div>
                  <button
                    onClick={() => setMediaPickerOpen(true)}
                    className="px-3 py-1 rounded bg-gray-100 text-gray-700 text-sm"
                  >
                    Add Media
                  </button>
                </div>
                {form.media.length > 0 && (
                  <div className="grid gap-3 md:grid-cols-2">
                    {form.media.map((media) => (
                      <div key={media.id} className="border rounded-xl p-2 flex items-center gap-3">
                        {media.url ? (
                          <img src={media.url} alt={media.name || 'media'} className="w-16 h-16 object-cover rounded-lg" />
                        ) : (
                          <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center text-xs text-gray-500">File</div>
                        )}
                        <div className="flex-1">
                          <p className="text-sm font-medium">{media.name || media.id}</p>
                          <p className="text-xs text-gray-500">{media.mimeType || media.type || 'media'}</p>
                        </div>
                        <button
                          onClick={() => setForm((prev) => ({ ...prev, media: prev.media.filter((m) => m.id !== media.id) }))}
                          className="text-xs text-red-500"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs text-gray-600">
                  Available payment methods.
                </div>
                <div>
                  <FieldLabel label="Payment method" help="Select the payment provider to fund this ad campaign before review." />
                  <select
                    value={formGatewayId}
                    onChange={(e) => setFormGatewayId(e.target.value)}
                    className="rounded-xl border border-gray-200 px-4 py-3 text-sm w-full"
                    disabled={gatewayLoading || paymentGateways.length === 0}
                  >
                    {gatewayLoading ? (
                      <option value="">Loading...</option>
                    ) : paymentGateways.length === 0 ? (
                      <option value="">No active gateways</option>
                    ) : (
                      paymentGateways.map((gateway) => (
                        <option key={gateway.id} value={gateway.id}>
                          {getUserFacingPaymentMethodName(gateway)}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>
            </div>
            <div className="p-6 border-t flex flex-wrap items-center justify-end gap-2">
              <button
                onClick={() => setFormOpen(false)}
                className="px-4 py-2 rounded-xl border text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => handleFormAction('draft')}
                disabled={saving}
                className="px-4 py-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-sm font-semibold"
              >
                {saving && formActionMode === 'draft'
                  ? formMode === 'create'
                    ? 'Saving...'
                    : 'Updating...'
                  : formMode === 'create'
                    ? 'Save Draft'
                    : 'Save Changes'}
              </button>
              <button
                onClick={() => handleFormAction('submit')}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold disabled:bg-gray-300"
              >
                {saving && formActionMode === 'submit' ? 'Submitting...' : 'Submit for Review'}
              </button>
              <button
                onClick={() => handleFormAction('pay')}
                disabled={saving || gatewayLoading || paymentGateways.length === 0 || !formGatewayId}
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold disabled:bg-gray-300"
              >
                {saving && formActionMode === 'pay' ? 'Processing payment...' : 'Pay Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      <FilePickerModal
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        onSelectMultiple={(files) => {
          appendMediaToForm(
            files.map((file) => ({
              id: file.id,
              url: file.url,
              name: file.name,
              mimeType: file.mimeType,
              type: file.type
            }))
          );
        }}
        onSelect={(file) => {
          appendMediaToForm([
            { id: file.id, url: file.url, name: file.name, mimeType: file.mimeType, type: file.type }
          ]);
        }}
        multiple
        allowUpload
        filterType="all"
        acceptedTypes={['image', 'video']}
        title="Select Ad Media"
        role={user?.role}
        visibility="public"
      />

      {performanceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <h3 className="text-lg font-bold">Ad Performance</h3>
                <p className="text-xs text-gray-500">{performanceAd?.title}</p>
              </div>
              <button
                onClick={() => setPerformanceOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                Close
              </button>
            </div>
            <div className="p-6 space-y-4">
              {performanceLoading ? (
                <div className="text-sm text-gray-500">Loading performance...</div>
              ) : (
                <>
                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="p-4 rounded-xl bg-gray-50">
                      <p className="text-xs text-gray-500">Impressions</p>
                      <p className="text-lg font-semibold">{performanceTotals.impressions}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-gray-50">
                      <p className="text-xs text-gray-500">Clicks</p>
                      <p className="text-lg font-semibold">{performanceTotals.clicks}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-gray-50">
                      <p className="text-xs text-gray-500">CTR</p>
                      <p className="text-lg font-semibold">{performanceTotals.ctr.toFixed(2)}%</p>
                    </div>
                    <div className="p-4 rounded-xl bg-gray-50">
                      <p className="text-xs text-gray-500">Spend</p>
                      <p className="text-lg font-semibold">
                        {formatCurrency(performanceTotals.spend, performanceAd?.currency)}
                      </p>
                    </div>
                  </div>
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="px-4 py-2 text-left">Date</th>
                          <th className="px-4 py-2 text-left">Impressions</th>
                          <th className="px-4 py-2 text-left">Clicks</th>
                          <th className="px-4 py-2 text-left">Spend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedMetrics.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                              No metrics yet.
                            </td>
                          </tr>
                        ) : (
                          sortedMetrics.slice(0, 10).map((metric, idx) => (
                            <tr key={`${metric.date || idx}`} className="border-t">
                              <td className="px-4 py-2">
                                {metric.date ? new Date(metric.date).toLocaleDateString() : '-'}
                              </td>
                              <td className="px-4 py-2">{toNumber(metric.impressions)}</td>
                              <td className="px-4 py-2">{toNumber(metric.clicks)}</td>
                              <td className="px-4 py-2">{formatCurrency(toNumber(metric.spend), performanceAd?.currency)}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyAds;

