// API 測試：驗證權限、輸入檢查，以及「寫進資料表再讀出來」與原始 JSON 相同
import { readFileSync } from 'node:fs';
import { canonical, createReporter, firstDiff } from './lib.mjs';

export async function runApiTests({ base, token, snapshotFile }) {
  console.log('▶ API 測試');
  const t = createReporter('API');
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/sample-project.json', import.meta.url), 'utf8'));

  const api = (path, init = {}) => fetch(`${base}${path}`, init);
  const put = (project, body, auth = token) => api(`/api/projects/${project}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const get = async (project) => (await api(`/api/projects/${project}`)).json();

  // 權限
  t.check('沒帶密碼 PUT → 401', (await put('t-auth', fixture, null)).status === 401);
  t.check('錯誤密碼 PUT → 401', (await put('t-auth', fixture, 'wrong')).status === 401);
  t.check('/api/auth 正確密碼 → admin:true',
    (await (await api('/api/auth', { headers: { Authorization: `Bearer ${token}` } })).json()).admin === true);
  t.check('/api/auth 無密碼 → admin:false', (await (await api('/api/auth')).json()).admin === false);

  // 輸入檢查
  t.check('非 JSON → 400', (await put('t-bad', '{not json')).status === 400);
  t.check('events 不是陣列 → 400', (await put('t-bad', { events: {} })).status === 400);
  const dup = await put('t-bad', { events: [{ id: 'x' }, { id: 'x' }] });
  t.check('events id 重複 → 400', dup.status === 400, (await dup.json()).message);
  t.check('不合法的專案代碼 → 404', (await api('/api/projects/bad%20id')).status === 404);
  t.check('不存在的專案 → null', (await get('t-not-exist')) === null);

  // 來回測試
  const putRes = await put('t-fixture', fixture);
  const putBody = await putRes.json();
  t.check('PUT 測試資料 → 200', putRes.ok, JSON.stringify(putBody));
  const back = await get('t-fixture');
  const diff = firstDiff(canonical(fixture), canonical(back));
  t.check('讀回的資料與原始 JSON 相同（含 extra 欄位、跨場地、特殊字元）', !diff, diff || '');
  t.check('/version 與 PUT 回傳的 updatedAt 一致',
    (await (await api('/api/projects/t-fixture/version')).json()).updatedAt === putBody.updatedAt);

  // 第二次寫入要完全取代（不殘留舊資料）、保留新順序
  const edited = structuredClone(fixture);
  edited.events = [edited.events[2], edited.events[0]];      // 刪掉兩筆並調換順序
  edited.events[1].referees = [{ role: '新職稱', name: '新老師' }];
  edited.venues = edited.venues.slice(0, 1);
  edited.dates[1].commandSlots = [];
  await put('t-fixture', edited);
  const back2 = await get('t-fixture');
  const diff2 = firstDiff(canonical(edited), canonical(back2));
  t.check('第二次 PUT 完整取代舊資料、順序正確', !diff2, diff2 || '');

  // 不同專案互不影響
  await put('t-other', { venues: [], dates: [], events: [{ id: 'only', title: '另一個專案' }] });
  const stillEdited = await get('t-fixture');
  t.check('寫入其他專案不影響原專案', !firstDiff(canonical(edited), canonical(stillEdited)));

  // 空專案
  await put('t-empty', { events: [] });
  const empty = await get('t-empty');
  t.check('空專案可以存取', empty && empty.events.length === 0 && empty.venues.length === 0);

  // 選用：用正式資料快照做來回測試（不進版控）
  if (snapshotFile) {
    const snap = JSON.parse(readFileSync(snapshotFile, 'utf8'));
    await put('t-snapshot', snap);
    const snapBack = await get('t-snapshot');
    const d = firstDiff(canonical(snap), canonical(snapBack));
    t.check(`正式資料快照來回相同（${snap.events.length} 筆賽程）`, !d, d || '');
  }

  return t.summary();
}
