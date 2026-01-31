// Playwright expects a CommonJS config when the project uses "type": "module" in package.json.
// Rename to .cjs if necessary. Keeping CommonJS export style here.
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
