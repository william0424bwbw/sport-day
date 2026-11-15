import { expect, test, type Page } from '@playwright/test';
import { openAsAdmin, readProject, seedProject } from './helpers';

// 電腦版排版（I7）：時間 × 場地格狀表、拖曳、右側細節面板
// 測試資料：tests/fixtures/sample-project.json
//   場地 A、B、S；d1 有 ev-3（B 07:50–09:40）；d2 有 ev-1（A 09:00–10:10）、ev-2（A,B,S 10:20–10:50）

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', '只在電腦版尺寸執行');
  await seedProject(page);
});

const SLOT = 20; // 每 10 分鐘 20px

async function openDay(page: Page, label: RegExp) {
  await page.getByTestId('day-sidebar').getByRole('button', { name: label }).click();
}

/** 以管理者開啟並切到正式賽（d2），等到可以編輯 */
async function adminOnD2(page: Page) {
  await openAsAdmin(page);
  await openDay(page, /運動會正式賽/);
  await expect(page.getByTestId('toolbox-new-event')).toBeVisible();
  await expect(page.getByTestId('grid-event-ev-1')).toBeVisible();
}

async function box(page: Page, testId: string) {
  const b = await page.getByTestId(testId).boundingBox();
  if (!b) throw new Error(`找不到 ${testId}`);
  return b;
}

/** 以滑鼠分段拖曳（觸發 pointermove） */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 3, from.y + 3, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

const eventOf = async (page: Page, id: string) =>
  ((await readProject(page)).events as { id: string; startMin: number; endMin: number; venueIds: string[]; dateId: string }[]).find(
    (e) => e.id === id,
  );

test('格狀表顯示場地與選取比賽日的賽程，可切換比賽日', async ({ page }) => {
  await page.goto('/?role=staff');
  const grid = page.getByTestId('timeline-grid');
  await expect(grid).toBeVisible();
  for (const v of ['A', 'B', 'S']) await expect(page.getByTestId(`venue-header-${v}`)).toBeVisible();
  await expect(page.getByTestId('venue-header-A')).toContainText('A 跑道區');

  // 預設第一天（d1）
  await expect(page.getByTestId('day-title')).toContainText('立定跳遠');
  await expect(page.getByTestId('event-count')).toHaveText('1 個項目');
  await expect(page.getByTestId('grid-event-ev-3')).toBeVisible();
  await expect(page.getByTestId('grid-event-ev-1')).toHaveCount(0);

  await openDay(page, /運動會正式賽/);
  await expect(page.getByTestId('day-title')).toContainText('運動會正式賽');
  await expect(page.getByTestId('event-count')).toHaveText('2 個項目');
  await expect(page.getByTestId('grid-event-ev-1')).toBeVisible();
  await expect(page.getByTestId('grid-event-ev-3')).toHaveCount(0);

  // 跨三個場地的項目橫跨三欄
  const ev2 = await box(page, 'grid-event-ev-2');
  const gridBox = await box(page, 'timeline-grid');
  expect(ev2.width).toBeGreaterThan(gridBox.width * 0.9);
  // 檢錄緩衝區畫在方塊上方
  const ci = await box(page, 'grid-checkin-ev-1');
  const ev1 = await box(page, 'grid-event-ev-1');
  expect(ci.y + ci.height).toBeLessThanOrEqual(ev1.y + 2);
  // 時間位置：ev-1 09:00 = 距 07:00 共 12 格
  expect(Math.round(ev1.y - gridBox.y)).toBe(12 * SLOT + 2);
});

