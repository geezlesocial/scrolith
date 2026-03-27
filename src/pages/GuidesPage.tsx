import React, { useEffect, useState } from 'react';
import { Loader2, Sparkles, CheckCircle, AlertCircle } from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { useUser } from '../context/UserContext';
import { CMSService } from '../services/cms';
import AIService from '../services/ai/ai.service';
import { GuidesPageConfig } from '../types';
import { sanitizeScrolithaPageConfig } from '../utils/scrolithaBranding';

const fallback: GuidesPageConfig = {
  hero: {
    title: 'Scrolith Guides',
    subtitle: 'In-depth, professional guides for founders, freelancers, and teams.',
    primaryCtaLabel: 'Explore Guides',
    primaryCtaUrl: '#guides',
    backgroundImage: '',
    badgeLabel: 'Scrolitha Guided'
  },
  ai: { enabled: true, allowGuest: true, disclaimer: 'Scrolitha guides are drafts. Validate facts.' },
  topics: [],
  featuredGuides: [],
  callToAction: {
    title: 'Need a tailored guide?',
    subtitle: 'Generate a custom playbook with Scrolitha.',
    ctaLabel: 'Generate Guide',
    ctaUrl: '#scrolitha-guide-builder'
  },
  updated_at: new Date().toISOString()
};

