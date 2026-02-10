import { test, expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';

const FRONTEND = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const PASSWORD = 'RealtimePassw0rd!';

type AuthSession = {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    username?: string;
  };
};

const authHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json'
});

const unwrap = (payload: any) => {
  if (payload?.data !== undefined) return payload.data;
  return payload;
};

const parseFollowersCount = (text: string | null) => {
  if (!text) return -1;
  const match = text.match(/(\d+)\s+followers/i);
  return match ? Number(match[1]) : -1;
};

async function dismissBlockingOverlays(page: Page): Promise<void> {
  // Defensive close handler for marketing/newsletter overlays that can intercept clicks.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.keyboard.press('Escape').catch(() => {});

    const namedClose = page
      .getByRole('button', { name: /close|dismiss|not now|no thanks|skip|later/i })
      .first();
    if (await namedClose.isVisible().catch(() => false)) {
      await namedClose.click({ timeout: 1500 }).catch(() => {});
    }

    const ariaClose = page.locator('button[aria-label="Close"], [role="button"][aria-label="Close"]').first();
    if (await ariaClose.isVisible().catch(() => false)) {
      await ariaClose.click({ timeout: 1500 }).catch(() => {});
    }

    const xClose = page
      .locator('button:has-text("×"), button:has-text("Close"), button:has-text("Not now"), button:has-text("No thanks")')
      .first();
    if (await xClose.isVisible().catch(() => false)) {
      await xClose.click({ timeout: 1500 }).catch(() => {});
    }

    await page.mouse.click(10, 10).catch(() => {});
  }
}

async function login(
  request: APIRequestContext,
  email: string,
  password: string
): Promise<AuthSession | null> {
  const response = await request.post(`${FRONTEND}/api/auth/login`, {
    data: { email, password }
  });
  if (!response.ok()) return null;
  const json = await response.json().catch(() => ({}));
  const token = json?.token;
  const user = json?.user;
  if (!token || !user?.id) return null;
  return { token, user };
}

async function registerAndLogin(
  request: APIRequestContext,
  input: { email: string; name: string; role: 'EMPLOYER' | 'CLIENT' | 'FREELANCER' }
): Promise<AuthSession> {
  const existing = await login(request, input.email, PASSWORD);
  if (existing) return existing;

  const registerResponse = await request.post(`${FRONTEND}/api/auth/register`, {
    data: {
      email: input.email,
      name: input.name,
      password: PASSWORD,
      role: input.role
    }
  });

  if (!registerResponse.ok() && registerResponse.status() !== 409) {
    const body = await registerResponse.text().catch(() => '');
    throw new Error(`Failed to register ${input.email}: ${registerResponse.status()} ${body}`);
  }

  const session = await login(request, input.email, PASSWORD);
  if (!session) throw new Error(`Failed to login ${input.email} after register`);
  return session;
}

async function buildAuthenticatedContext(
  context: BrowserContext,
  auth: AuthSession
): Promise<void> {
  await context.addCookies([
    {
      name: 'Scrolith_token',
      value: auth.token,
      url: FRONTEND
    }
  ]);
  await context.addInitScript(
    ({ token, user }) => {
      try {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        // Keep marketing popups disabled during deterministic realtime assertions.
        localStorage.setItem('marketing.popup.subscribe.dismissedAt', String(Date.now()));
        localStorage.setItem('marketing.popup.subscribe.successAt', String(Date.now()));
      } catch {
        // ignore storage errors in test setup
      }
    },
    { token: auth.token, user: auth.user }
  );
}

async function suppressMarketingPopups(page: Page): Promise<void> {
  await page.route('**/api/marketing/popup-subscribe**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { enabled: false }
      })
    });
  });

  await page.route('**/api/marketing/popup-banners**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: []
      })
    });
  });
}

async function getOrCreateBusinessPage(request: APIRequestContext, owner: AuthSession) {
  const myPagesResponse = await request.get(`${FRONTEND}/api/community/business-pages/me`, {
    headers: authHeaders(owner.token)
  });
  if (!myPagesResponse.ok()) {
    const body = await myPagesResponse.text().catch(() => '');
    throw new Error(`Unable to list business pages: ${myPagesResponse.status()} ${body}`);
  }
  const myPagesJson = await myPagesResponse.json().catch(() => ({}));
  const myPages = Array.isArray(unwrap(myPagesJson)) ? unwrap(myPagesJson) : [];
  if (myPages.length > 0) {
    const existing = myPages[0];
    return {
      id: String(existing.id),
      slug: String(existing.slug),
      name: String(existing.name || 'Realtime Page')
    };
  }

  const now = Date.now();
  const slug = `rt-page-${now}`;
  const createResponse = await request.post(`${FRONTEND}/api/community/business-pages`, {
    headers: authHeaders(owner.token),
    data: {
      name: `Realtime Page ${now}`,
      handle: `rtpage${now}`,
      slug,
      tagline: 'Realtime assertions page'
    }
  });
  if (!createResponse.ok()) {
    const body = await createResponse.text().catch(() => '');
    throw new Error(`Unable to create business page: ${createResponse.status()} ${body}`);
  }

  const createdJson = await createResponse.json().catch(() => ({}));
  const created = unwrap(createdJson) || {};
  return {
    id: String(created.id),
    slug: String(created.slug || slug),
    name: String(created.name || `Realtime Page ${now}`)
  };
}

