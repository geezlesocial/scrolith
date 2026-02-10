import React, { useEffect, useRef, useState } from 'react';
import { Save, ShieldCheck, Activity, MapPin, Settings, ShieldAlert, FileCode2, Server, RefreshCw } from 'lucide-react';
import { useContent } from '../../context/ContentContext';
import { useNotification } from '../../context/NotificationContext';
import api from '../../services/api';
import { CMSService } from '../../services/cms';
import { commerceService } from '../../services/commerce';
import { jobsApi } from '../../services/jobs';
import { tokenStore } from '../../services/tokenStore';
import type { PlatformIntegrationsSettings } from '../../types';

const defaultIntegrations: PlatformIntegrationsSettings = {
  recaptcha: {
    enabled: false,
    siteKey: '',
    scoreThreshold: 0.5,
    version: 'v3'
  },
  analytics: {
    googleEnabled: false,
    googleAnalyticsId: '',
    facebookEnabled: false,
    facebookPixelId: ''
  },
  googleMap: {
    enabled: false,
    apiKey: '',
    defaultLat: 37.7749,
    defaultLng: -122.4194,
    defaultZoom: 12
  },
  firebase: {
    enabled: false,
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
    measurementId: ''
  },
  facebookComments: {
    enabled: false,
    appId: ''
  },
  sitemap: {
    lastGeneratedAt: ''
  }
};

const Toggle = ({ enabled, onChange }: { enabled: boolean; onChange: (value: boolean) => void }) => (
  <button
    type="button"
    onClick={() => onChange(!enabled)}
    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${enabled ? 'bg-green-600' : 'bg-gray-200'}`}
    aria-pressed={enabled}
  >
    <span
      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${enabled ? 'translate-x-5' : 'translate-x-0'}`}
    />
  </button>
);

