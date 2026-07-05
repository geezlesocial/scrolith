import React, { useEffect, useState } from 'react';
import { Loader2, Sparkles, AlertCircle } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { useUser } from '../context/UserContext';
import { CMSService } from '../services/cms';
import AIService from '../services/ai/ai.service';
import { FreelancerPageConfig } from '../types';
import { sanitizeScrolithaPageConfig } from '../utils/scrolithaBranding';
import ScrolithaResponseCard from '../components/scrolitha/ScrolithaResponseCard';

const fallback: FreelancerPageConfig = {
  hero: {
    title: 'Professional Freelancer for Strategic Business Projects',
    subtitle:
      'I deliver premium freelance and agency-level services for strategic business projects, combining expert execution with scalable solutions tailored to your goals.',
    primaryCtaLabel: 'Join as Pro Freelancer',
    primaryCtaUrl: '/auth/signup',
    secondaryCtaLabel: 'View Opportunities',
    secondaryCtaUrl: '/browse-jobs',
    backgroundImage: '',
    badgeLabel: 'Scrolitha Positioning'
  },
  ai: { enabled: true, allowGuest: true, disclaimer: 'Scrolitha assistance supports positioning and proposals.' },
  services: [],
  proof: [],
  callToAction: {
    title: 'Ready to deliver premium outcomes?',
    subtitle: 'Set up your elite freelancer profile.',
    ctaLabel: 'Create Profile',
    ctaUrl: '/profile/edit'
  },
  updated_at: new Date().toISOString()
};

