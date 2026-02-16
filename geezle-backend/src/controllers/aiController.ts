import { Request, Response } from 'express';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import prisma from '../utils/prismaClient';
import { getScrolithaKnowledgeBundle } from '../services/scrolitha/scrolitha.knowledge';
import { ollamaChat, resolveScrolithaLlmRuntime } from '../services/scrolitha/scrolitha.ollama';

type AiProvider = 'scrolitha' | 'google' | 'openai';

const getSystemAiConfig = async () => {
  const record = await prisma.appSetting.findUnique({ where: { scope: 'system' } });
  const system = (record?.data as any) || {};
  return system.aiConfig || system?.system?.aiConfig || null;
};

const pickProvider = (aiConfig: any, routeKey: string): AiProvider | null => {
  const routing = aiConfig?.routing || {};
  const routeProvider = (routing?.[routeKey] as AiProvider) || null;
  if (routeProvider === 'scrolitha') return 'scrolitha';
  const googleEnabled = aiConfig?.providers?.google?.enabled;
  const openaiEnabled = aiConfig?.providers?.openai?.enabled;
  if (routeProvider === 'google' && googleEnabled) return 'google';
  if (routeProvider === 'openai' && openaiEnabled) return 'openai';
  if (googleEnabled) return 'google';
  if (openaiEnabled) return 'openai';
  return null;
};

const getSafety = (aiConfig: any) => ({
  maxTokens: Number(aiConfig?.safety?.maxTokens ?? aiConfig?.safety?.max_tokens ?? 1024),
  temperature: Number(aiConfig?.safety?.temperature ?? 0.7)
});

const askScrolithaOllama = async (prompt: string, options?: { system?: string }) => {
  const runtime = await resolveScrolithaLlmRuntime('user');
  if (!runtime.enabled) {
    throw new Error('Scrolitha (Ollama) is not configured');
  }

  const messages = options?.system
    ? [
        { role: 'system' as const, content: options.system },
        { role: 'user' as const, content: prompt }
      ]
    : [{ role: 'user' as const, content: prompt }];

  const result = await ollamaChat({
    host: runtime.host,
    model: runtime.model,
    messages,
    maxTokens: runtime.maxTokens,
    temperature: runtime.temperature,
    topP: runtime.topP,
    timeoutMs: runtime.timeoutMs
  });

  return { provider: 'scrolitha' as const, model: runtime.model, text: result.text || '' };
};

const askOpenAI = async (apiKey: string, model: string, prompt: string, maxTokens: number, temperature: number) => {
  const client = new OpenAI({ apiKey });
  const response = await client.chat.completions.create({
    model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens,
    temperature
  });
  return response.choices?.[0]?.message?.content?.trim() || '';
};

const askGoogle = async (apiKey: string, model: string, prompt: string, maxTokens: number, temperature: number) => {
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelRef = genAI.getGenerativeModel({ model });
  const result = await modelRef.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: maxTokens, temperature }
  });
  return result.response.text();
};

const buildKnowledgeBlock = (audience?: string) => {
  const bundle = getScrolithaKnowledgeBundle();
  const normalizedAudience = String(audience || '').toLowerCase();
  const roleHints: string[] = [];

  if (normalizedAudience.includes('freelancer')) {
    roleHints.push(`Freelancer capabilities: ${bundle.freelancerCapabilities.join(' | ')}`);
  }
  if (normalizedAudience.includes('employer') || normalizedAudience.includes('client') || normalizedAudience.includes('hiring')) {
    roleHints.push(`Employer/client capabilities: ${bundle.employerCapabilities.join(' | ')}`);
  }
  if (!roleHints.length) {
    roleHints.push(`Freelancer capabilities: ${bundle.freelancerCapabilities.join(' | ')}`);
    roleHints.push(`Employer/client capabilities: ${bundle.employerCapabilities.join(' | ')}`);
  }

  return [
    `Scrolith knowledge baseline:`,
    `- Overview: ${bundle.overview}`,
    `- Core services: ${bundle.coreServices.join(' | ')}`,
    ...roleHints,
    `- Communication and collaboration: ${bundle.communicationAndCollaboration.join(' | ')}`,
    `- Trust and safety: ${bundle.trustAndSafety.join(' | ')}`
  ].join('\n');
};

