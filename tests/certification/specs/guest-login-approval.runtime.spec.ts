import { test, expect } from '@playwright/test';

test.describe('guest inline login approval runtime', () => {
  test.skip(
    process.env.SCROLITH_AUTH_APPROVAL_E2E !== '1',
    'Opt-in browser regression: run against a local build/preview with SCROLITH_AUTH_APPROVAL_E2E=1'
  );

  test('prevents reload, preserves Login, verifies HV, shows waiting state, and starts polling', async ({ page }) => {
    let loginRequests = 0;
    let statusRequests = 0;
    let verificationRequests = 0;
    let navigationsAfterSubmit = 0;
    let submitted = false;

    page.on('framenavigated', () => {
      if (submitted) navigationsAfterSubmit += 1;
    });

    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const path = url.pathname;

      if (request.method() === 'POST' && path.endsWith('/human-verification/create')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            required: true,
            challenge: {
              challengeToken: 'challenge-token-test',
              endpoint: 'login',
              challengeType: 'choice',
              difficulty: 'easy',
              prompt: { title: 'Choose the matching value', instruction: 'Select the correct answer.', kind: 'text' },
              options: [{ id: 'correct', label: 'Correct answer', value: 'correct' }],
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
              maxAttempts: 3
            }
          })
        });
        return;
      }

      if (request.method() === 'POST' && path.endsWith('/human-verification/verify')) {
        verificationRequests += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, verificationToken: 'verification-token-test' })
        });
        return;
      }

      if (request.method() === 'POST' && path.endsWith('/auth/login')) {
        loginRequests += 1;
        await route.fulfill({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify({
            requiresLoginApproval: true,
            code: 'LOGIN_APPROVAL_REQUIRED',
            attemptId: 'attempt-test',
            approvalToken: 'approval-token-test',
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            message: 'Approve this login from an existing trusted session.'
          })
        });
        return;
      }

      if (request.method() === 'POST' && path.includes('/security/login-approvals/') && path.endsWith('/status')) {
        statusRequests += 1;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'PENDING' })
        });
        return;
      }

      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
    });

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const loginTab = page.locator('button[type="button"]').filter({ hasText: /^Login$/ }).last();
    await expect(loginTab).toBeVisible();
    await loginTab.click();
    const loginForm = page.locator('form').filter({ has: page.locator('input[autocomplete="current-password"]') }).first();
    await expect(loginForm).toBeVisible();
    await loginForm.locator('input[type="email"]').fill('smoke@example.test');
    const password = loginForm.locator('input[autocomplete="current-password"]');
    await password.fill('not-a-real-password');
    await loginForm.getByRole('button', { name: /correct answer/i }).click();
    await expect.poll(() => verificationRequests).toBe(1);
    await expect(loginForm.locator('button[type="submit"]')).toBeEnabled();

    submitted = true;
    await password.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Waiting for trusted-device approval')).toBeVisible();
    await expect(loginForm).toBeVisible();
    await expect(loginForm.getByRole('button', { name: /waiting for approval/i })).toBeDisabled();
    await expect.poll(() => loginRequests).toBe(1);
    await expect.poll(() => statusRequests, { timeout: 6_000 }).toBeGreaterThan(0);
    expect(navigationsAfterSubmit).toBe(0);
  });
});
