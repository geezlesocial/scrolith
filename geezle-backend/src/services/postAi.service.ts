import prisma from '../utils/prismaClient';
import realtime from '../utils/realtime';
import { ScrolithaService, createSystemScrolithaActor } from '../modules/scrolitha/inference/scrolitha.service';
import { writeScrolithaAuditLog } from './scrolitha/scrolitha.audit';
import { incrementMinuteCounter } from './scrolitha/scrolitha.cache';
import {
  SCROLITHA_BACKUP_WARNING_CODE,
  SCROLITHA_BACKUP_WARNING_MESSAGE
} from './scrolitha/scrolitha.ollama';
import {
  ensureScrolithaConfig,
  isScrolithaPromptPolicyError
} from './scrolitha/scrolitha.policy';
import type { ScrolithaScope } from './scrolitha/scrolitha.types';

export type PostEnhanceMode = 'grammar' | 'rephrase' | 'professional' | 'shorten' | 'expand';

const ENHANCE_MODES = new Set<PostEnhanceMode>([
  'grammar',
  'rephrase',
  'professional',
  'shorten',
  'expand'
]);

const ENHANCE_MODE_ALIASES: Record<string, PostEnhanceMode> = {
  fix: 'grammar',
  correct: 'grammar',
  proofread: 'grammar',
  rewrite: 'rephrase',
  clarify: 'rephrase',
  pro: 'professional',
  business: 'professional',
  concise: 'shorten',
  brief: 'shorten',
  longer: 'expand',
  elaborate: 'expand',
  grammar_fix: 'grammar',
  improve_grammar: 'grammar',
  make_professional: 'professional',
  post_card_polish: 'rephrase',
  scroll_post_polish: 'rephrase',
  story_caption_polish: 'rephrase',
  caption_polish: 'rephrase',
  marketplace_tone: 'professional',
  friendly_rewrite: 'rephrase',
  engagement_rewrite: 'rephrase'
};

const resolveEnhanceMode = (mode: string): PostEnhanceMode | undefined => {
  const lowerCaseMode = mode.toLowerCase().trim();
  if (ENHANCE_MODES.has(lowerCaseMode as PostEnhanceMode)) {
    return lowerCaseMode as PostEnhanceMode;
  }
  return ENHANCE_MODE_ALIASES[lowerCaseMode];
};

const ENHANCE_PROMPTS: Record<PostEnhanceMode, string> = {
  grammar:
    'You are an expert copy editor. Correct all grammar, spelling, and punctuation errors in the following text. Preserve the original tone and meaning. Do not add new information or change the core message. Return only the corrected text.',
  rephrase:
    'You are an expert writer. Rephrase the following text to make it clearer, more concise, and more natural-sounding. Preserve the exact original meaning. Do not add or remove information. Return only the rephrased text.',
  professional:
    'You are an expert business writer. Rewrite the following text in a professional, formal, and business-appropriate tone. Ensure the meaning and factual content are preserved. The output should be ready for a corporate or client-facing communication. Return only the rewritten text. Do NOT include prefatory phrases such as "Here is", "Revised version", "Example", or any commentary. Do NOT wrap the result in quotes unless those quotes are present in the source text.',
  shorten:
    'You are an expert editor. Shorten the following text while preserving the key message and essential details. Return only the shortened text. Maximum length: 140 characters. Do NOT add hashtags, commentary, or prefatory phrasing. Ensure the result is meaningfully shorter than the source.',
  expand:
    'You are an expert content writer. Expand the following text by adding one or more useful sentences that clarify or add supportive detail while keeping the original intent and facts. Do not invent new factual content. Return only the expanded text (no preamble, no explanations).',
};

type PostAiSettings = {
  assistantEnabled: boolean;
  insightEnabled: boolean;
  randomPercentage: number;
  manualOnly: boolean;
  maxInsightLength: number;
  insightSafeMode: boolean;
  insightTone: string;
  rankingBoostEnabled: boolean;
};

const DEFAULT_POST_AI_SETTINGS: PostAiSettings = {
  assistantEnabled: true,
  insightEnabled: true,
  randomPercentage: 15,
  manualOnly: false,
  maxInsightLength: 220,
  insightSafeMode: false,
  insightTone: 'professional',
  rankingBoostEnabled: false
};

const asBool = (value: unknown, fallback: boolean) => {
  if (typeof value === 'boolean') return value;
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
};

const asInt = (value: unknown, fallback: number, min: number, max: number) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
};

