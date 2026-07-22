/**
 * Phase 33.0 — Scrolitha AI Platform Foundation types.
 * Provider-neutral contracts. Feature modules must not import provider SDKs.
 */

export type AIProviderId = 'OLLAMA' | 'GEMINI' | 'OPENAI' | 'MOCK' | 'DISABLED';

export type AICapabilityId =
  | 'TEXT_SUMMARIZATION'
  | 'TEXT_REWRITING'
  | 'TEXT_CLASSIFICATION'
  | 'STRUCTURED_EXTRACTION'
  | 'NOTIFICATION_SUMMARIZATION'
  | 'NOTIFICATION_PRIORITIZATION'
  | 'CONTENT_SAFETY_ANALYSIS'
  | 'SEMANTIC_SEARCH_PREPARATION';

export type PrivacyLevel =
  | 'PUBLIC'
  | 'INTERNAL'
  | 'PERSONAL'
  | 'SENSITIVE'
  | 'HIGHLY_SENSITIVE'
  | 'PROHIBITED';

export type AIRequestLifecycle =
  | 'REQUESTED'
  | 'VALIDATED'
  | 'CONSENT_CHECKED'
  | 'REDACTED'
  | 'ROUTED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'BLOCKED'
  | 'CANCELLED';

export type SafetyAction = 'ALLOW' | 'REDACT' | 'REFUSE' | 'ESCALATE';

export type AITextRequest = {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  model?: string;
  locale?: string;
};

export type AITextResponse = {
  text: string;
  provider: AIProviderId;
  model: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  latencyMs: number;
  finishReason?: string;
};

export type AIStructuredRequest<T = unknown> = AITextRequest & {
  schemaName: string;
  schemaVersion: string;
  /** JSON Schema-like description for documentation; validation is capability-specific */
  schemaHint?: Record<string, unknown>;
  parse: (raw: string) => T;
  validate: (value: T) => boolean;
};

export type AIStructuredResponse<T = unknown> = {
  data: T;
  rawText: string;
  provider: AIProviderId;
  model: string;
  usage?: AITextResponse['usage'];
  latencyMs: number;
  parseAttempts: number;
};

export type AIEmbeddingRequest = { input: string | string[]; model?: string; timeoutMs?: number };
export type AIEmbeddingResponse = {
  vectors: number[][];
  provider: AIProviderId;
  model: string;
  latencyMs: number;
};

export type AIModerationRequest = { text: string; timeoutMs?: number };
export type AIModerationResponse = {
  allowed: boolean;
  categories: string[];
  provider: AIProviderId;
  model: string;
  latencyMs: number;
};

export type AIProviderHealth = {
  provider: AIProviderId;
  status: 'operational' | 'degraded' | 'unavailable' | 'disabled';
  latencyMs?: number | null;
  checkedAt: string;
  message?: string;
};

export interface AIProvider {
  readonly id: AIProviderId;
  generateText(request: AITextRequest): Promise<AITextResponse>;
  generateStructured<T>(request: AIStructuredRequest<T>): Promise<AIStructuredResponse<T>>;
  embed?(request: AIEmbeddingRequest): Promise<AIEmbeddingResponse>;
  moderate?(request: AIModerationRequest): Promise<AIModerationResponse>;
  healthCheck(): Promise<AIProviderHealth>;
}

export type ModelRouteDecision = {
  provider: AIProviderId;
  model: string;
  reason: string;
  fallbackChain: Array<{ provider: AIProviderId; model: string }>;
  maximumTokens: number;
  timeoutMs: number;
};

export type SafetyDecision = {
  allowed: boolean;
  action: SafetyAction;
  reasons: string[];
  policyVersion: string;
};

export type AIConsentState = {
  aiFeaturesEnabled: boolean;
  privateMessageAnalysisAllowed: boolean;
  personalizationAllowed: boolean;
  externalProviderProcessingAllowed: boolean;
  aiSuggestionsAllowed: boolean;
  aiActivityHistoryEnabled: boolean;
  productImprovementDataAllowed: boolean;
  consentVersion: string;
  updatedAt?: string | null;
};