const GoogleSettings: React.FC = () => {
  const { settings, updateSettings } = useContent();
  const { showNotification } = useNotification();
  const [integrations, setIntegrations] = useState<PlatformIntegrationsSettings>(defaultIntegrations);
  const [recaptchaSecretKey, setRecaptchaSecretKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState('');
  const [recaptchaError, setRecaptchaError] = useState('');
  const [sitemapXml, setSitemapXml] = useState('');
  const [sitemapBaseUrl, setSitemapBaseUrl] = useState('');
  const [sitemapOptions, setSitemapOptions] = useState({
    includeCmsPages: true,
    includeBlogPosts: true,
    includeGigs: true,
    includeJobs: true,
    includeCommunity: false
  });
  const [sitemapGenerating, setSitemapGenerating] = useState(false);
  const [serverStatus, setServerStatus] = useState<any>(null);
  const [serviceChecks, setServiceChecks] = useState<Array<{ name: string; url: string; status: 'ok' | 'error' | 'pending' | 'auth-required'; latencyMs?: number; detail?: string }>>([]);
  const [serverLoading, setServerLoading] = useState(false);
  const mapPreviewRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);

  useEffect(() => {
    if (!settings) return;
    const current = (settings as any)?.integrations || {};
    const fallbackAnalyticsId = (settings as any)?.google_analytics_id || (settings as any)?.googleAnalyticsId || '';
    const fallbackFacebookPixelId = (settings as any)?.facebook_pixel_id || (settings as any)?.facebookPixelId || '';
    const fallbackRecaptchaSiteKey = (settings as any)?.recaptcha_site_key || (settings as any)?.recaptchaSiteKey || '';
    const merged: PlatformIntegrationsSettings = {
      ...defaultIntegrations,
      ...current,
      recaptcha: { ...defaultIntegrations.recaptcha, siteKey: fallbackRecaptchaSiteKey, ...(current.recaptcha || {}) },
      analytics: { ...defaultIntegrations.analytics, googleAnalyticsId: fallbackAnalyticsId, facebookPixelId: fallbackFacebookPixelId, ...(current.analytics || {}) },
      googleMap: { ...defaultIntegrations.googleMap, ...(current.googleMap || {}) },
      firebase: { ...defaultIntegrations.firebase, ...(current.firebase || {}) },
      facebookComments: { ...defaultIntegrations.facebookComments, ...(current.facebookComments || {}) },
      sitemap: { ...defaultIntegrations.sitemap, ...(current.sitemap || {}) }
    };

    setIntegrations(merged);
    setRecaptchaSecretKey(String((settings as any)?.system?.integrations?.recaptchaSecretKey || ''));
    if (!sitemapBaseUrl) {
      setSitemapBaseUrl((settings as any)?.siteUrl || (typeof window !== 'undefined' ? window.location.origin : ''));
    }
  }, [settings]);

  useEffect(() => {
    if (!integrations.googleMap?.enabled) return;
    if (!mapPreviewRef.current) return;
    const gmaps = (window as any)?.google?.maps;
    if (!gmaps) return;

    const lat = Number(integrations.googleMap?.defaultLat ?? 37.7749);
    const lng = Number(integrations.googleMap?.defaultLng ?? -122.4194);
    const zoom = Number(integrations.googleMap?.defaultZoom ?? 12);

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new gmaps.Map(mapPreviewRef.current, {
        center: { lat, lng },
        zoom
      });
    } else {
      mapInstanceRef.current.setCenter({ lat, lng });
      mapInstanceRef.current.setZoom(zoom);
    }
  }, [integrations.googleMap?.enabled, integrations.googleMap?.defaultLat, integrations.googleMap?.defaultLng, integrations.googleMap?.defaultZoom]);

  useEffect(() => {
    if (!integrations.facebookComments?.enabled || !integrations.facebookComments?.appId) return;
    const w = window as any;
    if (w?.FB?.XFBML?.parse) {
      try { w.FB.XFBML.parse(); } catch { /* ignore */ }
    }
  }, [integrations.facebookComments?.enabled, integrations.facebookComments?.appId, sitemapBaseUrl]);

  const saveAll = async () => {
    if (!updateSettings) {
      showNotification('alert', 'Unavailable', 'Settings update is not available in this context.');
      return;
    }

    try {
      setSaving(true);
      const nextSettings: any = {
        ...(settings || {}),
        integrations: integrations
      };

      const nextSystem: any = {
        ...((settings as any)?.system || {}),
        integrations: {
          ...((settings as any)?.system?.integrations || {}),
          recaptchaSecretKey: recaptchaSecretKey || ''
        }
      };

      nextSettings.system = nextSystem;

      await updateSettings(nextSettings);
      showNotification('success', 'Settings Saved', 'Google and integration settings were saved successfully.');
    } catch (e: any) {
      const message = e?.message || 'Failed to save settings.';
      showNotification('alert', 'Save Failed', message);
    } finally {
      setSaving(false);
    }
  };

  const runRecaptchaTest = async () => {
    setRecaptchaError('');
    setRecaptchaToken('');

    const siteKey = integrations.recaptcha?.siteKey?.trim();
    if (!siteKey) {
      setRecaptchaError('Site key is required.');
      return;
    }
    if ((integrations.recaptcha?.version || 'v3') === 'v2') {
      setRecaptchaError('Test is available for reCAPTCHA v3 only.');
      return;
    }

    const grecaptcha = (window as any)?.grecaptcha;
    if (!grecaptcha || typeof grecaptcha.execute !== 'function') {
      setRecaptchaError('reCAPTCHA script not loaded yet. Save settings and refresh this page.');
      return;
    }

    try {
      grecaptcha.ready(async () => {
        try {
          const token = await grecaptcha.execute(siteKey, { action: 'admin_test' });
          setRecaptchaToken(token);
        } catch (err: any) {
          setRecaptchaError(err?.message || 'Failed to execute reCAPTCHA.');
        }
      });
    } catch (err: any) {
      setRecaptchaError(err?.message || 'Failed to execute reCAPTCHA.');
    }
  };

  const sendAnalyticsTest = () => {
    const w = window as any;
    if (integrations.analytics?.googleEnabled && typeof w.gtag === 'function') {
      w.gtag('event', 'admin_test', { source: 'admin_settings' });
    }
    if (integrations.analytics?.facebookEnabled && typeof w.fbq === 'function') {
      w.fbq('trackCustom', 'AdminTest', { source: 'admin_settings' });
    }
    showNotification('info', 'Test Event Sent', 'Analytics test events were dispatched.');
  };

  const pingServer = async () => {
    try {
      setServerLoading(true);
      const healthResp = await api.get('/health');
      const healthData = healthResp?.data?.data || healthResp?.data || healthResp;
      setServerStatus(healthData);

      const serviceEntries = Object.entries(healthData?.services || {}) as Array<[string, string]>;
      const token = await tokenStore.get();
      const hasToken = Boolean(token);
      const isAdminUrl = (url: string) => /\/api\/admin\b/i.test(url);
      const checks = await Promise.all(
        serviceEntries.map(async ([name, url]) => {
          const path = url.startsWith('/api') ? url.replace('/api', '') : url;
          if (!hasToken && isAdminUrl(url)) {
            return { name, url, status: 'auth-required' as const, detail: 'Login required' };
          }
          const start = performance.now();
          try {
            await api.get(path);
            const latencyMs = Math.round(performance.now() - start);
            return { name, url, status: 'ok' as const, latencyMs };
          } catch (e: any) {
            const latencyMs = Math.round(performance.now() - start);
            const statusCode = e?.response?.status;
            if (statusCode === 401 || statusCode === 403) {
              return { name, url, status: 'auth-required' as const, latencyMs, detail: 'Login required' };
            }
            return { name, url, status: 'error' as const, latencyMs, detail: e?.message || 'Request failed' };
          }
        })
      );

      const adminChecks = await Promise.all([
        (async () => {
          const start = performance.now();
          if (!hasToken) {
            return { name: 'admin', url: '/api/admin/health', status: 'auth-required' as const, detail: 'Login required' };
          }
          try {
            await api.get('/admin/health');
            return { name: 'admin', url: '/api/admin/health', status: 'ok' as const, latencyMs: Math.round(performance.now() - start) };
          } catch (e: any) {
            const statusCode = e?.response?.status;
            if (statusCode === 401 || statusCode === 403) {
              return { name: 'admin', url: '/api/admin/health', status: 'auth-required' as const, latencyMs: Math.round(performance.now() - start), detail: 'Login required' };
            }
            return { name: 'admin', url: '/api/admin/health', status: 'error' as const, latencyMs: Math.round(performance.now() - start), detail: e?.message || 'Admin health failed' };
          }
        })(),
        (async () => {
          const start = performance.now();
          if (!hasToken) {
            return { name: 'market-intelligence', url: '/api/admin/market-intelligence/health', status: 'auth-required' as const, detail: 'Login required' };
          }
          try {
            await api.get('/admin/market-intelligence/health');
            return { name: 'market-intelligence', url: '/api/admin/market-intelligence/health', status: 'ok' as const, latencyMs: Math.round(performance.now() - start) };
          } catch (e: any) {
            const statusCode = e?.response?.status;
            if (statusCode === 401 || statusCode === 403) {
              return { name: 'market-intelligence', url: '/api/admin/market-intelligence/health', status: 'auth-required' as const, latencyMs: Math.round(performance.now() - start), detail: 'Login required' };
            }
            return { name: 'market-intelligence', url: '/api/admin/market-intelligence/health', status: 'error' as const, latencyMs: Math.round(performance.now() - start), detail: e?.message || 'Health failed' };
          }
        })()
      ]);

      setServiceChecks([...checks, ...adminChecks]);
    } catch (e: any) {
      showNotification('alert', 'Server Status Error', e?.message || 'Failed to check server status.');
    } finally {
      setServerLoading(false);
    }
  };

  useEffect(() => {
    pingServer();
    const interval = setInterval(pingServer, 30000);
    return () => clearInterval(interval);
  }, []);

  const generateSitemap = async () => {
    setSitemapGenerating(true);
    try {
      const baseUrl = (sitemapBaseUrl || (typeof window !== 'undefined' ? window.location.origin : '')).replace(/\/$/, '');
      const urls: Array<{ loc: string; lastmod?: string; changefreq?: string; priority?: number }> = [];

      const addUrl = (path: string, lastmod?: string, changefreq?: string, priority?: number) => {
        if (!path) return;
        const loc = path.startsWith('http') ? path : `${baseUrl}${path}`;
        urls.push({ loc, lastmod, changefreq, priority });
      };

      const staticRoutes = [
        '/',
        '/browse',
        '/browse-jobs',
        '/search',
        '/blog',
        '/answers',
        '/guides',
        '/hire',
        '/freelancer',
        '/support',
        '/affiliate-program'
      ];

      staticRoutes.forEach((route) => addUrl(route, undefined, 'weekly', route === '/' ? 1 : 0.6));

      const results = await Promise.allSettled([
        sitemapOptions.includeCmsPages ? CMSService.getPages() : Promise.resolve([]),
        sitemapOptions.includeBlogPosts ? CMSService.getBlogPosts() : Promise.resolve([]),
        sitemapOptions.includeGigs ? commerceService.getGigs({ limit: 500, status: 'active' }) : Promise.resolve([]),
        sitemapOptions.includeJobs ? jobsApi.getJobs({ limit: 500, status: 'active' }) : Promise.resolve({ jobs: [] })
      ]);

      const [pagesRes, blogRes, gigsRes, jobsRes] = results;

      if (pagesRes.status === 'fulfilled') {
        const pages = Array.isArray(pagesRes.value) ? pagesRes.value : [];
        pages.forEach((page: any) => addUrl(`/p/${page.slug}`, page.updated_at || page.updatedAt, 'monthly', 0.5));
      }

      if (blogRes.status === 'fulfilled') {
        const raw: any = blogRes.value as any;
        const posts = Array.isArray(raw?.data)
          ? raw.data
          : Array.isArray(raw?.data?.data)
            ? raw.data.data
            : Array.isArray(raw)
              ? raw
              : [];
        posts.forEach((post: any) => addUrl(`/blog/${post.slug}`, post.updated_at || post.updatedAt, 'weekly', 0.6));
      }

      if (gigsRes.status === 'fulfilled') {
        const gigs = Array.isArray(gigsRes.value) ? gigsRes.value : [];
        gigs.forEach((gig: any) => addUrl(`/gigs/${gig.id}`, gig.updated_at || gig.updatedAt, 'weekly', 0.7));
      }

      if (jobsRes.status === 'fulfilled') {
        const jobsData: any = jobsRes.value as any;
        const jobs = Array.isArray(jobsData?.jobs) ? jobsData.jobs : Array.isArray(jobsData) ? jobsData : [];
        jobs.forEach((job: any) => addUrl(`/jobs/${job.id}`, job.updated_at || job.updatedAt, 'weekly', 0.7));
      }

      if (sitemapOptions.includeCommunity) {
        addUrl('/community', undefined, 'weekly', 0.4);
      }

      const unique = Array.from(new Map(urls.map((u) => [u.loc, u])).values());

      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...unique.map((entry) => {
          const lastmod = entry.lastmod ? `<lastmod>${new Date(entry.lastmod).toISOString()}</lastmod>` : '';
          const changefreq = entry.changefreq ? `<changefreq>${entry.changefreq}</changefreq>` : '';
          const priority = entry.priority !== undefined ? `<priority>${entry.priority.toFixed(1)}</priority>` : '';
          return `  <url><loc>${entry.loc}</loc>${lastmod}${changefreq}${priority}</url>`;
        }),
        '</urlset>'
      ].join('\n');

      setSitemapXml(xml);
      const lastGeneratedAt = new Date().toISOString();
      setIntegrations((prev) => ({
        ...prev,
        sitemap: { ...prev.sitemap, lastGeneratedAt }
      }));
      showNotification('success', 'Sitemap Generated', 'Sitemap XML generated successfully.');
    } catch (e: any) {
      showNotification('alert', 'Sitemap Error', e?.message || 'Failed to generate sitemap.');
    } finally {
      setSitemapGenerating(false);
    }
  };

  const downloadSitemap = () => {
    if (!sitemapXml) return;
    const blob = new Blob([sitemapXml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sitemap.xml';
    a.click();
    URL.revokeObjectURL(url);
  };

  const copySitemap = async () => {
    if (!sitemapXml) return;
    try {
      await navigator.clipboard.writeText(sitemapXml);
      showNotification('success', 'Copied', 'Sitemap XML copied to clipboard.');
    } catch {
      showNotification('alert', 'Copy Failed', 'Unable to copy sitemap XML.');
    }
  };

  const sitemapLastGenerated = integrations.sitemap?.lastGeneratedAt;

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Google Settings & Integrations</h2>
          <p className="text-gray-500">Configure tracking, security, and platform utilities without impacting existing settings.</p>
        </div>
        <button
          onClick={saveAll}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-medium shadow hover:bg-blue-700 transition-all flex items-center"
          disabled={saving}
        >
          <Save className="w-4 h-4 mr-2" /> {saving ? 'Saving...' : 'Save All'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-bold text-gray-900">Google reCAPTCHA</h3>
            </div>
            <Toggle
              enabled={Boolean(integrations.recaptcha?.enabled)}
              onChange={(value) =>
                setIntegrations((prev) => ({
                  ...prev,
                  recaptcha: { ...prev.recaptcha!, enabled: value }
                }))
              }
            />
          </div>
          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Site Key</label>
              <input
                type="text"
                value={integrations.recaptcha?.siteKey || ''}
                onChange={(e) => setIntegrations((prev) => ({ ...prev, recaptcha: { ...prev.recaptcha!, siteKey: e.target.value } }))}
                className="w-full border-gray-300 rounded-lg p-2.5"
                placeholder="reCAPTCHA site key"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Secret Key (stored in System Settings)</label>
              <input
                type="password"
                value={recaptchaSecretKey}
                onChange={(e) => setRecaptchaSecretKey(e.target.value)}
                className="w-full border-gray-300 rounded-lg p-2.5"
                placeholder="Secret key"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Version</label>
                <select
                  value={integrations.recaptcha?.version || 'v3'}
                  onChange={(e) => setIntegrations((prev) => ({ ...prev, recaptcha: { ...prev.recaptcha!, version: e.target.value as 'v2' | 'v3' } }))}
                  className="w-full border-gray-300 rounded-lg p-2.5"
                >
                  <option value="v3">v3 (score-based)</option>
                  <option value="v2">v2 (checkbox)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Accept V3 Score</label>
                <select
                  value={integrations.recaptcha?.scoreThreshold ?? 0.5}
                  onChange={(e) => setIntegrations((prev) => ({ ...prev, recaptcha: { ...prev.recaptcha!, scoreThreshold: Number(e.target.value) } }))}
                  className="w-full border-gray-300 rounded-lg p-2.5"
                >
                  {[0.1, 0.3, 0.5, 0.7, 0.9].map((score) => (
                    <option key={score} value={score}>{score.toFixed(1)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={runRecaptchaTest} className="px-4 py-2 rounded-lg border text-sm font-medium hover:bg-gray-50">Test reCAPTCHA</button>
              {recaptchaToken && <span className="text-xs text-green-600">Token generated ({recaptchaToken.slice(0, 12)}...)</span>}
              {recaptchaError && <span className="text-xs text-red-600">{recaptchaError}</span>}
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h4 className="font-semibold text-gray-900 mb-3">reCAPTCHA Guidance</h4>
          <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
            <li>Use v3 for seamless background scoring.</li>
            <li>Scores below 0.3 are likely bots; consider blocking.</li>
            <li>Set a stricter threshold for sensitive forms.</li>
            <li>Store the secret key only in admin settings.</li>
          </ol>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Activity className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-bold text-gray-900">Analytics Tools</h3>
            </div>
            <button onClick={sendAnalyticsTest} className="text-sm px-3 py-1.5 rounded-lg border hover:bg-gray-50">Send Test Event</button>
          </div>
          <div className="mt-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-gray-900">Google Analytics</h4>
                <p className="text-sm text-gray-500">Supports GA4 Measurement ID or Universal Analytics Tracking ID.</p>
              </div>
              <Toggle
                enabled={Boolean(integrations.analytics?.googleEnabled)}
                onChange={(value) =>
                  setIntegrations((prev) => ({
                    ...prev,
                    analytics: { ...prev.analytics!, googleEnabled: value }
                  }))
                }
              />
            </div>
            <input
              type="text"
              value={integrations.analytics?.googleAnalyticsId || ''}
              onChange={(e) => setIntegrations((prev) => ({ ...prev, analytics: { ...prev.analytics!, googleAnalyticsId: e.target.value } }))}
              className="w-full border-gray-300 rounded-lg p-2.5"
              placeholder="GA4 Measurement ID (G-XXXXXXX)"
            />
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-gray-900">Facebook Pixel</h4>
                <p className="text-sm text-gray-500">Track conversions and ad performance.</p>
              </div>
              <Toggle
                enabled={Boolean(integrations.analytics?.facebookEnabled)}
                onChange={(value) =>
                  setIntegrations((prev) => ({
                    ...prev,
                    analytics: { ...prev.analytics!, facebookEnabled: value }
                  }))
                }
              />
            </div>
            <input
              type="text"
              value={integrations.analytics?.facebookPixelId || ''}
              onChange={(e) => setIntegrations((prev) => ({ ...prev, analytics: { ...prev.analytics!, facebookPixelId: e.target.value } }))}
              className="w-full border-gray-300 rounded-lg p-2.5"
              placeholder="Facebook Pixel ID"
            />
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h4 className="font-semibold text-gray-900 mb-3">Analytics Notes</h4>
          <ul className="text-sm text-gray-600 list-disc list-inside space-y-2">
            <li>Enable only the trackers you actively use.</li>
            <li>Events update in real time once saved.</li>
            <li>Use the test button to confirm tracking.</li>
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <MapPin className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-bold text-gray-900">Google Map Settings</h3>
            </div>
            <Toggle
              enabled={Boolean(integrations.googleMap?.enabled)}
              onChange={(value) =>
                setIntegrations((prev) => ({
                  ...prev,
                  googleMap: { ...prev.googleMap!, enabled: value }
                }))
              }
            />
          </div>
          <div className="mt-6 space-y-4">
            <input
              type="text"
              value={integrations.googleMap?.apiKey || ''}
              onChange={(e) => setIntegrations((prev) => ({ ...prev, googleMap: { ...prev.googleMap!, apiKey: e.target.value } }))}
              className="w-full border-gray-300 rounded-lg p-2.5"
              placeholder="Google Maps API Key"
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Default Latitude</label>
                <input
                  type="number"
                  value={integrations.googleMap?.defaultLat ?? 37.7749}
                  onChange={(e) => setIntegrations((prev) => ({ ...prev, googleMap: { ...prev.googleMap!, defaultLat: Number(e.target.value) } }))}
                  className="w-full border-gray-300 rounded-lg p-2.5"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Default Longitude</label>
                <input
                  type="number"
                  value={integrations.googleMap?.defaultLng ?? -122.4194}
                  onChange={(e) => setIntegrations((prev) => ({ ...prev, googleMap: { ...prev.googleMap!, defaultLng: Number(e.target.value) } }))}
                  className="w-full border-gray-300 rounded-lg p-2.5"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Default Zoom</label>
                <input
                  type="number"
                  value={integrations.googleMap?.defaultZoom ?? 12}
                  onChange={(e) => setIntegrations((prev) => ({ ...prev, googleMap: { ...prev.googleMap!, defaultZoom: Number(e.target.value) } }))}
                  className="w-full border-gray-300 rounded-lg p-2.5"
                />
              </div>
            </div>
            <div className="h-48 bg-gray-100 rounded-lg border border-dashed flex items-center justify-center text-sm text-gray-500" ref={mapPreviewRef}>
              {!integrations.googleMap?.enabled && 'Enable Google Maps to preview.'}
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h4 className="font-semibold text-gray-900 mb-3">Map Configuration Notes</h4>
          <ul className="text-sm text-gray-600 list-disc list-inside space-y-2">
            <li>Restrict the API key to your domain.</li>
            <li>Set a default location for map-based forms.</li>
            <li>Save settings to load the Maps SDK.</li>
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Settings className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-bold text-gray-900">Google Firebase Settings</h3>
            </div>
            <Toggle
              enabled={Boolean(integrations.firebase?.enabled)}
              onChange={(value) =>
                setIntegrations((prev) => ({
                  ...prev,
                  firebase: { ...prev.firebase!, enabled: value }
                }))
              }
            />
          </div>
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              value={integrations.firebase?.apiKey || ''}
              onChange={(e) => setIntegrations((prev) => ({ ...prev, firebase: { ...prev.firebase!, apiKey: e.target.value } }))}
              className="w-full border-gray-300 rounded-lg p-2.5"
              placeholder="API Key"
            />
            <input
              type="text"
              value={integrations.firebase?.authDomain || ''}
              onChange={(e) => setIntegrations((prev) => ({ ...prev, firebase: { ...prev.firebase!, authDomain: e.target.value } }))}
              className="w-full border-gray-300 rounded-lg p-2.5"
              placeholder="Auth Domain"
            />
            <input
              type="text"
              value={integrations.firebase?.projectId || ''}
              onChange={(e) => setIntegrations((prev) => ({ ...prev, firebase: { ...prev.firebase!, projectId: e.target.value } }))}
              className="w-full border-gray-300 rounded-lg p-2.5"
              placeholder="Project ID"
            />
            <input
              type="text"
              value={integrations.firebase?.storageBucket || ''}
              onChange={(e) => setIntegrations((prev) => ({ ...prev, firebase: { ...prev.firebase!, storageBucket: e.target.value } }))}
              className="w-full border-gray-300 rounded-lg p-2.5"
              placeholder="Storage Bucket"
            />
            <input
              type="text"
              value={integrations.firebase?.messagingSenderId || ''}
              onChange={(e) => setIntegrations((prev) => ({ ...prev, firebase: { ...prev.firebase!, messagingSenderId: e.target.value } }))}
              className="w-full border-gray-300 rounded-lg p-2.5"
              placeholder="Messaging Sender ID"
            />
            <input
              type="text"
              value={integrations.firebase?.appId || ''}
              onChange={(e) => setIntegrations((prev) => ({ ...prev, firebase: { ...prev.firebase!, appId: e.target.value } }))}
              className="w-full border-gray-300 rounded-lg p-2.5"
              placeholder="App ID"
            />
            <input
              type="text"
              value={integrations.firebase?.measurementId || ''}
              onChange={(e) => setIntegrations((prev) => ({ ...prev, firebase: { ...prev.firebase!, measurementId: e.target.value } }))}
              className="w-full border-gray-300 rounded-lg p-2.5"
              placeholder="Measurement ID (optional)"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  const fb = (window as any).firebase;
                  if (fb?.apps?.length) {
                    showNotification('success', 'Firebase Ready', `Initialized ${fb.apps.length} app(s).`);
                  } else {
                    showNotification('alert', 'Firebase Not Ready', 'Save settings to initialize Firebase.');
                  }
                }}
                className="px-4 py-2 rounded-lg border text-sm font-medium hover:bg-gray-50"
              >
                Test Firebase
              </button>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h4 className="font-semibold text-gray-900 mb-3">Firebase Notes</h4>
          <ul className="text-sm text-gray-600 list-disc list-inside space-y-2">
            <li>Use the web app config from Firebase console.</li>
            <li>Measurement ID enables Analytics.</li>
            <li>Firebase initializes after saving settings.</li>
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-bold text-gray-900">Facebook Comment Settings</h3>
            </div>
            <Toggle
              enabled={Boolean(integrations.facebookComments?.enabled)}
              onChange={(value) =>
                setIntegrations((prev) => ({
                  ...prev,
                  facebookComments: { ...prev.facebookComments!, enabled: value }
                }))
              }
            />
          </div>
          <div className="mt-6 space-y-4">
            <input
              type="text"
              value={integrations.facebookComments?.appId || ''}
              onChange={(e) => setIntegrations((prev) => ({ ...prev, facebookComments: { ...prev.facebookComments!, appId: e.target.value } }))}
              className="w-full border-gray-300 rounded-lg p-2.5"
              placeholder="Facebook App ID"
            />
            {integrations.facebookComments?.enabled && integrations.facebookComments?.appId ? (
              <div className="border rounded-lg p-4">
                <div
                  className="fb-comments"
                  data-href={sitemapBaseUrl || (typeof window !== 'undefined' ? window.location.href : '')}
                  data-width="100%"
                  data-numposts="3"
                ></div>
              </div>
            ) : (
              <p className="text-sm text-gray-500">Enable and save settings to preview Facebook comments.</p>
            )}
          </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h4 className="font-semibold text-gray-900 mb-3">Facebook Comments Notes</h4>
          <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
            <li>Create an app in the Facebook developer console.</li>
            <li>Paste the App ID here to enable comments.</li>
            <li>Save settings to load the SDK.</li>
          </ol>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FileCode2 className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-bold text-gray-900">Platform Sitemap Generator</h3>
          </div>
          <div className="text-sm text-gray-500">{sitemapLastGenerated ? `Last generated ${new Date(sitemapLastGenerated).toLocaleString()}` : 'Not generated yet'}</div>
        </div>
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
              <input
                type="text"
                value={sitemapBaseUrl}
                onChange={(e) => setSitemapBaseUrl(e.target.value)}
                className="w-full border-gray-300 rounded-lg p-2.5"
                placeholder="https://yourdomain.com"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {([
                ['includeCmsPages', 'CMS Pages'],
                ['includeBlogPosts', 'Blog Posts'],
                ['includeGigs', 'Gigs'],
                ['includeJobs', 'Jobs'],
                ['includeCommunity', 'Community']
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={(sitemapOptions as any)[key]}
                    onChange={(e) => setSitemapOptions((prev) => ({ ...prev, [key]: e.target.checked }))}
                    className="rounded text-blue-600"
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={generateSitemap}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                disabled={sitemapGenerating}
              >
                {sitemapGenerating ? 'Generating...' : 'Generate Sitemap'}
              </button>
              <button onClick={copySitemap} className="px-4 py-2 rounded-lg border hover:bg-gray-50" disabled={!sitemapXml}>Copy XML</button>
              <button onClick={downloadSitemap} className="px-4 py-2 rounded-lg border hover:bg-gray-50" disabled={!sitemapXml}>Download</button>
            </div>
            {sitemapXml && (
              <textarea className="w-full h-64 border-gray-300 rounded-lg p-3 font-mono text-xs" value={sitemapXml} readOnly />
            )}
          </div>
          <div className="space-y-4">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-600">
              <p className="font-semibold text-gray-800 mb-2">Generator Tips</p>
              <ul className="list-disc list-inside space-y-2">
                <li>Include only public-facing pages.</li>
                <li>Regenerate after publishing new content.</li>
                <li>Upload the XML to your domain root.</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Server className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-bold text-gray-900">Server Status</h3>
          </div>
          <button onClick={pingServer} className="text-sm px-3 py-1.5 rounded-lg border hover:bg-gray-50 flex items-center gap-2" disabled={serverLoading}>
            <RefreshCw className={`w-4 h-4 ${serverLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Status</span>
              <span className={`font-semibold ${serverStatus?.status === 'OK' ? 'text-green-600' : 'text-red-600'}`}>{serverStatus?.status || 'Unknown'}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Timestamp</span>
              <span className="text-gray-900">{serverStatus?.timestamp ? new Date(serverStatus.timestamp).toLocaleString() : 'N/A'}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Socket Status</span>
              <span className="text-gray-900">{serverStatus?.socket?.status || 'unknown'} ({serverStatus?.socket?.connected || 0} connected)</span>
            </div>
          </div>
          <div className="space-y-2">
            {serviceChecks.map((svc) => (
              <div key={`${svc.name}-${svc.url}`} className="flex items-center justify-between text-sm border-b border-gray-100 pb-2">
                <div>
                  <div className="font-medium text-gray-900">{svc.name}</div>
                  <div className="text-xs text-gray-500">{svc.url}</div>
                </div>
                <div className="text-right">
                  <div
                    className={`text-sm font-semibold ${
                      svc.status === 'ok'
                        ? 'text-green-600'
                        : svc.status === 'auth-required'
                          ? 'text-amber-600'
                          : 'text-red-600'
                    }`}
                  >
                    {svc.status.toUpperCase()}
                  </div>
                  {svc.latencyMs !== undefined && <div className="text-xs text-gray-500">{svc.latencyMs} ms</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GoogleSettings;