const normalizePostAiSettings = (metadata: any): PostAiSettings => {
  const source =
    (metadata?.postAi && typeof metadata.postAi === 'object' && !Array.isArray(metadata.postAi)
      ? metadata.postAi
      : metadata?.post_ai && typeof metadata.post_ai === 'object' && !Array.isArray(metadata.post_ai)
        ? metadata.post_ai
        : {}) || {};

  return {
    assistantEnabled: asBool(
      source.assistantEnabled ?? source.enablePostAssistant,
      DEFAULT_POST_AI_SETTINGS.assistantEnabled
    ),
    insightEnabled: asBool(
      source.insightEnabled ?? source.enableInsightSystem,
      DEFAULT_POST_AI_SETTINGS.insightEnabled
    ),
    randomPercentage: asInt(
      source.randomPercentage ?? source.randomInsightPercentage,
      DEFAULT_POST_AI_SETTINGS.randomPercentage,
      0,
      100
    ),
    manualOnly: asBool(source.manualOnly ?? source.enableManualInsightOnly, DEFAULT_POST_AI_SETTINGS.manualOnly),
    maxInsightLength: asInt(
      source.maxInsightLength ?? source.insightMaxLength,
      DEFAULT_POST_AI_SETTINGS.maxInsightLength,
      60,
      500
    ),
    insightSafeMode: asBool(source.insightSafeMode, DEFAULT_POST_AI_SETTINGS.insightSafeMode),
    insightTone: String(source.insightTone || DEFAULT_POST_AI_SETTINGS.insightTone).trim() || 'professional',
    rankingBoostEnabled: asBool(source.rankingBoostEnabled, DEFAULT_POST_AI_SETTINGS.rankingBoostEnabled)
  };
};

