import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AdService } from '../services/ads';
import AdCard from '../components/AdCard';
import { AdCampaign } from '../types';
import { useNotification } from '../context/NotificationContext';
import { useCurrency } from '../context/CurrencyContext';
import { useUser } from '../context/UserContext';
import FilePickerModal from '../dashboard/shared/FilePickerModal';
import { PaymentService } from '../services/payment';
import { PaymentGateway } from '../types';

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

type AdFormState = {
  title: string;
  body: string;
  objective: 'traffic' | 'messages';
  destinationType: 'url' | 'messages';
  destinationUrl: string;
  ctaText: string;
  placement: string;
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
  placement: 'feed',
  budget: 120,
  currency: currency || 'USD',
  durationDays: 7,
  media: []
});

const MyAds = () => {
  const { showNotification } = useNotification();
  const { availableCurrencies, currency: selectedCurrency } = useCurrency();
  const { user } = useUser();
  const [ads, setAds] = useState<AdCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [editingAdId, setEditingAdId] = useState<string | null>(null);
  const [form, setForm] = useState<AdFormState>(buildEmptyForm(selectedCurrency.code));
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [paymentGateways, setPaymentGateways] = useState<PaymentGateway[]>([]);
  const [gatewayLoading, setGatewayLoading] = useState(false);
  const [adGatewaySelections, setAdGatewaySelections] = useState<Record<string, string>>({});

  const [performanceOpen, setPerformanceOpen] = useState(false);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [performanceAd, setPerformanceAd] = useState<AdCampaign | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<any[]>([]);

  const currencyOptions = useMemo(
    () => availableCurrencies.filter((c) => c.isActive ?? true),
    [availableCurrencies]
  );

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
    const loadGateways = async () => {
      setGatewayLoading(true);
      try {
        const gateways = await PaymentService.getActivePaymentMethods();
        const active = Array.isArray(gateways) ? gateways : [];
        setPaymentGateways(active);
      } catch (e: any) {
        setPaymentGateways([]);
      } finally {
        setGatewayLoading(false);
      }
    };
    loadGateways();
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

  const normalizeStatus = (status?: string) =>
    (status || '').toString().toLowerCase().replace(/-/g, '_');

  const openCreate = () => {
    setFormMode('create');
    setEditingAdId(null);
    setForm(buildEmptyForm(selectedCurrency.code));
    setFormOpen(true);
  };

  const openEdit = (ad: AdCampaign) => {
    const mediaFromAd = Array.isArray(ad.media) && ad.media.length > 0
      ? ad.media.map((m: any) => ({ id: m.id || '', url: m.url, name: m.name, mimeType: m.mimeType }))
      : (ad.mediaFileIds || []).map((id) => ({ id } as any));
    setFormMode('edit');
    setEditingAdId(ad.id);
    setForm({
      title: ad.title || '',
      body: ad.body || '',
      objective: (ad.objective || 'traffic') as 'traffic' | 'messages',
      destinationType: (ad.destinationType || (ad.objective === 'messages' ? 'messages' : 'url')) as 'url' | 'messages',
      destinationUrl: ad.destinationUrl || '',
      ctaText: ad.ctaText || '',
      placement: (ad.placement as any) || 'feed',
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
    if (!gatewayId) {
      showNotification('warning', 'Payment method', 'Select a payment method before paying.');
      return;
    }
    if (!confirm('Proceed to pay for this ad?')) return;
    setPayingId(adId);
    try {
      showNotification('info', 'Processing', 'Sending payment...');
      const res = await AdService.payAd(adId, { paymentMethodId: gatewayId, currency });
      if (res?.success === false) {
        showNotification('error', 'Payment failed', res?.message || 'Unable to process payment.');
        return;
      }
      showNotification('success', 'Paid', res?.message || 'Ad payment initiated.');
      await load();
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
      const res = await AdService.submitAd(adId);
      if (res?.success === false) {
        showNotification('error', 'Submit failed', res?.message || 'Unable to submit ad.');
        return;
      }
      showNotification('success', 'Submitted', res?.message || 'Ad submitted for review.');
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

  const handleSave = async () => {
    if (!form.title.trim()) {
      showNotification('warning', 'Missing title', 'Please add a title for your ad.');
      return;
    }
    if (form.objective === 'traffic' && form.destinationType === 'url' && !form.destinationUrl.trim()) {
      showNotification('warning', 'Missing URL', 'Please add a destination URL for traffic ads.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: form.title,
        body: form.body,
        objective: form.objective,
        destinationType: form.destinationType,
        destinationUrl: form.destinationUrl,
        ctaText: form.ctaText,
        placement: form.placement as any,
        budget: form.budget,
        currency: form.currency,
        durationDays: form.durationDays,
        mediaFileIds: form.media.map((m) => m.id).filter(Boolean)
      } as Partial<AdCampaign>;

      if (formMode === 'create') {
        const created = await AdService.createAdDraft(payload);
        if (!created) throw new Error('Unable to create ad draft.');
        showNotification('success', 'Draft created', 'Ad draft saved.');
      } else if (editingAdId) {
        const updated = await AdService.updateAd(editingAdId, payload);
        if (!updated) throw new Error('Unable to update ad.');
        showNotification('success', 'Updated', 'Ad updated successfully.');
      }

      setFormOpen(false);
      setEditingAdId(null);
      await load();
    } catch (e: any) {
      showNotification('error', 'Save failed', e?.message || 'Unable to save ad.');
    } finally {
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
                            {gateway.name || gateway.label || gateway.id}
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
                <input
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Ad title"
                  className="rounded-xl border border-gray-200 px-4 py-3 text-sm"
                />
                <select
                  value={form.objective}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      objective: e.target.value as 'traffic' | 'messages',
                      destinationType: e.target.value === 'messages' ? 'messages' : prev.destinationType
                    }))
                  }
                  className="rounded-xl border border-gray-200 px-4 py-3 text-sm"
                >
                  <option value="traffic">Objective: Traffic</option>
                  <option value="messages">Objective: Messages</option>
                </select>
              </div>
              <textarea
                value={form.body}
                onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
                placeholder="Ad copy"
                className="rounded-xl border border-gray-200 px-4 py-3 text-sm w-full"
                rows={3}
              />
              <div className="grid gap-3 md:grid-cols-2">
                <select
                  value={form.placement}
                  onChange={(e) => setForm((prev) => ({ ...prev, placement: e.target.value }))}
                  className="rounded-xl border border-gray-200 px-4 py-3 text-sm"
                >
                  <option value="feed">Community feed</option>
                  <option value="forum_listing">Forum listing</option>
                  <option value="thread_detail">Thread detail</option>
                  <option value="chat">Chat sidebar</option>
                </select>
                <select
                  value={form.destinationType}
                  onChange={(e) => setForm((prev) => ({ ...prev, destinationType: e.target.value as 'url' | 'messages' }))}
                  className="rounded-xl border border-gray-200 px-4 py-3 text-sm"
                >
                  <option value="url">Send users to URL</option>
                  <option value="messages">Receive messages</option>
                </select>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  value={form.destinationUrl}
                  onChange={(e) => setForm((prev) => ({ ...prev, destinationUrl: e.target.value }))}
                  placeholder="Destination URL (https://...)"
                  disabled={form.destinationType === 'messages'}
                  className="rounded-xl border border-gray-200 px-4 py-3 text-sm"
                />
                <input
                  value={form.ctaText}
                  onChange={(e) => setForm((prev) => ({ ...prev, ctaText: e.target.value }))}
                  placeholder="CTA text (optional)"
                  className="rounded-xl border border-gray-200 px-4 py-3 text-sm"
                />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <input
                  type="number"
                  min={0}
                  value={form.budget}
                  onChange={(e) => setForm((prev) => ({ ...prev, budget: toNumber(e.target.value) }))}
                  placeholder="Budget"
                  className="rounded-xl border border-gray-200 px-4 py-3 text-sm"
                />
                <select
                  value={form.currency}
                  onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value }))}
                  className="rounded-xl border border-gray-200 px-4 py-3 text-sm"
                >
                  {currencyOptions.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} - {c.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  value={form.durationDays}
                  onChange={(e) => setForm((prev) => ({ ...prev, durationDays: toNumber(e.target.value || 1) }))}
                  placeholder="Duration (days)"
                  className="rounded-xl border border-gray-200 px-4 py-3 text-sm"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">Media</p>
                    <p className="text-xs text-gray-500">Upload or choose images/videos for your ad.</p>
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
            </div>
            <div className="p-6 border-t flex items-center justify-end gap-2">
              <button
                onClick={() => setFormOpen(false)}
                className="px-4 py-2 rounded-xl border text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold"
              >
                {saving ? 'Saving...' : formMode === 'create' ? 'Save Draft' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      <FilePickerModal
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        onSelectMultiple={(files) => {
          setForm((prev) => ({
            ...prev,
            media: [
              ...prev.media,
              ...files.map((file) => ({ id: file.id, url: file.url, name: file.name, mimeType: file.mimeType, type: file.type }))
            ]
          }));
        }}
        onSelect={(file) => {
          setForm((prev) => ({
            ...prev,
            media: [...prev.media, { id: file.id, url: file.url, name: file.name, mimeType: file.mimeType, type: file.type }]
          }));
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

