/**
 * Enterprise prompt orchestration — independently testable stages.
 */
export type PromptStageId =
  | 'system'
  | 'user'
  | 'platform'
  | 'permission'
  | 'graph'
  | 'memory'
  | 'evidence'
  | 'task';

export type PromptStage = {
  id: PromptStageId;
  title: string;
  content: string;
  required: boolean;
  maxChars: number;
  order: number;
};

export type AssembledPrompt = {
  stages: PromptStage[];
  systemPrompt: string;
  userPrompt: string;
  tokenEstimate: number;
  includedStageIds: PromptStageId[];
  omittedStageIds: PromptStageId[];
};

const text = (v: unknown) => String(v || '').trim();

const truncate = (value: string, max: number) => {
  const s = String(value || '');
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
};

export const buildPromptStage = (
  id: PromptStageId,
  content: string,
  opts?: Partial<Pick<PromptStage, 'required' | 'maxChars' | 'order' | 'title'>>
): PromptStage => {
  const defaults: Record<PromptStageId, { title: string; order: number; maxChars: number; required: boolean }> = {
    system: { title: 'System context', order: 10, maxChars: 2500, required: true },
    user: { title: 'User context', order: 20, maxChars: 1500, required: true },
    platform: { title: 'Platform context', order: 30, maxChars: 1200, required: false },
    permission: { title: 'Permission context', order: 40, maxChars: 600, required: true },
    graph: { title: 'Graph context', order: 50, maxChars: 2200, required: false },
    memory: { title: 'Conversation memory', order: 60, maxChars: 1200, required: false },
    evidence: { title: 'Ranked evidence', order: 70, maxChars: 2200, required: false },
    task: { title: 'Task instruction', order: 80, maxChars: 800, required: true }
  };
  const d = defaults[id];
  return {
    id,
    title: opts?.title || d.title,
    content: text(content),
    required: opts?.required ?? d.required,
    maxChars: opts?.maxChars ?? d.maxChars,
    order: opts?.order ?? d.order
  };
};

export const assemblePrompt = (
  stagesInput: PromptStage[],
  opts?: { maxTotalChars?: number }
): AssembledPrompt => {
  const maxTotal = Math.max(2000, Math.min(12000, Number(opts?.maxTotalChars) || 7000));
  const stages = [...stagesInput].sort((a, b) => a.order - b.order);
  const included: PromptStage[] = [];
  const omitted: PromptStageId[] = [];
  let used = 0;

  for (const stage of stages) {
    const content = truncate(stage.content, stage.maxChars);
    if (!content) {
      if (stage.required) {
        included.push({ ...stage, content: `[${stage.title} unavailable]` });
        used += 32;
      } else {
        omitted.push(stage.id);
      }
      continue;
    }
    if (!stage.required && used + content.length > maxTotal) {
      omitted.push(stage.id);
      continue;
    }
    const slice =
      used + content.length > maxTotal ? truncate(content, Math.max(80, maxTotal - used)) : content;
    included.push({ ...stage, content: slice });
    used += slice.length;
  }

  const systemParts = included
    .filter((s) => s.id === 'system' || s.id === 'permission' || s.id === 'platform')
    .map((s) => `## ${s.title}\n${s.content}`);
  const userParts = included
    .filter((s) => !['system', 'permission', 'platform'].includes(s.id))
    .map((s) => `## ${s.title}\n${s.content}`);

  const systemPrompt = systemParts.join('\n\n');
  const userPrompt = userParts.join('\n\n');
  const tokenEstimate = Math.ceil((systemPrompt.length + userPrompt.length) / 4);

  return {
    stages: included,
    systemPrompt,
    userPrompt,
    tokenEstimate,
    includedStageIds: included.map((s) => s.id),
    omittedStageIds: omitted
  };
};

export const buildStandardIntelligencePrompt = (input: {
  systemRules: string;
  userQuestion: string;
  platformKnowledge?: string;
  permissionNote?: string;
  graphContext?: string;
  memory?: string;
  rankedEvidence?: string;
  task?: string;
}): AssembledPrompt => {
  return assemblePrompt([
    buildPromptStage('system', input.systemRules),
    buildPromptStage(
      'permission',
      input.permissionNote ||
        'Only use permission-safe public/authorized context. Never invent private data. Never claim web search.'
    ),
    buildPromptStage('platform', input.platformKnowledge || ''),
    buildPromptStage('graph', input.graphContext || ''),
    buildPromptStage('memory', input.memory || ''),
    buildPromptStage('evidence', input.rankedEvidence || ''),
    buildPromptStage('user', input.userQuestion),
    buildPromptStage(
      'task',
      input.task ||
        'Answer clearly, hedge when confidence is low, cite only provided evidence categories, return user-facing text only.'
    )
  ]);
};
