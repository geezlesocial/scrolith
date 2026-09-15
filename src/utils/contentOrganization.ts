import { plainTextToHtml } from './staticPageContent';

export type ContentOrganizationMode = 'page' | 'blog';
const MAX_CONTENT_LENGTH = 30_000;
const cleanText = (value: string) => String(value || '').replace(/\r\n/g, '\n').trim();

/** Conservative, wording-preserving fallback for offline/provider failure. */
export const organizeReadableText = (value: string) => {
  const source = cleanText(value);
  if (!source) return '';
  const lines = source.split('\n').map((line) => line.trim()).filter(Boolean);
  const output: string[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) output.push(paragraph.join(' ').replace(/\s+/g, ' ').trim());
    paragraph = [];
  };
  for (const line of lines) {
    if (/^#{1,3}\s+/.test(line) || /^[-*_]{3,}$/.test(line)) {
      flush();
      if (!/^[-*_]{3,}$/.test(line)) output.push(line);
      continue;
    }
    if (/^(?:[-*•]|\d+[.)])\s+/.test(line)) {
      flush();
      output.push(line);
      continue;
    }
    paragraph.push(line);
    if (paragraph.join(' ').length >= 520 || /[.!?]["')\]]?$/.test(line)) flush();
  }
  flush();
  return output.join('\n\n');
};

const extractText = (payload: any) => {
  const value = payload?.answer || payload?.response || payload?.text || payload?.content || payload;
  return typeof value === 'string' ? value.trim() : '';
};

const extractStructuredContent = (value: string) => {
  const raw = cleanText(value).replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    return cleanText(parsed?.content || parsed?.body || parsed?.html || parsed?.text || '');
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return raw;
    try {
      const parsed = JSON.parse(match[0]);
      return cleanText(parsed?.content || parsed?.body || parsed?.html || parsed?.text || '');
    } catch {
      return raw;
    }
  }
};

export type ContentOrganizationResult = { html: string; source: 'scrolitha' | 'local' };

export const organizeContentWithScrolitha = async (input: {
  text: string;
  mode: ContentOrganizationMode;
  askScrolitha: (payload: { question: string; context: string; audience: string; format: 'json' }) => Promise<any>;
}): Promise<ContentOrganizationResult> => {
  const text = cleanText(input.text).slice(0, MAX_CONTENT_LENGTH);
  const fallback = () => plainTextToHtml(organizeReadableText(text));
  if (!text) return { html: '<p></p>', source: 'local' };
  try {
    const response = await input.askScrolitha({
      question: [
        'You are Scrolitha organizing content for an enterprise CMS editor.',
        'Preserve every factual statement and author intent; do not add claims or links.',
        'Break dense sentences into readable paragraphs. Turn short section labels into Markdown headings.',
        'Turn explicit bullet or numbered lines into lists. Keep original wording as much as possible.',
        'Return valid JSON only with exactly one key: {"content": "..."}.',
        'The content value must be plain text or Markdown, not HTML and not code fences.'
      ].join('\n'),
      context: JSON.stringify({ mode: input.mode, content: text }),
      audience: `${input.mode}-editor`,
      format: 'json'
    });
    const organized = extractStructuredContent(extractText(response));
    return organized
      ? { html: plainTextToHtml(organizeReadableText(organized)), source: 'scrolitha' }
      : { html: fallback(), source: 'local' };
  } catch {
    return { html: fallback(), source: 'local' };
  }
};
