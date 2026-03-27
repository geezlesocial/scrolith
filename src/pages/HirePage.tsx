import React, { useEffect, useState } from 'react';
import { Loader2, Sparkles, CheckCircle, AlertCircle } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { useUser } from '../context/UserContext';
import { CMSService } from '../services/cms';
import AIService from '../services/ai/ai.service';
import { HirePageConfig } from '../types';
import { sanitizeScrolithaPageConfig } from '../utils/scrolithaBranding';

const fallback: HirePageConfig = {
  hero: {
    title: 'I am seeking to hire',
    subtitle:
      "We're looking for proven freelance talent and a premium business solution to drive results.",
    primaryCtaLabel: 'Post a Project',
    primaryCtaUrl: '/create-job',
    secondaryCtaLabel: 'Browse Talent',
    secondaryCtaUrl: '/browse',
    backgroundImage: '',
    badgeLabel: 'Scrolitha Hiring'
  },
  ai: { enabled: true, allowGuest: true, disclaimer: 'Scrolitha recommendations are advisory.' },
  highlights: [],
  steps: [],
  testimonials: [],
  updated_at: new Date().toISOString()
};

const HirePage = () => {
  const { socket } = useSocket();
  const { isAuthenticated } = useUser();
  const [config, setConfig] = useState<HirePageConfig>(sanitizeScrolithaPageConfig(fallback));
  const [loading, setLoading] = useState(true);
  const [scrolithaEnabled, setScrolithaEnabled] = useState(true);
  const [projectBrief, setProjectBrief] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const loadConfig = async () => {
    try {
      const data = await CMSService.getHirePageConfig();
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
    socket.on('cms:hire_updated', refresh);
    return () => socket.off('cms:hire_updated', refresh);
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
    ? 'Scrolitha hiring recommendations are disabled for this page.'
    : !scrolithaEnabled
      ? 'Scrolitha is temporarily unavailable. Please try again shortly.'
      : !isAuthenticated && !config.ai.allowGuest
        ? 'Sign in to use Scrolitha hiring recommendations on this page.'
        : null;

  const handleRecommend = async () => {
    if (!projectBrief.trim()) {
      setError('Please describe your hiring need.');
      return;
    }
    setError(null);
    setAsking(true);
    try {
      const data = await AIService.answerQuestionWithScrolitha({
        question: `Create an enterprise hiring plan from this brief: ${projectBrief}`,
        context:
          'Return a structured shortlist checklist, ideal candidate profile, scope notes, and immediate next steps for the hiring team.',
        audience: 'business decision maker',
        format: 'structured bullets with section headings'
      });
      const payload = data?.data || data;
      const nextRecommendation = String(payload?.answer || '').trim();
      if (!nextRecommendation) {
        throw new Error('Scrolitha did not return a hiring plan.');
      }
      setRecommendation(nextRecommendation);
    } catch (e: any) {
      setError(e?.message || 'Failed to generate a Scrolitha hiring plan.');
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
      <section
        className="relative overflow-hidden"
        style={{ backgroundImage: config.hero.backgroundImage ? `url(${config.hero.backgroundImage})` : undefined }}
      >
        <div
          className={`absolute inset-0 ${
            config.hero.backgroundImage ? 'bg-black/50' : 'bg-gradient-to-r from-slate-900 to-emerald-600'
          }`}
        />
        <div className="relative max-w-6xl mx-auto px-6 py-20 text-white">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-sm mb-4">
            <Sparkles className="w-4 h-4" />
            {config.hero.badgeLabel || 'Scrolitha Hiring'}
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">{config.hero.title}</h1>
          <p className="text-lg md:text-xl text-white/90 max-w-2xl">{config.hero.subtitle}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={config.hero.primaryCtaUrl || '/create-job'}
              className="inline-flex items-center px-5 py-3 rounded-full bg-white text-emerald-700 font-semibold"
            >
              {config.hero.primaryCtaLabel || 'Post a Project'}
            </a>
            {config.hero.secondaryCtaLabel && (
              <a
                href={config.hero.secondaryCtaUrl || '/browse'}
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
            <h2 className="text-2xl font-bold text-gray-900">Scrolitha Hiring Concierge</h2>
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
                {asking ? 'Scrolitha is building your plan...' : 'Plan with Scrolitha'}
              </button>
              {availabilityMessage ? (
                <div className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  {availabilityMessage}
                </div>
              ) : null}
            </div>

            {recommendation && (
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 text-sm text-green-600 mb-3">
                  <CheckCircle className="w-4 h-4" /> Scrolitha Hiring Plan
                </div>
                <div className="whitespace-pre-wrap text-gray-800 leading-relaxed">{recommendation}</div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="font-semibold text-gray-900 mb-2">Scrolitha Status</h3>
              <p className="text-sm text-gray-600">
                {scrolithaEnabled
                  ? 'Scrolitha is live for hiring strategy and brief analysis.'
                  : 'Scrolitha is currently unavailable.'}
              </p>
              <p className="mt-2 text-xs text-gray-500">
                {config.ai.allowGuest
                  ? 'Guests can test the hiring concierge in real time.'
                  : 'This Scrolitha workspace requires sign-in.'}
              </p>
            </div>
            {config.highlights.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="font-semibold text-gray-900 mb-3">Why Hire Here</h3>
                <div className="space-y-2">
                  {config.highlights.map((highlight) => (
                    <div key={highlight.id} className="border border-gray-100 rounded-lg p-3">
                      <div className="font-medium text-gray-900">{highlight.title}</div>
                      <div className="text-xs text-gray-500">{highlight.description}</div>
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
            {config.testimonials.map((testimonial) => (
              <div key={testimonial.id} className="border border-gray-200 rounded-xl p-4">
                <p className="text-gray-700">"{testimonial.quote}"</p>
                <div className="mt-3 text-sm font-semibold text-gray-900">{testimonial.name}</div>
                <div className="text-xs text-gray-500">{testimonial.role}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default HirePage;