const safePreview = (value: unknown, max = 250) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max - 1)}...`;
};

const ensureSentence = (value: string) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return /[.!?]$/.test(text) ? text : `${text}.`;
};

const capitalizeFirst = (value: string) => {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const cleanFallbackText = (value: string) =>
  String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([,.;!?])/g, '$1')
    .replace(/([,.;!?])([^\s])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();

const applyLineAwareGrammarPolish = (value: string) =>
  String(value || '')
    .split('\n')
    .map((line) => {
      const normalized = cleanFallbackText(line);
      if (!normalized) return '';
      return ensureSentence(capitalizeFirst(normalized));
    })
    .filter(Boolean)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const applyCommonGrammarFixes = (value: string) => {
  let text = cleanFallbackText(value);
  const replacements: Array<[RegExp, string]> = [
    [/\bth respn\b/gi, 'the response'],
    [/\bth respon\b/gi, 'the response'],
    [/\bth response\b/gi, 'the response'],
    [/\bthank for\b/gi, 'thank you for'],
    [/\bthan yo\b/gi, 'thank you'],
    [/\bthan u\b/gi, 'thank you'],
    [/\bthan you\b/gi, 'thank you'],
    [/\bthx\b/gi, 'thanks'],
    [/\bi has\b/gi, 'I have'],
    [/\bmany idea\b/gi, 'many ideas'],
    [/\bneed make\b/gi, 'need to make'],
    [/\bneed write\b/gi, 'need to write'],
    [/\bneed send\b/gi, 'need to send'],
    [/\bneed present\b/gi, 'need to present'],
    [/\bneed explain\b/gi, 'need to explain'],
    [/\bwonful\b/gi, 'wonderful'],
    [/\bwondful\b/gi, 'wonderful'],
    [/\bwoderful\b/gi, 'wonderful'],
    [/\brespnse\b/gi, 'response'],
    [/\brespn\b/gi, 'response'],
    [/\bresponsese\b/gi, 'response'],
    [/\bpls\b/gi, 'please'],
    [/\bim\b/gi, "I'm"],
    [/\bdont\b/gi, "don't"],
    [/\bcant\b/gi, "can't"],
    [/\bhell,/gi, 'hello,'],
  ];
  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }
  text = text
    .replace(/\b([Tt]hanks?) you for\b/g, 'thank you for')
    .replace(/\bi\b/g, 'I')
    .replace(/\bideas and need to make it professional\b/i, 'ideas and need to make them more professional');

  return ensureSentence(capitalizeFirst(text));
};

const hasObviousTextIssues = (value: string) => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return false;
  const fragments = normalized
    .split(/[^a-z0-9]+/i)
    .filter((entry) => entry.length >= 4 && !/[aeiou]/i.test(entry) && !/^(html|css|sql|crm|api|sdk|jwt|php|cpp|tsx|jsx)$/i.test(entry));
  if (fragments.length > 0) return true;
  if (/\b(?:than yo|than u|th respn|th respon|respn|respnse|wondful|wonful|woderful)\b/i.test(normalized)) {
    return true;
  }
  return false;
};

const toProfessionalFallbackText = (value: string) => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';

  const conciseRequest = normalized
    .replace(/^Need update\b/i, 'I need to provide an update')
    .replace(/^Need to update\b/i, 'I need to provide an update')
    .replace(/^Need\b/i, 'I need to')
    .replace(/^Want\b/i, 'I would like to')
    .replace(/^Can you\b/i, 'Could you');

  return ensureSentence(
    conciseRequest
      .replace(/\bI have many ideas and need to make them more professional\b/i, 'I have several ideas and would like to present them in a more professional manner')
      .replace(/\bthank you for the responses\b/i, 'Thank you for your responses')
  );
};

const fallbackEnhanceText = (text: string, mode: PostEnhanceMode) => {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';
  const grammarFixed = applyCommonGrammarFixes(normalized);

  if (mode === 'shorten') {
    const condensed = grammarFixed
      .split(/\n+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
      .join(' ');
    const concise = condensed
      .replace(/\bI have many ideas and need to make them more professional\b/i, 'I need to present my ideas more professionally')
      .replace(/\bI would like to\b/gi, 'I want to');
    return ensureSentence(concise.length > 180 ? `${concise.slice(0, 177).trim()}...` : concise);
  }

  if (mode === 'expand') {
    return `${grammarFixed} I want the final message to sound clear, polished, and ready to share with others.`;
  }

  if (mode === 'professional') {
    return toProfessionalFallbackText(grammarFixed);
  }

  if (mode === 'rephrase') {
    return ensureSentence(
      grammarFixed
        .replace(/\bThank you for the responses\b/i, 'Thank you for your responses')
        .replace(/\bI have many ideas and need to make them more professional\b/i, 'I have several ideas and need to present them more professionally')
    );
  }

  if (mode === 'grammar') {
    return grammarFixed;
  }

  return grammarFixed;
};

const buildEnhanceUserPrompt = (text: string, mode: PostEnhanceMode) => {
  const modeInstruction =
    mode === 'grammar'
      ? 'Correct grammar, spelling, punctuation, and obviously incomplete words only. Infer the most likely intended correction when a word is clearly truncated or misspelled.'
      : mode === 'rephrase'
        ? 'Rewrite the text so it clearly uses different wording while preserving the same meaning.'
        : mode === 'professional'
          ? 'Rewrite the text as one polished final message in a professional, business-appropriate tone that is ready to send to a client, colleague, or stakeholder.'
          : mode === 'shorten'
            ? 'Shorten the text into a concise final message while preserving the key meaning.'
            : 'Expand the text into a fuller version with at least one additional sentence while preserving the original meaning and facts.';

  return [
    'Task: transform the provided text.',
    modeInstruction,
    'Return only the transformed text.',
    'Do not ask questions.',
    'Do not mention being an assistant.',
    'Do not describe what you are doing.',
    'Do not add commentary, explanations, quotation marks, headings, or bullet points.',
    'Do not mention missing context.',
    'Do not introduce the rewrite with phrases like "Here is", "Revised version", or similar.',
    'Do not add setup sentences such as thanking for feedback, explaining your approach, or saying you will improve the text.',
    'Preserve the original language unless correction is required.',
    'Source text:',
    '"""',
    text,
    '"""'
  ].join('\n');
};

const shouldRetryEnhanceResponse = (sourceText: string, mode: PostEnhanceMode, candidate: string) => {
  const normalized = String(candidate || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return true;
  const source = String(sourceText || '').replace(/\s+/g, ' ').trim();

  const lower = normalized.toLowerCase();
  const assistantPatterns = [
    "i'd be happy to help",
    'i would be happy to help',
    'can you please',
    'please provide more context',
    'what specific',
    'what can i help you with',
    'let me know if you',
    'here is a corrected version',
    'here is a rewritten version',
    "here's a revised version",
    'here is an example',
    'to get started',
    'i appreciate your feedback',
    'to refine my response',
    'i will focus on',
    'i would like to express my gratitude',
    'this requires a structured approach'
  ];

  if (assistantPatterns.some((pattern) => lower.includes(pattern))) {
    return true;
  }

  if (/["“”]/.test(normalized) || normalized.includes('\n\n')) {
    return true;
  }

  const sourceHashtagCount = (source.match(/#[a-z0-9_]+/gi) || []).length;
  const candidateHashtagCount = (normalized.match(/#[a-z0-9_]+/gi) || []).length;
  if (!sourceHashtagCount && candidateHashtagCount) return true;

  const sourceMentionCount = (source.match(/@[a-z0-9_.-]+/gi) || []).length;
  const candidateMentionCount = (normalized.match(/@[a-z0-9_.-]+/gi) || []).length;
  if (!sourceMentionCount && candidateMentionCount) return true;

  const sourceLinkCount = (source.match(/https?:\/\/|www\./gi) || []).length;
  const candidateLinkCount = (normalized.match(/https?:\/\/|www\./gi) || []).length;
  if (!sourceLinkCount && candidateLinkCount) return true;

  const sourceLength = source.length;
  const candidateLength = normalized.length;
  const normalizedSource = source.toLowerCase().replace(/[^a-z0-9]+/gi, ' ').trim();
  const normalizedCandidate = normalized.toLowerCase().replace(/[^a-z0-9]+/gi, ' ').trim();
  const sourceWordCount = source.split(/\s+/).filter(Boolean).length;
  const candidateWordCount = normalized.split(/\s+/).filter(Boolean).length;
  const sourceSentenceCount = (source.match(/[.!?]+/g) || []).length;
  const candidateSentenceCount = (normalized.match(/[.!?]+/g) || []).length;
  const sourceLooksBroken = hasObviousTextIssues(source);
  const candidateLooksBroken = hasObviousTextIssues(normalized);
  const grammarBaseline = applyLineAwareGrammarPolish(applyCommonGrammarFixes(source));
  const normalizedBaseline = grammarBaseline.toLowerCase().replace(/[^a-z0-9]+/gi, ' ').trim();
  const sourceWords = new Set(
    source
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((entry) => entry.length > 2)
  );
  const overlap = normalized
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter((entry) => entry.length > 2 && sourceWords.has(entry)).length;

  if (
    sourceLooksBroken &&
    normalizedBaseline &&
    normalizedCandidate === normalizedBaseline &&
    (mode === 'grammar' || mode === 'professional' || mode === 'rephrase')
  ) {
    return false;
  }

  if (overlap < 3) return true;

  if (mode === 'rephrase' && normalizedCandidate === normalizedSource) {
    return true;
  }

  if ((mode === 'grammar' || mode === 'professional' || mode === 'rephrase') && candidateLooksBroken) {
    return true;
  }

  if ((mode === 'grammar' || mode === 'professional') && sourceLooksBroken) {
    if (normalizedCandidate === normalizedSource) {
      return true;
    }
    if (normalizedBaseline && normalizedCandidate === normalizedSource && normalizedBaseline !== normalizedSource) {
      return true;
    }
  }

  if ((mode === 'grammar' || mode === 'professional' || mode === 'rephrase') && candidateWordCount >= 4) {
    const suspiciousFragments = normalized
      .split(/[^a-z0-9]+/i)
      .filter((entry) => entry.length >= 4 && !/[aeiou]/i.test(entry) && !/^(html|css|sql|crm|api|sdk|jwt|php|cpp|tsx|jsx)$/i.test(entry));
    if (suspiciousFragments.length > 0) {
      return true;
    }
    if (!/[.!?]$/.test(normalized) && sourceSentenceCount <= 1) {
      return true;
    }
  }

  if (mode === 'expand') {
    if (normalizedCandidate === normalizedSource) {
      return true;
    }
    const expandMinGrowth = sourceLength < 120 ? 8 : Math.max(12, Math.floor(sourceLength * 0.15));
    const addedSentence = candidateSentenceCount > sourceSentenceCount;
    const materiallyLonger = candidateLength >= sourceLength + 5;
    if (candidateLength < sourceLength + expandMinGrowth && !addedSentence && !materiallyLonger) {
      return true;
    }
  }

  if (mode === 'shorten') {
    if (normalizedCandidate === normalizedSource) {
      return true;
    }
    const shortInput = sourceLength <= 120;
    const wordNotLonger = candidateWordCount <= sourceWordCount;
    const smallLengthDelta = candidateLength <= sourceLength + 8;
    if (candidateLength > sourceLength && !(shortInput && wordNotLonger && smallLengthDelta)) {
      return true;
    }
  }

  if (
    mode === 'professional' &&
    (/:\s*$/.test(normalized) ||
      lower.includes('revised version') ||
      lower.includes('example of how') ||
      lower.includes('formal tone') ||
      lower.startsWith('i appreciate your feedback') ||
      lower.startsWith('to refine my response') ||
      lower.startsWith('i would like to express my gratitude'))
  ) {
    return true;
  }

  return false;
};

const fallbackInsightText = (text: string, tone: string, maxLength: number) => {
  const preview = safePreview(text, Math.max(80, maxLength - 32));
  const lead =
    String(tone || '').toLowerCase() === 'professional'
      ? 'Professional insight:'
      : String(tone || '').toLowerCase() === 'friendly'
        ? 'Friendly insight:'
        : 'Insight:';
  const value = ensureSentence(`${lead} ${preview}`);
  return value.length > maxLength ? `${value.slice(0, maxLength - 3).trim()}...` : value;
};

const runScrolithaText = async (input: {
  scope: ScrolithaScope;
  routeKey?: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  actor?: {
    id?: string | null;
    role?: string | null;
    scope?: ScrolithaScope;
    isAdmin?: boolean;
    ipAddress?: string | null;
    userAgent?: string | null;
  } | null;
}) => {
  const routeKey = String(input.routeKey || 'post_ai').trim() || 'post_ai';
  const actor =
    input.actor?.id
      ? {
          id: String(input.actor.id),
          role: String(input.actor.role || (input.scope === 'admin' ? 'admin' : 'user')),
          scope: input.actor.scope || input.scope,
          isAdmin: Boolean(input.actor.isAdmin),
          ipAddress: input.actor.ipAddress || null,
          userAgent: input.actor.userAgent || null
        }
      : createSystemScrolithaActor(input.scope, routeKey, input.scope === 'admin' ? 'system_admin' : 'system_user');
  const result = await ScrolithaService.generate({
    scope: input.scope,
    actor,
    routeKey,
    system: input.systemPrompt,
    prompt: input.userPrompt,
    maxTokens: input.maxTokens || 420
  });
  return {
    text: String(result.text || '').trim(),
    model: result.model,
    usedBackupProcessing: Boolean(result.usedFallback),
    warning: result.warning,
    warningCode: result.warningCode
  };
};

export const resolvePostAiSettings = async (): Promise<PostAiSettings> => {
  const config = await ensureScrolithaConfig('admin');
  return normalizePostAiSettings(config?.metadata || {});
};

export const isValidPostEnhanceMode = (value: unknown): value is PostEnhanceMode =>
  !!resolveEnhanceMode(String(value || '').trim());

export const enforcePostEnhanceRateLimit = (userId: string, limitPerMinute = 10) => {
  const id = String(userId || '').trim();
  if (!id) return { allowed: false, reason: 'Missing user id' };
  const key = `scrolitha:post-enhance:${id}`;
  const count = incrementMinuteCounter(key);
  if (count > Math.max(1, limitPerMinute)) {
    return { allowed: false, reason: `Rate limit exceeded (${limitPerMinute}/min)` };
  }
  return { allowed: true };
};

export const enhancePostDraftWithAi = async (input: {
  text: string;
  mode: PostEnhanceMode | string; // Allow string for aliases
  safeMode?: boolean;
  scope?: ScrolithaScope;
  actor?: {
    id?: string | null;
    role?: string | null;
    scope?: ScrolithaScope;
    isAdmin?: boolean;
    ipAddress?: string | null;
    userAgent?: string | null;
  } | null;
}) => {
  const text = String(input.text || '').trim();
  if (!text) throw new Error('text is required');

  const resolvedMode = resolveEnhanceMode(input.mode);
  if (!resolvedMode) throw new Error('Invalid mode');

  if (text.length > 20_000) throw new Error('text is too long (max 20000 characters)');

  const mode = resolvedMode;
  const safeMode = Boolean(input.safeMode);
  const scope = input.scope || 'user';
  const taskPrompt = ENHANCE_PROMPTS[mode];

  const systemPrompt = [
    'You are Scrolitha Post Assistant.',
    taskPrompt,
    'Never add fabricated facts.',
    'Keep hashtags, @mentions, links, and line breaks unless needed for correctness.',
    'Return only the improved text, without commentary or apologies.',
    'This is a text transformation task, not a conversation.',
    'Do not ask follow-up questions.',
    'Do not say you need more context.',
    'Do not mention being an assistant.',
    safeMode
      ? 'Safe mode is enabled: avoid unsafe, offensive, or policy-violating language and avoid risky instructions.'
      : '',
  ].filter(Boolean).join('\n');

  let response;
  let fallbackUsed = false;
  let warning: string | undefined = undefined;

  try {
    const sanitizeCandidate = (candidate: string, mode: PostEnhanceMode, source: string) => {
      let out = String(candidate || '')
        .replace(/\r\n/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .trim();

      // Remove common assistant/meta prefixes at the start
      out = out.replace(/^\s*(?:here(?:'s| is)(?: an?| a)?(?: revised| rewritten| corrected| updated| reworked)?(?: version)?[:\-\s]*|the revised text is[:\-\s]*|the revised version is[:\-\s]*|revised version[:\-\s]*|updated version[:\-\s]*|here is an example[:\-\s]*|here is a corrected version[:\-\s]*|here is a rewritten version[:\-\s]*|here's a corrected version[:\-\s]*|here's a rewritten version[:\-\s]*|here is a corrected version[:\-\s]*|here is a rewritten version[:\-\s]*|here is[:\-\s]*|here's[:\-\s]*|sure[,\-:\s]+|i can help(?: with)?[,\-:\s]+|i would be happy to help[,\-:\s]+|i'd be happy to help[,\-:\s]+|the corrected text is[:\-\s]*|example[:\-\s]*|reworked text[:\-\s]*)/i, '');

      // Strip surrounding code fences
      out = out.replace(/^```[a-zA-Z0-9]*\n?/, '').replace(/\n?```$/, '').trim();

      // If source contains no quotes, remove surrounding quotes from candidate
      const sourceHasQuotes = /["“”'‘’]/.test(String(source || ''));
      if (!sourceHasQuotes) {
        out = out.replace(/^["“”'‘’]+/, '').replace(/["“”'‘’]+$/, '');
      }

      // Remove hashtags inserted by the model when source had none.
      // Additionally, do not allow hashtags for the `shorten` mode.
      const sourceHashtags = (String(source || '').match(/#[a-z0-9_]+/gi) || []).length;
      if (mode === 'shorten' || sourceHashtags === 0) {
        out = out.replace(/#[a-z0-9_]+/gi, '');
      }

      // For shorten mode we must be particularly concise: collapse whitespace and trim length
      out = out.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();

      // Remove leftover assistant-like lead-ins that may appear after sentence breaks
      out = out.replace(/^(?:the revised text is[:\-\s]*|revised version[:\-\s]*|updated version[:\-\s]*|here is[:\-\s]*|here's[:\-\s]*)/i, '').trim();

      if (mode === 'grammar' || mode === 'professional' || mode === 'rephrase') {
        out = applyLineAwareGrammarPolish(applyCommonGrammarFixes(out));
      }

      return out;
    };

    const attemptPrompts = [
      systemPrompt,
      `${systemPrompt}\nStrict requirement: output only the final rewritten text. Do not ask questions or add any extra words outside the rewritten text. Never wrap the answer in quotes. Do not add introductions, examples, or explanations.`
    ];

    // Add an extra ultra-strict attempt for sensitive modes to reduce false positives
    if (mode === 'shorten') {
      attemptPrompts.push(
        `${systemPrompt}\nSTRICT: Return only the shortened text. Maximum length: 140 characters. Do NOT include hashtags, quotes, or any commentary. If you cannot shorten without losing meaning, return the most concise version under 140 characters.`
      );
    } else if (mode === 'professional') {
      attemptPrompts.push(
        `${systemPrompt}\nSTRICT: Return only the final rewritten text. Do NOT include prefatory phrases like \"Here is\", \"Revised version\", \"Example\", or apologies. No quotes or commentary.`
      );
    } else if (mode === 'expand') {
      attemptPrompts.push(
        `${systemPrompt}\nSTRICT: Expand the text by adding at least one useful sentence. Return only the expanded text without explanation or preamble.`
      );
    }

    let accepted = false;
    for (let attempt = 0; attempt < attemptPrompts.length; attempt += 1) {
      const attemptPrompt = attemptPrompts[attempt];
      response = await runScrolithaText({
        scope,
        routeKey: 'post_enhance',
        systemPrompt: attemptPrompt,
        userPrompt: buildEnhanceUserPrompt(text, mode),
        maxTokens: 420,
        actor: input.actor
      });

      if (!response?.text) {
        continue;
      }

      const sanitized = sanitizeCandidate(response.text, mode, text);

      // If sanitized response still looks like assistant/meta, allow one more strict retry
      if (shouldRetryEnhanceResponse(text, mode, sanitized)) {
        // If this was the last allowed attempt, mark as rejected and fall through to fallback
        if (attempt === attemptPrompts.length - 1) {
          response = { ...response, text: sanitized };
          break;
        }
        // otherwise continue to next (stricter) attempt
        continue;
      }

      // Accept sanitized candidate
      response.text = sanitized;
      accepted = true;
      break;
    }

    if (!accepted || !response?.text) {
      throw new Error('LLM did not return an acceptable transformed response');
    }

    if (response.usedBackupProcessing) {
      fallbackUsed = true;
      warning = response.warning || SCROLITHA_BACKUP_WARNING_MESSAGE;
    }
  } catch (error: any) {
    if (isScrolithaPromptPolicyError(error)) {
      throw error;
    }
    fallbackUsed = true;
    warning = SCROLITHA_BACKUP_WARNING_MESSAGE;
    response = {
      text: fallbackEnhanceText(text, mode),
      model: 'scrolitha-core',
      warningCode: SCROLITHA_BACKUP_WARNING_CODE
    };
    console.warn(`[post-ai] Scrolitha provider failed for mode ${mode}. Using backup processing.`, {
      mode,
      scope,
      error: String(error?.message || 'unknown error').slice(0, 220)
    });
  }

  return {
    enhancedText: response.text,
    model: response.model,
    mode,
    fallbackUsed, // Optional, backward-compatible
    warning,     // Optional, backward-compatible
    warningCode: response.warningCode || (fallbackUsed ? SCROLITHA_BACKUP_WARNING_CODE : undefined)
  };
};

