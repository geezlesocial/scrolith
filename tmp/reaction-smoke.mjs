import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const baseUrl = 'http://127.0.0.1:3000';
const artifactsDir = 'c:/Projects/tmp/reaction-smoke-artifacts';
fs.mkdirSync(artifactsDir, { recursive: true });

const credentials = {
  email: 'admin@scrolith.com',
  password: 'admin12345'
};

const results = {
  auth: { status: 'FAIL', checks: [], route: null, errors: [] },
  desktopFeed: { status: 'FAIL', checks: [], route: null, errors: [] },
  mobileFeed: { status: 'FAIL', checks: [], route: null, errors: [] },
  postDetail: { status: 'FAIL', checks: [], route: null, errors: [] }
};

const postIds = new Set();

const pushCheck = (bucket, name, pass, note = '') => {
  bucket.checks.push({ name, pass, note });
};

const ensureStatus = (bucket) => {
  bucket.status = bucket.errors.length === 0 && bucket.checks.length > 0 && bucket.checks.every((c) => c.pass) ? 'PASS' : 'FAIL';
};

const extractPostIds = (payload) => {
  const ids = [];
  const visit = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== 'object') return;
    const obj = value;
    if (typeof obj.id === 'string' && obj.id.length > 8) ids.push(obj.id);
    for (const key of ['posts', 'data', 'items', 'results']) {
      if (key in obj) visit(obj[key]);
    }
  };
  visit(payload);
  return ids;
};

const normalizeCount = (value) => {
  const n = Number(String(value || '').replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.trunc(n));
};

const readReactionTotalFromBar = async (bar) => {
  const text = await bar.evaluate((el) => {
    const strong = el.querySelector('span.font-semibold.text-slate-700');
    if (strong && strong.textContent) return strong.textContent.trim();
    const zero = el.querySelector('span.text-slate-400');
    if (zero && zero.textContent) return zero.textContent.trim();
    return '';
  });
  return normalizeCount(text);
};

const findFeedBar = async (page, routes) => {
  for (const route of routes) {
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);

    const selectorCandidates = [
      'div:has(button:has-text("Comment")):has(button:has-text("Repost"))',
      'div:has(button:has-text("Comment")):has(button:has-text("Send"))',
      'div:has(button:has-text("Com")):has(button:has-text("Rep"))'
    ];

    for (const selector of selectorCandidates) {
      const bar = page.locator(selector).first();
      try {
        await bar.waitFor({ state: 'visible', timeout: 8000 });
        return { route, bar };
      } catch {
        // try next selector
      }
    }
  }
  return null;
};

const checkButtonsNoOverlap = async (bar) => {
  const boxes = await bar.locator('button:visible').evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 48)
      };
    })
  );

  if (!boxes.length) return { pass: false, note: 'No visible action buttons found.' };

  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const overlapX = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const overlapY = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      if (overlapX > 1 && overlapY > 1) {
        return { pass: false, note: `Overlap: "${a.text}" + "${b.text}".` };
      }
    }
  }

  return { pass: true, note: `${boxes.length} buttons with no overlap.` };
};

const loginSession = async (context) => {
  const bases = ['https://api.scrolith.com/api', `${baseUrl}/api`];
  for (const base of bases) {
    try {
      const res = await context.request.post(`${base}/auth/login`, {
        data: credentials,
        timeout: 20000
      });
      if (!res.ok()) continue;
      const body = await res.json();
      const token = body?.token || body?.data?.token || body?.accessToken || body?.data?.accessToken || null;
      const user = body?.user || body?.data?.user || body?.data || body || null;
      if (token && user && user.id) {
        return { base, token, user };
      }
    } catch {
      // try next base
    }
  }
  return null;
};

const applySessionToPage = async (page, session) => {
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(({ token, user }) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    document.cookie = `Scrolith_token=${encodeURIComponent(token)}; path=/; SameSite=Lax`;
  }, session);
};

const firstApiPostId = async (context) => {
  const urls = [
    'https://api.scrolith.com/api/community/posts?limit=5',
    `${baseUrl}/api/community/posts?limit=5`
  ];

  for (const url of urls) {
    try {
      const resp = await context.request.get(url, { timeout: 20000 });
      if (!resp.ok()) continue;
      const body = await resp.json();
      const ids = extractPostIds(body);
      if (ids.length) return ids[0];
    } catch {
      // continue
    }
  }
  return null;
};