test('導師看不到任何編輯控制項', async ({ page }) => {
  await page.goto('/?role=teacher');
  await openDay(page, /運動會正式賽/);
  await expect(page.getByTestId('grid-event-ev-1')).toBeVisible();
  await expect(page.getByTestId('readonly-banner')).toBeVisible();
  await expect(page.getByTestId('toolbox-new-event')).toHaveCount(0);
  await expect(page.getByTestId('grid-resize-top-ev-1')).toHaveCount(0);
  await expect(page.getByTestId('grid-resize-bottom-ev-1')).toHaveCount(0);
  await expect(page.getByTestId('manage-days')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '管理場地' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /啟用司令台/ })).toHaveCount(0);

  // 連點兩下空白格不會新增
  const before = (await readProject(page)).events.length;
  await page.locator('[data-slot="B@480"]').dblclick();
  await page.waitForTimeout(500);
  expect((await readProject(page)).events.length).toBe(before);
});

test('點選賽程開啟右側細節面板，可關閉', async ({ page }) => {
  await page.goto('/?role=staff');
  await openDay(page, /運動會正式賽/);
  await expect(page.getByTestId('inspector')).toHaveCount(0);
  await page.getByTestId('grid-event-ev-1').click();
  const inspector = page.getByTestId('inspector');
  await expect(inspector).toBeVisible();
  await expect(inspector.getByTestId('event-detail')).toBeVisible();
  await expect(inspector).toContainText('100M + 60M 徑賽決賽');
  await expect(page.getByTestId('grid-event-ev-1')).toHaveAttribute('data-selected', 'true');

  await page.getByTestId('inspector-close').click();
  await expect(page.getByTestId('inspector')).toHaveCount(0);

  // 切換比賽日時關閉面板
  await page.getByTestId('grid-event-ev-1').click();
  await expect(page.getByTestId('inspector')).toBeVisible();
  await openDay(page, /立定跳遠/);
  await expect(page.getByTestId('inspector')).toHaveCount(0);
});

test('管理者拖曳賽程到其他時間與場地，修改會上傳', async ({ page }) => {
  await adminOnD2(page);
  const ev1 = await box(page, 'grid-event-ev-1');
  const grid = await box(page, 'timeline-grid');
  const colWidth = grid.width / 3;
  const from = { x: ev1.x + ev1.width / 2, y: ev1.y + ev1.height / 2 };
  // 往下 6 格（+60 分）、往右一欄（A → B）
  await drag(page, from, { x: from.x + colWidth, y: from.y + 6 * SLOT });

  await expect.poll(async () => (await eventOf(page, 'ev-1'))?.startMin).toBe(600);
  const saved = await eventOf(page, 'ev-1');
  expect(saved?.endMin).toBe(670);
  expect(saved?.venueIds).toEqual(['B']);
  // 畫面也更新到 B 欄 10:00（拖曳後版面可能位移，重新量格狀表位置）
  const moved = await box(page, 'grid-event-ev-1');
  const gridAfter = await box(page, 'timeline-grid');
  expect(Math.round(moved.y - gridAfter.y)).toBe(18 * SLOT + 2);
  expect(moved.x).toBeGreaterThan(gridAfter.x + gridAfter.width / 3);
  // 拖曳後選取該賽程（與舊版相同）
  await expect(page.getByTestId('inspector')).toBeVisible();
});

test('管理者只改時間（同一欄）不會改變場地', async ({ page }) => {
  await adminOnD2(page);
  const ev1 = await box(page, 'grid-event-ev-1');
  const from = { x: ev1.x + ev1.width / 2, y: ev1.y + ev1.height / 2 };
  await drag(page, from, { x: from.x, y: from.y - 3 * SLOT });
  await expect.poll(async () => (await eventOf(page, 'ev-1'))?.startMin).toBe(510);
  expect((await eventOf(page, 'ev-1'))?.venueIds).toEqual(['A']);
});