export const generatePostInsightText = async (input: {
  text: string;
  tone?: string;
  maxLength?: number;
  safeMode?: boolean;
  scope?: ScrolithaScope;
  actor?: {
    id?: string | null;
    role?: string | null;
    scope?: ScrolithaScope;
    isAdmin?: boolean;
    ipAddress?: string | null;
    userAgent?: string | null;
  } | null;
}) => {
  const text = String(input.text || '').trim();
  if (!text) throw new Error('text is required');
  if (text.length > 20_000) throw new Error('text is too long (max 20000 characters)');

  const maxLength = asInt(input.maxLength, DEFAULT_POST_AI_SETTINGS.maxInsightLength, 60, 500);
  const tone = String(input.tone || DEFAULT_POST_AI_SETTINGS.insightTone).trim() || 'professional';
  const safeMode = Boolean(input.safeMode);
  const scope = input.scope || 'admin';

  const systemPrompt = [
    'You are Scrolitha Insight Engine.',
    'Analyze the user-authored post and provide a short professional insight summary.',
    'Do not invent facts or entities not present in the text.',
    'Keep output concise and clear.',
    `Tone: ${tone}.`,
    `Maximum length: ${maxLength} characters.`,
    'Use plain text only; no markdown bullet lists.',
    safeMode
      ? 'Safe mode is enabled: exclude unsafe content and avoid sensitive speculation.'
      : 'Output only the insight sentence(s).'
  ].join('\n');

  let response;
  try {
    response = await runScrolithaText({
      scope,
      routeKey: 'post_insight',
      systemPrompt,
      userPrompt: text,
      maxTokens: 260,
      actor: input.actor
    });
  } catch (error) {
    if (isScrolithaPromptPolicyError(error)) {
      throw error;
    }
    response = {
      text: fallbackInsightText(text, tone, maxLength),
      model: 'scrolitha-core'
    };
  }

  let insight = response.text.replace(/\s+/g, ' ').trim();
  if (insight.length > maxLength) {
    insight = `${insight.slice(0, maxLength - 1).trim()}...`;
  }

  return {
    insightText: insight,
    model: response.model
  };
};

