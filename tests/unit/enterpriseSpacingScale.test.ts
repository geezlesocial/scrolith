/**
 * Enterprise Spacing Scale contracts.
 * Post cards, surveys, coach, and feed chrome must derive geometry from the scale.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  spacing,
  spacingClass,
  spacingCssVariables,
  spacingPx,
  spacingSemantic
} from '../../src/components/enterprise/enterpriseSpacing.ts';
import { postCardTokens, postCardPaddingClass, postCardSectionStackClass, postCardChipRailClass, postCardAiCoachClass, postCardActionsRowClass, postCardHeaderRightClass, postCardType } from '../../src/components/enterprise/postCardDesign.ts';

const here = dirname(fileURLToPath(import.meta.url));
const indexCss = readFileSync(join(here, '../../src/index.css'), 'utf8');

test('spacing scale matches approved enterprise steps', () => {
  assert.deepEqual({ ...spacing }, { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 });
  assert.equal(spacingPx('md'), 12);
  assert.equal(spacingPx('lg'), 16);
  assert.equal(spacingSemantic.section, 12);
  assert.equal(spacingSemantic.card, 16);
  assert.equal(spacingSemantic.control, 8);
});

test('spacing classes map to Tailwind gap/p utilities', () => {
  assert.equal(spacingClass.gap.xs, 'gap-1');
  assert.equal(spacingClass.gap.sm, 'gap-2');
  assert.equal(spacingClass.gap.md, 'gap-3');
  assert.equal(spacingClass.gap.lg, 'gap-4');
  assert.equal(spacingClass.px.lg, 'px-4');
  assert.equal(spacingClass.p.lg, 'p-4');
  assert.equal(spacingClass.titleToBody, 'gap-2.5');
});

test('CSS custom properties are published on :root', () => {
  assert.match(indexCss, /--scrolith-space-xs:\s*4px/);
  assert.match(indexCss, /--scrolith-space-sm:\s*8px/);
  assert.match(indexCss, /--scrolith-space-md:\s*12px/);
  assert.match(indexCss, /--scrolith-space-lg:\s*16px/);
  assert.match(indexCss, /--scrolith-space-xl:\s*20px/);
  assert.match(indexCss, /--scrolith-space-xxl:\s*24px/);
  assert.equal(spacingCssVariables['--scrolith-space-md'], '12px');
});

test('post card tokens derive from spacing scale (no orphan px gaps)', () => {
  assert.equal(postCardTokens.cardPaddingX, spacing.lg);
  assert.equal(postCardTokens.sectionGap, spacing.md);
  assert.equal(postCardTokens.statsToActionsGap, spacing.sm);
  assert.equal(postCardTokens.chipGap, spacing.sm);
  assert.equal(postCardTokens.aiCoachPadding, spacing.lg);
  assert.deepEqual({ ...postCardTokens.spacingScale }, { ...spacing });
  assert.match(postCardPaddingClass, /px-4/);
  assert.match(postCardSectionStackClass, /gap-3/);
  assert.match(postCardChipRailClass, /gap-2/);
  assert.match(postCardAiCoachClass, /p-4/);
  assert.match(postCardActionsRowClass, /grid-cols-5/);
});
