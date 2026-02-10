// Playwright config - ESM export for projects using "type": "module"
export default {
  testDir: './tests',
  // Run only TypeScript spec files to avoid accidentally loading compiled .js files
  testMatch: /.*\.spec\.ts$/,
  timeout: 120000,
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    viewport: { width: 1280, height: 900 },
    actionTimeout: 30000,
    navigationTimeout: 30000,
  },
  reporter: [['list'], ['html', { outputFolder: 'playwright-report' }]],
};
