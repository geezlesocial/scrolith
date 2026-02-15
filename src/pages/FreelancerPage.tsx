import React, { useEffect, useMemo, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useUser } from '../context/UserContext';
import { CMSService } from '../services/cms';
import AIService from '../services/ai/ai.service';
import { FreelancerPageConfig } from '../types';
import { Loader2, Sparkles, CheckCircle, AlertCircle } from 'lucide-react';

const fallback: FreelancerPageConfig = {
  hero: {
    title: 'Professional Freelancer for Strategic Business Projects',
    subtitle: 'I deliver premium freelance and agency-level services for strategic business projects—combining expert execution with scalable solutions tailored to your goals.',
    primaryCtaLabel: 'Join as Pro Freelancer',
    primaryCtaUrl: '/auth/signup',
    secondaryCtaLabel: 'View Opportunities',
    secondaryCtaUrl: '/browse-jobs',
    backgroundImage: '',
    badgeLabel: 'Elite Talent'
  },
  ai: { enabled: true, allowGuest: true, disclaimer: 'AI assistance supports positioning and proposals.' },
  services: [],
  proof: [],
  callToAction: { title: 'Ready to deliver premium outcomes?', subtitle: 'Set up your elite freelancer profile.', ctaLabel: 'Create Profile', ctaUrl: '/profile/edit' },
  updated_at: new Date().toISOString()
};

const FreelancerPage = () => {
  const { socket } = useSocket();
  const { isAuthenticated } = useUser();
  const [config, setConfig] = useState<FreelancerPageConfig>(fallback);
  const [loading, setLoading] = useState(true);
  const [aiConfig, setAiConfig] = useState<any>(null);
  const [profileSummary, setProfileSummary] = useState('');
  const [pitch, setPitch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const loadConfig = async () => {
    try {
      const data = await CMSService.getFreelancerPageConfig();
      setConfig(data || fallback);
    } catch {
      setConfig(fallback);
    }
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      await loadConfig();
      try {
        const cfg = await AIService.getConfig();
        setAiConfig(cfg?.data || cfg);
      } catch {
        setAiConfig(null);
      }
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => loadConfig();
    socket.on('cms:freelancer_updated', refresh);
    return () => socket.off('cms:freelancer_updated', refresh);
  }, [socket]);

  useEffect(() => {
    if (socket) return;
    const id = window.setInterval(() => loadConfig(), 60000);
    return () => window.clearInterval(id);
  }, [socket]);

  const providerLabel = useMemo(() => {
    const routing = aiConfig?.routing || {};
    const scrolitha = aiConfig?.providers?.scrolitha || aiConfig?.scrolitha || {};
    if (scrolitha?.enabled) {
      const model = scrolitha?.model ? String(scrolitha.model) : '';
      return `SCROLITHA${model ? ` • ${model}` : ''}`;
    }

    const provider =
      routing?.seo_tags ||
      (aiConfig?.providers?.google?.enabled
        ? 'google'
        : aiConfig?.providers?.openai?.enabled
          ? 'openai'
          : '');
    if (!provider) return 'AI not configured';
    const model = provider === 'google' ? aiConfig?.providers?.google?.model : aiConfig?.providers?.openai?.model;
    return `${provider.toUpperCase()}${model ? ` • ${model}` : ''}`;
  }, [aiConfig]);

  const aiAllowed = config.ai.enabled && (config.ai.allowGuest || isAuthenticated);

  const handleGenerate = async () => {
    if (!profileSummary.trim()) {
      setError('Please describe your expertise and target projects.');
      return;
    }
    setError(null);
    setGenerating(true);
    try {
      const data = await AIService.answerQuestion({
        question: `Write a premium freelancer positioning statement based on: ${profileSummary}`,
        context: 'Return a short headline, 3 bullet strengths, and a concise client pitch.',
        audience: 'enterprise clients',
        format: 'structured bullets'
      });
      const payload = data?.data || data;
      setPitch(payload?.answer || '');
    } catch (e: any) {
      setError(e?.message || 'Failed to generate positioning.');
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
      <section className="relative overflow-hidden" style={{ backgroundImage: config.hero.backgroundImage ? `url(${config.hero.backgroundImage})` : undefined }}>
        <div className={`absolute inset-0 ${config.hero.backgroundImage ? 'bg-black/50' : 'bg-gradient-to-r from-indigo-700 to-purple-600'}`}></div>
        <div className="relative max-w-6xl mx-auto px-6 py-20 text-white">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-sm mb-4">
            <Sparkles className="w-4 h-4" />
            {config.hero.badgeLabel || 'Elite Talent'}
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">{config.hero.title}</h1>
          <p className="text-lg md:text-xl text-white/90 max-w-2xl">{config.hero.subtitle}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href={config.hero.primaryCtaUrl || '/auth/signup'} className="inline-flex items-center px-5 py-3 rounded-full bg-white text-indigo-700 font-semibold">
              {config.hero.primaryCtaLabel || 'Join as Pro Freelancer'}
            </a>
            {config.hero.secondaryCtaLabel && (
              <a href={config.hero.secondaryCtaUrl || '/browse-jobs'} className="inline-flex items-center px-5 py-3 rounded-full border border-white/50 text-white font-semibold">
                {config.hero.secondaryCtaLabel}
              </a>
            )}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-2xl font-bold text-gray-900">AI Positioning Studio</h2>
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
                {generating ? 'Crafting...' : 'Generate Positioning'}
              </button>
              {!aiAllowed && (
                <div className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  AI assistance is currently restricted to signed-in users.
                </div>
              )}
            </div>

            {pitch && (
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 text-sm text-green-600 mb-3">
                  <CheckCircle className="w-4 h-4" /> Positioning Draft
                </div>
                <div className="whitespace-pre-wrap text-gray-800 leading-relaxed">{pitch}</div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="font-semibold text-gray-900 mb-2">AI Engine Status</h3>
              <p className="text-sm text-gray-600">{providerLabel}</p>
            </div>
            {config.services.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="font-semibold text-gray-900 mb-3">Core Services</h3>
                <div className="space-y-2">
                  {config.services.map((s) => (
                    <div key={s.id} className="border border-gray-100 rounded-lg p-3">
                      <div className="font-medium text-gray-900">{s.title}</div>
                      <div className="text-xs text-gray-500">{s.description}</div>
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
            {config.proof.map((p) => (
              <div key={p.id} className="border border-gray-200 rounded-xl p-4 text-center">
                <div className="text-2xl font-bold text-indigo-700">{p.metric}</div>
                <div className="text-sm text-gray-600">{p.label}</div>
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
              <a href={config.callToAction.ctaUrl || '/profile/edit'} className="inline-flex items-center px-5 py-3 rounded-full bg-white text-indigo-700 font-semibold">
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
