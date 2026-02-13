import { Request, Response } from 'express';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import prisma from '../utils/prismaClient';

type AiProvider = 'google' | 'openai';

const getSystemAiConfig = async () => {
  const record = await prisma.appSetting.findUnique({ where: { scope: 'system' } });
  const system = (record?.data as any) || {};
  return system.aiConfig || system?.system?.aiConfig || null;
};

const pickProvider = (aiConfig: any, routeKey: string): AiProvider | null => {
  const routing = aiConfig?.routing || {};
  const routeProvider = (routing?.[routeKey] as AiProvider) || null;
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

const buildQaPrompt = (payload: any) => {
  const question = payload?.question || '';
  const context = payload?.context || '';
  const audience = payload?.audience || 'business professional';
  const format = payload?.format || 'concise, structured';
  return `You are Scrolith Answers, a professional business advisor.\nAudience: ${audience}.\nResponse format: ${format}.\nQuestion: ${question}\nContext: ${context}\nProvide a clear, actionable answer with bullets and a short summary.`;
};

const buildGuidePrompt = (payload: any) => {
  const topic = payload?.topic || '';
  const audience = payload?.audience || 'founders and operators';
  const depth = payload?.depth || 'in-depth';
  const format = payload?.format || 'outline';
  return `You are Scrolith Guides, a professional business strategist.\nAudience: ${audience}.\nDepth: ${depth}.\nOutput format: ${format}.\nTopic: ${topic}\nCreate a structured guide with headings, key steps, and best practices.`;
};

export const getAIConfig = async (_req: Request, res: Response) => {
  try {
    const aiConfig = await getSystemAiConfig();
    const safe = {
      providers: {
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
      }
    };
    return res.json({ success: true, data: safe });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Failed to load AI config' });
  }
};

export const answerQuestion = async (req: Request, res: Response) => {
  try {
    const aiConfig = await getSystemAiConfig();
    if (!aiConfig) return res.status(400).json({ success: false, error: 'AI settings not configured' });
    const provider = pickProvider(aiConfig, 'support_chat');
    if (!provider) return res.status(400).json({ success: false, error: 'AI provider is disabled' });

    const safety = getSafety(aiConfig);
    const prompt = buildQaPrompt(req.body || {});

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
  } catch (error: any) {
    console.error('AI answer error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'AI request failed' });
  }
};

export const generateGuide = async (req: Request, res: Response) => {
  try {
    const aiConfig = await getSystemAiConfig();
    if (!aiConfig) return res.status(400).json({ success: false, error: 'AI settings not configured' });
    const provider = pickProvider(aiConfig, 'seo_tags');
    if (!provider) return res.status(400).json({ success: false, error: 'AI provider is disabled' });

    const safety = getSafety(aiConfig);
    const prompt = buildGuidePrompt(req.body || {});

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
  } catch (error: any) {
    console.error('AI guide error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'AI request failed' });
  }
};