const GuidesPage = () => {
  const { socket } = useSocket();
  const { isAuthenticated } = useUser();
  const [config, setConfig] = useState<GuidesPageConfig>(sanitizeScrolithaPageConfig(fallback));
  const [loading, setLoading] = useState(true);
  const [scrolithaEnabled, setScrolithaEnabled] = useState(true);
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState('Founders & Operators');
  const [depth, setDepth] = useState('In-depth');
  const [format, setFormat] = useState('Outline');
  const [guide, setGuide] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const loadConfig = async () => {
    try {
      const data = await CMSService.getGuidesPageConfig();
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
    socket.on('cms:guides_updated', refresh);
    return () => {
      socket.off('cms:guides_updated', refresh);
    };
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
    ? 'Scrolitha guide generation is disabled for this page.'
    : !scrolithaEnabled
      ? 'Scrolitha is temporarily unavailable. Please try again shortly.'
      : !isAuthenticated && !config.ai.allowGuest
        ? 'Sign in to use Scrolitha guide generation on this page.'
        : null;

  const handleGenerate = async () => {
    if (!topic.trim()) {
      setError('Please enter a guide topic.');
      return;
    }
    setError(null);
    setGenerating(true);
    try {
      const data = await AIService.generateGuideWithScrolitha({
        topic,
        audience,
        depth,
        format
      });
      const payload = data?.data || data;
      const nextGuide = String(payload?.guide || '').trim();
      if (!nextGuide) {
        throw new Error('Scrolitha did not return a guide.');
      }
      setGuide(nextGuide);
    } catch (e: any) {
      setError(e?.message || 'Failed to generate a Scrolitha guide.');
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
            config.hero.backgroundImage ? 'bg-black/50' : 'bg-gradient-to-r from-slate-900 to-indigo-700'
          }`}
        />
        <div className="relative max-w-6xl mx-auto px-6 py-20 text-white">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-sm mb-4">
            <Sparkles className="w-4 h-4" />
            {config.hero.badgeLabel || 'Scrolitha Guided'}
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">{config.hero.title}</h1>
          <p className="text-lg md:text-xl text-white/90 max-w-2xl">{config.hero.subtitle}</p>
          <div className="mt-6">
            <a
              href={config.hero.primaryCtaUrl || '#guides'}
              className="inline-flex items-center px-5 py-3 rounded-full bg-white text-indigo-700 font-semibold"
            >
              {config.hero.primaryCtaLabel || 'Explore Guides'}
            </a>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-12" id="guides">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <h2 className="text-2xl font-bold text-gray-900">Featured Guides</h2>
            {config.featuredGuides.length === 0 ? (
              <p className="text-gray-600">No guides yet. Add featured guides from the admin dashboard.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {config.featuredGuides.map((guideItem) => (
                  <div key={guideItem.id} className="border border-gray-200 rounded-xl overflow-hidden hover:shadow-sm">
                    {guideItem.coverImage ? (
                      <img src={guideItem.coverImage} alt={guideItem.title} className="h-36 w-full object-cover" />
                    ) : (
                      <div className="h-36 bg-gray-100 flex items-center justify-center text-gray-400">Cover Image</div>
                    )}
                    <div className="p-4 space-y-2">
                      <div className="text-xs text-gray-500">{guideItem.category}</div>
                      <h3 className="font-semibold text-gray-900">{guideItem.title}</h3>
                      <p className="text-sm text-gray-600">{guideItem.excerpt}</p>
                      {guideItem.readTime && <div className="text-xs text-gray-400">{guideItem.readTime} read</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="font-semibold text-gray-900 mb-2">Scrolitha Status</h3>
              <p className="text-sm text-gray-600">
                {scrolithaEnabled ? 'Scrolitha is live for guide generation.' : 'Scrolitha is currently unavailable.'}
              </p>
              <p className="mt-2 text-xs text-gray-500">
                {config.ai.allowGuest
                  ? 'Guide generation is available to guests and signed-in users.'
                  : 'Guide generation requires sign-in.'}
              </p>
            </div>
            {config.topics.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="font-semibold text-gray-900 mb-3">Topics</h3>
                <div className="space-y-2">
                  {config.topics.map((topicItem) => (
                    <div key={topicItem.id} className="border border-gray-100 rounded-lg p-3">
                      <div className="font-medium text-gray-900">{topicItem.label}</div>
                      <div className="text-xs text-gray-500">{topicItem.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 pb-12" id="scrolitha-guide-builder">
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Scrolitha Guide Builder</h2>
          <p className="text-gray-600 mb-4">
            Generate a professional guide outline tailored to your topic. {config.ai.disclaimer}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              className="border rounded-lg p-2.5"
              placeholder="Guide topic"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={!aiAllowed}
            />
            <input
              className="border rounded-lg p-2.5"
              placeholder="Target audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              disabled={!aiAllowed}
            />
            <select
              className="border rounded-lg p-2.5"
              value={depth}
              onChange={(e) => setDepth(e.target.value)}
              disabled={!aiAllowed}
            >
              <option>In-depth</option>
              <option>Executive Summary</option>
              <option>Quick Start</option>
            </select>
            <select
              className="border rounded-lg p-2.5"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              disabled={!aiAllowed}
            >
              <option>Outline</option>
              <option>Step-by-step</option>
              <option>Checklist</option>
            </select>
          </div>
          {error && (
            <div className="flex items-center text-sm text-red-600 mt-3">
              <AlertCircle className="w-4 h-4 mr-2" /> {error}
            </div>
          )}
          <button
            onClick={handleGenerate}
            disabled={!aiAllowed || generating}
            className="mt-4 inline-flex items-center px-5 py-2 rounded-lg bg-indigo-600 text-white font-semibold disabled:opacity-60"
          >
            {generating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
            {generating ? 'Scrolitha is generating...' : 'Generate with Scrolitha'}
          </button>

          {availabilityMessage ? (
            <div className="mt-4 text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              {availabilityMessage}
            </div>
          ) : null}
          {guide && (
            <div className="mt-6 bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-2 text-sm text-green-600 mb-3">
                <CheckCircle className="w-4 h-4" /> Scrolitha Guide Draft
              </div>
              <div className="whitespace-pre-wrap text-gray-800 leading-relaxed">{guide}</div>
            </div>
          )}
        </div>
      </section>

      {config.callToAction && (
        <section className="max-w-6xl mx-auto px-6 pb-16">
          <div className="bg-indigo-600 text-white rounded-2xl p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-2xl font-bold">{config.callToAction.title}</h3>
              <p className="text-white/80">{config.callToAction.subtitle}</p>
            </div>
            {config.callToAction.ctaLabel && (
              <a
                href={config.callToAction.ctaUrl || '#scrolitha-guide-builder'}
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

export default GuidesPage;
