/**
 * Structured AI action cards — launch workflows without free-text only UX.
 */
export type ActionCardKind =
  | 'verify'
  | 'summarize'
  | 'translate'
  | 'compare'
  | 'improve_writing'
  | 'generate_reply'
  | 'explain'
  | 'find_similar'
  | 'related_jobs'
  | 'related_services'
  | 'related_communities'
  | 'open_profile'
  | 'recommend'
  | 'moderation_review';

export type ScrolithaActionCard = {
  id: string;
  kind: ActionCardKind;
  label: string;
  description: string;
  intent: string;
  prompt: string;
  skillHints: string[];
  priority: number;
  icon?: string;
};

const card = (
  kind: ActionCardKind,
  label: string,
  description: string,
  intent: string,
  prompt: string,
  skillHints: string[],
  priority: number
): ScrolithaActionCard => ({
  id: `card_${kind}`,
  kind,
  label,
  description,
  intent,
  prompt,
  skillHints,
  priority,
  icon: kind
});

export const buildActionCards = (input: {
  surface?: string;
  hasPost?: boolean;
  hasCompany?: boolean;
  hasJob?: boolean;
  hasService?: boolean;
  hasCommunity?: boolean;
  hasProfile?: boolean;
  hasThread?: boolean;
  claimy?: boolean;
  longText?: boolean;
  role?: string;
}): ScrolithaActionCard[] => {
  const cards: ScrolithaActionCard[] = [];
  const role = String(input.role || '').toLowerCase();

  if (input.hasPost || input.claimy) {
    cards.push(
      card(
        'verify',
        'Verify',
        'Check claims against platform records',
        'verify_claim',
        'Verify the main claims using only platform-authoritative records.',
        ['fact_verification'],
        input.claimy ? 0.95 : 0.7
      )
    );
  }

  if (input.hasPost || input.hasThread || input.longText) {
    cards.push(
      card(
        'summarize',
        'Summarize',
        'Condense the discussion or page content',
        'summarize',
        'Summarize the key points of the visible content.',
        ['thread_summarization'],
        input.longText ? 0.9 : 0.75
      )
    );
  }

  cards.push(
    card(
      'explain',
      'Explain',
      'Explain this in plain language',
      'general_assist',
      'Explain this content in simple, clear terms.',
      ['thread_summarization', 'content_assistant'],
      0.72
    ),
    card(
      'generate_reply',
      'Generate Reply',
      'Draft a respectful reply',
      'writing_help',
      'Help me write a respectful, professional reply.',
      ['content_assistant', 'tone_improvement'],
      0.78
    ),
    card(
      'improve_writing',
      'Improve Writing',
      'Polish tone and clarity',
      'tone_improvement',
      'Improve the professional tone of my draft.',
      ['tone_improvement', 'content_assistant'],
      0.65
    ),
    card(
      'translate',
      'Translate',
      'Restate or translate visible text',
      'translation',
      'Help restate or translate the visible content.',
      ['translation'],
      0.55
    )
  );

  if (input.hasPost || input.hasThread) {
    cards.push(
      card(
        'compare',
        'Compare',
        'Compare claims or comments',
        'general_assist',
        'Compare the main claims in this discussion and highlight agreements or conflicts.',
        ['fact_verification', 'thread_summarization'],
        0.6
      ),
      card(
        'find_similar',
        'Find Similar',
        'Find related public discussions',
        'recommend',
        'Find similar public discussions or related content on the platform.',
        ['community_intelligence', 'thread_summarization'],
        0.58
      )
    );
  }

  if (input.hasJob || role.includes('freelancer')) {
    cards.push(
      card(
        'related_jobs',
        'Related Jobs',
        'Discover related public jobs',
        'recommend',
        'Recommend related public jobs based on this context.',
        ['job_intelligence', 'career_assistant'],
        0.8
      )
    );
  }

  if (input.hasService || role.includes('client') || role.includes('employer')) {
    cards.push(
      card(
        'related_services',
        'Related Services',
        'Discover public services/gigs',
        'recommend',
        'Recommend related public services based on this context.',
        ['service_intelligence'],
        0.78
      )
    );
  }

  if (input.hasCommunity) {
    cards.push(
      card(
        'related_communities',
        'Related Communities',
        'Explore community context',
        'community_rules',
        'Explain community context and related communities.',
        ['community_intelligence'],
        0.7
      )
    );
  }

  if (input.hasProfile || input.hasCompany) {
    cards.push(
      card(
        'open_profile',
        'Open Profile',
        'Review public profile or company page signals',
        input.hasCompany ? 'summarize_company' : 'profile_intelligence',
        input.hasCompany
          ? 'Summarize the public company page and legitimacy signals from platform data only.'
          : 'Summarize the public profile signals in context.',
        input.hasCompany ? ['company_intelligence'] : ['profile_intelligence'],
        0.74
      )
    );
  }

  if (role.includes('moderator') || role.includes('admin')) {
    cards.push(
      card(
        'moderation_review',
        'Moderation Review',
        'Get non-binding moderation assist',
        'moderation_assist',
        'Provide moderation assist signals for human review only.',
        ['moderator_assistant'],
        0.85
      )
    );
  }

  cards.push(
    card(
      'recommend',
      'Recommend',
      'Get conversation-aware recommendations',
      'recommend',
      'Recommend relevant public jobs, services, or communities.',
      ['service_intelligence', 'job_intelligence', 'community_intelligence'],
      0.66
    )
  );

  // Deduplicate by kind, keep highest priority
  const byKind = new Map<string, ScrolithaActionCard>();
  for (const c of cards) {
    const prev = byKind.get(c.kind);
    if (!prev || c.priority > prev.priority) byKind.set(c.kind, c);
  }

  return Array.from(byKind.values())
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 8);
};

export const resolveActionCardPrompt = (card: ScrolithaActionCard, userText?: string) => {
  const extra = String(userText || '').trim();
  if (!extra) return card.prompt;
  return `${card.prompt}\n\nUser note: ${extra}`;
};
