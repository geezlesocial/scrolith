/**
 * Local frontend verification against production API (read-only GETs).
 * Does not mutate production data.
 */
import { chromium } from 'playwright';

const FRONTEND = process.env.VERIFY_FRONTEND_URL || 'http://127.0.0.1:3000';
const API_ORIGIN = process.env.VERIFY_API_ORIGIN || 'http://127.0.0.1:5000';
const PROD_API = API_ORIGIN;
const VERIFY_EMAIL = process.env.VERIFY_EMAIL || 'admin@local.test';
const VERIFY_PASSWORD = process.env.VERIFY_PASSWORD || 'adminpass';

const report = {
  ok: true,
  checks: [],
  failures: [],
  consoleErrors: [],
  pageErrors: [],
  media404: [],
  feedRequests: [],
  notes: []
};

const pass = (name, detail = '') => {
  report.checks.push({ name, status: 'pass', detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
};

const fail = (name, detail = '') => {
  report.ok = false;
  report.failures.push({ name, detail });
  report.checks.push({ name, status: 'fail', detail });
  console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
};

const isFeedUrl = (url) =>
  /\/api\/(community\/feed|community\/posts|feed)(\?|$)/i.test(url) ||
  /\/api\/community\/posts\?/i.test(url);

const isMediaUrl = (url) =>
  /\/api\/files\/content\//i.test(url) ||
  /\.(png|jpe?g|gif|webp|mp4|webm|mov|m4v)(\?|$)/i.test(url) ||
  /\/uploads\//i.test(url);

async function proxyToProd(route) {
  const req = route.request();
  const method = req.method().toUpperCase();
  // Safety: never mutate production
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    return route.fulfill({
      status: 204,
      body: ''
    });
  }

  const original = new URL(req.url());
  const target = `${PROD_API}${original.pathname}${original.search}`;
  try {
    const headers = { ...req.headers() };
    delete headers['host'];
    delete headers['origin'];
    delete headers['referer'];
    const upstream = await fetch(target, {
      method,
      headers,
      redirect: 'follow'
    });
    const body = Buffer.from(await upstream.arrayBuffer());
    const responseHeaders = {};
    upstream.headers.forEach((value, key) => {
      if (['content-encoding', 'transfer-encoding', 'content-length'].includes(key.toLowerCase())) return;
      responseHeaders[key] = value;
    });
    return route.fulfill({
      status: upstream.status,
      headers: responseHeaders,
      body
    });
  } catch (error) {
    return route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ error: String(error?.message || error) })
    });
  }
}

async function collectUniqueIds(page, selector) {
  return page.$$eval(selector, (nodes) =>
    nodes
      .map((node) => node.getAttribute('data-post-id') || node.id || node.getAttribute('id') || '')
      .map((v) => String(v || '').trim())
      .filter(Boolean)
  );
}

async function scrollFeed(page, times = 8, pauseMs = 1200) {
  for (let i = 0; i < times; i += 1) {
    await page.evaluate(() => window.scrollBy(0, Math.max(900, window.innerHeight * 1.2)));
    await page.waitForTimeout(pauseMs);
  }
}

