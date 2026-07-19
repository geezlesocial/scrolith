import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export const POST_CARD = '[data-testid="enterprise-post-card"], [data-post-card-design="21.1.5"], article.scrolith-post-card';
export const POST_HEADER = '[data-testid="post-header"]';
export const POST_ACTIONS = '[data-testid="post-action-row"]';
export const POST_ENGAGEMENT = '[data-testid="post-engagement-bar"]';
export const AI_COACH = '[data-testid="post-ai-coach-card"]';
export const SURVEY = '[data-testid="content-interest-survey"]';
export const TRANSLATABLE = '[data-testid="translatable-post-text"]';

export type PostCardSnapshot = {
  postId: string | null;
  authorText: string;
  bodyPreview: string;
  hasCoach: boolean;
  hasSurvey: boolean;
  hasActions: boolean;
  actionCount: number;
  top: number;
  width: number;
  fingerprint: string;
};

export function postCards(page: Page): Locator {
  return page.locator(POST_CARD);
}

export async function waitForFeed(page: Page, timeout = 45_000) {
  await page.waitForLoadState('domcontentloaded');
  // Either post cards appear or an empty-state / login gate is visible
  await Promise.race([
    page.locator(POST_CARD).first().waitFor({ state: 'visible', timeout }),
    page.getByText(/log in|sign in|no posts|caught up|create your first/i).first().waitFor({
      state: 'visible',
      timeout
    })
  ]).catch(() => undefined);
  await page.waitForTimeout(800);
}

export async function snapshotPostCard(card: Locator): Promise<PostCardSnapshot> {
  return card.evaluate((el) => {
    const postId =
      el.getAttribute('data-feed-post-id') ||
      el.getAttribute('data-post-id') ||
      el.getAttribute('id') ||
      null;
    const author =
      el.querySelector('[data-testid="post-header"] a')?.textContent?.trim() ||
      el.querySelector('header a')?.textContent?.trim() ||
      '';
    const body =
      el.querySelector('[data-testid="translatable-post-text"]')?.textContent?.trim() ||
      el.querySelector('p, span')?.textContent?.trim() ||
      '';
    const actions = el.querySelectorAll('[data-testid="post-action-row"] button, [data-post-action-control="true"]');
    const rect = el.getBoundingClientRect();
    const fingerprint = [
      postId || '',
      author.slice(0, 80),
      body.slice(0, 120),
      String(actions.length),
      el.getAttribute('data-post-card-design') || ''
    ].join('|');
    return {
      postId,
      authorText: author,
      bodyPreview: body.slice(0, 200),
      hasCoach: Boolean(el.querySelector('[data-testid="post-ai-coach-card"]')),
      hasSurvey: Boolean(el.querySelector('[data-testid="content-interest-survey"]')),
      hasActions: actions.length > 0,
      actionCount: actions.length,
      top: Math.round(rect.top),
      width: Math.round(rect.width),
      fingerprint
    };
  });
}

export async function assertPostCardGeometry(card: Locator) {
  const box = await card.boundingBox();
  expect(box, 'post card should be rendered').toBeTruthy();
  if (!box) return;
  expect(box.width).toBeGreaterThan(280);
  expect(box.height).toBeGreaterThan(80);
}

/**
 * Document-level overflow (legacy). Prefer assertFeedColumnNoOverflow /
 * assertPostCardNoOverflow — desktop shell docks can exceed viewport without
 * breaking post-card layout.
 */
export async function assertNoHorizontalOverflow(page: Page, maxPx = 12) {
  const overflow = await measureDocumentOverflowX(page);
  expect(overflow, `document horizontal overflow ${overflow}px`).toBeLessThanOrEqual(maxPx);
}

export async function measureDocumentOverflowX(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    return Math.max(doc.scrollWidth, body?.scrollWidth || 0) - window.innerWidth;
  });
}

/**
 * Component-level overflow: post card content must stay within card bounds
 * and feed column (not the whole page / messaging dock).
 */
export async function assertPostCardNoOverflow(card: Locator, slackPx = 8) {
  const metrics = await card.evaluate((el) => {
    const cardRect = el.getBoundingClientRect();
    let maxChildRight = cardRect.left;
    const walk = (node: Element) => {
      const r = node.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        maxChildRight = Math.max(maxChildRight, r.right);
      }
      for (const child of Array.from(node.children)) walk(child);
    };
    walk(el);
    return {
      cardWidth: Math.round(cardRect.width),
      cardLeft: Math.round(cardRect.left),
      cardRight: Math.round(cardRect.right),
      maxChildRight: Math.round(maxChildRight),
      overrun: Math.round(maxChildRight - cardRect.right)
    };
  });
  expect(
    metrics.overrun,
    `post card content overrun ${metrics.overrun}px (card width ${metrics.cardWidth})`
  ).toBeLessThanOrEqual(slackPx);
  expect(metrics.cardWidth).toBeGreaterThan(200);
}