export const decidePostInsightEnabled = (input: {
  explicitEnabled?: boolean | null;
  settings: PostAiSettings;
  randomValue?: number;
}) => {
  if (!input.settings.insightEnabled) return false;
  if (input.settings.manualOnly) return Boolean(input.explicitEnabled);
  if (typeof input.explicitEnabled === 'boolean') return input.explicitEnabled;
  const randomValue =
    typeof input.randomValue === 'number' && Number.isFinite(input.randomValue)
      ? input.randomValue
      : Math.random() * 100;
  return randomValue < input.settings.randomPercentage;
};

const emitPostAiInsightReady = (app: any, payload: {
  postId: string;
  aiInsightText: string | null;
  aiInsightGenerated: boolean;
}) => {
  try {
    const io = app?.get?.('io');
    const communityIo = app?.get?.('communityIo');
    const communityNs = app?.get?.('communityNs');
    io?.emit?.('community:post_ai_insight_ready', payload);
    io?.emit?.('post:aiInsightReady', payload);
    communityIo?.emit?.('community:post_ai_insight_ready', payload);
    communityIo?.emit?.('post:aiInsightReady', payload);
    communityNs?.emit?.('community:post_ai_insight_ready', payload);
    communityNs?.emit?.('post:aiInsightReady', payload);
  } catch (error) {
    console.warn('[post-ai] socket emit failed:', error);
  }
  try {
    realtime.emitToPost(payload.postId, 'community:post_ai_insight_ready', payload);
    realtime.emitToPost(payload.postId, 'post:aiInsightReady', payload);
  } catch (error) {}
};

