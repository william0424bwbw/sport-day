import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

// 端對端測試共用工具
export const ADMIN_TOKEN = 'e2e-admin-token';
export const PROJECT_ID = 'school-sports-115';

/** 測試資料（tests/fixtures/sample-project.json，不含正式資料） */
export function fixture() {
  return JSON.parse(readFileSync(new URL('../fixtures/sample-project.json', import.meta.url), 'utf8'));
}

/** 透過 API 寫入專案資料（經由 Vite 的 /api 轉送到測試用 Worker） */
// 預設帶空的 settings：沒帶 settings 時伺服器會保留原值，測試之間會互相影響
export async function seedProject(page: Page, data: unknown = { ...fixture(), settings: {} }, projectId = PROJECT_ID) {
  const res = await page.request.put(`/api/projects/${projectId}`, {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}`, 'Content-Type': 'application/json' },
    data,
  });
  if (!res.ok()) throw new Error(`seedProject 失敗：${res.status()} ${await res.text()}`);
  return (await res.json()) as { updatedAt: number };
}

/** 讀取目前雲端資料 */
export async function readProject(page: Page, projectId = PROJECT_ID) {
  const res = await page.request.get(`/api/projects/${projectId}`);
  return res.json();
}

/** 以管理者身分開啟（在載入前寫入 localStorage 的密碼與角色） */
export async function openAsAdmin(page: Page, path = '/') {
  await page.addInitScript((token) => {
    localStorage.setItem('sport-day:v1:adminToken', token);
  }, ADMIN_TOKEN);
  await page.goto(`${path}${path.includes('?') ? '&' : '?'}role=admin`);
}
