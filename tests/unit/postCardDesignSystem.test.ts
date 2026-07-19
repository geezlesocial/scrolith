/**
 * Mobile Post Card Design System contracts.
 * Guards spacing tokens, shell padding, and shared component class stability.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  postCardActionButtonClass,
  postCardActionsRowClass,
  postCardAiCoachClass,
  postCardChipClass,
  postCardChipRailClass,
  postCardPaddingClass,
  postCardPaddingCompactClass,
  postCardSectionStackClass,
  postCardShellClass,
  postCardTokens,
  postCardType
} from '../../src/components/enterprise/postCardDesign.ts';
import {
  enterprisePostCard,
  enterprisePostCardCompact,
  enterprisePostCardPadding,
  enterpriseIntelChip,
  enterpriseIntelRail
} from '../../src/components/enterprise/enterpriseClasses.ts';

const here = dirname(fileURLToPath(import.meta.url));

test('post card tokens match enterprise layout contract', () => {
  assert.equal(postCardTokens.cardPaddingX, 16);
  assert.equal(postCardTokens.cardPaddingY, 16);
  assert.equal(postCardTokens.sectionGap, 12);
  assert.equal(postCardTokens.titleToBodyGap, 10);
  assert.equal(postCardTokens.statsToActionsGap, 8);
  assert.equal(postCardTokens.chipGap, 8);
  assert.equal(postCardTokens.chipMinHeight, 32);
  assert.equal(postCardTokens.avatarSize, 48);
  assert.equal(postCardTokens.followButtonHeight, 36);
  assert.equal(postCardTokens.aiCoachMinHeight, 72);
  assert.equal(postCardTokens.surveyButtonHeight, 42);
  assert.equal(postCardTokens.reactionButtonMinHeight, 48);
  assert.equal(postCardTokens.bodyMaxLines, 5);
  assert.equal(postCardTokens.actionIconSize, 22);
});

test('typography scale is mobile-first and readable', () => {
  assert.match(postCardType.name, /text-\[18px\]/);
  assert.match(postCardType.username, /text-\[13px\]/);
  assert.match(postCardType.date, /text-\[12px\]/);
  assert.match(postCardType.title, /text-\[17px\]/);
  assert.match(postCardType.title, /font-bold/);
  assert.match(postCardType.body, /text-\[15px\]/);
  assert.match(postCardType.chip, /text-\[11px\]/);
  assert.match(postCardType.surveyTitle, /text-\[15px\]/);
  assert.match(postCardType.stats, /text-\[13px\]/);
});

test('card padding is always 16px horizontal', () => {
  assert.match(postCardPaddingClass, /px-4/);
  assert.match(postCardPaddingCompactClass, /px-4/);
  assert.equal(enterprisePostCardPadding, postCardPaddingClass);
  assert.equal(enterprisePostCardCompact, postCardPaddingCompactClass);
  assert.equal(enterprisePostCard, postCardShellClass);
});

test('section stack uses 12px gap and never collapses', () => {
  assert.match(postCardSectionStackClass, /gap-3/);
  assert.match(postCardSectionStackClass, /flex-col/);
  assert.match(postCardSectionStackClass, /mt-3/);
});

test('action row is equal-width 5-column grid', () => {
  assert.match(postCardActionsRowClass, /grid-cols-5/);
  assert.match(postCardActionButtonClass, /min-h-12/);
  assert.match(postCardActionButtonClass, /w-full/);
  assert.match(postCardActionButtonClass, /items-center/);
  assert.match(postCardActionButtonClass, /justify-center/);
});

test('chips wrap with 8px gap and min-height 32px', () => {
  assert.match(postCardChipRailClass, /flex-wrap/);
  assert.match(postCardChipRailClass, /gap-2/);
  assert.match(postCardChipClass, /min-h-8/);
  assert.equal(enterpriseIntelRail, postCardChipRailClass);
  assert.equal(enterpriseIntelChip, postCardChipClass);
});

test('AI coach has stable min-height 72px and 16px padding', () => {
  assert.match(postCardAiCoachClass, /min-h-\[72px\]/);
  assert.match(postCardAiCoachClass, /p-4/);
});

test('shell avoids hover lift (feed shake prevention)', () => {
  assert.equal(postCardShellClass.includes('-translate-y'), false);
  assert.match(postCardShellClass, /transition-shadow/);
  assert.match(postCardShellClass, /scrolith-post-card/);
});

test('Member Home / Community / Mobile wire design system markers', () => {
  const memberHome = readFileSync(
    join(here, '../../src/components/sections/MemberHomeSection.tsx'),
    'utf8'
  );
  const community = readFileSync(join(here, '../../src/community/CommunityHome.tsx'), 'utf8');
  const mobileFeed = readFileSync(
    join(here, '../../src/mobile/home/components/MobileFeed.tsx'),
    'utf8'
  );
  const survey = readFileSync(
    join(here, '../../src/components/recommendation/ContentInterestSurvey.tsx'),
    'utf8'
  );
  const engagement = readFileSync(
    join(here, '../../src/community/components/PostEngagementBar.tsx'),
    'utf8'
  );
  const header = readFileSync(join(here, '../../src/community/components/PostHeader.tsx'), 'utf8');
  const expandable = readFileSync(
    join(here, '../../src/components/common/ExpandablePreviewText.tsx'),
    'utf8'
  );

  assert.match(memberHome, /PostAiCoachCard/);
  assert.match(memberHome, /postCardSectionStackClass/);
  assert.match(memberHome, /data-post-card-design="21\.1\.5"/);
  assert.match(community, /enterprisePostCardPadding/);
  assert.match(community, /PostAiCoachCard/);
  assert.match(community, /data-post-card-design="21\.1\.5"/);
  assert.match(mobileFeed, /enterprisePostCardPadding/);
  assert.match(mobileFeed, /PostAiCoachCard/);
  assert.match(mobileFeed, /data-post-card-design="21\.1\.5"/);

  assert.match(survey, /h-\[42px\]/);
  assert.match(survey, /whitespace-nowrap/);
  assert.match(survey, /grid-cols-2/);
  assert.match(engagement, /postCardActionsRowClass/);
  assert.match(engagement, /postCardActionButtonClass/);
  assert.match(header, /postCardType\.name/);
  assert.match(header, /truncate/);
  assert.match(header, /postCardHeaderRightClass/);
  assert.match(expandable, /useLineClamp/);
  assert.match(expandable, /bodyMaxLines/);
});