async function ensureViewerUnfollowedPage(
  request: APIRequestContext,
  viewer: AuthSession,
  pageId: string
) {
  const followingResponse = await request.get(`${FRONTEND}/api/community/following?userId=me`, {
    headers: authHeaders(viewer.token)
  });
  if (!followingResponse.ok()) return;
  const followingJson = await followingResponse.json().catch(() => ({}));
  const following = unwrap(followingJson) || {};
  const pages = Array.isArray(following.pages) ? following.pages : [];
  const match = pages.find((entry: any) => String(entry?.id || '') === pageId);
  const followId = match?.followId || match?.follow_id || null;
  if (!followId) return;
  await request.delete(`${FRONTEND}/api/community/follow/${followId}`, {
    headers: authHeaders(viewer.token)
  });
}

async function readFollowersSummaryCount(page: Page) {
  const summary = page.locator('p').filter({ hasText: 'followers ·' }).first();
  const text = await summary.textContent();
  return parseFollowersCount(text);
}

test.describe('Business page strict realtime assertions', () => {
  test.setTimeout(240000);

  test('create/edit/delete post + follow/unfollow sync across two sessions', async ({ browser, request }) => {
    const stamp = Date.now();
    const owner = await registerAndLogin(request, {
      email: `e2e.page.owner.${stamp}@local.test`,
      name: `E2E Page Owner ${stamp}`,
      role: 'EMPLOYER'
    });
    const viewer = await registerAndLogin(request, {
      email: `e2e.page.viewer.${stamp}@local.test`,
      name: `E2E Page Viewer ${stamp}`,
      role: 'CLIENT'
    });

    const businessPage = await getOrCreateBusinessPage(request, owner);
    await ensureViewerUnfollowedPage(request, viewer, businessPage.id);

    const ownerContext = await browser.newContext();
    const viewerContext = await browser.newContext();
    await buildAuthenticatedContext(ownerContext, owner);
    await buildAuthenticatedContext(viewerContext, viewer);

    const ownerPage = await ownerContext.newPage();
    const viewerPage = await viewerContext.newPage();
    const pageUrl = `${FRONTEND}/company/${businessPage.slug}`;

    await Promise.all([suppressMarketingPopups(ownerPage), suppressMarketingPopups(viewerPage)]);

    ownerPage.on('pageerror', (err) => {
      console.log('[owner pageerror]', err.message);
    });
    viewerPage.on('pageerror', (err) => {
      console.log('[viewer pageerror]', err.message);
    });

    await Promise.all([
      ownerPage.goto(pageUrl, { waitUntil: 'domcontentloaded' }),
      viewerPage.goto(pageUrl, { waitUntil: 'domcontentloaded' })
    ]);

    await expect(ownerPage.locator('h1')).toContainText(businessPage.name, { timeout: 30000 });
    await expect(viewerPage.locator('h1')).toContainText(businessPage.name, { timeout: 30000 });

    await dismissBlockingOverlays(ownerPage);
    await dismissBlockingOverlays(viewerPage);

    const createContent = `RT-CREATE-${stamp}`;
    await ownerPage.getByPlaceholder('Share an update with your followers...').fill(createContent);
    await ownerPage.getByRole('button', { name: 'Publish', exact: true }).click();

    const ownerCreatedPost = ownerPage.locator('article', { hasText: createContent }).first();
    await expect(ownerCreatedPost).toBeVisible({ timeout: 20000 });
    const postDomId = await ownerCreatedPost.getAttribute('id');
    if (!postDomId) throw new Error('Could not resolve created post DOM id');

    const ownerPost = ownerPage.locator(`#${postDomId}`).first();
    const viewerPost = viewerPage.locator(`#${postDomId}`).first();
    await expect(viewerPost).toBeVisible({ timeout: 20000 });
    await expect(viewerPost).toContainText(createContent);

    const editedContent = `RT-EDIT-${stamp}`;
    await ownerPost.getByRole('button', { name: 'Edit', exact: true }).click();
    await ownerPost.locator('textarea').first().fill(editedContent);
    await ownerPost.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(viewerPost).toContainText(editedContent, { timeout: 20000 });
    await expect(viewerPost).not.toContainText(createContent);

    ownerPage.once('dialog', (dialog) => dialog.accept());
    await ownerPost.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect
      .poll(async () => viewerPage.locator(`#${postDomId}`).count(), {
        timeout: 20000,
        intervals: [500, 1000, 2000]
      })
      .toBe(0);

    const viewerFollowButton = viewerPage.getByRole('button', { name: /Follow|Following/ }).first();
    await expect(viewerFollowButton).toBeVisible({ timeout: 20000 });
    await expect(viewerFollowButton).toHaveText('Follow');

    const baselineFollowers = await readFollowersSummaryCount(ownerPage);
    expect(baselineFollowers).toBeGreaterThanOrEqual(0);

    await viewerFollowButton.click();
    await expect(viewerFollowButton).toHaveText('Following', { timeout: 15000 });

    await expect
      .poll(async () => readFollowersSummaryCount(ownerPage), { timeout: 20000, intervals: [500, 1000, 2000] })
      .toBe(baselineFollowers + 1);

    await viewerFollowButton.click();
    await expect(viewerFollowButton).toHaveText('Follow', { timeout: 15000 });

    await expect
      .poll(async () => readFollowersSummaryCount(ownerPage), { timeout: 20000, intervals: [500, 1000, 2000] })
      .toBe(baselineFollowers);

    await ownerContext.close();
    await viewerContext.close();
  });
});
