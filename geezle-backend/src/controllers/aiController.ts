import { Request, Response } from 'express';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import prisma from '../utils/prismaClient';
import { getScrolithaKnowledgeBundle } from '../services/scrolitha/scrolitha.knowledge';
import { ollamaChat, resolveScrolithaLlmRuntime } from '../services/scrolitha/scrolitha.ollama';
import { resolveActorFromRequest, writeScrolithaAuditLog } from '../services/scrolitha/scrolitha.audit';
import { ensureScrolithaConfig } from '../services/scrolitha/scrolitha.policy';
import {
  enhancePostDraftWithAi,
  enforcePostEnhanceRateLimit,
  generateAndPersistPostInsight,
  generatePostInsightText,
  isValidPostEnhanceMode,
  resolvePostAiSettings
} from '../services/postAi.service';

type AiProvider = 'scrolitha' | 'google' | 'openai';
const SCROLITHA_MODEL_LABEL = 'Scrolitha';

const brandModelLabel = (provider: AiProvider | string, model: unknown) => {
  if (String(provider || '').toLowerCase() === 'scrolitha') {
    return SCROLITHA_MODEL_LABEL;
  }
  const normalized = String(model || '').trim();
  return normalized || null;
};

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
  if (!runtime.enabled || runtime.provider === 'disabled') {
    throw new Error('Scrolitha is disabled');
  }
  if (runtime.provider !== 'ollama' || !runtime.runtimeConfigured) {
    throw new Error('Scrolitha Ollama accelerator is not configured');
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

  return { provider: 'scrolitha' as const, model: SCROLITHA_MODEL_LABEL, text: result.text || '' };
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

const cleanInlineText = (value: unknown) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const titleize = (value: string) =>
  cleanInlineText(value)
    .toLowerCase()
    .replace(/\b\w/g, (entry) => entry.toUpperCase());

const formatBulletSection = (title: string, items: string[]) =>
  `${title}:\n${items.map((item) => `- ${item}`).join('\n')}`;

const buildScrolithaFallbackAnswer = (payload: any) => {
  const bundle = getScrolithaKnowledgeBundle();
  const question = cleanInlineText(payload?.question || 'Clarify the business objective.');
  const context = cleanInlineText(payload?.context);
  const audience = cleanInlineText(payload?.audience || 'business professional');
  const source = `${question} ${context}`.toLowerCase();

  let recommendedApproach = [
    'Define the objective, owner, timeline, and measurable success criteria before execution starts.',
    'Break the work into milestones, deliverables, and approval checkpoints so expectations stay aligned.',
    'Keep communication, files, and decisions inside one managed workflow to reduce delivery risk.'
  ];

  let nextSteps = [
    'Write a concise brief that captures scope, constraints, success metrics, and deadlines.',
    'Assign the primary decision-maker and document the review cadence for the workstream.',
    'Launch with a smaller validated phase first, then expand once quality and timing are proven.'
  ];

  let platformAdvantage = bundle.coreServices.slice(0, 3);

  if (/(hire|hiring|candidate|talent|job post|recruit)/.test(source)) {
    recommendedApproach = [
      'Translate the role into business outcomes, ownership boundaries, budget range, and timeline.',
      'Shortlist talent against proven portfolio evidence, communication quality, and delivery fit.',
      'Use milestones, escrow, and structured review points so the hiring workflow stays accountable.'
    ];
    nextSteps = [
      'Finalize the role brief and include must-have versus nice-to-have requirements.',
      'Open the job or talent search with a clear shortlist rubric and response deadline.',
      'Prepare the first milestone, success criteria, and stakeholder approval path before kickoff.'
    ];
    platformAdvantage = bundle.employerCapabilities.slice(0, 3);
  } else if (/(freelancer|gig|proposal|portfolio|client pitch|positioning)/.test(source)) {
    recommendedApproach = [
      'Lead with your niche, strongest proof of work, and the specific outcomes you help clients achieve.',
      'Package services into clear deliverables, pricing logic, and revision or milestone boundaries.',
      'Use concise client-facing language that builds trust, relevance, and confidence to engage.'
    ];
    nextSteps = [
      'Rewrite your summary into a role-specific value proposition with measurable outcomes.',
      'Add portfolio proof, testimonials, and case results that match the work you want to win.',
      'Prepare a reusable proposal structure for discovery, scope, delivery plan, and CTA.'
    ];
    platformAdvantage = bundle.freelancerCapabilities.slice(0, 3);
  } else if (/(growth|marketing|seo|content|audience|community)/.test(source)) {
    recommendedApproach = [
      'Start with one measurable growth objective and select the acquisition or retention lever that matters most.',
      'Build a repeatable content, conversion, or community loop instead of isolated one-off campaigns.',
      'Review performance weekly and iterate on message, offer, distribution, and funnel quality.'
    ];
    nextSteps = [
      'Set the primary KPI and baseline the current performance before changes go live.',
      'Create a 30-day execution plan covering content, distribution, and reporting ownership.',
      'Use controlled experiments and keep the highest-performing message or offer variants.'
    ];
    platformAdvantage = bundle.growthAndMonetization.slice(0, 3);
  }

  return [
    'Scrolitha Summary',
    `Your request: ${question}`,
    context ? `Context: ${context}` : '',
    '',
    formatBulletSection('Recommended approach', recommendedApproach),
    '',
    formatBulletSection('Immediate next steps', nextSteps),
    '',
    formatBulletSection('Scrolith advantage', platformAdvantage),
    '',
    `Audience fit: This guidance is tailored for ${audience}.`
  ]
    .filter(Boolean)
    .join('\n');
};

const buildScrolithaFallbackGuide = (payload: any) => {
  const bundle = getScrolithaKnowledgeBundle();
  const topic = cleanInlineText(payload?.topic || 'Operational planning');
  const audience = cleanInlineText(payload?.audience || 'founders and operators');
  const depth = cleanInlineText(payload?.depth || 'in-depth');
  const format = cleanInlineText(payload?.format || 'outline');
  const normalizedTopic = titleize(topic || 'Operational planning');

  return [
    normalizedTopic,
    `Audience: ${audience}`,
    `Depth: ${depth}`,
    `Format: ${format}`,
    '',
    `Scrolitha Overview: This guide provides a practical execution plan for ${topic}.`,
    '',
    formatBulletSection('1. Objective', [
      `Define what success looks like for ${topic}, including owners, timeline, budget, and measurable outcomes.`,
      'Document the decision criteria that will determine whether the initiative should scale, pause, or change direction.'
    ]),
    '',
    formatBulletSection('2. Preparation', [
      'Gather the inputs, stakeholders, dependencies, and operating constraints before kickoff.',
      'Turn the scope into milestones, deliverables, review checkpoints, and approval owners.'
    ]),
    '',
    formatBulletSection('3. Execution plan', [
      'Start with the highest-impact workstream first and sequence the remaining work around dependencies.',
      'Track delivery rhythm through weekly reviews, risks, blockers, and next-step ownership.'
    ]),
    '',
    formatBulletSection('4. Metrics and signals', [
      'Select leading indicators that show whether execution quality is improving before final outcomes land.',
      'Review conversion, retention, delivery quality, or margin signals depending on the operating goal.'
    ]),
    '',
    formatBulletSection('5. Risks and controls', [
      'Control scope creep, unclear ownership, weak approvals, and fragmented communication early.',
      ...bundle.trustAndSafety.slice(0, 2)
    ]),
    '',
    formatBulletSection('6. Recommended Scrolith workflows', [
      ...bundle.coreServices.slice(0, 2),
      ...bundle.communicationAndCollaboration.slice(0, 1)
    ]),
    '',
    'Final recommendation: launch with a validated first phase, review outcomes quickly, and only scale once the execution pattern is reliable.'
  ].join('\n');
};

const buildScrolithaSupportFallbackReply = (payload: { message?: unknown; role?: unknown }) => {
  const message = cleanInlineText(payload.message || 'I need support using Scrolith.');
  const role = cleanInlineText(payload.role || 'Guest');
  const bundle = getScrolithaKnowledgeBundle();

  return [
    `Scrolitha Support Summary`,
    `Role: ${role}`,
    `Request: ${message}`,
    '',
    formatBulletSection('Recommended next steps', [
      'Clarify the exact page, feature, or workflow where the issue started.',
      'Keep actions, screenshots, and recent error details ready so support can reproduce the problem quickly.',
      'Use the Scrolith support center if you need account-specific help, order assistance, or policy review.'
    ]),
    '',
    formatBulletSection('What Scrolith can help with', bundle.coreServices.slice(0, 3)),
    '',
    'If the issue involves account data or a protected workflow, sign in and contact support so the team can review the case securely.'
  ].join('\n');
};

export const getAIConfig = async (_req: Request, res: Response) => {
  try {
    const aiConfig = await getSystemAiConfig();
    const runtime = await resolveScrolithaLlmRuntime('user');
    const safe = {
      providers: {
        scrolitha: {
          enabled: Boolean(runtime.enabled),
          provider: 'scrolitha',
          runtime: runtime.provider,
          status: runtime.status,
          model: SCROLITHA_MODEL_LABEL
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
        provider: 'scrolitha',
        runtime: runtime.provider,
        status: runtime.status,
        acceleratorActive: Boolean(runtime.acceleratorActive),
        model: SCROLITHA_MODEL_LABEL,
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
      return res.json({
        success: true,
        data: {
          provider: result.provider,
          model: brandModelLabel(result.provider, result.model),
          answer: result.text
        }
      });
    } catch (scrolithaError) {
      // Optional fallback to legacy providers when explicitly enabled.
      const runtime = await resolveScrolithaLlmRuntime('user');
      if (!runtime.allowGeminiFallback) {
        return res.json({
          success: true,
          data: {
            provider: 'scrolitha',
            model: SCROLITHA_MODEL_LABEL,
            answer: buildScrolithaFallbackAnswer(req.body || {})
          }
        });
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

export const answerQuestionWithScrolitha = async (req: Request, res: Response) => {
  try {
    const prompt = buildQaPrompt(req.body || {});
    let result;
    try {
      result = await askScrolithaOllama(prompt);
    } catch {
      return res.json({
        success: true,
        data: {
          provider: 'scrolitha',
          model: SCROLITHA_MODEL_LABEL,
          answer: buildScrolithaFallbackAnswer(req.body || {})
        }
      });
    }
    return res.json({
      success: true,
      data: {
        provider: result.provider,
        model: brandModelLabel(result.provider, result.model),
        answer: result.text
      }
    });
  } catch (error: any) {
    console.error('Scrolitha-only answer error:', error);
    const msg = String(error?.message || 'Scrolitha request failed');
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
      return res.json({
        success: true,
        data: {
          provider: result.provider,
          model: brandModelLabel(result.provider, result.model),
          guide: result.text
        }
      });
    } catch (scrolithaError) {
      // Optional fallback to legacy providers when explicitly enabled.
      const runtime = await resolveScrolithaLlmRuntime('user');
      if (!runtime.allowGeminiFallback) {
        return res.json({
          success: true,
          data: {
            provider: 'scrolitha',
            model: SCROLITHA_MODEL_LABEL,
            guide: buildScrolithaFallbackGuide(req.body || {})
          }
        });
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

export const generateGuideWithScrolitha = async (req: Request, res: Response) => {
  try {
    const prompt = buildGuidePrompt(req.body || {});
    let result;
    try {
      result = await askScrolithaOllama(prompt);
    } catch {
      return res.json({
        success: true,
        data: {
          provider: 'scrolitha',
          model: SCROLITHA_MODEL_LABEL,
          guide: buildScrolithaFallbackGuide(req.body || {})
        }
      });
    }
    return res.json({
      success: true,
      data: {
        provider: result.provider,
        model: brandModelLabel(result.provider, result.model),
        guide: result.text
      }
    });
  } catch (error: any) {
    console.error('Scrolitha-only guide error:', error);
    const msg = String(error?.message || 'Scrolitha request failed');
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

    try {
      const result = await askScrolithaOllama(prompt, { system });
      return res.json({
        success: true,
        data: {
          provider: result.provider,
          model: brandModelLabel(result.provider, result.model),
          reply: result.text
        },
        message: 'Support reply ready'
      });
    } catch {
      return res.json({
        success: true,
        data: {
          provider: 'scrolitha',
          model: SCROLITHA_MODEL_LABEL,
          reply: buildScrolithaSupportFallbackReply({ message, role: userRole })
        },
        message: 'Support reply ready'
      });
    }
  } catch (error: any) {
    const msg = String(error?.message || 'AI request failed');
    const lower = msg.toLowerCase();
    const status = lower.includes('not configured') ? 503 : 500;
    return res.status(status).json({ success: false, error: msg });
  }
};

const safePreview = (value: unknown, max = 220) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max - 1)}...`;
};

export const postEnhance = async (req: Request, res: Response) => {
  const actor = resolveActorFromRequest(req);
  const text = String(req.body?.text || '').trim();
  const modeRaw = String(req.body?.mode || '').trim().toLowerCase();

  if (!actor.id) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  if (!text) {
    return res.status(400).json({ success: false, error: 'text is required' });
  }
  if (!isValidPostEnhanceMode(modeRaw)) {
    return res.status(400).json({ success: false, error: 'mode must be one of: grammar, rephrase, professional, shorten, expand' });
  }

  const postAiSettings = await resolvePostAiSettings();
  if (!postAiSettings.assistantEnabled) {
    return res.status(403).json({ success: false, error: 'AI post assistant is disabled by admin' });
  }

  const limit = enforcePostEnhanceRateLimit(actor.id, 10);
  if (!limit.allowed) {
    return res.status(429).json({ success: false, error: limit.reason || 'Rate limit exceeded' });
  }

  try {
    const config = await ensureScrolithaConfig('user');
    const result = await enhancePostDraftWithAi({
      text,
      mode: modeRaw,
      safeMode: Boolean(config.safeMode),
      scope: 'user'
    });

    await writeScrolithaAuditLog({
      actor,
      eventType: 'POST_AI_ENHANCE',
      intent: `post_enhance_${modeRaw}`,
      toolKey: 'POST_AI_ENHANCE',
      requestPayload: { mode: modeRaw, textLength: text.length },
      redactedPayload: { mode: modeRaw, textPreview: safePreview(text, 100) },
      resultStatus: 'ok',
      resultSummary: safePreview(result.enhancedText, 180)
    });

    return res.json({
      success: true,
      data: {
        enhancedText: result.enhancedText,
        fallbackUsed: Boolean(result.fallbackUsed),
        warning: result.warning
      }
    });
  } catch (error: any) {
    const message = String(error?.message || 'AI enhancement failed');
    await writeScrolithaAuditLog({
      actor,
      eventType: 'POST_AI_ENHANCE',
      intent: `post_enhance_${modeRaw}`,
      toolKey: 'POST_AI_ENHANCE',
      requestPayload: { mode: modeRaw, textLength: text.length },
      redactedPayload: { mode: modeRaw, textPreview: safePreview(text, 100) },
      resultStatus: 'failed',
      resultSummary: safePreview(message, 180)
    });
    const lower = message.toLowerCase();
    const status = lower.includes('not configured') ? 503 : lower.includes('rate limit') ? 429 : 500;
    return res.status(status).json({ success: false, error: message });
  }
};

export const postInsight = async (req: Request, res: Response) => {
  const actor = resolveActorFromRequest(req);
  const postId = String(req.body?.postId || '').trim();
  const text = String(req.body?.text || '').trim();
  const force = Boolean(req.body?.force);

  if (!actor.id) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const settings = await resolvePostAiSettings();
  if (!settings.insightEnabled) {
    return res.status(403).json({ success: false, error: 'AI insight system is disabled by admin' });
  }

  try {
    if (postId) {
      const post = await prisma.communityPost.findUnique({
        where: { id: postId },
        select: { id: true, authorId: true }
      });
      if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

      const isPrivileged = actor.isAdmin || String(actor.role || '').toLowerCase() === 'moderator';
      if (!isPrivileged && post.authorId !== actor.id) {
        return res.status(403).json({ success: false, error: 'Not allowed to generate insight for this post' });
      }

      const result = await generateAndPersistPostInsight({
        postId,
        app: req.app,
        force,
        actor
      });

      await writeScrolithaAuditLog({
        actor,
        eventType: 'POST_AI_INSIGHT_REQUEST',
        intent: 'post_insight_generate',
        toolKey: 'POST_AI_INSIGHT',
        requestPayload: { postId, force },
        redactedPayload: { postId, force },
        resultStatus: result.generated ? 'ok' : 'skipped',
        resultSummary: result.generated
          ? safePreview((result as any)?.post?.aiInsightText || '', 180)
          : safePreview((result as any)?.reason || 'not_generated', 120)
      });

      return res.json({
        success: true,
        data: {
          postId,
          generated: Boolean(result.generated),
          reason: (result as any)?.reason || null,
          aiInsightText: (result as any)?.post?.aiInsightText || null
        }
      });
    }

    if (!text) {
      return res.status(400).json({ success: false, error: 'Provide postId or text' });
    }

    const config = await ensureScrolithaConfig('admin');
    const generated = await generatePostInsightText({
      text,
      tone: settings.insightTone,
      maxLength: settings.maxInsightLength,
      safeMode: Boolean(settings.insightSafeMode || config.safeMode),
      scope: 'user'
    });

    await writeScrolithaAuditLog({
      actor,
      eventType: 'POST_AI_INSIGHT_REQUEST',
      intent: 'post_insight_preview',
      toolKey: 'POST_AI_INSIGHT',
      requestPayload: { textLength: text.length },
      redactedPayload: { textPreview: safePreview(text, 100) },
      resultStatus: 'ok',
      resultSummary: safePreview(generated.insightText, 180)
    });

    return res.json({
      success: true,
      data: {
        insightText: generated.insightText
      }
    });
  } catch (error: any) {
    const message = String(error?.message || 'AI insight generation failed');
    await writeScrolithaAuditLog({
      actor,
      eventType: 'POST_AI_INSIGHT_REQUEST',
      intent: 'post_insight_error',
      toolKey: 'POST_AI_INSIGHT',
      requestPayload: { postId: postId || null, textLength: text.length || 0 },
      redactedPayload: { postId: postId || null, textPreview: safePreview(text, 100) },
      resultStatus: 'failed',
      resultSummary: safePreview(message, 180)
    });
    const lower = message.toLowerCase();
    const status = lower.includes('not configured') ? 503 : 500;
    return res.status(status).json({ success: false, error: message });
  }
};
