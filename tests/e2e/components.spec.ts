import { expect, test, type Page } from '@playwright/test';
import { openAsAdmin, readProject, seedProject } from './helpers';

// I5 共用元件：透過手機排版操作 EventCard、EventDetail、EventEditorModal、確認對話框、LiveControls、SettingsPanel
// 時間固定在 2026-12-19 09:30（台北）

type Ev = { id: string; title: string; startMin: number; endMin: number; actualStartMin?: number | null };

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', '元件流程用手機排版測試');
  await page.clock.setFixedTime(new Date('2026-12-19T09:30:00+08:00'));
  await seedProject(page);
});

async function openAgendaAsAdmin(page: Page) {
  await openAsAdmin(page, '/agenda');
  await expect(page.getByRole('button', { name: '新增賽程' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('navigation', { name: '比賽日' }).getByRole('button', { name: /12\/19/ }).click();
}

async function events(page: Page): Promise<Ev[]> {
  return ((await readProject(page)) as { events: Ev[] }).events;
}

test('細節 → 編輯 → 儲存，寫回雲端', async ({ page }) => {
  await openAgendaAsAdmin(page);
  await page.getByTestId('event-card').filter({ hasText: '100M' }).first().getByRole('button').first().click();
  const detail = page.getByTestId('event-detail');
  await expect(detail).toBeVisible();
  await detail.getByRole('button', { name: '編輯', exact: true }).click();

  const form = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: '編輯賽程' }) });
  await form.getByLabel('標題').fill('100M 決賽（改）');
  await form.getByLabel('檢錄提早（分鐘）').fill('15');
  await form.getByRole('button', { name: '儲存', exact: true }).click();
  await expect(form).toBeHidden();

  await expect.poll(async () => (await events(page)).some((e) => e.title === '100M 決賽（改）'), { timeout: 10_000 }).toBe(true);
});

test('結束時間早於開始時間時不能儲存', async ({ page }) => {
  await openAgendaAsAdmin(page);
  await page.getByRole('button', { name: '新增賽程' }).click();
  const form = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: '新增賽程' }) });
  await form.getByLabel('開始時間').selectOption({ label: '10:00' });
  await form.getByLabel('結束時間').selectOption({ label: '09:00' });
  await form.getByRole('button', { name: '儲存', exact: true }).click();
  await expect(form.getByRole('alert')).toContainText('結束時間必須晚於開始時間');
  await form.getByRole('button', { name: '取消', exact: true }).click();
  await expect(form).toBeHidden();
});

test('複製與刪除（先確認）', async ({ page }) => {
  await openAgendaAsAdmin(page);
  const before = (await events(page)).length;
  await page.getByTestId('event-card').filter({ hasText: '100M' }).first().getByRole('button').first().click();
  const detail = page.getByTestId('event-detail');
  await detail.getByRole('button', { name: '複製', exact: true }).click();
  await expect.poll(async () => (await events(page)).length, { timeout: 10_000 }).toBe(before + 1);

  // 複製後選取複本；刪除要先確認，取消則不刪
  await expect(page.getByTestId('event-detail')).toContainText('(複製)');
  await page.getByTestId('event-detail').getByRole('button', { name: '刪除', exact: true }).click();
  const confirm = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: '刪除賽程？' }) });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: '取消', exact: true }).click();
  await expect(confirm).toBeHidden();
  await page.getByTestId('event-detail').getByRole('button', { name: '刪除', exact: true }).click();
  await confirm.getByRole('button', { name: '刪除', exact: true }).click();
  await expect.poll(async () => (await events(page)).length, { timeout: 10_000 }).toBe(before);
});

test('現場調度：標記開始與重設', async ({ page }) => {
  await openAgendaAsAdmin(page);
  await page.getByTestId('event-card').filter({ hasText: '100M' }).first().getByRole('button').first().click();
  const detail = page.getByTestId('event-detail');
  await detail.getByRole('button', { name: '標記開始' }).click();
  await expect(page.getByText(/已記錄實際開賽/)).toBeVisible();
  await expect.poll(async () => (await events(page)).some((e) => e.actualStartMin === 570), { timeout: 10_000 }).toBe(true);
  await detail.getByRole('button', { name: '重設' }).click();
  await expect(page.getByText('已清除現場實測紀錄')).toBeVisible();
});

test('導師看不到編輯按鈕', async ({ page }) => {
  await page.goto('/agenda?role=teacher');
  await page.getByRole('navigation', { name: '比賽日' }).getByRole('button', { name: /12\/19/ }).click();
  await page.getByTestId('event-card').filter({ hasText: '100M' }).first().getByRole('button').first().click();
  const detail = page.getByTestId('event-detail');
  await expect(detail).toBeVisible();
  await expect(detail.getByRole('button', { name: '編輯', exact: true })).toHaveCount(0);
  await expect(detail.getByRole('button', { name: '標記開始' })).toHaveCount(0);
  await expect(detail).not.toContainText('志工');
});