/** Feed column / main content container must not exceed viewport meaningfully */
export async function assertFeedColumnNoOverflow(page: Page, maxPx = 16) {
  const overflow = await page.evaluate(() => {
    const selectors = [
      '[data-testid="scrolith-member-home-feed"]',
      '[data-feed-scroll-root="true"]',
      'main',
      '[role="main"]',
      '[aria-label="Home feed"]',
      '[aria-label*="feed" i]'
    ];
    let target: Element | null = null;
    for (const sel of selectors) {
      target = document.querySelector(sel);
      if (target) break;
    }
    if (!target) {
      // Fall back to first post card's offset parent chain
      const card = document.querySelector(
        '[data-testid="enterprise-post-card"], [data-post-card-design="21.1.5"]'
      );
      target = card?.parentElement || null;
    }
    if (!target) return { overflow: 0, mode: 'no_feed_column' as const };
    const rect = target.getBoundingClientRect();
    const overflowRight = Math.max(0, rect.right - window.innerWidth);
    const overflowLeft = Math.max(0, -rect.left);
    return {
      overflow: Math.round(overflowRight + overflowLeft),
      mode: 'feed_column' as const,
      width: Math.round(rect.width)
    };
  });
  if (overflow.mode === 'no_feed_column') return overflow;
  expect(
    overflow.overflow,
    `feed column horizontal overflow ${overflow.overflow}px`
  ).toBeLessThanOrEqual(maxPx);
  return overflow;
}

/** Primary layout check used by auth specs (component-scoped) */
export async function assertLayoutNoProductOverflow(page: Page, card?: Locator) {
  await assertFeedColumnNoOverflow(page, 16);
  if (card && (await card.count()) > 0) {
    await assertPostCardNoOverflow(card.first());
  } else {
    const cards = postCards(page);
    if ((await cards.count()) > 0) {
      await assertPostCardNoOverflow(cards.first());
    }
  }
}

export async function assertActionRowEqualColumns(card: Locator) {
  const actions = card.locator(`${POST_ACTIONS} button, [data-post-action-control="true"]`);
  const count = await actions.count();
  if (count < 2) return;
  const widths: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const box = await actions.nth(i).boundingBox();
    if (box) widths.push(Math.round(box.width));
  }
  if (widths.length < 2) return;
  const min = Math.min(...widths);
  const max = Math.max(...widths);
  // Equal-width grid cells may differ by a few px due to badges
  expect(max - min, `action widths ${widths.join(',')}`).toBeLessThanOrEqual(24);
}

export async function assertSurveyEqualButtons(card: Locator) {
  const survey = card.locator(SURVEY);
  if ((await survey.count()) === 0) return;
  const yes = survey.locator('[data-testid="content-interest-yes"]');
  const no = survey.locator('[data-testid="content-interest-no"]');
  if ((await yes.count()) === 0 || (await no.count()) === 0) return;
  const a = await yes.boundingBox();
  const b = await no.boundingBox();
  if (!a || !b) return;
  expect(Math.abs(a.height - b.height)).toBeLessThanOrEqual(4);
  expect(Math.abs(a.width - b.width)).toBeLessThanOrEqual(8);
  expect(a.height).toBeGreaterThanOrEqual(40);
}

export async function assertTypographyScale(card: Locator) {
  const styles = await card.evaluate((el) => {
    const name = el.querySelector('[data-testid="post-header"] a');
    const body = el.querySelector('[data-testid="translatable-post-text"]');
    const nameFs = name ? getComputedStyle(name).fontSize : null;
    const bodyFs = body ? getComputedStyle(body).fontSize : null;
    return { nameFs, bodyFs };
  });
  if (styles.nameFs) {
    const px = parseFloat(styles.nameFs);
    expect(px).toBeGreaterThanOrEqual(14);
    expect(px).toBeLessThanOrEqual(22);
  }
  if (styles.bodyFs) {
    const px = parseFloat(styles.bodyFs);
    expect(px).toBeGreaterThanOrEqual(13);
    expect(px).toBeLessThanOrEqual(18);
  }
}

export async function assertDesignTokenOnPage(page: Page) {
  const spaceLg = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--scrolith-space-lg').trim()
  );
  // Present on p2115+; soft check so older baselines still run
  if (spaceLg) {
    expect(spaceLg).toBe('16px');
  }
}

export async function expandFirstMoreIfPresent(card: Locator) {
  const more = card.getByRole('button', { name: /more/i }).first();
  if ((await more.count()) === 0) return false;
  if (!(await more.isVisible().catch(() => false))) return false;
  await more.click();
  await card.page().waitForTimeout(300);
  return true;
}

export async function collectFeedInventory(page: Page) {
  const cards = postCards(page);
  const n = await cards.count();
  const inventory = {
    count: n,
    withCoach: 0,
    withSurvey: 0,
    withMedia: 0,
    withTranslation: 0,
    snapshots: [] as PostCardSnapshot[]
  };
  const limit = Math.min(n, 12);
  for (let i = 0; i < limit; i += 1) {
    const snap = await snapshotPostCard(cards.nth(i));
    inventory.snapshots.push(snap);
    if (snap.hasCoach) inventory.withCoach += 1;
    if (snap.hasSurvey) inventory.withSurvey += 1;
    const hasMedia = await cards
      .nth(i)
      .locator('img, video')
      .count()
      .then((c) => c > 0);
    if (hasMedia) inventory.withMedia += 1;
    const hasTrans = await cards.nth(i).locator(TRANSLATABLE).count();
    if (hasTrans) inventory.withTranslation += 1;
  }
  return inventory;
}
