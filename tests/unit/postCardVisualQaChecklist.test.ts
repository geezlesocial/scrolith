/**
 * Phase 21.1.5 visual QA checklist — automated contract coverage.
 *
 * Maps operator checklist items 1–12 to source/token invariants so Desktop
 * Chrome, Mobile Chrome, and Android wrapper share the same layout guarantees.
 * Device smoke still required for pixel QA; these tests prevent regression of
 * the design-system contracts that implement the checklist.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  postCardActionButtonClass,
  postCardActionsRowClass,
  postCardAiCoachButtonClass,
  postCardAiCoachClass,
  postCardAiCoachInnerClass,
  postCardAvatarClass,
  postCardBodyClampClass,
  postCardChipClass,
  postCardChipRailClass,
  postCardFollowButtonClass,
  postCardHeaderRightClass,
  postCardMediaFrameClass,
  postCardPaddingClass,
  postCardSectionStackClass,
  postCardSurveyButtonClass,
  postCardSurveyButtonsRowClass,
  postCardTokens,
  postCardType
} from '../../src/components/enterprise/postCardDesign.ts';
import { spacing } from '../../src/components/enterprise/enterpriseSpacing.ts';

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel: string) => readFileSync(join(here, '../../', rel), 'utf8');

const postHeader = src('src/community/components/PostHeader.tsx');
const engagement = src('src/community/components/PostEngagementBar.tsx');
const survey = src('src/components/recommendation/ContentInterestSurvey.tsx');
const expandable = src('src/components/common/ExpandablePreviewText.tsx');
const translatable = src('src/components/translation/TranslatablePostText.tsx');
const coach = src('src/components/enterprise/PostAiCoachCard.tsx');
const memberHome = src('src/components/sections/MemberHomeSection.tsx');
const community = src('src/community/CommunityHome.tsx');
const mobileFeed = src('src/mobile/home/components/MobileFeed.tsx');
const feedMixed = src('src/components/feed/FeedMixedCard.tsx');
const listingCard = src('src/mobile/home/components/RecommendedListingCard.tsx');
const intel = src('src/components/feed/FeedIntelligenceSignals.tsx');
const stableMedia = src('src/components/enterprise/StableMediaFrame.tsx');
const indexCss = src('src/index.css');

// ---------------------------------------------------------------------------
// 1. Very long username — Follow / More stay aligned, no wrap
// ---------------------------------------------------------------------------
test('QA1 long username: header right cluster fixed, name/username truncate', () => {
  assert.match(postHeader, /postCardHeaderRightClass|shrink-0/);
  assert.match(postHeader, /truncate/);
  assert.match(postHeader, /postCardType\.username|postCardType\.name/);
  assert.match(postCardHeaderRightClass, /shrink-0/);
  assert.match(postCardHeaderRightClass, /self-start/);
  assert.match(postCardType.name, /truncate|text-\[18px\]/);
  // Mobile feed also truncates author name
  assert.match(mobileFeed, /truncate/);
  assert.match(mobileFeed, /postCardType\.name/);
  assert.match(mobileFeed, /postCardType\.username/);
  // Follow + More stay in fixed right slot
  assert.match(postHeader, /FollowButton/);
  assert.match(postHeader, /rightSlot/);
  assert.match(postCardFollowButtonClass, /h-9|min-h-9/);
  assert.match(postCardAvatarClass, /h-12 w-12/);
});

// ---------------------------------------------------------------------------
// 2. Very long post — 5-line clamp, More, expand, collapse
// ---------------------------------------------------------------------------
test('QA2 long post: 5-line clamp with More/Less expand collapse', () => {
  assert.equal(postCardTokens.bodyMaxLines, 5);
  assert.match(postCardBodyClampClass, /line-clamp-5/);
  assert.match(expandable, /useLineClamp/);
  assert.match(expandable, /bodyMaxLines/);
  assert.match(expandable, /moreLabel = 'More\.\.\.'/);
  assert.match(expandable, /lessLabel = 'Less'/);
  assert.match(expandable, /allowCollapse/);
  assert.match(expandable, /setExpanded/);
  assert.match(translatable, /useLineClamp/);
  assert.match(translatable, /More\.\.\./);
});

// ---------------------------------------------------------------------------
// 3. AI Coach visible — identical height, CTA right, no overflow
// ---------------------------------------------------------------------------
test('QA3 AI Coach: min-height 72, padding 16, CTA right, overflow hidden', () => {
  assert.equal(postCardTokens.aiCoachMinHeight, 72);
  assert.equal(postCardTokens.aiCoachPadding, spacing.lg);
  assert.match(postCardAiCoachClass, /min-h-\[72px\]/);
  assert.match(postCardAiCoachClass, /p-4/);
  assert.match(postCardAiCoachButtonClass, /shrink-0/);
  assert.match(postCardAiCoachInnerClass, /justify-between/);
  assert.match(coach, /overflow-hidden/);
  assert.match(coach, /data-ai-coach="visible"/);
  assert.match(coach, /line-clamp-2/);
  // Wired on all three surfaces
  assert.match(memberHome, /PostAiCoachCard/);
  assert.match(community, /PostAiCoachCard/);
  assert.match(mobileFeed, /PostAiCoachCard/);
});

// ---------------------------------------------------------------------------
// 4. Recommendation chips — wrap for 2 / 5 / 10 chips
// ---------------------------------------------------------------------------
test('QA4 chips: flex-wrap gap-sm min-height, never overlap', () => {
  assert.match(postCardChipRailClass, /flex-wrap/);
  assert.match(postCardChipRailClass, /gap-2/);
  assert.match(postCardChipClass, /min-h-8/);
  assert.match(postCardChipClass, /truncate/);
  assert.match(intel, /enterpriseIntelRail|RecoSignalChips/);
  assert.match(intel, /enterpriseIntelChip/);
  // Slice allows multi-chip rails (secondary reasons)
  assert.match(intel, /slice\(0/);
});

// ---------------------------------------------------------------------------
// 5. Survey — equal buttons, nowrap, grid 2 cols, fixed height
// ---------------------------------------------------------------------------
test('QA5 survey: equal width/height buttons, no wrap, 42px height', () => {
  assert.equal(postCardTokens.surveyButtonHeight, 42);
  assert.match(survey, /h-\[42px\]/);
  assert.match(survey, /whitespace-nowrap/);
  assert.match(survey, /grid-cols-2/);
  assert.match(survey, /w-full/);
  assert.match(survey, /content-interest-yes/);
  assert.match(survey, /content-interest-no/);
  assert.match(postCardSurveyButtonsRowClass, /grid-cols-2/);
  assert.match(postCardSurveyButtonClass, /h-\[42px\]/);
  assert.match(postCardSurveyButtonClass, /whitespace-nowrap/);
  // Dark appearance path exists for Scroll / small dark shells
  assert.match(survey, /appearance/);
  assert.match(survey, /isDark/);
});

// ---------------------------------------------------------------------------
// 6. Translation — See translation row stable in text block
// ---------------------------------------------------------------------------
test('QA6 translation: row inside stable text block stack', () => {
  assert.match(translatable, /See translation|Show original|Translating/);
  assert.match(translatable, /postCardTextBlockClass/);
  assert.match(translatable, /canTranslate/);
  assert.match(translatable, /translationRowClassName/);
  // Title/body/translation share fixed gaps, not ad-hoc margins
  assert.match(translatable, /data-testid="translatable-post-text"/);
});

// ---------------------------------------------------------------------------
// 7. Images — aspect / reserved space, no layout jump
// ---------------------------------------------------------------------------
test('QA7 images: reserved frames / fixed preview heights', () => {
  assert.match(postCardMediaFrameClass, /overflow-hidden/);
  assert.match(postCardMediaFrameClass, /bg-slate-100/);
  assert.match(stableMedia, /aspectRatio/);
  assert.match(stableMedia, /absolute inset-0/);
  // Member Home / Community / Mobile use fixed media height classes
  assert.match(memberHome, /FEED_SINGLE_MEDIA_HEIGHT_CLASS|h-\[24rem\]|object-cover/);
  assert.match(community, /FEED_SINGLE_MEDIA_HEIGHT_CLASS|object-cover|OptimizedImage/);
  assert.match(mobileFeed, /h-\[22rem\]|object-cover|OptimizedImage/);
});

// ---------------------------------------------------------------------------
// 8. No AI Coach — section stack gap remains uniform
// ---------------------------------------------------------------------------
test('QA8 no AI Coach: optional section omitted keeps gap-md stack', () => {
  // Stack is flex-col gap-3; optional children simply not rendered
  assert.match(postCardSectionStackClass, /flex-col/);
  assert.match(postCardSectionStackClass, /gap-3/);
  // Coach is a sibling component, not an empty reserved hole
  assert.match(memberHome, /PostAiCoachCard/);
  assert.doesNotMatch(memberHome, /min-h-\[72px\].*empty|placeholder-ai-coach/);
  // Documented contract in PostAiCoachCard
  assert.match(coach, /When omitted from a card|uniform gap|section stack/i);
});

// ---------------------------------------------------------------------------
// 9–11. Marketplace / Job / Community reco cards do NOT inherit post spacing
// ---------------------------------------------------------------------------
test('QA9 marketplace card does not import post card section stack', () => {
  assert.doesNotMatch(feedMixed, /postCardSectionStackClass/);
  assert.doesNotMatch(feedMixed, /postCardPaddingClass/);
  assert.doesNotMatch(feedMixed, /from ['\"].*postCardDesign/);
  assert.doesNotMatch(feedMixed, /PostAiCoachCard/);
  assert.match(feedMixed, /FeedMixedCard|marketplace|job/);
});

test('QA10 job card uses FeedMixedCard isolation (not enterprise post padding)', () => {
  assert.match(feedMixed, /case 'job'/);
  assert.doesNotMatch(feedMixed, /enterprisePostCardPadding/);
  assert.doesNotMatch(feedMixed, /data-post-card-design/);
});

test('QA11 community / mobile reco listing cards keep independent spacing', () => {
  assert.doesNotMatch(listingCard, /postCardSectionStackClass/);
  assert.doesNotMatch(listingCard, /from ['\"].*postCardDesign/);
  assert.doesNotMatch(listingCard, /PostAiCoachCard/);
  // Listing cards use their own shell (rounded-3xl p-5), not post card shell
  assert.match(listingCard, /rounded-3xl|p-5|Recommended/);
});

// ---------------------------------------------------------------------------
// 12. Dark mode support path
// ---------------------------------------------------------------------------
test('QA12 dark mode: theme toggle + survey dark appearance supported', () => {
  assert.match(indexCss, /\[data-theme="dark"\]/);
  assert.match(survey, /appearance === 'dark'|isDark/);
  // Scroll surface uses dark survey appearance
  const scrollCard = src('src/features/scroll/ScrollCard.tsx');
  assert.match(scrollCard, /appearance="dark"/);
});

// ---------------------------------------------------------------------------
// Cross-surface: equal action columns + padding
// ---------------------------------------------------------------------------
test('cross-surface: actions equal width, padding 16px, section gap 12px', () => {
  assert.equal(postCardTokens.cardPaddingX, 16);
  assert.equal(postCardTokens.sectionGap, 12);
  assert.match(postCardPaddingClass, /px-4/);
  assert.match(postCardActionsRowClass, /grid-cols-5/);
  assert.match(postCardActionButtonClass, /min-h-12/);
  assert.match(postCardActionButtonClass, /w-full/);
  assert.match(postCardActionButtonClass, /items-center/);
  assert.match(postCardActionButtonClass, /justify-center/);
  assert.match(engagement, /postCardActionsRowClass|postCardActionButtonClass/);
  assert.match(memberHome, /data-post-card-design="21\.1\.5"/);
  assert.match(community, /data-post-card-design="21\.1\.5"/);
  assert.match(mobileFeed, /data-post-card-design="21\.1\.5"/);
});

// ---------------------------------------------------------------------------
// Operator device matrix markers (for docs / CI evidence)
// ---------------------------------------------------------------------------
test('device matrix markers present for Desktop / Mobile / Android QA', () => {
  // Structural markers operators can target in DevTools
  assert.match(memberHome, /data-testid="enterprise-post-card"/);
  assert.match(community, /data-testid="enterprise-post-card"/);
  assert.match(mobileFeed, /data-testid="enterprise-post-card"/);
  assert.match(engagement, /data-testid="post-engagement-bar"/);
  assert.match(engagement, /data-testid="post-action-row"/);
  assert.match(coach, /data-testid="post-ai-coach-card"/);
  assert.match(survey, /data-testid="content-interest-survey"/);
});
