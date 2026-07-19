import type { Page, APIRequestContext } from '@playwright/test';
import { CERT_BASE_URL, CERT_EMAIL, CERT_PASSWORD } from './env';

/**
 * UI login against the certification base URL.
 * Prefer storage state generation for CI (scripts/phase2116-generate-storage-state.mjs).
 */
export async function loginViaUi(page: Page, email = CERT_EMAIL, password = CERT_PASSWORD) {
  if (!email || !password) {
    throw new Error('CERT_EMAIL and CERT_PASSWORD are required for UI login');
  }
  await page.goto('/auth/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  const emailInput = page
    .locator('input[type="email"], input[name="email"], input[autocomplete="username"]')
    .first();
  const passwordInput = page
    .locator('input[type="password"], input[name="password"], input[autocomplete="current-password"]')
    .first();

  await emailInput.fill(email);
  await passwordInput.fill(password);

  const submit = page
    .locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")')
    .first();
  await submit.click();

  await page.waitForURL((url) => !url.pathname.includes('/auth/login'), { timeout: 45_000 });
  await page.waitForTimeout(1500);
}

/**
 * Optional API login when the public API allows credential grant from the cert origin.
 * Returns token string or null.
 */
export async function loginViaApi(
  request: APIRequestContext,
  email = CERT_EMAIL,
  password = CERT_PASSWORD
): Promise<string | null> {
  if (!email || !password) return null;
  const apiBase =
    process.env.CERT_API_BASE ||
    process.env.VITE_API_URL ||
    'https://api.scrolith.com/api';
  try {
    const res = await request.post(`${apiBase.replace(/\/$/, '')}/auth/login`, {
      data: { email, password },
      failOnStatusCode: false
    });
    if (!res.ok()) return null;
    const body = await res.json().catch(() => ({} as any));
    return (
      body?.token ||
      body?.accessToken ||
      body?.data?.token ||
      body?.data?.accessToken ||
      null
    );
  } catch {
    return null;
  }
}

export async function injectToken(page: Page, token: string, user?: Record<string, unknown>) {
  await page.addInitScript(
    ({ token: t, user: u }) => {
      try {
        localStorage.setItem('token', t);
        if (u) localStorage.setItem('user', JSON.stringify(u));
      } catch {
        /* ignore */
      }
    },
    { token, user: user || { id: 'cert-user', email: CERT_EMAIL } }
  );
}

export function isLikelyAuthenticated(page: Page) {
  return page.evaluate(() => {
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('accessToken');
      return Boolean(token);
    } catch {
      return false;
    }
  });
}

export { CERT_BASE_URL };
