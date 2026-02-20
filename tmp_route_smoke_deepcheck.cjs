const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const checks = [];

  // browse-jobs deeper wait
  const r1 = await page.goto('https://scrolith.com/browse-jobs', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(12000);
  const jobsBody = await page.locator('body').innerText();
  checks.push({
    route: '/browse-jobs',
    statusCode: r1 ? r1.status() : null,
    stillLoading: /Loading jobs\.\.\./i.test(jobsBody),
    hasBrowseJobsHeading: /Browse Jobs/i.test(jobsBody),
    articleCount: await page.locator('article').count(),
    preview: jobsBody.replace(/\s+/g, ' ').trim().slice(0, 220)
  });

  // discover real username links
  await page.goto('https://scrolith.com/browse', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);
  const userLinks = await page.locator('a[href^="/u/"]').evaluateAll((els) => els.map((el) => el.getAttribute('href')).filter(Boolean));
  checks.push({ route: '/browse -> user links', count: userLinks.length, sample: userLinks.slice(0, 5) });

  // test profile route from discovered, if any
  if (userLinks.length > 0) {
    const path = userLinks[0];
    const r2 = await page.goto(`https://scrolith.com${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);
    const profileBody = await page.locator('body').innerText();
    checks.push({
      route: path,
      statusCode: r2 ? r2.status() : null,
      hasErrorText: /Unable to load profile right now/i.test(profileBody),
      hasFollowers: /followers/i.test(profileBody),
      preview: profileBody.replace(/\s+/g, ' ').trim().slice(0, 220)
    });
  }

  console.log(JSON.stringify({ executedAt: new Date().toISOString(), checks }, null, 2));
  await browser.close();
})();