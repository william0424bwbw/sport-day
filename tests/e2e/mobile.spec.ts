import { expect, test, type Page } from '@playwright/test';
import { fixture, openAsAdmin, readProject, seedProject } from './helpers';

// I6 手機版排版：只在 mobile 專案（390 × 844、觸控）執行
// 時間固定在 2026-12-19 09:30（台北），測試資料 d2：ev-1 09:00–10:10 進行中，ev-2 10:20 下一項（10:10 檢錄）

type Ev = { id: string; title: string; startMin: number; endMin: number; actualStartMin?: number | null; actualEndMin?: number | null };

test.beforeEach(async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', '只測手機排版');
  await page.clock.setFixedTime(new Date('2026-12-19T09:30:00+08:00'));
  await seedProject(page, raceDayData());
});

/** 測試資料：ev-1 清掉現場紀錄，讓它在 09:30 是「進行中」 */
function raceDayData() {
  const data = fixture();
  const ev1 = data.events.find((e: Ev) => e.id === 'ev-1');
  ev1.actualStartMin = null;
  ev1.actualEndMin = null;
  return data;
}

const nav = (page: Page) => page.getByRole('navigation', { name: '主選單' });

/** 切換到 12/19 正式賽 */
async function pickRaceDay(page: Page) {
  await page.getByRole('navigation', { name: '比賽日' }).getByRole('button', { name: /12\/19/ }).click();
}

async function expectNoHorizontalOverflow(page: Page) {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
}

async function eventsById(page: Page): Promise<Record<string, Ev>> {
  const data = (await readProject(page)) as { events: Ev[] };
  return Object.fromEntries(data.events.map((e) => [e.id, e]));
}

/** 管理者：等密碼驗證完成（浮動「新增賽程」按鈕出現） */
async function waitForEditor(page: Page) {
  await expect(page.getByRole('button', { name: '新增賽程' })).toBeVisible({ timeout: 15_000 });
}

test('四個分頁都沒有水平捲動（管理者）', async ({ page }) => {
  await openAsAdmin(page);
  await waitForEditor(page);
  await pickRaceDay(page);
  for (const [label, heading] of [
    ['今日', '今日'],
    ['賽程', '賽程'],
    ['場地', '場地時間軸'],
    ['設定', '設定'],
  ]) {
    await nav(page).getByRole('link', { name: label }).click();
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }
});

test('底部導覽切換頁面並保留網址參數', async ({ page }) => {
  await page.goto('/?role=staff');
  await expect(page.getByRole('heading', { level: 1, name: '今日' })).toBeVisible();
  await nav(page).getByRole('link', { name: '賽程' }).click();
  await expect(page).toHaveURL(/\/agenda\?role=staff$/);
  await expect(page.getByRole('heading', { level: 1, name: '賽程' })).toBeVisible();
  await nav(page).getByRole('link', { name: '場地' }).click();
  await expect(page).toHaveURL(/\/venue\?role=staff$/);
  await nav(page).getByRole('link', { name: '設定' }).click();
  await expect(page).toHaveURL(/\/settings\?role=staff$/);
  await nav(page).getByRole('link', { name: '今日' }).click();
  await expect(page).toHaveURL(/\/\?role=staff$/);
  await expect(nav(page).getByRole('link', { name: '今日' })).toHaveAttribute('aria-current', 'page');
});

test('導師看不到任何編輯功能', async ({ page }) => {
  await page.goto('/?role=teacher');
  await pickRaceDay(page);
  await expect(page.getByTestId('today-live')).toContainText('100M + 60M');
  await expect(page.getByRole('button', { name: '新增賽程' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '標記開始' })).toHaveCount(0);

  await nav(page).getByRole('link', { name: '場地' }).click();
  await expect(page.getByTestId('venue-event-ev-1')).toBeVisible();
  await expect(page.getByTestId('resize-end')).toHaveCount(0);

  await nav(page).getByRole('link', { name: '設定' }).click();
  await expect(page.getByRole('heading', { name: '場地管理' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '比賽日管理' })).toHaveCount(0);
});

test('今日：進行中與下一項（幾分鐘後檢錄）', async ({ page }) => {
  await page.goto('/');
  await pickRaceDay(page);
  await expect(page.getByTestId('today-live')).toContainText('100M + 60M 徑賽決賽');
  const next = page.getByTestId('today-next');
  await expect(next).toContainText('跨三個場地的項目');
  await expect(next).toContainText('10:10 檢錄（40 分鐘後）');
});

