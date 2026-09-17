/**
 * Phase 33.3 — Scrolitha Native Intelligence provider.
 * Local deterministic / heuristic reasoning — no external network.
 * Primary path before Ollama / Gemini / OpenAI.
 */
import type {
  AIProvider,
  AIProviderHealth,
  AIStructuredRequest,
  AIStructuredResponse,
  AITextRequest,
  AITextResponse
} from '../types';

function detectIntentLocal(text: string): { intent: string; confidence: number; tasks: string[] } {
  const t = String(text || '').toLowerCase();
  // Domain intents first (order matters)
  const rules: Array<{ re: RegExp; intent: string; tasks: string[] }> = [
    { re: /\b(summarize|summary|summarise|tl;dr|tldr)\b/, intent: 'summarize', tasks: ['summarize'] },
    { re: /\b(rewrite|rephrase|improve writing)\b/, intent: 'rewrite', tasks: ['rewrite'] },
    { re: /\b(translate|translation)\b/, intent: 'translate', tasks: ['translate'] },
    { re: /\b(job|jobs|hiring|career|resume|cover letter)\b/, intent: 'jobs', tasks: ['draft_job', 'search_jobs'] },
    { re: /\b(marketplace|gig|product|listing)\b/, intent: 'marketplace', tasks: ['draft_listing', 'search_marketplace'] },
    { re: /\b(community|group|forum)\b/, intent: 'community', tasks: ['recommend_community'] },
    { re: /\b(notif|inbox|alert)\b/, intent: 'notifications', tasks: ['summarize_notifications', 'prioritize'] },
    { re: /\b(recommend|suggest|discover)\b/, intent: 'recommend', tasks: ['recommend'] },
    { re: /\b(plan|steps|workflow|how do i)\b/, intent: 'plan', tasks: ['task_plan'] },
    { re: /\b(feed|ranking|timeline)\b/, intent: 'feed', tasks: ['feed_reason'] },
    { re: /\b(message|dm|chat)\b/, intent: 'messaging', tasks: ['draft_message'] },
    { re: /\b(profile|bio)\b/, intent: 'profile', tasks: ['draft_bio'] },
    { re: /\b(business|company page|announcement)\b/, intent: 'business', tasks: ['draft_announcement'] },
    { re: /\b(recruit|candidate|hire)\b/, intent: 'recruiting', tasks: ['recruiter_assist'] },
    { re: /\b(analytics|metrics|dashboard)\b/, intent: 'analytics', tasks: ['analytics_hint'] },
    { re: /\b(search|find|look for)\b/, intent: 'search', tasks: ['expand_query'] }
  ];
  for (const r of rules) {
    if (r.re.test(t)) return { intent: r.intent, confidence: 0.78, tasks: r.tasks };
  }
  return { intent: 'general', confidence: 0.45, tasks: ['assist'] };
}

function summarizeLocal(text: string, maxSentences = 3): string {
  const clean = String(text || '')
    .replace(/<<<UNTRUSTED_USER_CONTENT>>>|<<<END_UNTRUSTED_USER_CONTENT>>>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '[Scrolitha Native] No content to summarize.';
  const sentences = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length <= maxSentences) return `[Scrolitha Native summary] ${clean.slice(0, 800)}`;
  return `[Scrolitha Native summary] ${sentences.slice(0, maxSentences).join(' ')}`;
}

function rewriteLocal(text: string, mode: string): string {
  const body = String(text || '').replace(/<<<UNTRUSTED_USER_CONTENT>>>|<<<END_UNTRUSTED_USER_CONTENT>>>/g, '').trim();
  if (mode.includes('bullet')) {
    const parts = body.split(/[,;.]/).map((p) => p.trim()).filter((p) => p.length > 2).slice(0, 8);
    return parts.map((p) => `• ${p}`).join('\n');
  }
  if (mode.includes('short')) {
    return body.split(/\s+/).slice(0, 40).join(' ') + (body.split(/\s+/).length > 40 ? '…' : '');
  }
  if (mode.includes('professional') || mode.includes('formal')) {
    return `[Professional draft] ${body.replace(/\b(gonna|wanna|kinda)\b/gi, (m) =>
      m.toLowerCase() === 'gonna' ? 'going to' : m.toLowerCase() === 'wanna' ? 'want to' : 'somewhat'
    )}`;
  }
  return `[Scrolitha Native rewrite] ${body}`;
}

function planLocal(text: string): string {
  const intent = detectIntentLocal(text);
  const steps = [
    `1. Clarify goal (${intent.intent}).`,
    '2. Gather only necessary context (privacy-preserving).',
    '3. Produce a draft suggestion for you to review.',
    '4. You approve, edit, or discard — Scrolitha never acts autonomously.'
  ];
  if (intent.tasks.includes('search_jobs')) {
    steps.splice(2, 0, '2b. Suggest search queries (you run search).');
  }
  return [
    `[Scrolitha Native plan] Intent: ${intent.intent} (confidence ${intent.confidence})`,
    ...steps,
    '',
    'Suggested skills: ' + intent.tasks.join(', ')
  ].join('\n');
}

