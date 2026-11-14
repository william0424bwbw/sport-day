import { defineConfig, devices } from '@playwright/test';

// 端對端測試：同一組測試分別在「桌機」與「手機」尺寸執行
// 伺服器：scripts/serve-test.sh（獨立的本機 D1，不會碰到正式環境）
const PORT = 8798;
// 本機有安裝 Chrome 時直接使用（不必下載瀏覽器）；CI 使用 npx playwright install chromium
const channel = process.env.CI ? undefined : 'chrome';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel, viewport: { width: 1440, height: 900 } } },
    // 手機：用 Chromium 模擬 iPhone 尺寸與觸控
    { name: 'mobile', use: { ...devices['Pixel 7'], channel, viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: 'bash scripts/serve-test.sh',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