const buildQaPrompt = (payload: any) => {
  const question = payload?.question || '';
  const context = payload?.context || '';
  const audience = payload?.audience || 'business professional';
  const format = payload?.format || 'concise, structured';
  return `You are Scrolith Answers, a professional business advisor.\nAudience: ${audience}.\nResponse format: ${format}.\n${buildKnowledgeBlock(audience)}\nQuestion: ${question}\nContext: ${context}\nProvide a clear, actionable answer with bullets and a short summary.`;
};

const buildGuidePrompt = (payload: any) => {
  const topic = payload?.topic || '';
  const audience = payload?.audience || 'founders and operators';
  const depth = payload?.depth || 'in-depth';
  const format = payload?.format || 'outline';
  return `You are Scrolith Guides, a professional business strategist.\nAudience: ${audience}.\nDepth: ${depth}.\nOutput format: ${format}.\n${buildKnowledgeBlock(audience)}\nTopic: ${topic}\nCreate a structured guide with headings, key steps, and best practices.`;
};

export const getAIConfig = async (_req: Request, res: Response) => {
  try {
    const aiConfig = await getSystemAiConfig();
    const runtime = await resolveScrolithaLlmRuntime('user');
    const safe = {
      providers: {
        scrolitha: {
          enabled: Boolean(runtime.enabled),
          provider: 'ollama',
          model: runtime.model || 'llama3.1'
        },
        google: {
          enabled: Boolean(aiConfig?.providers?.google?.enabled),
          model: aiConfig?.providers?.google?.model || 'gemini-pro'
        },
        openai: {
          enabled: Boolean(aiConfig?.providers?.openai?.enabled),
          model: aiConfig?.providers?.openai?.model || 'gpt-4'
        }
      },
      routing: aiConfig?.routing || {},
      safety: {
        maxTokens: aiConfig?.safety?.maxTokens ?? aiConfig?.safety?.max_tokens ?? 1024,
        temperature: aiConfig?.safety?.temperature ?? 0.7
      },
      scrolitha: {
        enabled: Boolean(runtime.enabled),
        provider: runtime.provider,
        model: runtime.model || null,
        allowGeminiFallback: Boolean(runtime.allowGeminiFallback)
      }
    };
    return res.json({ success: true, data: safe });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to load AI config' });
  }
};

export const answerQuestion = async (req: Request, res: Response) => {
  try {
    const prompt = buildQaPrompt(req.body || {});

    // Default + preferred: Scrolitha (Ollama).
    try {
      const result = await askScrolithaOllama(prompt);
      return res.json({ success: true, data: { provider: result.provider, model: result.model, answer: result.text } });
    } catch (scrolithaError) {
      // Optional fallback to legacy providers when explicitly enabled.
      const runtime = await resolveScrolithaLlmRuntime('user');
      if (!runtime.allowGeminiFallback) {
        throw scrolithaError;
      }

      const aiConfig = await getSystemAiConfig();
      if (!aiConfig) return res.status(400).json({ success: false, error: 'AI settings not configured' });

      const provider = pickProvider(aiConfig, 'support_chat');
      if (!provider || provider === 'scrolitha') {
        return res.status(400).json({ success: false, error: 'AI provider is disabled' });
      }

      const safety = getSafety(aiConfig);
      if (provider === 'google') {
        const apiKey = aiConfig?.providers?.google?.apiKey || aiConfig?.providers?.google?.api_key;
        const model = aiConfig?.providers?.google?.model || 'gemini-pro';
        if (!apiKey) return res.status(400).json({ success: false, error: 'Google AI API key missing' });
        const text = await askGoogle(apiKey, model, prompt, safety.maxTokens, safety.temperature);
        return res.json({ success: true, data: { provider, model, answer: text } });
      }

      const apiKey = aiConfig?.providers?.openai?.apiKey || aiConfig?.providers?.openai?.api_key;
      const model = aiConfig?.providers?.openai?.model || 'gpt-4';
      if (!apiKey) return res.status(400).json({ success: false, error: 'OpenAI API key missing' });
      const text = await askOpenAI(apiKey, model, prompt, safety.maxTokens, safety.temperature);
      return res.json({ success: true, data: { provider, model, answer: text } });
    }
  } catch (error: any) {
    console.error('AI answer error:', error);
    const msg = String(error?.message || 'AI request failed');
    const lower = msg.toLowerCase();
    const status = lower.includes('not configured') ? 503 : 500;
    return res.status(status).json({ success: false, error: msg });
  }
};