function keywordsLocal(text: string): string {
  const stopWords = new Set(
    'a an and are as at be building by for from in into is of on or the their this to with'.split(' ')
  );
  const words = String(text || '')
    .replace(/<<<UNTRUSTED_USER_CONTENT>>>|<<<END_UNTRUSTED_USER_CONTENT>>>/g, '')
    .match(/[A-Za-z][A-Za-z0-9+#.-]{2,}/g) || [];
  const unique = Array.from(new Set(words.map((word) => word.trim())))
    .filter((word) => !stopWords.has(word.toLowerCase()))
    .slice(0, 12);
  return unique.join(', ');
}

function copilotLocal(system: string, user: string): string {
  const surface = /surface[=:]\s*([a-z_]+)/i.exec(system + user)?.[1] || 'generic';
  const intent = detectIntentLocal(user);
  return [
    `[Scrolitha Copilot · ${surface}]`,
    `I understand this as: ${intent.intent}.`,
    'Suggestions (draft only — nothing is published or sent):',
    `• Focus on: ${intent.tasks.slice(0, 3).join(', ') || 'general assistance'}`,
    '• Ask me to rewrite, summarize, or draft copy for this page.',
    '• I can recommend next steps but will not take actions for you.',
    '',
    user.length > 20 ? summarizeLocal(user, 2) : 'Tell me what you want help with on this screen.'
  ].join('\n');
}

export class NativeAIProvider implements AIProvider {
  readonly id = 'NATIVE' as const;

  async generateText(request: AITextRequest): Promise<AITextResponse> {
    const started = Date.now();
    const system = request.messages.find((m) => m.role === 'system')?.content || '';
    const user = request.messages
      .filter((m) => m.role === 'user')
      .map((m) => m.content)
      .join('\n\n');
    const combined = `${system}\n${user}`.toLowerCase();

    let text: string;
    if (/intent|detect intent|classify intent/i.test(system) || /intent detection/i.test(user)) {
      const d = detectIntentLocal(user);
      text = JSON.stringify(d);
    } else if (/task plan|workflow|plan steps/i.test(system) || /\bplan\b/i.test(user)) {
      text = planLocal(user);
    } else if (/copilot|contextual assist/i.test(system) || /surface=/i.test(user)) {
      text = copilotLocal(system, user);
    } else if (/summar/i.test(system) || /summar/i.test(user)) {
      text = summarizeLocal(user);
    } else if (/keyword|skills|seo/i.test(system + user)) {
      text = keywordsLocal(user);
    } else if (/rewrite|composer|draft/i.test(system) || /rewrite/i.test(user)) {
      text = rewriteLocal(user, system + user);
    } else if (/classif/i.test(system)) {
      const d = detectIntentLocal(user);
      text = `label=${d.intent} confidence=${d.confidence}`;
    } else if (/search|query expand|semantic/i.test(system)) {
      const q = user.replace(/^[\s\S]*?:\n\n/, '').trim().slice(0, 120);
      text = [q, `${q} remote`, `${q} scrolith`, `best ${q}`].join('\n');
    } else if (/recommend|why am i seeing/i.test(system)) {
      text = 'Recommended based on your disclosed interests and recent platform activity (suggestion only).';
    } else if (/skill|orchestrat|tool plan/i.test(system)) {
      const d = detectIntentLocal(user);
      text = JSON.stringify({
        skillHints: d.tasks,
        tools: d.tasks.includes('search_jobs')
          ? ['search_suggest', 'recommend']
          : d.tasks.includes('summarize_notifications')
            ? ['notification_priority_suggest']
            : ['memory_read'],
        autonomous: false
      });
    } else {
      const d = detectIntentLocal(user);
      text = [
        `[Scrolitha Native] Intent: ${d.intent}`,
        summarizeLocal(user, 2),
        'This response used native Scrolitha intelligence (no external model). Review before acting.'
      ].join('\n\n');
    }

    return {
      text,
      provider: 'NATIVE',
      model: request.model || 'scrolitha-native-33.3',
      usage: {
        promptTokens: Math.ceil((system.length + user.length) / 4),
        completionTokens: Math.ceil(text.length / 4),
        totalTokens: Math.ceil((system.length + user.length + text.length) / 4)
      },
      latencyMs: Date.now() - started,
      finishReason: 'stop'
    };
  }

  async generateStructured<T>(request: AIStructuredRequest<T>): Promise<AIStructuredResponse<T>> {
    const raw = await this.generateText(request);
    try {
      const data = request.parse(raw.text);
      if (!request.validate(data)) throw new Error('invalid');
      return {
        data,
        rawText: raw.text,
        provider: 'NATIVE',
        model: raw.model,
        usage: raw.usage,
        latencyMs: raw.latencyMs,
        parseAttempts: 1
      };
    } catch {
      return {
        data: request.parse('{}') as T,
        rawText: raw.text,
        provider: 'NATIVE',
        model: raw.model,
        usage: raw.usage,
        latencyMs: raw.latencyMs,
        parseAttempts: 2
      };
    }
  }

  async healthCheck(): Promise<AIProviderHealth> {
    return {
      provider: 'NATIVE',
      status: 'operational',
      latencyMs: 0,
      checkedAt: new Date().toISOString(),
      message: 'Scrolitha native intelligence (local, no network)'
    };
  }
}

export const nativeProvider = new NativeAIProvider();
export { detectIntentLocal, summarizeLocal, rewriteLocal, planLocal };
export default nativeProvider;
