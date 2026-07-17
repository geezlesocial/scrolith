/**
 * Moderator assistance only — never auto-removes content.
 * All outputs are suggestions for human review.
 */
import { recordIntelligenceMetric } from './scrolitha.observability';

export type ModerationSignal =
  | 'possible_misinformation'
  | 'possible_duplicate'
  | 'possible_off_topic'
  | 'conflicting_claims'
  | 'hostile_tone'
  | 'spam_pattern'
  | 'needs_human_review';

export type ModerationAssistResult = {
  signals: Array<{
    signal: ModerationSignal;
    confidence: number;
    rationale: string;
    suggestedAction: string;
  }>;
  summary: string;
  autoActionTaken: false;
  disclosure: string;
};

const text = (v: unknown) => String(v || '').trim();
const lower = (v: unknown) => text(v).toLowerCase();

export const analyzeModerationAssist = (input: {
  postContent?: string;
  commentContent?: string;
  threadSnippets?: string[];
  communityRules?: string | null;
}): ModerationAssistResult => {
  recordIntelligenceMetric('moderation_assists');

  const post = lower(input.postContent);
  const comment = lower(input.commentContent);
  const thread = (input.threadSnippets || []).map(lower);
  const combined = [post, comment, ...thread].join('\n');
  const signals: ModerationAssistResult['signals'] = [];

  if (/\b(guaranteed|100% true|scientists say|everyone knows|without a doubt)\b/.test(combined) &&
      /\b(cure|secret|scam|conspiracy|fake news)\b/.test(combined)) {
    signals.push({
      signal: 'possible_misinformation',
      confidence: 0.55,
      rationale: 'Language patterns common in unsubstantiated absolute claims were detected.',
      suggestedAction: 'Review for factual support; request sources from the author before escalating.'
    });
  }

  if (thread.length >= 2) {
    const normalized = thread.map((t) => t.replace(/\s+/g, ' ').slice(0, 120));
    const uniq = new Set(normalized);
    if (uniq.size < normalized.length) {
      signals.push({
        signal: 'possible_duplicate',
        confidence: 0.5,
        rationale: 'Near-duplicate replies appear in the thread.',
        suggestedAction: 'Consider collapsing or asking participants to consolidate discussion.'
      });
    }
  }

  if (input.communityRules && comment) {
    const rules = lower(input.communityRules);
    if (/\bno (promo|spam|self[- ]?promo)/.test(rules) && /\b(buy now|discount|click here|dm me for)\b/.test(comment)) {
      signals.push({
        signal: 'possible_off_topic',
        confidence: 0.58,
        rationale: 'Comment may conflict with community no-promo style rules.',
        suggestedAction: 'Review against community rules; warn or hide only after human confirmation.'
      });
    }
  }

  if (/\b(always|never)\b/.test(post) && /\b(but|however|actually)\b/.test(comment)) {
    signals.push({
      signal: 'conflicting_claims',
      confidence: 0.45,
      rationale: 'Post and reply appear to assert conflicting absolute claims.',
      suggestedAction: 'Highlight both claims for community review; do not auto-remove.'
    });
  }

  if (/\b(idiot|stupid|kill yourself|hate you)\b/.test(comment)) {
    signals.push({
      signal: 'hostile_tone',
      confidence: 0.7,
      rationale: 'Hostile or abusive language may violate conduct policies.',
      suggestedAction: 'Prioritize human moderation review; consider warn/hide tools if policy matches.'
    });
  }

  if (/(.)\1{8,}/.test(comment) || (comment.match(/https?:\/\//g) || []).length >= 3) {
    signals.push({
      signal: 'spam_pattern',
      confidence: 0.6,
      rationale: 'Repetitive characters or multiple links resemble spam patterns.',
      suggestedAction: 'Queue for spam review; do not auto-delete without moderator confirmation.'
    });
  }

  if (!signals.length) {
    signals.push({
      signal: 'needs_human_review',
      confidence: 0.3,
      rationale: 'No high-confidence automated risk signal; human judgment still applies.',
      suggestedAction: 'No automated action. Monitor if reports arrive.'
    });
  }

  const summary = signals
    .slice(0, 4)
    .map((s) => `${s.signal.replace(/_/g, ' ')} (${Math.round(s.confidence * 100)}%): ${s.suggestedAction}`)
    .join('\n');

  return {
    signals: signals.slice(0, 6),
    summary: `Moderator assist only — no content was removed.\n${summary}`,
    autoActionTaken: false,
    disclosure:
      'Scrolitha moderation assist never removes content automatically. Final decisions remain with human moderators.'
  };
};