test('賽程列表顯示當日賽程，點卡片開啟細節面板', async ({ page }) => {
  const f = fixture();
  await page.goto('/agenda');
  await pickRaceDay(page);
  const list = page.locator('main');
  for (const ev of f.events.filter((e: Ev & { dateId: string }) => e.dateId === 'd2')) {
    await expect(list.getByText(ev.title, { exact: false }).first()).toBeVisible();
  }
  await expect(page.getByTestId('agenda-count')).toHaveText('共 2 項');

  await list.getByText('100M + 60M 徑賽決賽').first().click();
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText('體育組長');
  await sheet.getByRole('button', { name: '關閉' }).first().click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('篩選可以縮小賽程列表', async ({ page }) => {
  await page.goto('/agenda');
  await pickRaceDay(page);
  await expect(page.getByTestId('agenda-count')).toHaveText('共 2 項');
  await page.getByRole('button', { name: /篩選/ }).click();
  await page.getByTestId('filter-panel').getByRole('searchbox').fill('體育組長');
  await expect(page.getByTestId('agenda-count')).toHaveText('1 / 2 項');
  await expect(page.locator('main').getByText('跨三個場地的項目')).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: '清除', exact: true }).click();
  await expect(page.getByTestId('agenda-count')).toHaveText('共 2 項');
});

test('管理者用表單新增賽程並同步到雲端', async ({ page }) => {
  await openAsAdmin(page, '/agenda');
  await waitForEditor(page);
  await pickRaceDay(page);
  await page.getByRole('button', { name: '新增賽程' }).click();
  const form = page.getByRole('dialog');
  await expect(form).toBeVisible();
  await form.getByLabel('標題').fill('E2E 手機新增項目');
  await form.getByRole('button', { name: '儲存' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('main').getByText('E2E 手機新增項目')).toBeVisible();

  await expect
    .poll(async () => Object.values(await eventsById(page)).find((e) => e.title === 'E2E 手機新增項目'), { timeout: 15_000 })
    .toMatchObject({ dateId: 'd2', venueIds: ['A'] });
  // 下一個空檔：09:30 起，A 場地 09:00–10:10、10:20–10:50 有賽程 → 10:50
  const created = Object.values(await eventsById(page)).find((e) => e.title === 'E2E 手機新增項目')!;
  expect(created.startMin).toBe(650);
});

test('管理者在今日頁標記開始／結束', async ({ page }) => {
  await openAsAdmin(page);
  await waitForEditor(page);
  await pickRaceDay(page);

  await page.getByTestId('today-live').getByRole('button', { name: '標記結束' }).click();
  await expect.poll(async () => (await eventsById(page))['ev-1'].actualEndMin, { timeout: 15_000 }).toBeTruthy();

  await page.getByTestId('today-next').getByRole('button', { name: '標記開始' }).click();
  await expect.poll(async () => (await eventsById(page))['ev-2'].actualStartMin, { timeout: 15_000 }).toBeTruthy();
});

test('管理者在場地時間軸長按拖曳改開始時間（觸控）', async ({ page }) => {
  await openAsAdmin(page, '/venue');
  await waitForEditor(page);
  await pickRaceDay(page);
  const block = page.getByTestId('venue-event-ev-1');
  await expect(block).toHaveAttribute('data-start', '540');

  // 把方塊捲到畫面中間，避開自動捲動區
  await block.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = (await block.boundingBox())!;
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);

  // 用 CDP 送出真正的觸控事件：長按 450ms 後往下拖 40px（= 20 分鐘）
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await page.waitForTimeout(450);
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + i * 5 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  await expect(block).toHaveAttribute('data-start', '560');
  await expect(block).toHaveAttribute('data-end', '630');
  await expect.poll(async () => (await eventsById(page))['ev-1'].startMin, { timeout: 15_000 }).toBe(560);
  // 拖曳後不應該開啟細節面板
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('觸控快速滑動只會捲動，不會移動賽程', async ({ page }) => {
  await openAsAdmin(page, '/venue');
  await waitForEditor(page);
  await pickRaceDay(page);
  const block = page.getByTestId('venue-event-ev-1');
  await block.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const box = (await block.boundingBox())!;
  const x = Math.round(box.x + box.width / 2);
  const y = Math.round(box.y + box.height / 2);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + i * 10 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(500);
  await expect(block).toHaveAttribute('data-start', '540');
});

test('管理者拖曳下緣調整結束時間，點空白處開啟新增表單', async ({ page }) => {
  await openAsAdmin(page, '/venue');
  await waitForEditor(page);
  await pickRaceDay(page);
  const block = page.getByTestId('venue-event-ev-1');
  await block.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  const handle = block.getByTestId('resize-end');
  const hb = (await handle.boundingBox())!;
  const x = Math.round(hb.x + hb.width / 2);
  const y = Math.round(hb.y + hb.height / 2);

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  for (let i = 1; i <= 4; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + i * 5 }] });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(block).toHaveAttribute('data-end', '620');
  await expect.poll(async () => (await eventsById(page))['ev-1'].endMin, { timeout: 15_000 }).toBe(620);

  // 15:00 的空白處（07:00 起 480 分鐘 × 2px）
  const area = page.getByTestId('venue-timeline-area');
  await area.evaluate((el) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + 960 - 300 }));
  const ab = (await area.boundingBox())!;
  await page.touchscreen.tap(Math.round(ab.x + ab.width / 2), Math.round(ab.y + 965));
  const form = page.getByRole('dialog');
  await expect(form).toBeVisible();
  await expect(form.getByLabel('開始時間')).toHaveValue('900');
});
