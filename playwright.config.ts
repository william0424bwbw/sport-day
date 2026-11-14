import { defineConfig, devices } from '@playwright/test';

// 端對端測試：同一組測試分別在「桌機」與「手機」尺寸執行
// 伺服器：Worker（API、獨立的本機 D1，scripts/serve-test.sh）+ Vite 開發伺服器（前端，/api 轉給 Worker）
// 連接埠可用環境變數調整，讓多組測試同時執行時不互相干擾：
//   E2E_API_PORT（預設 8798）、E2E_WEB_PORT（預設 5180）
const API_PORT = Number(process.env.E2E_API_PORT ?? 8798);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5180);
// 本機有安裝 Chrome 時直接使用（不必下載瀏覽器）；CI 使用 npx playwright install chromium
const channel = process.env.CI ? undefined : 'chrome';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel, viewport: { width: 1440, height: 900 } } },
    // 手機：用 Chromium 模擬手機尺寸與觸控
    { name: 'mobile', use: { ...devices['Pixel 7'], channel, viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    {
      command: 'bash scripts/serve-test.sh',
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      env: { E2E_API_PORT: String(API_PORT) },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npx --no-install vite --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      env: { API_PORT: String(API_PORT) },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
