/**
 * Phase 26B — follow-onboarding progress, gates, language search, messaging dock exclusion.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildOnboardingMissingHint,
  canContinueOnboarding,
  checkFollowCaps,
  computeOnboardingProgressPercent,
  FOLLOW_ONBOARDING_MAX_PAGES,
  FOLLOW_ONBOARDING_MAX_TOTAL,
  FOLLOW_ONBOARDING_MAX_USERS,
  languagesSatisfied,
  resolveFollowMinimum
} from '../../src/auth/followOnboardingLogic.ts';
import {
  isMessagingDockExcludedPath,
  shouldShowMessagingDock
} from '../../src/services/messagingSurfaces.ts';
import {
  listOnboardingLanguages,
  searchLanguages,
  normalizeLanguageCode
} from '../../src/utils/supportedLanguages.ts';

const here = dirname(fileURLToPath(import.meta.url));
const followOnboardingSrc = readFileSync(join(here, '../../src/auth/FollowOnboarding.tsx'), 'utf8');
const appSrc = readFileSync(join(here, '../../src/App.tsx'), 'utf8');
const languageSelectSrc = readFileSync(join(here, '../../src/components/language/LanguageMultiSelect.tsx'), 'utf8');
const indexCss = readFileSync(join(here, '../../src/index.css'), 'utf8');

test('business rules: min 1 language and min 1 follow; max 6 total', () => {
  assert.equal(languagesSatisfied(0), false);
  assert.equal(languagesSatisfied(1), true);
  assert.equal(resolveFollowMinimum(undefined), 1);
  assert.equal(resolveFollowMinimum(1), 1);
  assert.equal(FOLLOW_ONBOARDING_MAX_TOTAL, 6);
  assert.equal(FOLLOW_ONBOARDING_MAX_USERS, 3);
  assert.equal(FOLLOW_ONBOARDING_MAX_PAGES, 3);
});

test('canContinue requires both language and follow minimums', () => {
  assert.equal(canContinueOnboarding({ languageCount: 0, followedCount: 0 }), false);
  assert.equal(canContinueOnboarding({ languageCount: 1, followedCount: 0 }), false);
  assert.equal(canContinueOnboarding({ languageCount: 0, followedCount: 1 }), false);
  assert.equal(canContinueOnboarding({ languageCount: 1, followedCount: 1 }), true);
  assert.equal(canContinueOnboarding({ languageCount: 2, followedCount: 3, minimumRequired: 1 }), true);
});

test('progress does not imply six follows are required', () => {
  // Languages only → ~50%
  const langOnly = computeOnboardingProgressPercent({ languageCount: 1, followedCount: 0, minimumRequired: 1 });
  assert.equal(langOnly, 50);
  // One follow of one required + languages → 100%
  const ready = computeOnboardingProgressPercent({ languageCount: 1, followedCount: 1, minimumRequired: 1 });
  assert.equal(ready, 100);
  // Six follows without languages still not 100 (missing language half)
  const followsOnly = computeOnboardingProgressPercent({ languageCount: 0, followedCount: 6, minimumRequired: 1 });
  assert.equal(followsOnly, 50);
  // Extra follows beyond min do not inflate past 100
  assert.equal(
    computeOnboardingProgressPercent({ languageCount: 1, followedCount: 6, minimumRequired: 1 }),
    100
  );
});

test('missing hint distinguishes language vs follow requirements', () => {
  assert.match(buildOnboardingMissingHint({ languageCount: 0, followedCount: 0 }), /language/i);
  assert.match(buildOnboardingMissingHint({ languageCount: 1, followedCount: 0 }), /Follow at least 1/i);
  assert.equal(buildOnboardingMissingHint({ languageCount: 1, followedCount: 1 }), 'Ready to continue');
});

test('follow caps enforce step maxima without changing min required', () => {
  assert.equal(checkFollowCaps({ targetType: 'user', followedTotal: 0, selectedUsers: 0, selectedPages: 0 }).ok, true);
  assert.equal(
    checkFollowCaps({ targetType: 'user', followedTotal: 6, selectedUsers: 3, selectedPages: 3 }).ok,
    false
  );
  assert.equal(
    checkFollowCaps({ targetType: 'user', followedTotal: 3, selectedUsers: 3, selectedPages: 0 }).ok,
    false
  );
  assert.equal(
    checkFollowCaps({ targetType: 'page', followedTotal: 3, selectedUsers: 0, selectedPages: 3 }).ok,
    false
  );
});

test('language search matches English name, native name, code, and aliases', () => {
  const catalog = listOnboardingLanguages();
  assert.ok(catalog.length >= 8);

  const byEnglish = searchLanguages('Arabic', catalog);
  assert.ok(byEnglish.some((l) => l.code === 'ar'));

  const byNative = searchLanguages('العربية', catalog);
  assert.ok(byNative.some((l) => l.code === 'ar'));

  const byCode = searchLanguages('ar', catalog);
  assert.ok(byCode.some((l) => l.code === 'ar'));

  assert.equal(normalizeLanguageCode('ara'), 'ar');
  assert.equal(normalizeLanguageCode('fil'), 'tl');

  const filipino = searchLanguages('tagalog', catalog);
  assert.ok(filipino.some((l) => l.code === 'tl'));

  assert.equal(searchLanguages('zzzz-not-a-language', catalog).length, 0);
});

test('messaging dock excluded on follow-onboarding routes', () => {
  for (const path of ['/auth/follow-onboarding', '/auth/follow-onboarding/', '/auth/follow-onboarding/extra']) {
    assert.equal(isMessagingDockExcludedPath(path), true, path);
    assert.equal(shouldShowMessagingDock(path), false, path);
  }
  assert.equal(shouldShowMessagingDock('/'), true);
  assert.equal(isMessagingDockExcludedPath('/auth/login'), false);
});

test('FollowOnboarding page implements mobile-first sticky CTA and progress a11y', () => {
  assert.match(followOnboardingSrc, /follow-onboarding-sticky/);
  assert.match(followOnboardingSrc, /safe-area-inset-bottom/);
  assert.match(followOnboardingSrc, /role="progressbar"/);
  assert.match(followOnboardingSrc, /Build your first Scrolith feed/);
  assert.match(followOnboardingSrc, /Why we ask this/);
  assert.match(followOnboardingSrc, /min \{followMin\}/);
  assert.match(followOnboardingSrc, /up to \$\{MAX_ONBOARDING_TOTAL\}/);
  assert.match(followOnboardingSrc, /min-h-\[44px\]/);
  assert.match(followOnboardingSrc, /canContinueOnboarding/);
  assert.match(followOnboardingSrc, /LanguageMultiSelect/);
  // Optimistic follow with rollback
  assert.match(followOnboardingSrc, /isFollowing: true/);
  assert.match(followOnboardingSrc, /isFollowing: false/);
});

test('App hides Navbar and DesktopMessagingDock on follow-onboarding', () => {
  assert.match(appSrc, /isFollowOnboardingRoute/);
  assert.match(appSrc, /!isFollowOnboardingRoute/);
  assert.ok(appSrc.includes('!isFollowOnboardingRoute &&') || appSrc.includes('!isFollowOnboardingRoute\n'));
  // Navbar gate
  assert.match(appSrc, /isFollowOnboardingRoute[\s\S]{0,200}Navbar/);
});

test('LanguageMultiSelect is touch-friendly and RTL-safe', () => {
  assert.match(languageSelectSrc, /min-h-\[44px\]/);
  assert.match(languageSelectSrc, /dir="auto"/);
  // No emoji flag glyphs as UI (comment may mention "flags" as a negative)
  assert.doesNotMatch(languageSelectSrc, /[\u{1F1E6}-\u{1F1FF}]{2}/u);
  assert.doesNotMatch(languageSelectSrc, /twemoji|flagcdn|country-flag/i);
  assert.match(languageSelectSrc, /No languages match your search/);
});

test('CSS includes follow-onboarding overflow and reduced-motion safeguards', () => {
  assert.match(indexCss, /\.follow-onboarding-shell/);
  assert.match(indexCss, /overflow-x:\s*clip/);
  assert.match(indexCss, /\.follow-onboarding-sticky/);
  assert.match(indexCss, /prefers-reduced-motion/);
});
