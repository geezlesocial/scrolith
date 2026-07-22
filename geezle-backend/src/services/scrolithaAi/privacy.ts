/**
 * Phase 33.0 — Privacy classification + data minimization / redaction.
 */
import type { PrivacyLevel, ScrolithaAIExecuteInput } from './types';

const SECRET_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /sk-[a-zA-Z0-9]{20,}/g, label: '[REDACTED_API_KEY]' },
  { re: /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, label: '[REDACTED_BEARER]' },
  { re: /password\s*[:=]\s*\S+/gi, label: 'password:[REDACTED]' },
  { re: /api[_-]?key\s*[:=]\s*\S+/gi, label: 'api_key:[REDACTED]' },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, label: '[REDACTED_PRIVATE_KEY]' },
  { re: /\b\d{13,19}\b/g, label: '[REDACTED_CARD_LIKE]' },
  { re: /\bcv[vc]\s*[:=]?\s*\d{3,4}\b/gi, label: '[REDACTED_CVV]' },
  { re: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, label: '[REDACTED_JWT]' }
];

const PROHIBITED_HINTS =
  /\b(jwt_secret|database_url|private[_-]?key|ssn|social.?security|mfa.?seed|recovery.?codes?)\b/i;

export function classifyPrivacy(
  input: ScrolithaAIExecuteInput,
  explicit?: PrivacyLevel | null
): PrivacyLevel {
  if (explicit) return explicit;
  const text = flattenInput(input.input) + ' ' + JSON.stringify(input.context || {});
  if (PROHIBITED_HINTS.test(text) || /authentication secrets?/i.test(text)) return 'PROHIBITED';
  if (/\b(wallet|payment|iban|routing number|credit card|bank account)\b/i.test(text)) {
    return 'HIGHLY_SENSITIVE';
  }
  if (input.capability === 'NOTIFICATION_SUMMARIZATION' || input.capability === 'NOTIFICATION_PRIORITIZATION') {
    return 'PERSONAL';
  }
  if (/\b(private message|dm|direct message|conversation)\b/i.test(text)) return 'SENSITIVE';
  if (/\b(email|phone|address)\b/i.test(text)) return 'PERSONAL';
  if (/\b(internal|admin|staff only)\b/i.test(text)) return 'INTERNAL';
  return 'PUBLIC';
}

export function flattenInput(input: string | Record<string, unknown>): string {
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

export function redactText(text: string, maxChars = 12_000): { text: string; redacted: boolean } {
  let out = String(text || '');
  let redacted = false;
  for (const { re, label } of SECRET_PATTERNS) {
    if (re.test(out)) {
      redacted = true;
      out = out.replace(re, label);
    }
  }
  // strip common secret field names from JSON-ish payloads
  const fieldRedact = out.replace(
    /"(password|token|accessToken|refreshToken|secret|apiKey|authorization)"\s*:\s*"[^"]*"/gi,
    '"$1":"[REDACTED]"'
  );
  if (fieldRedact !== out) {
    redacted = true;
    out = fieldRedact;
  }
  if (out.length > maxChars) {
    out = out.slice(0, maxChars) + '\n[TRUNCATED]';
    redacted = true;
  }
  return { text: out, redacted };
}

export function minimizeContext(
  context: Record<string, unknown> | null | undefined,
  privacy: PrivacyLevel
): Record<string, unknown> {
  if (!context) return {};
  const drop = new Set([
    'password',
    'token',
    'accessToken',
    'refreshToken',
    'secret',
    'apiKey',
    'authorization',
    'cookie',
    'jwt'
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(context)) {
    if (drop.has(k) || /secret|password|token/i.test(k)) continue;
    if (privacy === 'HIGHLY_SENSITIVE' && /email|phone|address|ssn/i.test(k)) continue;
    if (typeof v === 'string') {
      out[k] = redactText(v, 2000).text;
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = minimizeContext(v as Record<string, unknown>, privacy);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** External providers (OpenAI/Gemini) forbidden for sensitive+ without consent */
export function externalProviderAllowedForPrivacy(
  level: PrivacyLevel,
  externalConsent: boolean
): boolean {
  if (level === 'PROHIBITED') return false;
  if (level === 'HIGHLY_SENSITIVE') return false;
  if (level === 'SENSITIVE') return Boolean(externalConsent);
  return true;
}