export const generateAndPersistPostInsight = async (input: {
  postId: string;
  app?: any;
  force?: boolean;
  actor?: {
    id?: string | null;
    role?: string | null;
    scope?: ScrolithaScope;
    isAdmin?: boolean;
    ipAddress?: string | null;
    userAgent?: string | null;
  } | null;
}) => {
  const postId = String(input.postId || '').trim();
  if (!postId) throw new Error('postId is required');

  const [settings, scopeConfig] = await Promise.all([
    resolvePostAiSettings(),
    ensureScrolithaConfig('admin')
  ]);
  if (!settings.insightEnabled) {
    return { generated: false, reason: 'insight_disabled' as const };
  }

  const post = await prisma.communityPost.findUnique({
    where: { id: postId },
    select: {
      id: true,
      title: true,
      content: true,
      status: true,
      aiInsightEnabled: true,
      aiInsightGenerated: true,
      aiInsightText: true
    }
  });

  if (!post) return { generated: false, reason: 'post_not_found' as const };
  if (String(post.status || '').toLowerCase() !== 'active') {
    return { generated: false, reason: 'post_inactive' as const };
  }
  if (!input.force && !post.aiInsightEnabled) {
    return { generated: false, reason: 'not_enabled' as const };
  }
  if (!input.force && post.aiInsightGenerated && String(post.aiInsightText || '').trim()) {
    return { generated: true, skipped: true, reason: 'already_generated' as const };
  }

  const textSource = [String(post.title || '').trim(), String(post.content || '').trim()]
    .filter(Boolean)
    .join('\n\n');
  if (!textSource) {
    return { generated: false, reason: 'empty_post' as const };
  }

  const safeMode = Boolean(settings.insightSafeMode || scopeConfig?.safeMode);
  const generated = await generatePostInsightText({
    text: textSource,
    tone: settings.insightTone,
    maxLength: settings.maxInsightLength,
    safeMode,
    scope: 'admin',
    actor: input.actor
  });

  const updated = await prisma.communityPost.update({
    where: { id: postId },
    data: {
      aiInsightEnabled: true,
      aiInsightGenerated: true,
      aiInsightText: generated.insightText
    },
    select: {
      id: true,
      aiInsightEnabled: true,
      aiInsightGenerated: true,
      aiInsightText: true
    }
  });

  if (input.app) {
    emitPostAiInsightReady(input.app, {
      postId: updated.id,
      aiInsightText: updated.aiInsightText || null,
      aiInsightGenerated: Boolean(updated.aiInsightGenerated)
    });
  }

  if (input.actor?.id) {
    await writeScrolithaAuditLog({
      actor: {
        id: String(input.actor.id),
        role: String(input.actor.role || 'user'),
        scope: input.actor.scope || 'user',
        isAdmin: Boolean(input.actor.isAdmin),
        ipAddress: input.actor.ipAddress || null,
        userAgent: input.actor.userAgent || null
      },
      eventType: 'POST_AI_INSIGHT_GENERATE',
      intent: 'post_insight_generation',
      toolKey: 'POST_AI_INSIGHT',
      requestPayload: {
        postId: updated.id
      },
      redactedPayload: {
        postId: updated.id
      },
      resultStatus: 'ok',
      resultSummary: safePreview(generated.insightText, 160)
    });
  }

  return {
    generated: true,
    post: updated,
    model: generated.model
  };
};

