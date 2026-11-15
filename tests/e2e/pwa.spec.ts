import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { seedProject } from './helpers';

// I9 PWA：Service Worker 只存在於建置後的 dist/，所以這裡直接開 wrangler dev（由 Worker 提供 dist/），
// 不經過 Vite 開發伺服器。bash scripts/test.sh 會先建置；單獨執行 playwright 且沒有建置時略過。
const API_PORT = Number(process.env.E2E_API_PORT ?? 8798);
const ORIGIN = `http://127.0.0.1:${API_PORT}`;
const built = existsSync(new URL('../../dist/sw.js', import.meta.url));

test.skip(!built, '需要先建置（npx vite build），dist/ 才有 Service Worker');

test.beforeEach(async ({ page }) => {
  await seedProject(page);
});

/** 等到看得到測試資料（d1 的 ev-3） */
async function expectSchedule(page: Page, isMobile: boolean) {
  if (isMobile) {
    await expect(page.getByTestId('agenda-list')).toContainText('從 Firebase 搬來', { timeout: 15_000 });
  } else {
    await expect(page.getByTestId('grid-event-ev-3')).toBeVisible({ timeout: 15_000 });
  }
}

test('manifest 與圖示可以讀取（可安裝到桌面）', async ({ page }) => {
  const res = await page.request.get(`${ORIGIN}/manifest.webmanifest`);
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest).toMatchObject({ short_name: '運動會賽程', display: 'standalone', start_url: '/', lang: 'zh-TW' });
  for (const icon of manifest.icons as { src: string }[]) {
    expect((await page.request.get(`${ORIGIN}/${icon.src}`)).ok(), icon.src).toBe(true);
  }
  expect((await page.request.get(`${ORIGIN}/sw.js`)).headers()['cache-control']).toContain('no-cache');

  await page.goto(`${ORIGIN}/`);
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});

test('離線時仍可開啟，並顯示上次同步的賽程', async ({ page, context }, testInfo) => {
  const isMobile = testInfo.project.name === 'mobile';
  const url = `${ORIGIN}${isMobile ? '/agenda' : '/'}?role=staff`;

  await page.goto(url);
  await expectSchedule(page, isMobile);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  // 第一次載入時頁面還不受 Service Worker 控制，重新整理一次
  await page.reload();
  await expectSchedule(page, isMobile);
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  await context.setOffline(true);
  try {
    await page.reload();
    await expectSchedule(page, isMobile);
    await expect(page.getByTestId('sync-badge').first()).toContainText('離線');
  } finally {
    await context.setOffline(false);
  }
});

test('API 不經過 Service Worker 快取（離線時直接失敗，不會拿到舊資料）', async ({ page, context }) => {
  await page.goto(`${ORIGIN}/?role=staff`);
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  await context.setOffline(true);
  try {
    const ok = await page.evaluate(() =>
      fetch('/api/projects/school-sports-115').then(
        () => true,
        () => false,
      ),
    );
    expect(ok).toBe(false);
  } finally {
    await context.setOffline(false);
  }
});
