// API 測試：驗證權限、輸入檢查，以及「寫進資料表再讀出來」與原始 JSON 相同
import { readFileSync } from 'node:fs';
import { canonical, createReporter, firstDiff, openSocket, sleep } from './lib.mjs';

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

  // 專案設定（聯絡窗口）：有帶就寫入；沒帶 settings（舊版裝置）時保留原值；帶空物件則清除
  const withSettings = { ...structuredClone(fixture), settings: { contact: '體育組 楊合萍老師', note: '其他設定' } };
  await put('t-settings', withSettings);
  const s1 = await get('t-settings');
  t.check('settings 寫入後讀回相同（含 extra）', !firstDiff(canonical(withSettings), canonical(s1)), firstDiff(canonical(withSettings), canonical(s1)) || '');
  await put('t-settings', fixture);
  const s2 = await get('t-settings');
  t.check('PUT 沒帶 settings 時保留原本的聯絡窗口', s2.settings?.contact === '體育組 楊合萍老師' && s2.settings?.note === '其他設定',
    JSON.stringify(s2.settings));
  await put('t-settings', { ...fixture, settings: {} });
  const s3 = await get('t-settings');
  t.check('PUT 帶空的 settings 時清除設定', s3.settings === undefined, JSON.stringify(s3.settings));
  const tooLong = await put('t-settings', { ...fixture, settings: { contact: 'x'.repeat(201) } });
  t.check('聯絡窗口超過 200 字 → 400', tooLong.status === 400);

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

// 即時同步測試（§J）：Durable Object ProjectRoom 透過 WebSocket 推送
export async function runRealtimeTests({ base, token }) {
  console.log('▶ 即時同步（WebSocket）測試');
  const t = createReporter('即時同步');
  const wsBase = base.replace(/^http/, 'ws');
  const project = `t-ws-${Date.now()}`;
  const sample = { venues: [], dates: [], events: [{ id: 'ws-1', title: '即時同步測試' }] };
  const put = (body, auth = token) => fetch(`${base}/api/projects/${project}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) },
    body: JSON.stringify(body),
  });
  const isType = (type) => (m) => m && typeof m === 'object' && m.type === type;
  const sockets = [];
  const open = async () => {
    const s = await openSocket(`${wsBase}/api/projects/${project}/ws`);
    sockets.push(s);
    return s;
  };

  try {
    // 非 WebSocket 請求、不合法的專案代碼
    t.check('一般 GET /ws（非升級）→ 426', (await fetch(`${base}/api/projects/${project}/ws`)).status === 426);
    t.check('不合法的專案代碼 /ws → 404', (await fetch(`${base}/api/projects/bad%20id/ws`)).status === 404);
    let badRejected = false;
    try {
      const s = await openSocket(`${wsBase}/api/projects/bad%20id/ws`);
      await s.close();
    } catch {
      badRejected = true;
    }
    t.check('不合法的專案代碼無法建立 WebSocket', badRejected);

    // 尚未存在的專案：hello 的 updatedAt 為 null
    const ghost = await openSocket(`${wsBase}/api/projects/${project}-none/ws`);
    sockets.push(ghost);
    const ghostHello = await ghost.next(isType('hello'));
    t.check('不存在的專案 hello.updatedAt 為 null', ghostHello && ghostHello.updatedAt === null, JSON.stringify(ghostHello));
    await ghost.close();

    // 先寫入一次，連線後 hello 要帶目前版本號
    const first = await (await put(sample)).json();
    const a = await open();
    const helloA = await a.next(isType('hello'));
    t.check('連線後收到 hello，updatedAt 與 D1 一致',
      helloA && helloA.updatedAt === first.updatedAt, JSON.stringify(helloA));
    t.check('hello.online 為 1', helloA && helloA.online === 1, JSON.stringify(helloA));

    // 心跳：ping → pong（由 setWebSocketAutoResponse 自動回覆）
    a.ws.send('ping');
    t.check('送出 ping 收到 pong', (await a.next((m) => m === 'pong')) === 'pong');

    // 第二個裝置連線：線上人數變 2
    const b = await open();
    const helloB = await b.next(isType('hello'));
    t.check('第二個連線 hello.online 為 2', helloB && helloB.online === 2, JSON.stringify(helloB));
    const presence2 = await a.next((m) => isType('presence')(m) && m.online === 2);
    t.check('第二個連線加入時，原連線收到 presence online=2', Boolean(presence2));

    // 管理者 PUT：兩個裝置都收到 updated，版本號與 PUT 回傳相同
    const putRes = await (await put({ ...sample, events: [{ id: 'ws-2', title: '更新後' }] })).json();
    const [updA, updB] = await Promise.all([a.next(isType('updated')), b.next(isType('updated'))]);
    t.check('PUT 後第一個連線收到 updated（版本號相同）',
      updA && updA.updatedAt === putRes.updatedAt, JSON.stringify(updA));
    t.check('PUT 後第二個連線收到 updated（版本號相同）',
      updB && updB.updatedAt === putRes.updatedAt, JSON.stringify(updB));

    // 沒有密碼的 PUT：不廣播
    const unauth = await put(sample, null);
    t.check('沒帶密碼 PUT → 401', unauth.status === 401);
    const wrong = await put(sample, 'wrong');
    t.check('錯誤密碼 PUT → 401', wrong.status === 401);
    const bad = await put({ events: {} });
    t.check('不合法的資料 PUT → 400', bad.status === 400);
    t.check('未授權或不合法的 PUT 不會廣播', (await a.next(isType('updated'), 1000)) === null);

    // 第二個裝置離線：線上人數變回 1
    await b.close();
    const presence1 = await a.next((m) => isType('presence')(m) && m.online === 1, 5000);
    t.check('第二個連線離開後，原連線收到 presence online=1', Boolean(presence1));
  } catch (err) {
    t.check(`即時同步測試執行錯誤：${err.message}`, false);
  } finally {
    await Promise.all(sockets.map((s) => s.close()));
    await sleep(100);
  }

  return t.summary();
}
