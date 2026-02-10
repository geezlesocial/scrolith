import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useContent } from '../context/ContentContext';
import { PlatformIntegrationsSettings } from '../types';

const ensureScript = (id: string, src: string, attrs: Record<string, string> = {}) => {
  return new Promise<HTMLScriptElement>((resolve, reject) => {
    if (typeof document === 'undefined') return reject(new Error('document not available'));

    const existing = document.getElementById(id) as HTMLScriptElement | null;
    if (existing) {
      if (existing.src === src || existing.getAttribute('data-src') === src) {
        resolve(existing);
        return;
      }
      existing.remove();
    }

    const script = document.createElement('script');
    script.id = id;
    script.async = true;
    script.src = src;
    script.setAttribute('data-src', src);
    Object.entries(attrs).forEach(([key, value]) => {
      script.setAttribute(key, value);
    });
    script.onload = () => resolve(script);
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
};

const removeScript = (id: string) => {
  if (typeof document === 'undefined') return;
  const script = document.getElementById(id);
  if (script) script.remove();
};

const IntegrationsManager: React.FC = () => {
  const { settings } = useContent();
  const location = useLocation();
  const integrations = (settings as any)?.integrations as PlatformIntegrationsSettings | undefined;
  const legacyAnalyticsId = (settings as any)?.google_analytics_id || (settings as any)?.googleAnalyticsId || '';
  const legacyPixelId = (settings as any)?.facebook_pixel_id || (settings as any)?.facebookPixelId || '';
  const legacyRecaptchaKey = (settings as any)?.recaptcha_site_key || (settings as any)?.recaptchaSiteKey || '';

  const analytics = integrations?.analytics || (legacyAnalyticsId || legacyPixelId ? {
    googleEnabled: Boolean(legacyAnalyticsId),
    googleAnalyticsId: legacyAnalyticsId,
    facebookEnabled: Boolean(legacyPixelId),
    facebookPixelId: legacyPixelId
  } : undefined);
  const recaptcha = integrations?.recaptcha || (legacyRecaptchaKey ? {
    enabled: true,
    siteKey: legacyRecaptchaKey,
    version: 'v3'
  } : undefined);
  const googleMap = integrations?.googleMap;
  const firebase = integrations?.firebase;
  const facebookComments = integrations?.facebookComments;

  useEffect(() => {
    const loadGa = async () => {
      if (!analytics?.googleEnabled || !analytics?.googleAnalyticsId) {
        removeScript('ga-script');
        const w = window as any;
        if (w.gtag) delete w.gtag;
        return;
      }

      const id = analytics.googleAnalyticsId.trim();
      if (!id) return;

      await ensureScript('ga-script', `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`);

      const w = window as any;
      w.dataLayer = w.dataLayer || [];
      w.gtag = w.gtag || function gtag() { w.dataLayer.push(arguments); };
      w.gtag('js', new Date());
      w.gtag('config', id, { send_page_view: false });
    };

    loadGa().catch((e) => console.warn('Failed to load Google Analytics', e));
  }, [analytics?.googleEnabled, analytics?.googleAnalyticsId]);

  useEffect(() => {
    const loadPixel = async () => {
      if (!analytics?.facebookEnabled || !analytics?.facebookPixelId) {
        removeScript('facebook-pixel');
        const w = window as any;
        if (w.fbq) delete w.fbq;
        if (w._fbq) delete w._fbq;
        return;
      }

      const id = analytics.facebookPixelId.trim();
      if (!id) return;

      const w = window as any;
      if (!w.fbq) {
        const fbq = function (...args: any[]) {
          fbq.callMethod ? fbq.callMethod.apply(fbq, args) : fbq.queue.push(args);
        } as any;
        fbq.queue = [];
        fbq.loaded = true;
        fbq.version = '2.0';
        w.fbq = fbq;
        w._fbq = fbq;
      }

      await ensureScript('facebook-pixel', 'https://connect.facebook.net/en_US/fbevents.js');
      w.fbq('init', id);
      w.fbq('track', 'PageView');
    };

    loadPixel().catch((e) => console.warn('Failed to load Facebook Pixel', e));
  }, [analytics?.facebookEnabled, analytics?.facebookPixelId]);

  useEffect(() => {
    const loadRecaptcha = async () => {
      if (!recaptcha?.enabled || !recaptcha?.siteKey) {
        removeScript('recaptcha-script');
        const w = window as any;
        if (w.grecaptcha) delete w.grecaptcha;
        return;
      }

      const siteKey = recaptcha.siteKey.trim();
      if (!siteKey) return;

      const version = recaptcha?.version || 'v3';
      const src = version === 'v2'
        ? 'https://www.google.com/recaptcha/api.js?render=explicit'
        : `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
      await ensureScript('recaptcha-script', src);
    };

    loadRecaptcha().catch((e) => console.warn('Failed to load reCAPTCHA', e));
  }, [recaptcha?.enabled, recaptcha?.siteKey]);

  useEffect(() => {
    const loadGoogleMaps = async () => {
      if (!googleMap?.enabled || !googleMap?.apiKey) {
        removeScript('google-maps-script');
        return;
      }

      const apiKey = googleMap.apiKey.trim();
      if (!apiKey) return;

      await ensureScript('google-maps-script', `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`);
    };

    loadGoogleMaps().catch((e) => console.warn('Failed to load Google Maps', e));
  }, [googleMap?.enabled, googleMap?.apiKey]);

  useEffect(() => {
    const loadFirebase = async () => {
      if (!firebase?.enabled || !firebase?.apiKey || !firebase?.projectId) return;

      await ensureScript('firebase-app', 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
      if (firebase.measurementId) {
        await ensureScript('firebase-analytics', 'https://www.gstatic.com/firebasejs/9.23.0/firebase-analytics-compat.js');
      }

      const w = window as any;
      const fb = w.firebase;
      if (!fb) return;

      const config = {
        apiKey: firebase.apiKey,
        authDomain: firebase.authDomain,
        projectId: firebase.projectId,
        storageBucket: firebase.storageBucket,
        messagingSenderId: firebase.messagingSenderId,
        appId: firebase.appId,
        measurementId: firebase.measurementId || undefined
      };

      const existing = fb.apps && fb.apps.length ? fb.apps[0] : null;
      const existingConfig = existing?.options || {};
      const sameConfig = JSON.stringify(existingConfig) === JSON.stringify(config);
      if (!existing || !sameConfig) {
        try {
          if (existing && typeof existing.delete === 'function') {
            await existing.delete();
          }
        } catch (e) {
          // ignore delete failures
        }
        fb.initializeApp(config);
      }

      if (firebase.measurementId && typeof fb.analytics === 'function') {
        try { fb.analytics(); } catch (e) { /* ignore */ }
      }
    };

    loadFirebase().catch((e) => console.warn('Failed to load Firebase', e));
  }, [firebase?.enabled, firebase?.apiKey, firebase?.authDomain, firebase?.projectId, firebase?.storageBucket, firebase?.messagingSenderId, firebase?.appId, firebase?.measurementId]);

  useEffect(() => {
    const loadFacebookComments = async () => {
      if (!facebookComments?.enabled || !facebookComments?.appId) {
        removeScript('facebook-comments-sdk');
        return;
      }

      const appId = facebookComments.appId.trim();
      if (!appId) return;

      if (!document.getElementById('fb-root')) {
        const root = document.createElement('div');
        root.id = 'fb-root';
        document.body.prepend(root);
      }

      await ensureScript(
        'facebook-comments-sdk',
        `https://connect.facebook.net/en_US/sdk.js#xfbml=1&version=v19.0&appId=${encodeURIComponent(appId)}`
      );

      const w = window as any;
      if (w.FB && w.FB.XFBML && typeof w.FB.XFBML.parse === 'function') {
        w.FB.XFBML.parse();
      }
    };

    loadFacebookComments().catch((e) => console.warn('Failed to load Facebook Comments SDK', e));
  }, [facebookComments?.enabled, facebookComments?.appId]);

  useEffect(() => {
    const path = `${location.pathname}${location.search}`;
    const w = window as any;
    if (analytics?.googleEnabled && analytics.googleAnalyticsId && typeof w.gtag === 'function') {
      w.gtag('config', analytics.googleAnalyticsId, { page_path: path });
    }
    if (analytics?.facebookEnabled && analytics.facebookPixelId && typeof w.fbq === 'function') {
      w.fbq('track', 'PageView');
    }
  }, [location.pathname, location.search, analytics?.googleEnabled, analytics?.googleAnalyticsId, analytics?.facebookEnabled, analytics?.facebookPixelId]);

  return null;
};

export default IntegrationsManager;