const FreelancerPage = () => {
  const { socket } = useSocket();
  const { isAuthenticated } = useUser();
  const [config, setConfig] = useState<FreelancerPageConfig>(sanitizeScrolithaPageConfig(fallback));
  const [loading, setLoading] = useState(true);
  const [scrolithaEnabled, setScrolithaEnabled] = useState(true);
  const [profileSummary, setProfileSummary] = useState('');
  const [pitch, setPitch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const loadConfig = async () => {
    try {
      const data = await CMSService.getFreelancerPageConfig();
      setConfig(sanitizeScrolithaPageConfig(data || fallback));
    } catch {
      setConfig(sanitizeScrolithaPageConfig(fallback));
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await loadConfig();
      try {
        const cfg = await AIService.getConfig();
        const normalized = cfg?.data || cfg;
        const enabled = normalized?.scrolitha?.enabled ?? normalized?.providers?.scrolitha?.enabled;
        setScrolithaEnabled(enabled !== false);
      } catch {
        setScrolithaEnabled(true);
      }
      setLoading(false);
    };
    void init();
  }, []);

  useEffect(() => {
    if (!socket) return undefined;
    const refresh = () => {
      void loadConfig();
    };
    socket.on('cms:freelancer_updated', refresh);
    return () => socket.off('cms:freelancer_updated', refresh);
  }, [socket]);

  useEffect(() => {
    if (socket) return undefined;
    const id = window.setInterval(() => {
      void loadConfig();
    }, 60000);
    return () => window.clearInterval(id);
  }, [socket]);

  const aiAllowed = config.ai.enabled && scrolithaEnabled && (config.ai.allowGuest || isAuthenticated);
  const availabilityMessage = !config.ai.enabled
    ? 'Scrolitha positioning assistance is disabled for this page.'
    : !scrolithaEnabled
      ? 'Scrolitha is temporarily unavailable. Please try again shortly.'
      : !isAuthenticated && !config.ai.allowGuest
        ? 'Sign in to use Scrolitha positioning assistance on this page.'
        : null;

  const handleGenerate = async () => {
    if (!profileSummary.trim()) {
      setError('Please describe your expertise and target projects.');
      return;
    }
    setError(null);
    setGenerating(true);
    try {
      const data = await AIService.answerQuestionWithScrolitha({
        question: `Create a premium freelancer positioning draft from this profile summary: ${profileSummary}`,
        context:
          'Return a short positioning headline, three differentiators, and a concise client-facing pitch for enterprise buyers.',
        audience: 'enterprise clients',
        format: 'organized markdown with a concise opening line, section headings, and readable bullets'
      });
      const payload = data?.data || data;
      const nextPitch = String(payload?.answer || '').trim();
      if (!nextPitch) {
        throw new Error('Scrolitha did not return a positioning draft.');
      }
      setPitch(nextPitch);
    } catch (e: any) {
      setError(e?.message || 'Failed to generate Scrolitha positioning.');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <section
        className="relative overflow-hidden"
        style={{ backgroundImage: config.hero.backgroundImage ? `url(${config.hero.backgroundImage})` : undefined }}
      >
        <div
          className={`absolute inset-0 ${
            config.hero.backgroundImage ? 'bg-black/50' : 'bg-gradient-to-r from-indigo-700 to-purple-600'
          }`}
        />
        <div className="relative max-w-6xl mx-auto px-6 py-20 text-white">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-sm mb-4">
            <Sparkles className="w-4 h-4" />
            {config.hero.badgeLabel || 'Scrolitha Positioning'}
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">{config.hero.title}</h1>
          <p className="text-lg md:text-xl text-white/90 max-w-2xl">{config.hero.subtitle}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={config.hero.primaryCtaUrl || '/auth/signup'}
              className="inline-flex items-center px-5 py-3 rounded-full bg-white text-indigo-700 font-semibold"
            >
              {config.hero.primaryCtaLabel || 'Join as Pro Freelancer'}
            </a>
            {config.hero.secondaryCtaLabel && (
              <a
                href={config.hero.secondaryCtaUrl || '/browse-jobs'}
                className="inline-flex items-center px-5 py-3 rounded-full border border-white/50 text-white font-semibold"
              >
                {config.hero.secondaryCtaLabel}
              </a>
            )}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-2xl font-bold text-gray-900">Scrolitha Positioning Studio</h2>
            <p className="text-gray-600">{config.ai.disclaimer}</p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 space-y-4">
              <textarea
                className="w-full border-gray-300 rounded-lg p-3 h-28"
                placeholder="Describe your expertise, industries, and impact..."
                value={profileSummary}
                onChange={(e) => setProfileSummary(e.target.value)}
                disabled={!aiAllowed}
              />
              {error && (
                <div className="flex items-center text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 mr-2" /> {error}
                </div>
              )}
              <button
                onClick={handleGenerate}
                disabled={!aiAllowed || generating}
                className="inline-flex items-center px-5 py-2 rounded-lg bg-indigo-600 text-white font-semibold disabled:opacity-60"
              >
                {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                {generating ? 'Scrolitha is crafting...' : 'Generate with Scrolitha'}
              </button>
              {availabilityMessage ? (
                <div className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  {availabilityMessage}
                </div>
              ) : null}
            </div>

            {pitch && (
              <ScrolithaResponseCard title="Scrolitha Positioning Draft" content={pitch} tone="indigo" />
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="font-semibold text-gray-900 mb-2">Scrolitha Status</h3>
              <p className="text-sm text-gray-600">
                {scrolithaEnabled
                  ? 'Scrolitha is live for positioning and proposal strategy.'
                  : 'Scrolitha is currently unavailable.'}
              </p>
              <p className="mt-2 text-xs text-gray-500">
                {config.ai.allowGuest
                  ? 'Guests can test positioning support in real time.'
                  : 'This Scrolitha workspace requires sign-in.'}
              </p>
            </div>
            {config.services.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="font-semibold text-gray-900 mb-3">Core Services</h3>
                <div className="space-y-2">
                  {config.services.map((service) => (
                    <div key={service.id} className="border border-gray-100 rounded-lg p-3">
                      <div className="font-medium text-gray-900">{service.title}</div>
                      <div className="text-xs text-gray-500">{service.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {config.proof.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 pb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Proof of Impact</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {config.proof.map((proofItem) => (
              <div key={proofItem.id} className="border border-gray-200 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-indigo-700">{proofItem.metric}</div>
                <div className="text-sm text-gray-600">{proofItem.label}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {config.callToAction && (
        <section className="max-w-6xl mx-auto px-6 pb-16">
          <div className="bg-indigo-600 text-white rounded-2xl p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-2xl font-bold">{config.callToAction.title}</h3>
              <p className="text-white/80">{config.callToAction.subtitle}</p>
            </div>
            {config.callToAction.ctaLabel && (
              <a
                href={config.callToAction.ctaUrl || '/profile/edit'}
                className="inline-flex items-center px-5 py-3 rounded-full bg-white text-indigo-700 font-semibold"
              >
                {config.callToAction.ctaLabel}
              </a>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

export default FreelancerPage;
