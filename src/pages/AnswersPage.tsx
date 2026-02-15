import React, { useEffect, useMemo, useState } from 'react';
import { useSocket } from '../context/SocketContext';
import { useUser } from '../context/UserContext';
import { CMSService } from '../services/cms';
import AIService from '../services/ai/ai.service';
import { AnswersPageConfig } from '../types';
import { Loader2, Sparkles, CheckCircle, AlertCircle } from 'lucide-react';

const fallback: AnswersPageConfig = {
  hero: {
    title: 'Scrolith Answers',
    subtitle: 'Get expert answers and AI-powered insights for your business challenges.',
    primaryCtaLabel: 'Ask a Question',
    primaryCtaUrl: '#ask-ai',
    backgroundImage: '',
    badgeLabel: 'AI Powered'
  },
  ai: { enabled: true, allowGuest: true, disclaimer: 'AI responses are for informational purposes only.' },
  categories: [],
  featuredQuestions: [],
  faq: [],
  updated_at: new Date().toISOString()
};

const AnswersPage = () => {
  const { socket } = useSocket();
  const { isAuthenticated } = useUser();
  const [config, setConfig] = useState<AnswersPageConfig>(fallback);
  const [loading, setLoading] = useState(true);
  const [aiConfig, setAiConfig] = useState<any>(null);
  const [question, setQuestion] = useState('');
  const [context, setContext] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  const loadConfig = async () => {
    try {
      const data = await CMSService.getAnswersPageConfig();
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
    socket.on('cms:answers_updated', refresh);
    return () => {
      socket.off('cms:answers_updated', refresh);
    };
  }, [socket]);

  useEffect(() => {
    if (socket) return;
    const id = window.setInterval(() => {
      loadConfig();
    }, 60000);
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

  const handleAsk = async () => {
    if (!question.trim()) {
      setError('Please enter a question.');
      return;
    }
    setError(null);
    setAsking(true);
    try {
      const data = await AIService.answerQuestion({
        question,
        context: context || undefined,
        audience: 'business professional',
        format: 'concise, structured with bullets'
      });
      const payload = data?.data || data;
      setAnswer(payload?.answer || '');
    } catch (e: any) {
      setError(e?.message || 'Failed to get AI answer.');
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
        <div className={`absolute inset-0 ${config.hero.backgroundImage ? 'bg-black/50' : 'bg-gradient-to-r from-indigo-600 to-blue-600'}`}></div>
        <div className="relative max-w-6xl mx-auto px-6 py-20 text-white">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-sm mb-4">
            <Sparkles className="w-4 h-4" />
            {config.hero.badgeLabel || 'AI Powered'}
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">{config.hero.title}</h1>
          <p className="text-lg md:text-xl text-white/90 max-w-2xl">{config.hero.subtitle}</p>
          <div className="mt-6">
            <a href={config.hero.primaryCtaUrl || '#ask-ai'} className="inline-flex items-center px-5 py-3 rounded-full bg-white text-indigo-700 font-semibold">
              {config.hero.primaryCtaLabel || 'Ask a Question'}
            </a>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-6 py-12" id="ask-ai">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-2xl font-bold text-gray-900">Ask Scrolith Answers</h2>
            <p className="text-gray-600">Get AI-powered business guidance in seconds. {config.ai.disclaimer}</p>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 space-y-4">
              <textarea
                className="w-full border-gray-300 rounded-lg p-3 h-28"
                placeholder="Ask a business question..."
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                disabled={!aiAllowed}
              />
              <textarea
                className="w-full border-gray-300 rounded-lg p-3 h-24"
                placeholder="Add context (optional)"
                value={context}
                onChange={(e) => setContext(e.target.value)}
                disabled={!aiAllowed}
              />
              {error && (
                <div className="flex items-center text-sm text-red-600">
                  <AlertCircle className="w-4 h-4 mr-2" /> {error}
                </div>
              )}
              <button
                onClick={handleAsk}
                disabled={!aiAllowed || asking}
                className="inline-flex items-center px-5 py-2 rounded-lg bg-indigo-600 text-white font-semibold disabled:opacity-60"
              >
                {asking ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                {asking ? 'Thinking...' : 'Get Answer'}
              </button>
            </div>

            {!aiAllowed && (
              <div className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                AI answers are currently restricted to signed-in users.
              </div>
            )}
            {answer && (
              <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 text-sm text-green-600 mb-3">
                  <CheckCircle className="w-4 h-4" /> AI Answer
                </div>
                <div className="whitespace-pre-wrap text-gray-800 leading-relaxed">{answer}</div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="font-semibold text-gray-900 mb-2">AI Engine Status</h3>
              <p className="text-sm text-gray-600">{providerLabel}</p>
            </div>
            {config.categories.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h3 className="font-semibold text-gray-900 mb-3">Popular Categories</h3>
                <div className="space-y-2">
                  {config.categories.map((cat) => (
                    <div key={cat.id} className="border border-gray-100 rounded-lg p-3">
                      <div className="font-medium text-gray-900">{cat.label}</div>
                      <div className="text-xs text-gray-500">{cat.description}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {config.featuredQuestions.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 pb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Featured Questions</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {config.featuredQuestions.map((q) => (
              <div key={q.id} className="border border-gray-200 rounded-xl p-4 hover:shadow-sm">
                <div className="font-medium text-gray-900">{q.question}</div>
                {q.tags?.length ? <div className="text-xs text-gray-500 mt-2">Tags: {q.tags.join(', ')}</div> : null}
              </div>
            ))}
          </div>
        </section>
      )}

      {config.faq.length > 0 && (
        <section className="max-w-6xl mx-auto px-6 pb-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">FAQ</h2>
          <div className="space-y-4">
            {config.faq.map((item) => (
              <div key={item.id} className="border border-gray-200 rounded-xl p-4">
                <div className="font-semibold text-gray-900">{item.question}</div>
                <div className="text-sm text-gray-600 mt-2">{item.answer}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default AnswersPage;

