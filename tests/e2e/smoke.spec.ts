import { expect, test } from '@playwright/test';
import { fixture, openAsAdmin, readProject, seedProject } from './helpers';

// 冒煙測試：測試環境（Worker + Vite）正常、前端可以載入雲端資料
test('API 與前端可以啟動，並讀到測試資料', async ({ page }) => {
  const { updatedAt } = await seedProject(page);
  const data = await readProject(page);
  expect(data.updatedAt).toBe(updatedAt);
  expect(data.events).toHaveLength(fixture().events.length);

  await page.goto('/');
  await expect(page).toHaveTitle(/運動會/);
  // 同步服務載入雲端資料後，store 會有測試資料的賽程
  await expect.poll(async () => page.evaluate(() => document.body.innerText.length)).toBeGreaterThan(0);
});

test('管理者密碼可以從 localStorage 帶入', async ({ page }) => {
  await seedProject(page);
  await openAsAdmin(page);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sport-day:v1:adminToken'))).toBe('e2e-admin-token');
});
