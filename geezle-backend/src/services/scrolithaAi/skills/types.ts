/**
 * Phase 33.3 — Skill framework contracts.
 */
import type { CopilotSurface, ScrolithaSkillId } from '../types';

export type SkillContext = {
  userId: string;
  surface: CopilotSurface;
  locale?: string;
  pagePath?: string;
  entityId?: string | null;
  entityType?: string | null;
  memoryTopics?: string[];
  recentActions?: string[];
  workspaceHint?: string | null;
};

export type SkillSuggestion = {
  id: string;
  title: string;
  body: string;
  kind: 'tip' | 'draft' | 'action_hint' | 'explanation' | 'search' | 'recommend';
  /** Never executable by AI — user must act */
  requiresUserAction: true;
  hrefHint?: string;
  skillId: ScrolithaSkillId;
};

export type SkillResult = {
  skillId: ScrolithaSkillId;
  ok: boolean;
  suggestions: SkillSuggestion[];
  plan?: string[];
  reason?: string;
  usedNative: boolean;
};

export interface ScrolithaSkill {
  readonly id: ScrolithaSkillId;
  readonly surfaces: CopilotSurface[];
  canHandle(input: { message: string; context: SkillContext }): boolean;
  run(input: { message: string; context: SkillContext }): Promise<SkillResult>;
}
