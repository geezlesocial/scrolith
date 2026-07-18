import type { Application } from 'express';

export type ScrolithaScope = 'user' | 'admin';

export type ScrolithaActor = {
  id: string;
  role: string;
  scope: ScrolithaScope;
  isAdmin: boolean;
  /** Optional identity for internal allowlist matching (never required for public master). */
  email?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type ScrolithaToolExecutionResult = {
  success: boolean;
  result: any;
  emittedEvents?: string[];
  resultSummary?: string;
  deepLink?: string | null;
};

export type ScrolithaToolContext = {
  actor: ScrolithaActor;
  app?: Application;
  conversationId?: string;
  actionPlanId?: string;
};

/** Phase 20.7.1 — tool risk / activation class */
export type ScrolithaToolRiskClass =
  | 'read_only'
  | 'draft'
  | 'write'
  | 'destructive'
  | 'administrative';

export type ScrolithaToolDefinition = {
  key: string;
  description: string;
  scope: ScrolithaScope;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  endpoint: string;
  roleScope?: string[];
  requiresConfirmation?: boolean;
  destructive?: boolean;
  /** Phase 20.7.1: explicit risk class for rollout gates */
  riskClass?: ScrolithaToolRiskClass;
  /** When true, tool may run in messaging assistant without extra toolExecution flag (read-only defaults). */
  messagingSafe?: boolean;
  redactedFields?: string[];
  execute: (params: Record<string, any>, context: ScrolithaToolContext) => Promise<ScrolithaToolExecutionResult>;
};

export type ScrolithaAgentStepPreview = {
  index: number;
  type: string;
  mode: 'fetch' | 'preview' | 'execute' | 'confirm' | 'other';
  toolKey?: string | null;
  summary: string;
  requiresConfirmation: boolean;
};

export type ScrolithaAgentPlanPreview = {
  mode: 'skill';
  skillId?: string | null;
  skillKey: string;
  skillName?: string | null;
  stepCount: number;
  executableStepCount: number;
  steps: ScrolithaAgentStepPreview[];
};

export type ScrolithaPlanSuggestion = {
  actionKey: string;
  toolKey: string;
  summary: string;
  paramsPreview?: Record<string, any>;
  draftChanges?: Record<string, any>;
  agent?: ScrolithaAgentPlanPreview | null;
};

export type ScrolithaChatInput = {
  message: unknown;
  context?: {
    page?: string;
    entityId?: string;
    surface?: string;
    accountType?: string;
    userName?: string;
    userRole?: string;
    userId?: string;
    locale?: string;
    source?: string;
    route?: string;
    [key: string]: unknown;
  };
  conversationId?: unknown;
};

export type ScrolithaExecuteInput = {
  actionId: unknown;
  confirmed: unknown;
  params?: Record<string, any>;
  /** Phase 20.7.1 single-use confirmation token */
  confirmationToken?: unknown;
};

export type ScrolithaFeedbackInput = {
  conversationId: unknown;
  rating: unknown;
  note?: unknown;
};