test('管理者拖曳下緣與上緣調整時間', async ({ page }) => {
  await adminOnD2(page);
  await page.getByTestId('grid-event-ev-1').hover();
  const bottom = await box(page, 'grid-resize-bottom-ev-1');
  const b = { x: bottom.x + bottom.width / 2, y: bottom.y + bottom.height / 2 };
  await drag(page, b, { x: b.x, y: b.y + 2 * SLOT });
  await expect.poll(async () => (await eventOf(page, 'ev-1'))?.endMin).toBe(630);
  expect((await eventOf(page, 'ev-1'))?.startMin).toBe(540);
  // 磁吸：ev-2（同主要場地 A、連動）跟著往後 20 分鐘
  await expect.poll(async () => (await eventOf(page, 'ev-2'))?.startMin).toBe(640);

  await page.getByTestId('grid-event-ev-1').hover();
  const top = await box(page, 'grid-resize-top-ev-1');
  const t = { x: top.x + top.width / 2, y: top.y + top.height / 2 };
  await drag(page, t, { x: t.x, y: t.y - 3 * SLOT });
  await expect.poll(async () => (await eventOf(page, 'ev-1'))?.startMin).toBe(510);
  expect((await eventOf(page, 'ev-1'))?.endMin).toBe(630);
});

test('管理者從積木拖曳新增賽程，並開啟編輯表單', async ({ page }) => {
  await adminOnD2(page);
  const before = (await readProject(page)).events.length;
  const chip = await box(page, 'toolbox-new-event');
  const grid = await box(page, 'timeline-grid');
  const colWidth = grid.width / 3;
  // 放到 S 欄 08:00（距 07:00 六格）
  await drag(page, { x: chip.x + chip.width / 2, y: chip.y + chip.height / 2 }, { x: grid.x + colWidth * 2.5, y: grid.y + 6 * SLOT + SLOT / 2 });

  await expect.poll(async () => (await readProject(page)).events.length).toBe(before + 1);
  const data = await readProject(page);
  const created = (data.events as { id: string; dateId: string; venueIds: string[]; startMin: number; endMin: number }[]).find(
    (e) => !['ev-1', 'ev-2', 'ev-3', 'ev-4'].includes(e.id),
  );
  expect(created).toMatchObject({ dateId: 'd2', venueIds: ['S'], startMin: 480, endMin: 520 });
  await expect(page.getByTestId(`grid-event-${created!.id}`)).toBeVisible();
  await expect(page.getByTestId(`grid-event-${created!.id}`)).toHaveAttribute('data-selected', 'true');
  // 編輯表單（EventEditorModal）開啟
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('管理者連點兩下空白時間格新增賽程', async ({ page }) => {
  await adminOnD2(page);
  const before = (await readProject(page)).events.length;
  await page.locator('[data-slot="B@720"]').dblclick();
  await expect.poll(async () => (await readProject(page)).events.length).toBe(before + 1);
  const created = ((await readProject(page)).events as { id: string; venueIds: string[]; startMin: number }[]).find(
    (e) => e.startMin === 720,
  );
  expect(created?.venueIds).toEqual(['B']);
});

test('篩選時不符合的賽程淡化', async ({ page }) => {
  await page.goto('/?role=staff');
  await openDay(page, /運動會正式賽/);
  await expect(page.getByTestId('grid-event-ev-1')).toHaveAttribute('data-filter', 'none');
  await page.getByPlaceholder('老師姓名、職務或項目').fill('100M');
  await expect(page.getByTestId('grid-event-ev-1')).toHaveAttribute('data-filter', 'match');
  await expect(page.getByTestId('grid-event-ev-2')).toHaveAttribute('data-filter', 'dim');
  await expect(page.getByTestId('grid-event-ev-2')).toHaveClass(/opacity-25/);
});

test('時間控制：模擬時間可前後調整並顯示現在時間線', async ({ page }) => {
  await page.goto('/?role=teacher');
  const controls = page.getByTestId('time-controls');
  await controls.getByRole('button', { name: '模擬時間' }).click();
  const label = page.getByTestId('clock-label');
  const start = await label.textContent();
  await controls.getByRole('button', { name: '+10 分' }).click();
  await expect(label).not.toHaveText(start ?? '');
  await expect(page.getByTestId('now-line')).toBeVisible();
  await expect(page.getByTestId('now-line')).toContainText((await label.textContent()) ?? '');
});
