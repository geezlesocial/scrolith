/**
 * Intelligent context ranking — send only highest-value context to the model.
 */
import type { GraphNode, PlatformGraphSnapshot } from './scrolitha.platformGraph';

export type RankedContextItem = {
  id: string;
  type: string;
  label: string;
  text: string;
  score: number;
  factors: {
    relevance: number;
    recency: number;
    authority: number;
    permissionSafe: number;
    confidence: number;
  };
  sourceLabel: string;
};

export type RankedContextBundle = {
  items: RankedContextItem[];
  promptBlock: string;
  droppedCount: number;
  totalCandidates: number;
  rankingVersion: 'v1';
};

const text = (v: unknown) => String(v || '').trim();
const lower = (v: unknown) => text(v).toLowerCase();

const tokenize = (value: string) =>
  lower(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);

const relevanceScore = (query: string, body: string) => {
  const q = new Set(tokenize(query));
  if (!q.size) return 0.4;
  const b = tokenize(body);
  if (!b.length) return 0.2;
  let hits = 0;
  for (const token of b) if (q.has(token)) hits += 1;
  return Math.max(0.1, Math.min(1, hits / Math.max(3, q.size)));
};

const authorityForType = (type: string) => {
  switch (type) {
    case 'company':
      return 0.85;
    case 'user':
      return 0.75;
    case 'job':
    case 'gig':
      return 0.7;
    case 'community':
      return 0.65;
    case 'post':
      return 0.55;
    case 'comment':
      return 0.4;
    case 'skill':
      return 0.5;
    case 'session':
      return 0.45;
    case 'knowledge':
      return 0.6;
    default:
      return 0.4;
  }
};

const sourceLabelForType = (type: string) => {
  switch (type) {
    case 'company':
      return 'Public company page';
    case 'user':
      return 'Scrolith public profile';
    case 'job':
      return 'Public job information';
    case 'gig':
      return 'Public service listing';
    case 'community':
      return 'Community metadata';
    case 'post':
      return 'Public post';
    case 'comment':
      return 'Public comment';
    case 'knowledge':
      return 'Official Scrolith platform knowledge';
    case 'session':
      return 'Session conversation memory';
    default:
      return 'Platform context';
  }
};

export const rankContextItems = (input: {
  question: string;
  graph?: PlatformGraphSnapshot | null;
  sessionPrompt?: string;
  platformKnowledge?: string;
  maxItems?: number;
  maxPromptChars?: number;
}): RankedContextBundle => {
  const maxItems = Math.max(3, Math.min(12, Number(input.maxItems) || 8));
  const maxPromptChars = Math.max(800, Math.min(6000, Number(input.maxPromptChars) || 2800));
  const candidates: RankedContextItem[] = [];

  const pushNode = (node: GraphNode, recency = 0.5) => {
    const body = `${node.label} ${node.summary || ''} ${JSON.stringify(node.publicFields || {})}`;
    const relevance = relevanceScore(input.question, body);
    const authority = authorityForType(node.type);
    const permissionSafe = 1; // graph already permission-filtered
    const confidence = Math.min(1, (relevance + authority) / 2);
    const score =
      relevance * 0.4 + recency * 0.15 + authority * 0.25 + permissionSafe * 0.1 + confidence * 0.1;
    candidates.push({
      id: `${node.type}:${node.id}`,
      type: node.type,
      label: node.label,
      text: text(node.summary || node.label).slice(0, 400),
      score,
      factors: { relevance, recency, authority, permissionSafe, confidence },
      sourceLabel: sourceLabelForType(node.type)
    });
  };

  for (const node of input.graph?.nodes || []) {
    const recency = node.type === 'comment' ? 0.7 : node.type === 'post' ? 0.65 : 0.5;
    pushNode(node, recency);
  }

  if (input.sessionPrompt) {
    const relevance = relevanceScore(input.question, input.sessionPrompt);
    candidates.push({
      id: 'session:memory',
      type: 'session',
      label: 'Session memory',
      text: input.sessionPrompt.slice(0, 500),
      score: relevance * 0.45 + 0.35,
      factors: {
        relevance,
        recency: 0.9,
        authority: 0.4,
        permissionSafe: 1,
        confidence: relevance
      },
      sourceLabel: sourceLabelForType('session')
    });
  }

  if (input.platformKnowledge) {
    const relevance = relevanceScore(input.question, input.platformKnowledge);
    candidates.push({
      id: 'knowledge:platform',
      type: 'knowledge',
      label: 'Platform knowledge',
      text: input.platformKnowledge.slice(0, 400),
      score: relevance * 0.35 + 0.4,
      factors: {
        relevance,
        recency: 0.2,
        authority: 0.7,
        permissionSafe: 1,
        confidence: 0.6
      },
      sourceLabel: sourceLabelForType('knowledge')
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const selected = candidates.slice(0, maxItems);

  const lines: string[] = ['Ranked context (highest value first):'];
  for (const item of selected) {
    lines.push(
      `- [${item.type} score=${item.score.toFixed(2)} auth=${item.factors.authority.toFixed(2)} rel=${item.factors.relevance.toFixed(
        2
      )}] ${item.label}: ${item.text}`
    );
  }
  let promptBlock = lines.join('\n');
  if (promptBlock.length > maxPromptChars) {
    promptBlock = `${promptBlock.slice(0, maxPromptChars - 1)}…`;
  }

  return {
    items: selected,
    promptBlock,
    droppedCount: Math.max(0, candidates.length - selected.length),
    totalCandidates: candidates.length,
    rankingVersion: 'v1'
  };
};
