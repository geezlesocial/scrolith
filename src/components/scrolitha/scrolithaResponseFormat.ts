import { repairScrolithaText } from '../../utils/scrolithaBranding';

const META_PREFIXES = [
  'scrolith platform summary',
  'scrolith knowledge baseline',
  'overview',
  'core services',
  'freelancer capabilities',
  'employer/client capabilities',
  'primary platform strengths',
  'audience-specific guidance',
  'operational guardrails',
  'question',
  'context',
  'audience',
  'response format',
  'output format',
  'tone',
  'style',
  'prompt',
  'instruction',
  'task',
  'mode',
  'rules',
  'requested output style',
  'return only the final answer',
  'return only the guide content',
  'create a structured guide',
  'use short headings'
];
const KNOWLEDGE_DUMP_PHRASES = [
  'marketplace for gigs, jobs, proposals, and project briefs',
  'community and homepage feeds for content, engagement, recommendations, and professional discovery',
  'uploaded files module for centralized asset management and attachment reuse',
  'role-aware dashboards for freelancers, clients/employers, moderators, and admins',
  'real-time messaging, notifications, and collaboration with file-sharing support'
];

const INLINE_SECTION_LABELS = [
  'Executive summary',
  'Summary',
  'Positioning summary',
  'Growth summary',
  'Shortlist checklist',
  'Ideal candidate profile',
  'Scope notes',
  'Immediate next steps',
  'Recommended hiring move',
  'Value proposition',
  'Key differentiators',
  'Client-facing pitch',
  'Recommended profile upgrade',
  'Recommended approach',
  'Priority actions',
  'Risks to watch',
  'Next steps',
  'Key considerations',
  'Recommended next move',
  'Overview',
  'Objective',
  'Preparation',
  'Execution plan',
  'Metrics and signals',
  'Recommended next step'
];

const ANSWER_START_RE =
  /^(scrolith(a)?\s+)?(summary|answer|response|recommended approach|immediate next steps|final recommendation|scrolith advantage|scrolith hiring plan|scrolith positioning draft|plan|analysis|recommendation)\b/i;

const HEADING_RE = /^(#{1,3}\s+)?[A-Z][A-Za-z0-9\s&/-]{2,80}:?$/;

const compactWhitespace = (value: string) =>
  String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const shouldSplitPipeLine = (line: string) => line.includes('|') && line.length >= 80 && line.split('|').length >= 3;

const stripPromptLabel = (line: string) => line.replace(/^[#>*\-\s]+/, '').trim();

const isMetaLine = (line: string) => {
  const normalized = stripPromptLabel(line).toLowerCase();
  return META_PREFIXES.some((prefix) => {
    if (normalized === prefix) return true;
    if (!normalized.includes(prefix)) return false;
    if (normalized.startsWith(prefix)) return true;
    const tail = normalized.slice(prefix.length, prefix.length + 3);
    return /^[:|\-\s]/.test(tail);
  });
};

const isAnswerStart = (line: string) => ANSWER_START_RE.test(stripPromptLabel(line));

const isStructuralLine = (line: string) => {
  const normalized = stripPromptLabel(line);
  if (!normalized) return false;
  if (HEADING_RE.test(normalized)) return true;
  if (/^\d+[\).]\s+/.test(normalized)) return true;
  if (/^[-•]\s+/.test(normalized)) return true;
  return false;
};

const normalizeBulletLine = (line: string) => {
  const normalized = stripPromptLabel(line);
  if (!normalized) return '';
  if (/^\d+[\).]\s+/.test(normalized)) return `- ${normalized.replace(/^\d+[\).]\s+/, '')}`;
  if (/^[-•]\s+/.test(normalized)) return `- ${normalized.replace(/^[-•]\s+/, '')}`;
  return normalized;
};

const splitSentences = (line: string) =>
  line
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/g)
    .map((part) => part.trim())
    .filter(Boolean);

const inlineSectionPattern = new RegExp(`\\b(${INLINE_SECTION_LABELS.join('|').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}):\\s*`, 'gi');

const normalizeInlineSections = (value: string) =>
  String(value || '')
    .replace(inlineSectionPattern, (_match, label) => `\n\n${label}:\n`)
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const hasStructuredShape = (value: string) => /(^|\n)(#{1,3}\s+|[A-Z][A-Za-z0-9\s&/-]{2,80}:$|-\s+)/m.test(value);
const looksLikeKnowledgeDump = (value: string) =>
  KNOWLEDGE_DUMP_PHRASES.filter((phrase) => String(value || '').toLowerCase().includes(phrase)).length >= 2;

const structureLongNarrative = (value: string) => {
  const collapsed = String(value || '').replace(/\n+/g, ' ').trim();
  if (!collapsed) return '';
  const sentences = splitSentences(collapsed);
  if (sentences.length < 3) return value;

  const summary = sentences[0];
  const bullets = sentences.slice(1, 7);
  const lastSentence = sentences[sentences.length - 1];

  return [
    'Executive summary',
    summary,
    '',
    'Recommended approach',
    ...bullets.map((sentence) => `- ${sentence}`),
    '',
    'Recommended next step',
    lastSentence
  ]
    .filter(Boolean)
    .join('\n');
};

export const normalizeScrolithaResponseText = (input: string) => {
  const source = compactWhitespace(repairScrolithaText(input));
  if (!source) return '';

  const expandedLines = normalizeInlineSections(source)
    .split('\n')
    .flatMap((line) => (shouldSplitPipeLine(line) ? line.split('|') : [line]))
    .flatMap((line) => splitSentences(line))
    .map((line) => line.trim())
    .filter(Boolean);

  const answerStartIndex = expandedLines.findIndex((line) => isAnswerStart(line));
  const lines = answerStartIndex >= 0 ? expandedLines.slice(answerStartIndex) : expandedLines;

  const filtered = lines
    .filter((line) => !isMetaLine(line))
    .map((line) => {
      if (isStructuralLine(line)) return stripPromptLabel(line);
      return normalizeBulletLine(line);
    })
    .filter(Boolean);

  const normalized = filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!normalized) return '';
  if (looksLikeKnowledgeDump(normalized)) return '';
  if (hasStructuredShape(normalized)) return normalized;
  return structureLongNarrative(normalized);
};