export const DEFAULT_AI_CONSENT: AIConsentState = {
  aiFeaturesEnabled: false,
  privateMessageAnalysisAllowed: false,
  personalizationAllowed: false,
  externalProviderProcessingAllowed: false,
  aiSuggestionsAllowed: false,
  aiActivityHistoryEnabled: false,
  productImprovementDataAllowed: false,
  consentVersion: '33.0.0',
  updatedAt: null
};

export type ScrolithaAIExecuteInput = {
  capability: AICapabilityId;
  userId?: string | null;
  tenantId?: string | null;
  input: string | Record<string, unknown>;
  context?: Record<string, unknown> | null;
  /** When true, attempt structured parse via capability schema */
  structured?: boolean;
  locale?: string | null;
  policy?: {
    privacyLevel?: PrivacyLevel;
    preferInternalProvider?: boolean;
    allowCache?: boolean;
    maxTokens?: number;
    timeoutMs?: number;
  };
  metadata?: Record<string, unknown> | null;
  correlationId?: string | null;
  /** Force no network provider calls (tests / hard rules) */
  dryRun?: boolean;
};

export type ScrolithaAIExecuteResult<T = unknown> = {
  ok: boolean;
  lifecycle: AIRequestLifecycle;
  blocked?: boolean;
  reason?: string;
  text?: string;
  data?: T;
  disclosure?: {
    generatedByAI: boolean;
    provider: string;
    model: string;
    promptVersion: string;
    generatedAt: string;
  };
  safety?: SafetyDecision;
  route?: ModelRouteDecision;
  privacyLevel?: PrivacyLevel;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number; estimatedCostUsd?: number };
  latencyMs: number;
  correlationId: string;
  requestId?: string | null;
  cacheHit?: boolean;
};

export type AIFeatureFlags = {
  masterEnabled: boolean;
  killSwitch: boolean;
  enableProviderCalls: boolean;
  TEXT_SUMMARIZATION: boolean;
  TEXT_REWRITING: boolean;
  TEXT_CLASSIFICATION: boolean;
  STRUCTURED_EXTRACTION: boolean;
  NOTIFICATION_SUMMARIZATION: boolean;
  NOTIFICATION_PRIORITIZATION: boolean;
  CONTENT_SAFETY_ANALYSIS: boolean;
  SEMANTIC_SEARCH_PREPARATION: boolean;
  notificationAiHooks: boolean;
};

/** Privacy-preserving defaults — all AI features off */
export const DEFAULT_AI_FEATURE_FLAGS: AIFeatureFlags = {
  masterEnabled: false,
  killSwitch: false,
  enableProviderCalls: false,
  TEXT_SUMMARIZATION: false,
  TEXT_REWRITING: false,
  TEXT_CLASSIFICATION: false,
  STRUCTURED_EXTRACTION: false,
  NOTIFICATION_SUMMARIZATION: false,
  NOTIFICATION_PRIORITIZATION: false,
  CONTENT_SAFETY_ANALYSIS: false,
  SEMANTIC_SEARCH_PREPARATION: false,
  notificationAiHooks: false
};

export const FOUNDATION_CAPABILITIES: AICapabilityId[] = [
  'TEXT_SUMMARIZATION',
  'TEXT_REWRITING',
  'TEXT_CLASSIFICATION',
  'STRUCTURED_EXTRACTION',
  'NOTIFICATION_SUMMARIZATION',
  'NOTIFICATION_PRIORITIZATION',
  'CONTENT_SAFETY_ANALYSIS',
  'SEMANTIC_SEARCH_PREPARATION'
];

export const CONSENT_VERSION = '33.0.0';
export const SAFETY_POLICY_VERSION = '33.0.0';
export const AI_PLATFORM_SCHEMA_VERSION = '33.0';
