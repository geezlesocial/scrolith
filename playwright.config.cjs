// Playwright config (CommonJS) — use this when package.json uses "type": "module"
module.exports = {
  testDir: './tests',
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
