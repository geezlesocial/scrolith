import React, { useEffect, useMemo, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useUser } from '../context/UserContext';
import { CMSService } from '../services/cms';
import AIService from '../services/ai/ai.service';
import { HirePageConfig } from '../types';
import { Loader2, Sparkles, CheckCircle, AlertCircle } from 'lucide-react';

const fallback: HirePageConfig = {
  hero: {
    title: 'I am seeking to hire',
    subtitle: 'We’re looking for proven freelance talent and a premium business solution to drive results.',
    primaryCtaLabel: 'Post a Project',
    primaryCtaUrl: '/create-job',
    secondaryCtaLabel: 'Browse Talent',
    secondaryCtaUrl: '/browse',
    backgroundImage: '',
    badgeLabel: 'Premium Hiring'
  },
  ai: { enabled: true, allowGuest: true, disclaimer: 'AI recommendations are advisory.' },
  highlights: [],
  steps: [],
  testimonials: [],
  updated_at: new Date().toISOString()
};

const HirePage = () => {
  const { socket } = useSocket();
  const { isAuthenticated } = useUser();
  const [config, setConfig] = useState<HirePageConfig>(fallback);
  const [loading, setLoading] = useState(true);
  const [aiConfig, setAiConfig] = useState<any>(null);
  const [projectBrief, setProjectBrief] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const loadConfig = async () => {
    try {
      const data = await CMSService.getHirePageConfig();
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
    socket.on('cms:hire_updated', refresh);
    return () => socket.off('cms:hire_updated', refresh);
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
      routing?.support_chat ||
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

  const handleRecommend = async () => {
    if (!projectBrief.trim()) {
      setError('Please describe your hiring need.');
      return;
    }
    setError(null);
    setAsking(true);
    try {
      const data = await AIService.answerQuestion({
        question: `Provide a premium hiring plan based on this brief: ${projectBrief}`,
        context: 'Return a shortlist checklist, ideal profile, and next steps.',
        audience: 'business decision maker',
        format: 'structured bullets'
      });
      const payload = data?.data || data;
      setRecommendation(payload?.answer || '');
    } catch (e: any) {
      setError(e?.message || 'Failed to generate recommendations.');
    } finally {
      setAsking(false);
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
        <div className={`absolute inset-0 ${config.hero.backgroundImage ? 'bg-black/50' : 'bg-gradient-to-r from-slate-900 to-emerald-600'}`}></div>
        <div className="relative max-w-6xl mx-auto px-6 py-20 text-white">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-sm mb-4">
            <Sparkles className="w-4 h-4" />
            {config.hero.badgeLabel || 'Premium Hiring'}
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">{config.hero.title}</h1>
          <p className="text-lg md:text-xl text-white/90 max-w-2xl">{config.hero.subtitle}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href={config.hero.primaryCtaUrl || '/create-job'} className="inline-flex items-center px-5 py-3 rounded-full bg-white text-emerald-700 font-semibold">
              {config.hero.primaryCtaLabel || 'Post a Project'}
            </a>
            {config.hero.secondaryCtaLabel && (
              <a href={config.hero.secondaryCtaUrl || '/browse'} className="inline-flex items-center px-5 py-3 rounded-full border border-white/50 text-white font-semibold">
                {config.hero.secondaryCtaLabel}
              </a>
            )}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-2xl font-bold text-gray-900">AI Hiring Concierge</h2>
            <p className="text-gray-600">{config.ai.disclaimer}</p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 space-y-4">
              <textarea
                className="w-full border-gray-300 rounded-lg p-3 h-28"
                placeholder="Describe the role, goals, and expected impact..."
                value={projectBrief}
                onChange={(e) => setProjectBrief(e.target.value)}
                disabled={!aiAllowed}
              />
              {error && (
                <div className="flex items-center text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 mr-2" /> {error}
                </div>
              )}
              <button
                onClick={handleRecommend}
                disabled={!aiAllowed || asking}
                className="inline-flex items-center px-5 py-2 rounded-lg bg-emerald-600 text-white font-semibold disabled:opacity-60"
              >
                {asking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                {asking ? 'Building...' : 'Get Recommendations'}
              </button>
              {!aiAllowed && (
                <div className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  AI recommendations are currently restricted to signed-in users.
                </div>
              )}
            </div>

            {recommendation && (
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 text-sm text-green-600 mb-3">
                  <CheckCircle className="w-4 h-4" /> Hiring Plan
                </div>
                <div className="whitespace-pre-wrap text-gray-800 leading-relaxed">{recommendation}</div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="font-semibold text-gray-900 mb-2">AI Engine Status</h3>
              <p className="text-sm text-gray-600">{providerLabel}</p>
            </div>
            {config.highlights.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="font-semibold text-gray-900 mb-3">Why Hire Here</h3>
                <div className="space-y-2">
                  {config.highlights.map((h) => (
                    <div key={h.id} className="border border-gray-100 rounded-lg p-3">
                      <div className="font-medium text-gray-900">{h.title}</div>
                      <div className="text-xs text-gray-500">{h.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {config.steps.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 pb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {config.steps.map((step) => (
              <div key={step.id} className="border border-gray-200 rounded-xl p-4">
                <div className="font-semibold text-gray-900">{step.title}</div>
                <p className="text-sm text-gray-600 mt-2">{step.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {config.testimonials.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 pb-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Client Results</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {config.testimonials.map((t) => (
              <div key={t.id} className="border border-gray-200 rounded-xl p-4">
                <p className="text-gray-700">“{t.quote}”</p>
                <div className="mt-3 text-sm font-semibold text-gray-900">{t.name}</div>
                <div className="text-xs text-gray-500">{t.role}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default HirePage;
