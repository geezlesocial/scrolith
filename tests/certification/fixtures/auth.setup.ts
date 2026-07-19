import { test as setup, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CERT_EMAIL,
  CERT_PASSWORD,
  CERT_STORAGE_STATE,
  canRunAuthenticated,
  hasAuthCredentials,
  hasAuthStorage
} from '../helpers/env';
import { injectToken, loginViaApi, loginViaUi } from '../helpers/auth';

const here = dirname(fileURLToPath(import.meta.url));

setup('authenticate for certification suite', async ({ page, request }) => {
  setup.skip(!canRunAuthenticated(), 'No CERT_STORAGE_STATE or CERT_EMAIL/CERT_PASSWORD');

  // Existing storage state is sufficient — refresh file timestamp by re-saving
  if (hasAuthStorage() && !hasAuthCredentials()) {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.context().storageState({ path: CERT_STORAGE_STATE });
    return;
  }

  mkdirSync(dirname(CERT_STORAGE_STATE), { recursive: true });

  const token = await loginViaApi(request, CERT_EMAIL, CERT_PASSWORD);
  if (token) {
    await injectToken(page, token, { email: CERT_EMAIL });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  } else {
    await loginViaUi(page, CERT_EMAIL, CERT_PASSWORD);
  }

  // Soft assert: we should not remain on login
  await expect(page).not.toHaveURL(/\/auth\/login/, { timeout: 15_000 }).catch(() => undefined);
  await page.context().storageState({ path: CERT_STORAGE_STATE });
  // Also write example path for local default
  const defaultPath = join(here, 'storage-state.json');
  if (defaultPath !== CERT_STORAGE_STATE) {
    await page.context().storageState({ path: defaultPath });
  }
});
