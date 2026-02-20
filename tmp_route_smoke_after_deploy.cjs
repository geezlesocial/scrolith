const { chromium, devices } = require('playwright');

const BASE = 'https://scrolith.com';
const checks = [];

function ok(details = {}) {
  checks.push({ status: 'PASS', ...details });
}

function fail(details = {}) {
  checks.push({ status: 'FAIL', ...details });
}

async function getBodyPreview(page) {
  try {
    const txt = await page.locator('body').innerText({ timeout: 5000 });
    return String(txt || '').replace(/\s+/g, ' ').trim().slice(0, 260);
  } catch {
    return '';
  }
}

async function gotoAndInspect(page, path, label) {
  const url = `${BASE}${path}`;
  const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);
  const finalUrl = page.url();
  const statusCode = response ? response.status() : null;
  const title = await page.title();
  const bodyPreview = await getBodyPreview(page);
  return { label, path, url, finalUrl, statusCode, title, bodyPreview };
}

function routeLooksHealthy(entry) {
  return (entry.statusCode === null || entry.statusCode < 400) && !/not found|error 404/i.test(entry.bodyPreview);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await desktop.newPage();

    const home = await gotoAndInspect(page, '/', 'Desktop Home /');
    routeLooksHealthy(home) ? ok(home) : fail(home);

    let discoveredUserPath = null;
    try {
      const hrefs = await page.locator('a[href^="/u/"]').evaluateAll((els) =>
        els
          .map((el) => el.getAttribute('href'))
          .filter(Boolean)
      );
      discoveredUserPath = Array.isArray(hrefs) ? hrefs.find((h) => /^\/u\/[A-Za-z0-9_.-]+$/.test(String(h))) : null;
    } catch {}

    const browseJobs = await gotoAndInspect(page, '/browse-jobs', 'Desktop /browse-jobs');
    routeLooksHealthy(browseJobs) ? ok(browseJobs) : fail(browseJobs);

    const browseTalentRequested = await gotoAndInspect(page, '/browse-talent', 'Desktop /browse-talent (requested)');
    routeLooksHealthy(browseTalentRequested) ? ok(browseTalentRequested) : fail(browseTalentRequested);

    const browseTalentActual = await gotoAndInspect(page, '/browse', 'Desktop /browse (actual talent route)');
    routeLooksHealthy(browseTalentActual) ? ok(browseTalentActual) : fail(browseTalentActual);

    if (!discoveredUserPath) {
      try {
        const fromBrowse = await page.locator('a[href^="/u/"]').evaluateAll((els) =>
          els
            .map((el) => el.getAttribute('href'))
            .filter(Boolean)
        );
        discoveredUserPath = Array.isArray(fromBrowse)
          ? fromBrowse.find((h) => /^\/u\/[A-Za-z0-9_.-]+$/.test(String(h)))
          : null;
      } catch {}
    }

    const userPath = discoveredUserPath || '/u/jima';
    const userRoute = await gotoAndInspect(page, userPath, `Desktop ${userPath}`);
    const userRouteDetails = { ...userRoute, discoveredUserPath: discoveredUserPath || null };
    routeLooksHealthy(userRouteDetails) ? ok(userRouteDetails) : fail(userRouteDetails);

    await desktop.close();

    const mobile = await browser.newContext({ ...devices['iPhone 12'] });
    const mobilePage = await mobile.newPage();
    const mobileFeed = await gotoAndInspect(mobilePage, '/', 'Mobile feed /');

    let feedSignals = { articleCount: 0, hasNoPostsMsg: false, hasBody: false };
    try {
      feedSignals.articleCount = await mobilePage.locator('article').count();
      const bodyText = await mobilePage.locator('body').innerText();
      feedSignals.hasNoPostsMsg = /No posts yet|Be the first to share/i.test(bodyText || '');
      feedSignals.hasBody = String(bodyText || '').trim().length > 0;
    } catch {}

    const mobileDetails = { ...mobileFeed, ...feedSignals };
    if (routeLooksHealthy(mobileDetails) && (feedSignals.articleCount > 0 || feedSignals.hasNoPostsMsg || feedSignals.hasBody)) {
      ok(mobileDetails);
    } else {
      fail(mobileDetails);
    }

    await mobile.close();

    const summary = {
      executedAt: new Date().toISOString(),
      base: BASE,
      totals: {
        pass: checks.filter((c) => c.status === 'PASS').length,
        fail: checks.filter((c) => c.status === 'FAIL').length
      },
      checks
    };

    console.log(JSON.stringify(summary, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ fatal: true, message: err?.message || String(err), stack: err?.stack || null }, null, 2));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();