export const generateGuide = async (req: Request, res: Response) => {
  try {
    const prompt = buildGuidePrompt(req.body || {});

    // Default + preferred: Scrolitha (Ollama).
    try {
      const result = await askScrolithaOllama(prompt);
      return res.json({ success: true, data: { provider: result.provider, model: result.model, guide: result.text } });
    } catch (scrolithaError) {
      // Optional fallback to legacy providers when explicitly enabled.
      const runtime = await resolveScrolithaLlmRuntime('user');
      if (!runtime.allowGeminiFallback) {
        throw scrolithaError;
      }

      const aiConfig = await getSystemAiConfig();
      if (!aiConfig) return res.status(400).json({ success: false, error: 'AI settings not configured' });

      const provider = pickProvider(aiConfig, 'seo_tags');
      if (!provider || provider === 'scrolitha') return res.status(400).json({ success: false, error: 'AI provider is disabled' });

      const safety = getSafety(aiConfig);
      if (provider === 'google') {
        const apiKey = aiConfig?.providers?.google?.apiKey || aiConfig?.providers?.google?.api_key;
        const model = aiConfig?.providers?.google?.model || 'gemini-pro';
        if (!apiKey) return res.status(400).json({ success: false, error: 'Google AI API key missing' });
        const text = await askGoogle(apiKey, model, prompt, safety.maxTokens, safety.temperature);
        return res.json({ success: true, data: { provider, model, guide: text } });
      }

      const apiKey = aiConfig?.providers?.openai?.apiKey || aiConfig?.providers?.openai?.api_key;
      const model = aiConfig?.providers?.openai?.model || 'gpt-4';
      if (!apiKey) return res.status(400).json({ success: false, error: 'OpenAI API key missing' });
      const text = await askOpenAI(apiKey, model, prompt, safety.maxTokens, safety.temperature);
      return res.json({ success: true, data: { provider, model, guide: text } });
    }
  } catch (error: any) {
    console.error('AI guide error:', error);
    const msg = String(error?.message || 'AI request failed');
    const lower = msg.toLowerCase();
    const status = lower.includes('not configured') ? 503 : 500;
    return res.status(status).json({ success: false, error: msg });
  }
};

// Public, guest-safe support chat (used by the support widget when not authenticated).
export const supportChat = async (req: Request, res: Response) => {
  try {
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ success: false, error: 'message is required' });

    const userRole = String(req.body?.role || 'Guest').trim();
    const history = Array.isArray(req.body?.history) ? req.body.history : [];

    const contextLines = history
      .slice(-10)
      .map((h: any) => `${String(h?.sender || '').toLowerCase() === 'user' ? 'User' : 'Agent'}: ${String(h?.text || '')}`)
      .join('\n');

    const system = [
      `You are Scrolitha, a helpful customer support agent for the Scrolith platform.`,
      `Rules:`,
      `- Be concise and professional.`,
      `- Do not request secrets, passwords, or OTP codes.`,
      `- If you need account-specific details, ask the user to log in or contact support.`,
      `User role: ${userRole}`,
      buildKnowledgeBlock(userRole)
    ].join('\n');

    const prompt = contextLines
      ? `Conversation so far:\n${contextLines}\n\nUser: ${message}\nAgent:`
      : `User: ${message}\nAgent:`;

    const result = await askScrolithaOllama(prompt, { system });
    return res.json({
      success: true,
      data: { provider: result.provider, model: result.model, reply: result.text },
      message: 'Support reply ready'
    });
  } catch (error: any) {
    const msg = String(error?.message || 'AI request failed');
    const lower = msg.toLowerCase();
    const status = lower.includes('not configured') ? 503 : 500;
    return res.status(status).json({ success: false, error: msg });
  }
};