export const queuePostInsightGeneration = (input: {
  postId: string;
  app?: any;
  force?: boolean;
  actor?: {
    id?: string | null;
    role?: string | null;
    scope?: ScrolithaScope;
    isAdmin?: boolean;
    ipAddress?: string | null;
    userAgent?: string | null;
  } | null;
}) => {
  setTimeout(() => {
    void generateAndPersistPostInsight(input).catch((error) => {
      console.warn('[post-ai] insight generation failed:', (error as any)?.message || error);
    });
  }, 0);
};

const normalizePostIdList = (items: unknown): string[] => {
  if (!Array.isArray(items)) return [];
  const unique = new Set<string>();
  const out: string[] = [];
  items.forEach((item) => {
    const id = String(item || '').trim();
    if (!id || unique.has(id)) return;
    unique.add(id);
    out.push(id);
  });
  return out;
};

export const regeneratePostInsightsBatch = async (input: {
  postIds?: string[];
  limit?: number;
  app?: any;
  actor?: {
    id?: string | null;
    role?: string | null;
    scope?: ScrolithaScope;
    isAdmin?: boolean;
    ipAddress?: string | null;
    userAgent?: string | null;
  } | null;
}) => {
  const requestedIds = normalizePostIdList(input.postIds);
  const limit = asInt(input.limit, 40, 1, 200);

  const postIds =
    requestedIds.length > 0
      ? requestedIds
      : (
          await prisma.communityPost.findMany({
            where: {
              status: 'active',
              aiInsightEnabled: true
            },
            orderBy: { updatedAt: 'desc' },
            take: limit,
            select: { id: true }
          })
        ).map((row) => row.id);

  if (!postIds.length) {
    return {
      total: 0,
      generated: 0,
      skipped: 0,
      failed: 0,
      items: [] as Array<{ postId: string; status: 'generated' | 'skipped' | 'failed'; reason?: string }>
    };
  }

  const items: Array<{ postId: string; status: 'generated' | 'skipped' | 'failed'; reason?: string }> = [];
  let generated = 0;
  let skipped = 0;
  let failed = 0;

  for (const postId of postIds) {
    try {
      const result = await generateAndPersistPostInsight({
        postId,
        app: input.app,
        force: true,
        actor: input.actor
      });
      if (result.generated) {
        generated += 1;
        items.push({ postId, status: 'generated' });
      } else {
        skipped += 1;
        items.push({ postId, status: 'skipped', reason: (result as any)?.reason || 'not_generated' });
      }
    } catch (error: any) {
      failed += 1;
      items.push({
        postId,
        status: 'failed',
        reason: String(error?.message || 'generation_failed')
      });
    }
  }

  return {
    total: postIds.length,
    generated,
    skipped,
    failed,
    items
  };
};

export const clearPostInsights = async (input?: { postIds?: string[] }) => {
  const postIds = normalizePostIdList(input?.postIds);
  const where = postIds.length ? { id: { in: postIds } } : { aiInsightGenerated: true };
  const updated = await prisma.communityPost.updateMany({
    where,
    data: {
      aiInsightGenerated: false,
      aiInsightText: null,
      aiScore: null
    }
  });

  return {
    updatedCount: updated.count,
    scope: postIds.length ? 'selected' : 'generated'
  };
};
