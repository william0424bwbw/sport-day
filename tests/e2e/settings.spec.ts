import { expect, test, type Page } from '@playwright/test';
import { openAsAdmin, readProject, seedProject } from './helpers';

// 專案設定：聯絡窗口由管理者在「設定」修改，寫回雲端；導師與工作人員都看得到

test.beforeEach(async ({ page }) => {
  await seedProject(page);
});

/** 開啟設定（手機：設定分頁；電腦：頂部「雲端同步」對話框） */
async function openSettings(page: Page, isMobile: boolean, asAdmin: boolean, role = 'teacher') {
  if (asAdmin) await openAsAdmin(page, isMobile ? '/settings' : '/');
  else await page.goto(isMobile ? `/settings?role=${role}` : `/?role=${role}`);
  if (!isMobile) await page.getByRole('button', { name: '雲端同步' }).click();
}

test('管理者設定聯絡窗口，寫回雲端；導師看得到但不能修改', async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name === 'mobile';
  await openSettings(page, isMobile, true);

  const card = page.getByTestId('contact-card');
  await expect(card.getByRole('button', { name: '修改' })).toBeVisible({ timeout: 15_000 });
  await expect(card.getByTestId('contact-text')).toContainText('尚未設定');
  await card.getByRole('button', { name: '修改' }).click();
  await card.getByLabel('有問題請聯絡').fill('體育組 楊合萍老師');
  await card.getByRole('button', { name: '儲存' }).click();
  await expect(card.getByTestId('contact-text')).toContainText('有問題請聯絡：體育組 楊合萍老師');
  await expect.poll(async () => (await readProject(page)).settings?.contact, { timeout: 10_000 }).toBe('體育組 楊合萍老師');

  // 導師：看得到，沒有修改按鈕；電腦版左欄也顯示
  await page.evaluate(() => localStorage.removeItem('sport-day:v1:adminToken'));
  await openSettings(page, isMobile, false);
  const teacherCard = page.getByTestId('contact-card');
  await expect(teacherCard.getByTestId('contact-text')).toContainText('體育組 楊合萍老師');
  await expect(teacherCard.getByRole('button', { name: '修改' })).toHaveCount(0);
  if (!isMobile) {
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('sidebar-contact')).toContainText('體育組 楊合萍老師');
  }
});

test('沒有設定聯絡窗口時，導師看不到這個區塊', async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name === 'mobile';
  await openSettings(page, isMobile, false, 'staff');
  await expect(page.getByRole('heading', { name: '角色' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('heading', { name: '聯絡窗口' })).toHaveCount(0);
  if (!isMobile) await expect(page.getByTestId('sidebar-contact')).toHaveCount(0);
});