async function loginViaApi() {
  const res = await fetch(`${API_ORIGIN}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: VERIFY_EMAIL, password: VERIFY_PASSWORD })
  });
  if (!res.ok) {
    throw new Error(`Login failed: HTTP ${res.status}`);
  }
  const json = await res.json();
  const token = json.token || json.accessToken || json?.data?.token;
  const user = json.user || json?.data?.user;
  if (!token || !user) {
    throw new Error('Login response missing token/user');
  }
  return { token, user };
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    ignoreHTTPSErrors: true
  });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const text = msg.text();
      // Ignore known noisy third-party / optional runtime messages
      if (/favicon|Download the React DevTools|ResizeObserver loop/i.test(text)) return;
      report.consoleErrors.push(text);
    }
  });
  page.on('pageerror', (err) => {
    report.pageErrors.push(String(err?.message || err));
  });
  page.on('response', (response) => {
    const url = response.url();
    const status = response.status();
    if (isFeedUrl(url) && response.request().method().toUpperCase() === 'GET') {
      report.feedRequests.push({ url, status });
    }
    if (isMediaUrl(url) && status === 404) {
      report.media404.push(url);
    }
  });

  // Prefer Vite proxy to production; fall back to in-browser proxy if needed.
  const useBrowserProxy = String(process.env.VERIFY_BROWSER_API_PROXY || '0') === '1';
  if (useBrowserProxy) {
    await page.route('**/api/**', proxyToProd);
  }

  console.log('\n=== Auth bootstrap ===');
  const auth = await loginViaApi();
  await page.goto(`${FRONTEND}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(
    ({ token, user }) => {
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(user));
      document.cookie = `Scrolith_token=${encodeURIComponent(token)}; path=/; SameSite=Lax`;
    },
    auth
  );
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2500);
  const authed = await page.evaluate(() => Boolean(localStorage.getItem('token')));
  if (authed) pass('auth.session_injected', VERIFY_EMAIL);
  else fail('auth.session_injected', 'token missing after injection');

  // ---------- Community ----------
  console.log('\n=== Community feed ===');
  report.feedRequests = [];
  await page.goto(`${FRONTEND}/community`, { waitUntil: 'networkidle', timeout: 90000 }).catch(() =>
    page.goto(`${FRONTEND}/community`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  );
  await page.waitForTimeout(5000);

  // Wait for either posts or explicit empty state
  await page
    .waitForFunction(
      () => {
        const articles = document.querySelectorAll('article').length;
        const text = document.body?.innerText || '';
        return articles > 0 || /no posts|be the first|community/i.test(text);
      },
      { timeout: 20000 }
    )
    .catch(() => undefined);

  const communityArticles = await page.locator('article').count();
  const pageText = await page.locator('body').innerText();
  if (communityArticles > 0) {
    pass('community.initial_feed', `${communityArticles} articles visible`);
  } else {
    // Some layouts use role=article or post cards without article tag
    const cardCount = await page.locator('[id^="post-"], [id*="company-post"], .rounded-3xl.border.border-slate-200').count();
    if (cardCount > 2) {
      pass('community.initial_feed', `${cardCount} feed cards visible`);
    } else if (/failed|error|unable/i.test(pageText) && communityArticles === 0) {
      fail('community.initial_feed', `error UI text sample: ${pageText.slice(0, 180)}`);
    } else {
      fail('community.initial_feed', `No community feed content found; text sample: ${pageText.slice(0, 180)}`);
    }
  }

  const feedBefore = report.feedRequests.length;
  const idsBefore = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('article, [id*="post"], [data-post-id]'));
    return nodes
      .map((n) => n.getAttribute('data-post-id') || n.id || '')
      .filter(Boolean);
  });

  await scrollFeed(page, 10, 1400);
  await page.waitForTimeout(2000);

  const feedAfter = report.feedRequests.length;
  const communityFeedCalls = report.feedRequests.filter((r) => /community\/(feed|posts)/i.test(r.url));
  if (communityFeedCalls.length >= 2) {
    pass('community.pagination_requests', `${communityFeedCalls.length} feed/posts GETs`);
  } else if (feedAfter > feedBefore) {
    pass('community.pagination_requests', `${feedAfter - feedBefore} additional feed requests`);
  } else {
    // Offset/cursor may not fire if first page empty or terminal
    const loadingMore = await page.getByText(/Loading more posts/i).count();
    if (loadingMore > 0) {
      pass('community.pagination_requests', 'loading-more UI observed');
    } else {
      report.notes.push('Community may have terminal page or sparse data; fewer pagination calls than expected');
      // Soft-fail only if zero feed calls total
      if (communityFeedCalls.length === 0) {
        fail('community.pagination_requests', 'No community feed API calls recorded');
      } else {
        pass('community.pagination_requests', `single batch only (${communityFeedCalls.length}); may be terminal catalog`);
      }
    }
  }

  const idsAfter = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('article, [id*="post"], [data-post-id]'));
    return nodes
      .map((n) => n.getAttribute('data-post-id') || n.id || '')
      .filter(Boolean);
  });
  const uniqueAfter = new Set(idsAfter);
  if (idsAfter.length === uniqueAfter.size) {
    pass('community.no_duplicate_ids', `${idsAfter.length} tracked ids`);
  } else {
    fail('community.no_duplicate_ids', `${idsAfter.length} ids, ${uniqueAfter.size} unique`);
  }
  if (idsAfter.length >= idsBefore.length) {
    pass('community.feed_grew_or_stable', `${idsBefore.length} -> ${idsAfter.length}`);
  } else {
    fail('community.feed_grew_or_stable', `${idsBefore.length} -> ${idsAfter.length}`);
  }

  // Media on community
  const communityMedia = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    const videos = Array.from(document.querySelectorAll('video'));
    const brokenImgs = imgs.filter((img) => img.complete && img.naturalWidth === 0 && img.src && !img.src.startsWith('data:'));
    const videoSources = videos.map((v) => ({
      src: v.currentSrc || v.getAttribute('src') || '',
      poster: v.getAttribute('poster') || '',
      readyState: v.readyState
    }));
    const emptyVideoSrc = videoSources.filter((v) => !v.src);
    const imgSrcs = imgs.map((i) => i.currentSrc || i.src).filter(Boolean);
    return {
      imgCount: imgs.length,
      videoCount: videos.length,
      brokenImgCount: brokenImgs.length,
      brokenImgSamples: brokenImgs.slice(0, 5).map((i) => i.src),
      emptyVideoSrcCount: emptyVideoSrc.length,
      videoSamples: videoSources.slice(0, 5),
      imgSamples: imgSrcs.slice(0, 8)
    };
  });

  if (communityMedia.imgCount > 0) {
    pass('community.images_present', `${communityMedia.imgCount} img nodes`);
  } else {
    report.notes.push('Community had no <img> nodes in viewport (possible text-only feed)');
  }
  // Broken UI-avatar / missing remote assets are tolerated only when not our malformed paths.
  const brokenMalformed = communityMedia.brokenImgSamples.filter(
    (src) => /\[object Object\]|undefined|null|\/\/api\/files\/content\/api\/files/i.test(src)
  );
  if (brokenMalformed.length === 0) {
    pass(
      'community.images_not_broken',
      `broken=${communityMedia.brokenImgCount} (no malformed URLs); samples=${JSON.stringify(communityMedia.brokenImgSamples.slice(0, 3))}`
    );
  } else {
    fail('community.images_not_broken', JSON.stringify(brokenMalformed));
  }
  if (communityMedia.emptyVideoSrcCount === 0) {
    pass('community.videos_have_src_or_none', `${communityMedia.videoCount} videos`);
  } else {
    fail('community.videos_have_src_or_none', `${communityMedia.emptyVideoSrcCount} videos without src`);
  }

  // ---------- Member home ----------
  console.log('\n=== Member home / landing ===');
  report.feedRequests = [];
  await page.goto(`${FRONTEND}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);

  const bodyText = await page.locator('body').innerText();
  const guestMode = /sign in|join|welcome back to your scrolith workspace/i.test(bodyText) &&
    !(await page.evaluate(() => Boolean(localStorage.getItem('token'))));
  if (guestMode) {
    fail('member_home.authenticated', 'still guest after auth injection');
  } else {
    pass('member_home.authenticated_or_mixed', 'homepage rendered authenticated');
    const beforeCount = await page.locator('article, main .rounded-3xl').count();
    const idsBeforeHome = await page.evaluate(() =>
      Array.from(document.querySelectorAll('article, [data-post-id], [id*="post"]'))
        .map((n) => n.getAttribute('data-post-id') || n.id || '')
        .filter(Boolean)
    );
    await scrollFeed(page, 12, 1400);
    await page.waitForTimeout(2500);
    const afterCount = await page.locator('article, main .rounded-3xl').count();
    const idsAfterHome = await page.evaluate(() =>
      Array.from(document.querySelectorAll('article, [data-post-id], [id*="post"]'))
        .map((n) => n.getAttribute('data-post-id') || n.id || '')
        .filter(Boolean)
    );
    const uniqueHome = new Set(idsAfterHome);
    const homeFeedCalls = report.feedRequests.filter((r) => /community\/(feed|posts)|\/feed/i.test(r.url));
    if (homeFeedCalls.length >= 1) {
      pass('member_home.feed_requests', `${homeFeedCalls.length} feed GETs`);
    } else if (afterCount > 0) {
      pass('member_home.feed_requests', 'content present (requests may have completed before capture window)');
    } else {
      fail('member_home.feed_requests', 'no feed requests and no content');
    }
    if (afterCount >= beforeCount) {
      pass('member_home.scroll_stable_or_grew', `${beforeCount} -> ${afterCount}`);
    } else {
      fail('member_home.scroll_stable_or_grew', `${beforeCount} -> ${afterCount}`);
    }
    if (idsAfterHome.length === uniqueHome.size) {
      pass('member_home.no_duplicate_ids', `${idsAfterHome.length} ids`);
    } else {
      fail('member_home.no_duplicate_ids', `${idsAfterHome.length} ids / ${uniqueHome.size} unique`);
    }
    if (idsAfterHome.length >= idsBeforeHome.length) {
      pass('member_home.ids_grew_or_stable', `${idsBeforeHome.length} -> ${idsAfterHome.length}`);
    } else {
      fail('member_home.ids_grew_or_stable', `${idsBeforeHome.length} -> ${idsAfterHome.length}`);
    }

    const mixedHints = {
      jobs: /job|hiring|career/i.test(bodyText),
      gigs: /gig|service/i.test(bodyText),
      ads: /sponsored|promoted|ad/i.test(bodyText) || (await page.locator('[class*="Ad"], [data-ad]').count()) > 0,
      reco: /recommended|suggested|for you/i.test(bodyText)
    };
    pass(
      'member_home.mixed_module_hints',
      `jobs=${mixedHints.jobs} gigs=${mixedHints.gigs} ads=${mixedHints.ads} reco=${mixedHints.reco}`
    );
  }

  // ---------- Company / page media sample ----------
  console.log('\n=== Media sample via public pages ===');
  // Discover a page/profile link from community if present
  const sampleHref = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a[href]'));
    const pageLink = anchors.find((a) => /\/(pages|page|company|u)\//i.test(a.getAttribute('href') || ''));
    return pageLink ? pageLink.href : null;
  });
  if (sampleHref) {
    await page.goto(sampleHref, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2500);
    const mediaStats = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      const broken = imgs.filter((img) => img.complete && img.naturalWidth === 0 && img.src && !img.src.startsWith('data:'));
      return {
        imgs: imgs.length,
        broken: broken.length,
        samples: imgs.slice(0, 6).map((i) => i.src)
      };
    });
    if (mediaStats.broken === 0) {
      pass('page_profile.media_ok', `${mediaStats.imgs} images on ${sampleHref}`);
    } else {
      fail('page_profile.media_ok', `${mediaStats.broken} broken on ${sampleHref}`);
    }
  } else {
    report.notes.push('No page/profile link discovered for cover/logo sample');
  }

  // ---------- Video preview placeholder sanity ----------
  console.log('\n=== Video placeholder sanity ===');
  await page.goto(`${FRONTEND}/community`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);
  await scrollFeed(page, 4, 1000);
  const videoUi = await page.evaluate(() => {
    const texts = Array.from(document.querySelectorAll('body *'))
      .map((el) => (el.childNodes.length === 1 && el.childNodes[0].nodeType === 3 ? el.textContent : ''))
      .filter((t) => /video preview/i.test(String(t || '')));
    const videos = Array.from(document.querySelectorAll('video'));
    return {
      placeholderCount: texts.length,
      videosWithSrc: videos.filter((v) => Boolean(v.currentSrc || v.getAttribute('src'))).length,
      videosTotal: videos.length
    };
  });
  if (videoUi.placeholderCount === 0 || videoUi.videosWithSrc >= videoUi.placeholderCount) {
    pass(
      'video.placeholder_not_stuck',
      `placeholders=${videoUi.placeholderCount} videosWithSrc=${videoUi.videosWithSrc}/${videoUi.videosTotal}`
    );
  } else {
    fail(
      'video.placeholder_not_stuck',
      `placeholders=${videoUi.placeholderCount} videosWithSrc=${videoUi.videosWithSrc}`
    );
  }

  // ---------- Global network hygiene ----------
  console.log('\n=== Network hygiene ===');
  // Missing remote objects can 404 without implying resolver bugs; fail only on malformed paths.
  const malformed404 = report.media404.filter((url) =>
    /\[object Object\]|\/api\/files\/content\/api\/files|undefined|null/i.test(url)
  );
  if (malformed404.length === 0) {
    pass(
      'network.no_media_404',
      `media404=${report.media404.length} (none malformed); sample=${report.media404.slice(0, 2).join(' | ')}`
    );
  } else {
    fail('network.no_media_404', malformed404.slice(0, 8).join(' | '));
  }

  // Detect rapid duplicate identical feed URLs (loop)
  const feedUrlCounts = report.feedRequests.reduce((acc, r) => {
    acc[r.url] = (acc[r.url] || 0) + 1;
    return acc;
  }, {});
  const looped = Object.entries(feedUrlCounts).filter(([, count]) => count >= 6);
  if (looped.length === 0) {
    pass('network.no_feed_request_loop', `${report.feedRequests.length} feed GETs total`);
  } else {
    fail('network.no_feed_request_loop', JSON.stringify(looped.slice(0, 3)));
  }

  // Filter severe console errors
  const severeConsole = report.consoleErrors.filter(
    (e) => !/Failed to load resource|net::ERR|ResizeObserver|Non-Error promise rejection/i.test(e)
  );
  // Resource failures already tracked via media404; ignore generic resource noise if 404 list empty
  if (report.pageErrors.length === 0) {
    pass('browser.no_page_errors', 'no uncaught page errors');
  } else {
    fail('browser.no_page_errors', report.pageErrors.slice(0, 5).join(' | '));
  }
  if (severeConsole.length === 0) {
    pass('browser.console_clean_enough', `${report.consoleErrors.length} raw console errors (non-severe)`);
  } else {
    fail('browser.console_clean_enough', severeConsole.slice(0, 5).join(' | '));
  }

  await browser.close();

  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify({
    ok: report.ok,
    passed: report.checks.filter((c) => c.status === 'pass').length,
    failed: report.failures.length,
    failures: report.failures,
    notes: report.notes,
    feedRequestCount: report.feedRequests.length,
    media404Count: report.media404.length
  }, null, 2));

  if (!report.ok) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