let browser;
try {
  browser = await chromium.launch({ headless: true });

  const bootstrap = await browser.newContext();
  let session = null;
  try {
    session = await loginSession(bootstrap);
    if (!session) throw new Error('Could not authenticate smoke user against known login endpoints.');
    pushCheck(results.auth, 'API login for smoke user', true, `Authenticated via ${session.base}`);
  } catch (error) {
    results.auth.errors.push(String(error?.message || error));
  }
  ensureStatus(results.auth);
  await bootstrap.close();

  if (!session) {
    throw new Error('Auth bootstrap failed; reaction smoke requires authenticated feed access.');
  }

  // Desktop feed checks
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    page.on('response', async (response) => {
      try {
        const url = response.url();
        if (!url.includes('/community/posts')) return;
        const json = await response.json();
        for (const id of extractPostIds(json)) postIds.add(id);
      } catch {
        // ignore
      }
    });

    try {
      await applySessionToPage(page, session);
      const found = await findFeedBar(page, ['/community', '/m/home']);
      if (!found) throw new Error('Engagement bar not found on desktop feed routes after auth.');

      results.desktopFeed.route = found.route;
      pushCheck(results.desktopFeed, 'Desktop feed renders engagement bar', true, `Route ${found.route}`);

      const overlap = await checkButtonsNoOverlap(found.bar);
      pushCheck(results.desktopFeed, 'Desktop reaction actions have no overlap', overlap.pass, overlap.note);

      const reactionBtn = found.bar.locator('button').first();
      await reactionBtn.hover();
      await page.locator('text=Reactions').first().waitFor({ state: 'visible', timeout: 6000 });
      pushCheck(results.desktopFeed, 'Hover opens desktop reaction picker', true, 'Floating picker opened.');

      await page.screenshot({ path: path.join(artifactsDir, 'desktop-feed.png'), fullPage: true });
    } catch (error) {
      results.desktopFeed.errors.push(String(error?.message || error));
      await page.screenshot({ path: path.join(artifactsDir, 'desktop-feed-fail.png'), fullPage: true }).catch(() => {});
    }

    ensureStatus(results.desktopFeed);
    await context.close();
  }

  // Mobile web feed checks
  {
    const context = await browser.newContext({ ...devices['Pixel 7'] });
    const page = await context.newPage();

    try {
      await applySessionToPage(page, session);
      const found = await findFeedBar(page, ['/m/home', '/community']);
      if (!found) throw new Error('Engagement bar not found on mobile feed routes after auth.');

      results.mobileFeed.route = found.route;
      pushCheck(results.mobileFeed, 'Mobile feed renders engagement bar', true, `Route ${found.route}`);

      const overlap = await checkButtonsNoOverlap(found.bar);
      pushCheck(results.mobileFeed, 'Mobile reaction actions have no overlap', overlap.pass, overlap.note);

      const reactionBtn = found.bar.locator('button').first();
      await reactionBtn.evaluate((el) => el.dispatchEvent(new Event('touchstart', { bubbles: true, cancelable: true })));
      await page.waitForTimeout(450);
      await reactionBtn.evaluate((el) => el.dispatchEvent(new Event('touchend', { bubbles: true, cancelable: true })));

      const sheet = page.locator('div[role="dialog"][aria-label="Choose a reaction"]').first();
      await sheet.waitFor({ state: 'visible', timeout: 6000 });
      pushCheck(results.mobileFeed, 'Long-press opens mobile reaction sheet', true, 'Bottom sheet opened.');

      const box = await sheet.boundingBox();
      const vp = page.viewportSize();
      const inView = !!(box && vp && box.y >= 0 && box.y + box.height <= vp.height + 3);
      pushCheck(results.mobileFeed, 'Mobile reaction sheet is fully visible', inView, inView ? 'No clipping detected.' : 'Sheet clipping detected.');

      await page.screenshot({ path: path.join(artifactsDir, 'mobile-feed.png'), fullPage: true });
    } catch (error) {
      results.mobileFeed.errors.push(String(error?.message || error));
      await page.screenshot({ path: path.join(artifactsDir, 'mobile-feed-fail.png'), fullPage: true }).catch(() => {});
    }

    ensureStatus(results.mobileFeed);
    await context.close();
  }

  // Post detail checks + realtime cross-tab propagation
  {
    const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
    const pageA = await context.newPage();
    const pageB = await context.newPage();

    try {
      await applySessionToPage(pageA, session);
      await applySessionToPage(pageB, session);

      let postId = [...postIds][0] || null;
      if (!postId) postId = await firstApiPostId(context);
      if (!postId) throw new Error('Unable to resolve postId for /post/:postId smoke.');

      const route = `/post/${encodeURIComponent(postId)}`;
      results.postDetail.route = route;

      await pageA.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await pageB.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await pageA.waitForTimeout(2000);
      await pageB.waitForTimeout(2000);

      const barA = pageA.locator('div:has(button:has-text("Comment")):has(button:has-text("Repost"))').first();
      const barB = pageB.locator('div:has(button:has-text("Comment")):has(button:has-text("Repost"))').first();
      await barA.waitFor({ state: 'visible', timeout: 12000 });
      await barB.waitFor({ state: 'visible', timeout: 12000 });
      pushCheck(results.postDetail, 'Post detail renders engagement bar', true, route);

      const overlap = await checkButtonsNoOverlap(barA);
      pushCheck(results.postDetail, 'Post detail reaction actions have no overlap', overlap.pass, overlap.note);

      const before = await readReactionTotalFromBar(barB);

      const reactionBtn = barA.locator('button').first();
      await reactionBtn.click({ timeout: 6000 });
      pushCheck(results.postDetail, 'Reaction click executes without UI error', true, 'Primary reaction button clicked on detail view.');

      const changed = await pageB.waitForFunction(
        ({ expected }) => {
          const chip = document.querySelector('span.font-semibold.text-slate-700');
          const zero = document.querySelector('span.text-slate-400');
          const text = (chip?.textContent || zero?.textContent || '').trim();
          const now = Number(String(text).replace(/[^0-9.-]/g, '')) || 0;
          return now !== expected;
        },
        { expected: before },
        { timeout: 10000 }
      ).then(() => true).catch(() => false);

      pushCheck(results.postDetail, 'Realtime reaction update propagates across open detail views', changed, changed ? `Count changed from ${before}.` : `No count change observed from baseline ${before}.`);

      await reactionBtn.click({ timeout: 6000 }).catch(() => {});

      await pageA.screenshot({ path: path.join(artifactsDir, 'post-detail-a.png'), fullPage: true });
      await pageB.screenshot({ path: path.join(artifactsDir, 'post-detail-b.png'), fullPage: true });
    } catch (error) {
      results.postDetail.errors.push(String(error?.message || error));
      await pageA.screenshot({ path: path.join(artifactsDir, 'post-detail-fail-a.png'), fullPage: true }).catch(() => {});
      await pageB.screenshot({ path: path.join(artifactsDir, 'post-detail-fail-b.png'), fullPage: true }).catch(() => {});
    }

    ensureStatus(results.postDetail);
    await context.close();
  }
} catch (fatal) {
  results.auth.errors.push(String(fatal?.message || fatal));
} finally {
  if (browser) await browser.close();
}

for (const bucket of Object.values(results)) ensureStatus(bucket);
const overallPass = Object.values(results).every((bucket) => bucket.status === 'PASS');
const outputPath = path.join(artifactsDir, 'summary.json');
fs.writeFileSync(outputPath, JSON.stringify({ overallPass, results }, null, 2));

for (const [name, bucket] of Object.entries(results)) {
  console.log(`\n[${name}] ${bucket.status}${bucket.route ? ` (${bucket.route})` : ''}`);
  for (const check of bucket.checks) {
    console.log(` - ${check.pass ? 'PASS' : 'FAIL'}: ${check.name}${check.note ? ` :: ${check.note}` : ''}`);
  }
  for (const err of bucket.errors) {
    console.log(` - ERROR: ${err}`);
  }
}

console.log(`\nArtifacts: ${artifactsDir}`);
console.log(`Summary: ${outputPath}`);

if (!overallPass) process.exitCode = 2;
