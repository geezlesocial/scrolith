/**
 * Phase 20.7.8 — Official enterprise Scrolitha public profile at /u/scrolitha
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BadgeCheck,
  Bot,
  MessageCircle,
  Shield,
  Sparkles,
  Lock,
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2
} from 'lucide-react';
import api from '../services/api';
import { MessagingService } from '../services/messaging';
import { useUser } from '../context/UserContext';
import { useNotification } from '../context/NotificationContext';
import { getCanonicalAppOrigin } from '../utils/siteUrl';

type Capability = {
  id: string;
  label: string;
  description?: string;
  status: 'available' | 'limited' | 'unavailable' | string;
};

type PublicProfile = {
  displayName?: string;
  username?: string;
  headline?: string;
  organization?: string;
  avatarUrl?: string;
  availabilityLabel?: string;
  available?: boolean;
  trustPoints?: string[];
  capabilities?: Capability[];
  limitations?: string[];
  privacySummary?: string;
  accuracySummary?: string;
  accuracyNotice?: string;
  accountType?: string;
  managedBy?: string;
  verificationStatus?: string;
  aiDisclosure?: string;
  primaryLanguages?: string[];
  seo?: { title?: string; description?: string; canonicalPath?: string; ogImage?: string };
  security?: { e2eeAvailable?: boolean; messageSecurityModel?: string };
  profileUrl?: string;
};

const statusStyles: Record<string, string> = {
  available: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  limited: 'bg-amber-50 text-amber-800 ring-amber-200',
  unavailable: 'bg-slate-100 text-slate-600 ring-slate-200'
};

const statusLabel = (s: string) => {
  if (s === 'available') return 'Available';
  if (s === 'limited') return 'Limited';
  return 'Not currently available';
};

const ScrolithaOfficialProfile: React.FC = () => {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useUser() as any;
  const { showNotification } = useNotification();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messaging, setMessaging] = useState(false);

  const origin = useMemo(() => getCanonicalAppOrigin().replace(/\/$/, ''), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get('/scrolitha/public-profile');
        const data = res?.data?.data || res?.data || null;
        if (!cancelled) setProfile(data);
      } catch (e: any) {
        if (!cancelled) setError(e?.response?.data?.error || e?.message || 'Failed to load profile');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!profile?.seo) return;
    const title = profile.seo.title || "Scrolitha — Scrolith's Official AI Assistant";
    const description =
      profile.seo.description ||
      "Meet Scrolitha, Scrolith's official AI assistant for jobs, profiles, resumes, freelancers, professional content, communities, and platform guidance.";
    const prevTitle = document.title;
    document.title = title;

    const setMeta = (attr: 'name' | 'property', key: string, content: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.content = content;
    };
    setMeta('name', 'description', description);
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:type', 'profile');
    setMeta('property', 'og:url', `${origin}/u/scrolitha`);
    if (profile.seo.ogImage) setMeta('property', 'og:image', profile.seo.ogImage);
    setMeta('name', 'twitter:card', 'summary');
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);

    let canonical = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = `${origin}/u/scrolitha`;

    return () => {
      if (document.title === title) document.title = prevTitle;
    };
  }, [profile, origin]);

  const openMessage = useCallback(async () => {
    if (!isAuthenticated && !user?.id) {
      navigate(`/login?redirect=${encodeURIComponent('/u/scrolitha')}`);
      return;
    }
    setMessaging(true);
    try {
      const ensured = await MessagingService.ensureScrolithaConversation();
      const conversationId = String(
        ensured?.conversationId || ensured?.conversation?.id || (ensured as any)?.id || ''
      ).trim();
      if (!conversationId) throw new Error('Could not open Scrolitha conversation');
      navigate(`/messages/${encodeURIComponent(conversationId)}`);
    } catch (e: any) {
      showNotification(
        'error',
        'Scrolitha',
        e?.response?.data?.error || e?.message || 'Unable to open Scrolitha right now'
      );
    } finally {
      setMessaging(false);
    }
  }, [isAuthenticated, user?.id, navigate, showNotification]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden />
        Loading Scrolitha…
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-lg font-semibold text-slate-900">Scrolitha profile unavailable</p>
        <p className="mt-2 text-sm text-slate-600">{error || 'Please try again later.'}</p>
        <Link to="/" className="mt-6 inline-block text-sm font-semibold text-indigo-600 hover:underline">
          Back to home
        </Link>
      </div>
    );
  }

  const name = profile.displayName || 'Scrolitha';
  const username = profile.username || 'scrolitha';
  const avatar = profile.avatarUrl || 'https://scrolith.com/icon-192.png';

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 via-white to-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Hero */}
        <section className="overflow-hidden rounded-3xl border border-indigo-100 bg-white shadow-xl shadow-indigo-100/50">
          <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-6 py-8 text-white sm:px-10">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
              <div className="relative shrink-0">
                <img
                  src={avatar}
                  alt=""
                  className="h-24 w-24 rounded-2xl border-4 border-white/30 object-cover shadow-lg sm:h-28 sm:w-28"
                />
                <span className="absolute -bottom-2 -right-2 inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700 shadow">
                  <Bot className="h-3 w-3" aria-hidden />
                  AI
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{name}</h1>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold backdrop-blur">
                    <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
                    Verified
                  </span>
                </div>
                <p className="mt-1 text-sm text-indigo-100">@{username}</p>
                <p className="mt-2 text-base font-medium text-white/95">
                  {profile.headline || "Scrolith's official AI assistant"}
                </p>
                <p className="mt-1 text-sm text-indigo-100">
                  Official Scrolith AI Assistant · {profile.organization || 'Scrolith'} ·{' '}
                  {profile.availabilityLabel || 'Available'}
                </p>
              </div>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void openMessage()}
                disabled={messaging}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-indigo-700 shadow-lg transition hover:bg-indigo-50 disabled:opacity-60"
              >
                {messaging ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <MessageCircle className="h-4 w-4" aria-hidden />
                )}
                Message Scrolitha
              </button>
              <a
                href="#about-scrolitha"
                className="inline-flex items-center gap-2 rounded-xl border border-white/40 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur transition hover:bg-white/20"
              >
                <Info className="h-4 w-4" aria-hidden />
                Learn about Scrolitha
              </a>
            </div>
          </div>
        </section>

        <div className="mt-8 grid gap-6 lg:grid-cols-3">
          {/* Trust */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-1">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500">
              <Shield className="h-4 w-4 text-indigo-600" aria-hidden />
              Trust & identity
            </h2>
            <ul className="mt-4 space-y-2">
              {(profile.trustPoints || []).map((point) => (
                <li key={point} className="flex items-start gap-2 text-sm text-slate-700">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" aria-hidden />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-6 space-y-3 border-t border-slate-100 pt-4 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-400">Account type</dt>
                <dd className="mt-0.5 font-medium text-slate-800">{profile.accountType || 'Official AI system account'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-400">Managed by</dt>
                <dd className="mt-0.5 font-medium text-slate-800">{profile.managedBy || 'Scrolith'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-400">Verification</dt>
                <dd className="mt-0.5 font-medium text-slate-800">
                  {profile.verificationStatus || 'Officially verified system identity'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-400">AI disclosure</dt>
                <dd className="mt-0.5 font-medium text-slate-800">
                  {profile.aiDisclosure || 'Responses may be AI-generated'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-slate-400">Languages</dt>
                <dd className="mt-0.5 font-medium text-slate-800">
                  {(profile.primaryLanguages || ['English']).join(', ')}
                </dd>
              </div>
            </dl>
          </section>

          <div className="space-y-6 lg:col-span-2">
            <section id="about-scrolitha" className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <Sparkles className="h-5 w-5 text-indigo-600" aria-hidden />
                Capabilities
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Status reflects current production availability for your account context.
              </p>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                {(profile.capabilities || []).map((cap) => (
                  <li
                    key={cap.id}
                    className="rounded-xl border border-slate-100 bg-slate-50/80 p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{cap.label}</p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ring-1 ${
                          statusStyles[cap.status] || statusStyles.unavailable
                        }`}
                      >
                        {statusLabel(cap.status)}
                      </span>
                    </div>
                    {cap.description ? (
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">{cap.description}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border border-amber-100 bg-amber-50/50 p-6 shadow-sm">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <AlertTriangle className="h-5 w-5 text-amber-600" aria-hidden />
                Accuracy & limitations
              </h2>
              <p className="mt-2 text-sm text-slate-700">
                {profile.accuracyNotice || profile.accuracySummary}
              </p>
              <ul className="mt-4 space-y-2">
                {(profile.limitations || []).map((item) => (
                  <li key={item} className="flex gap-2 text-sm text-slate-700">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <Lock className="h-5 w-5 text-indigo-600" aria-hidden />
                Privacy & safety
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">
                {profile.privacySummary}
              </p>
              {profile.security?.messageSecurityModel ? (
                <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-600">
                  <strong className="font-semibold text-slate-800">Message security: </strong>
                  {profile.security.messageSecurityModel}
                </p>
              ) : null}
            </section>
          </div>
        </div>

        <p className="mt-10 text-center text-xs text-slate-400">
          Scrolitha is a protected Scrolith system identity — not a human freelancer, employer, or
          ordinary member account.
        </p>
      </div>
    </div>
  );
};

export default ScrolithaOfficialProfile;
