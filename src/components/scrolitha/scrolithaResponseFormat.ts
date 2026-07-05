const META_PREFIXES = [
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
  'mode'
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
  return META_PREFIXES.some((prefix) => normalized.startsWith(`${prefix}:`));
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

export const normalizeScrolithaResponseText = (input: string) => {
  const source = compactWhitespace(input);
  if (!source) return '';

  const expandedLines = source
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

  return filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

