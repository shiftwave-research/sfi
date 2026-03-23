// playwright.config.js
const { defineConfig, devices } = require('@playwright/test');
require('dotenv').config();

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60000,
  retries: 1,
  workers: 1,

  use: {
    headless: true,
    viewport: { width: 390, height: 844 },
    ignoreHTTPSErrors: true,
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Uncomment after running: npx playwright install webkit
    // {
    //   name: 'mobile',
    //   use: { ...devices['iPhone 14'] },
    // }
  ],

  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }]
  ],
});
