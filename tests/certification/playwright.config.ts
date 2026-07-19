/**
 * Phase 21.1.6 — Authenticated production certification Playwright config.
 *
 * Base URL defaults to the staged p2115 tag; override with CERT_BASE_URL.
 * Auth: CERT_STORAGE_STATE path, or CERT_EMAIL + CERT_PASSWORD via setup project.
 */
import { defineConfig, devices } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const storageStatePath =
  process.env.CERT_STORAGE_STATE || join(here, 'fixtures/storage-state.json');
const hasStorage = existsSync(storageStatePath);

const baseURL =
  process.env.CERT_BASE_URL ||
  process.env.P2115_BASE_URL ||
  'https://p2115---scrolith-frontend-25ysnpjdda-as.a.run.app';

export default defineConfig({
  testDir: join(here, 'specs'),
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: join(here, '../../playwright-results/phase2116/cert-results.json') }],
    ['html', { outputFolder: join(here, '../../playwright-results/phase2116/html-report'), open: 'never' }]
  ],
  outputDir: join(here, '../../playwright-results/phase2116/test-output'),
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    ...(hasStorage ? { storageState: storageStatePath } : {})
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
      testDir: join(here, 'fixtures')
    },
    {
      name: 'desktop-chrome',
      dependencies: hasStorage || process.env.CERT_EMAIL ? ['setup'] : [],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        ...(hasStorage ? { storageState: storageStatePath } : {})
      }
    },
    {
      name: 'pixel-7',
      dependencies: hasStorage || process.env.CERT_EMAIL ? ['setup'] : [],
      use: {
        ...devices['Pixel 7'],
        ...(hasStorage ? { storageState: storageStatePath } : {})
      }
    },
    {
      name: 'iphone-15',
      dependencies: hasStorage || process.env.CERT_EMAIL ? ['setup'] : [],
      use: {
        ...devices['iPhone 15'],
        ...(hasStorage ? { storageState: storageStatePath } : {})
      }
    },
    {
      name: 'mobile-390',
      dependencies: hasStorage || process.env.CERT_EMAIL ? ['setup'] : [],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        userAgent:
          'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        ...(hasStorage ? { storageState: storageStatePath } : {})
      }
    }
  ]
});
