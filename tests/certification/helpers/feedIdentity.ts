import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { FEED_IDENTITY_MS } from './env';
import { postCards, snapshotPostCard, type PostCardSnapshot, waitForFeed } from './postCard';

export type FeedIdentityResult = {
  surface: string;
  durationMs: number;
  samples: number;
  initial: PostCardSnapshot | null;
  final: PostCardSnapshot | null;
  failed: boolean;
  reason?: string;
};

async function disturbSession(page: Page) {
  // Simulate background activity without faking visibility transitions.
  // Synthetic visibilitychange previously caused soft_refresh storms (WebKit).
  await page.evaluate(() => {
    try {
      window.dispatchEvent(new Event('focus'));
      window.dispatchEvent(new Event('online'));
    } catch {
      /* ignore */
    }
  });
  // Brief scroll nudge then restore — must not reorder identity under soft-refresh.
  // Prefer programmatic scroll: mouse.wheel is unsupported on mobile WebKit (iPhone project).
  await page
    .evaluate(() => {
      window.scrollBy(0, 40);
    })
    .catch(() => undefined);
  await page.waitForTimeout(200);
  await page
    .evaluate(() => {
      window.scrollBy(0, -40);
    })
    .catch(() => undefined);
}

/** Prefer the same session-head card by data-feed-post-id when available. */
function cardLocatorForAnchor(page: Page, postId: string | null) {
  if (postId) {
    const byId = page.locator(
      `[data-testid="enterprise-post-card"][data-feed-post-id="${postId}"], [data-post-card-design="21.1.5"][data-feed-post-id="${postId}"]`
    );
    return byId;
  }
  return postCards(page).first();
}

/**
 * Keep the session-head post card stable for durationMs.
 * Fails if post id / author / fingerprint change for the anchored card,
 * or if the session head (first post card) swaps identity.
 */
export async function runFeedIdentityProbe(
  page: Page,
  options?: { surface?: string; durationMs?: number; sampleEveryMs?: number }
): Promise<FeedIdentityResult> {
  const surface = options?.surface || 'unknown';
  const durationMs = options?.durationMs ?? FEED_IDENTITY_MS;
  const sampleEveryMs = options?.sampleEveryMs ?? Math.min(5_000, Math.max(1_000, Math.floor(durationMs / 12)));

  await waitForFeed(page);
  const cards = postCards(page);
  const count = await cards.count();
  if (count === 0) {
    return {
      surface,
      durationMs,
      samples: 0,
      initial: null,
      final: null,
      failed: true,
      reason: 'no_post_cards'
    };
  }

  const first = cards.first();
  await first.scrollIntoViewIfNeeded();
  const initial = await snapshotPostCard(first);
  const productSnapshot = await page
    .evaluate(() => {
      const w = window as any;
      const head = document.querySelector(
        '[data-testid="enterprise-post-card"][data-feed-post-id], [data-post-card-design="21.1.5"][data-feed-post-id]'
      ) as HTMLElement | null;
      return {
        sessionId: w.__scrolithFeedSessionId || null,
        productHead: w.__scrolithFeedHeadPostId || null,
        domHead: head?.getAttribute('data-feed-post-id') || null,
        lifecycleLen: Array.isArray(w.__scrolithFeedLifecycleLog)
          ? w.__scrolithFeedLifecycleLog.length
          : 0
      };
    })
    .catch(() => ({ sessionId: null, productHead: null, domHead: null, lifecycleLen: 0 }));

  const timeline: Array<Record<string, unknown>> = [
    {
      t: 0,
      event: 'anchor',
      postId: initial.postId,
      author: initial.authorText?.slice(0, 40),
      headPostId: initial.postId,
      ...productSnapshot
    }
  ];
  let samples = 1;
  let failed = false;
  let reason: string | undefined;
  const started = Date.now();

  while (Date.now() - started < durationMs) {
    await page.waitForTimeout(sampleEveryMs);
    await disturbSession(page);
    samples += 1;

    const still = postCards(page);
    if ((await still.count()) === 0) {
      failed = true;
      reason = 'feed_emptied';
      timeline.push({ t: Date.now() - started, event: 'feed_emptied' });
      break;
    }

    // Session head (first post card in DOM order)
    const headSnap = await snapshotPostCard(still.first());
    // Anchored card by id (same post still present and stable)
    const anchorLoc = cardLocatorForAnchor(page, initial.postId);
    const anchorCount = await anchorLoc.count();
    const current =
      initial.postId && anchorCount > 0
        ? await snapshotPostCard(anchorLoc.first())
        : headSnap;

    const productTick = await page
      .evaluate(() => {
        const w = window as any;
        const log = Array.isArray(w.__scrolithFeedLifecycleLog)
          ? w.__scrolithFeedLifecycleLog.slice(-8)
          : [];
        return {
          sessionId: w.__scrolithFeedSessionId || null,
          productHead: w.__scrolithFeedHeadPostId || null,
          recentLifecycle: log
        };
      })
      .catch(() => ({ sessionId: null, productHead: null, recentLifecycle: [] }));

    timeline.push({
      t: Date.now() - started,
      event: 'sample',
      headPostId: headSnap.postId,
      anchorPostId: current.postId,
      anchorPresent: anchorCount > 0,
      productHead: productTick.productHead,
      sessionId: productTick.sessionId,
      recentLifecycle: productTick.recentLifecycle
    });

    if (initial.postId && headSnap.postId && initial.postId !== headSnap.postId) {
      failed = true;
      reason = `visible_post_id_changed:${initial.postId}->${headSnap.postId}`;
      timeline.push({
        t: Date.now() - started,
        event: 'fail',
        reason,
        recentLifecycle: productTick.recentLifecycle
      });
      break;
    }
    if (initial.authorText && current.authorText && initial.authorText !== current.authorText) {
      failed = true;
      reason = `author_changed:${initial.authorText}->${current.authorText}`;
      break;
    }
    if (initial.fingerprint && current.fingerprint && initial.fingerprint !== current.fingerprint) {
      failed = true;
      reason = `fingerprint_changed`;
      break;
    }
  }

  // Expose timeline for certification diagnostics
  const lifecycleLog = await page
    .evaluate((rows) => {
      try {
        (window as any).__scrolithFeedIdentityTimeline = rows;
        return Array.isArray((window as any).__scrolithFeedLifecycleLog)
          ? (window as any).__scrolithFeedLifecycleLog
          : [];
      } catch {
        return [];
      }
    }, timeline)
    .catch(() => []);

  const finalHead = postCards(page).first();
  const final = (await finalHead.count()) > 0 ? await snapshotPostCard(finalHead) : null;

  return {
    surface,
    durationMs: Date.now() - started,
    samples,
    initial,
    final,
    failed,
    reason,
    lifecycleEventCount: Array.isArray(lifecycleLog) ? lifecycleLog.length : 0
  };
}

export async function assertFeedIdentityStable(
  page: Page,
  options?: { surface?: string; durationMs?: number }
) {
  const result = await runFeedIdentityProbe(page, options);
  expect(result.failed, result.reason || 'feed identity failed').toBe(false);
  expect(result.initial, 'expected an initial post snapshot').toBeTruthy();
  if (result.initial && result.final) {
    if (result.initial.postId && result.final.postId) {
      expect(result.final.postId).toBe(result.initial.postId);
    }
    expect(result.final.fingerprint).toBe(result.initial.fingerprint);
  }
  return result;
}
