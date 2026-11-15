import { readFileSync } from 'node:fs';
import { expect, test, type Download, type Page } from '@playwright/test';
import { fixture, openAsAdmin, readProject, seedProject } from './helpers';

// I8 輸出功能：細流表（預覽、大會人員、CSV、列印）、JSON 匯出與匯入
// 測試資料 d2（12/19 正式賽）有 ev-1、ev-2 兩筆賽程，大會人員「主持甲、主持乙」

test.beforeEach(async ({ page }) => {
  await seedProject(page);
});

const BOM = String.fromCharCode(0xfeff);

async function text(download: Download) {
  return readFileSync(await download.path(), 'utf8');
}

/** 以管理者開啟細流表（電腦：頂部按鈕；手機：設定頁），並切到正式賽 */
async function openRundown(page: Page, isMobile: boolean) {
  if (isMobile) {
    await openAsAdmin(page, '/settings');
    await expect(page.getByRole('button', { name: '匯入 JSON 備份' })).toBeVisible({ timeout: 15_000 });
  } else {
    await openAsAdmin(page);
    await expect(page.getByTestId('toolbox-new-event')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('day-sidebar').getByRole('button', { name: /運動會正式賽/ }).click();
  }
  await page.getByRole('button', { name: isMobile ? '細流表（列印 / CSV）' : '輸出細流表' }).click();
  const rundown = page.getByTestId('rundown');
  await expect(rundown).toBeVisible();
  return rundown;
}

test('細流表：預覽、範圍切換、匯出 CSV、列印只印細流表', async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name === 'mobile';
  const rundown = await openRundown(page, isMobile);

  // 手機版預設第一天（d1，1 筆）；電腦版已切到正式賽（d2，2 筆）
  await expect(rundown.getByTestId('rundown-day')).toHaveCount(1);
  await rundown.getByRole('button', { name: '全部日期' }).click();
  await expect(rundown.getByTestId('rundown-day')).toHaveCount(3);
  await expect(rundown.getByTestId('rundown-row')).toHaveCount(3); // ev-4 指向不存在的比賽日，不列出
  await expect(rundown).toContainText('100M + 60M 徑賽決賽');

  const [download] = await Promise.all([page.waitForEvent('download'), rundown.getByRole('button', { name: /匯出 Excel/ }).click()]);
  expect(download.suggestedFilename()).toMatch(/^小學運動會賽務細流表_\d{4}-\d{2}-\d{2}\.csv$/);
  const csv = await text(download);
  expect(csv.startsWith(BOM)).toBe(true);
  const lines = csv.slice(1).split('\r\n');
  expect(lines).toHaveLength(4);
  expect(lines[0]).toContain('"比賽項目名稱"');
  expect(csv).toContain('"100M + 60M 徑賽決賽"');
  expect(csv).toContain('"主持甲、主持乙"');

  // 列印：只顯示 #print-root。瀏覽器列印時寬度會變成紙張寬度（A4 約 794px），
  // 排版不可以因此切換（否則細流表被卸載、印出空白頁）
  const viewport = page.viewportSize()!;
  await page.emulateMedia({ media: 'print' });
  await page.setViewportSize({ width: 794, height: 1123 });
  await expect(page.locator('#print-root')).toBeVisible();
  await expect(page.locator('#root')).toBeHidden();
  await expect(page.locator('#print-root')).toContainText('賽務工作細流表');
  await expect(page.locator('#print-root')).toContainText('100M + 60M 徑賽決賽');
  await page.setViewportSize(viewport);
  await page.emulateMedia({ media: 'screen' });
  await expect(page.locator('#print-root')).toBeHidden();
  await expect(rundown).toBeVisible();
});

test('細流表：管理者直接修改大會人員，寫回雲端', async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name === 'mobile';
  const rundown = await openRundown(page, isMobile);
  await rundown.getByRole('button', { name: '全部日期' }).click();
  const d2 = rundown.getByTestId('rundown-day').filter({ hasText: '運動會正式賽' });
  await d2.getByLabel('主持人／司儀播報').fill('新主持人');
  await expect
    .poll(async () => (await readProject(page)).dates.find((d: { id: string }) => d.id === 'd2')?.generalStaff?.hosts, { timeout: 10_000 })
    .toBe('新主持人');
});

test('工作人員可以看細流表但不能修改大會人員；導師看不到', async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name === 'mobile';
  await page.goto(isMobile ? '/settings?role=staff' : '/?role=staff');
  await page.getByRole('button', { name: isMobile ? '細流表（列印 / CSV）' : '輸出細流表' }).click();
  const rundown = page.getByTestId('rundown');
  await expect(rundown).toContainText('賽務工作細流表');
  await expect(rundown.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /匯入 JSON/ })).toHaveCount(0);

  await page.goto(isMobile ? '/settings?role=teacher' : '/?role=teacher');
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /細流表/ })).toHaveCount(0);
});

test('JSON：匯出備份，修改後匯入（先確認），雲端資料被取代', async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name === 'mobile';
  if (isMobile) {
    await openAsAdmin(page, '/settings');
    await expect(page.getByRole('button', { name: '匯入 JSON 備份' })).toBeVisible({ timeout: 15_000 });
  } else {
    await openAsAdmin(page);
    await expect(page.getByTestId('toolbox-new-event')).toBeVisible({ timeout: 15_000 });
  }

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: isMobile ? '匯出 JSON 備份' : '匯出 JSON' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^運動會排程備份_\d{4}-\d{2}-\d{2}\.json$/);
  const backup = JSON.parse(await text(download));
  expect(backup.events.map((e: { id: string }) => e.id).sort()).toEqual(fixture().events.map((e: { id: string }) => e.id).sort());

  // 格式錯誤：不匯入，顯示錯誤
  const input = page.getByTestId('import-json-input');
  await input.setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"venues":[]}') });
  await expect(page.getByText(/無法匯入/)).toBeVisible();

  // 只留下一筆賽程後匯入；取消時不變，確認後取代
  const edited = { ...backup, events: backup.events.filter((e: { id: string }) => e.id === 'ev-1') };
  const file = { name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(edited)) };
  const confirm = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: '匯入並取代全部資料？' }) });

  await input.setInputFiles(file);
  await expect(confirm.getByTestId('import-summary')).toContainText('1 筆賽程');
  await confirm.getByRole('button', { name: '取消', exact: true }).click();
  await expect(confirm).toBeHidden();
  expect((await readProject(page)).events).toHaveLength(backup.events.length);

  await input.setInputFiles(file);
  await confirm.getByRole('button', { name: '匯入', exact: true }).click();
  await expect.poll(async () => (await readProject(page)).events.length, { timeout: 10_000 }).toBe(1);
});
