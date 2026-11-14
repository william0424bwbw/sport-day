// 端對端測試：用無頭 Chrome（Chrome DevTools Protocol）實際操作網頁
// 找不到 Chrome 時略過（設定 REQUIRE_E2E=1 則視為失敗）
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createReporter, sleep } from './lib.mjs';

const PROJECT = 'school-sports-115';

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);
  for (const p of candidates) if (existsSync(p)) return p;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']) {
    const r = spawnSync('which', [name], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  }
  return null;
}

async function openTab(cdpBase, url) {
  const target = await (await fetch(`${cdpBase}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push(d.exception?.description || d.text);
    }
  });
  const send = (method, params = {}) => new Promise(r => {
    const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params }));
  });
  await send('Runtime.enable');
  return {
    errors,
    async eval(expr) {
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error');
      return r.result.result.value;
    },
    reload: () => send('Page.reload', { ignoreCache: true }),
    close: () => ws.close(),
  };
}

export async function runE2eTests({ base, token }) {
  console.log('▶ 端對端測試（無頭瀏覽器）');
  const chrome = findChrome();
  if (!chrome) {
    console.log('  ⚠️ 找不到 Chrome / Edge，略過端對端測試\n');
    return process.env.REQUIRE_E2E === '1' ? 1 : 0;
  }

  const t = createReporter('端對端');
  const port = 9339;
  const profile = mkdtempSync(join(tmpdir(), 'sport-day-e2e-'));
  const browser = spawn(chrome, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--no-sandbox', 'about:blank',
  ], { stdio: 'ignore' });
  const cdp = `http://127.0.0.1:${port}`;

  const tabs = [];
  try {
    for (let i = 0; i < 40; i++) {
      try { await fetch(`${cdp}/json/version`); break; } catch { await sleep(250); }
    }

    // 準備資料
    const fixture = JSON.parse(readFileSync(new URL('./fixtures/sample-project.json', import.meta.url), 'utf8'));
    await fetch(`${base}/api/projects/${PROJECT}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(fixture),
    });
    const getProject = async () => (await fetch(`${base}/api/projects/${PROJECT}`)).json();
    const snapshot = `({
      events: state.events.length, venues: state.venues.length, dates: state.dates.length,
      apiBase: cloudConfig.apiBase, connected: cloudConfig.isConnected, admin: cloudConfig.isAdminVerified,
      badge: document.getElementById('cloudStatusBadge').textContent.trim(),
      icons: document.querySelectorAll('svg.lucide').length
    })`;

    // 1. 老師端（無密碼）
    const teacher = await openTab(cdp, `${base}/?role=teacher`); tabs.push(teacher);
    await sleep(3500);
    let s = await teacher.eval(snapshot);
    t.check('老師端從 D1 載入測試資料', s.events === fixture.events.length && s.venues === fixture.venues.length
      && s.dates === fixture.dates.length, JSON.stringify({ events: s.events, venues: s.venues, dates: s.dates }));
    t.check('API 位置為同網域', s.apiBase === base, s.apiBase);
    t.check('狀態顯示「瀏覽」', s.connected && !s.admin && s.badge.includes('瀏覽'), s.badge);
    t.check('圖示正常渲染', s.icons > 10, `${s.icons} 個`);

    // 2. 管理者端：錯誤密碼
    const admin = await openTab(cdp, `${base}/?role=admin`); tabs.push(admin);
    await sleep(2000);
    await admin.eval(`localStorage.setItem(CLOUD_CFG_KEY, JSON.stringify({ adminToken: 'wrong' })); true`);
    await admin.reload(); await sleep(3500);
    s = await admin.eval(snapshot);
    t.check('錯誤密碼 → 只能瀏覽', s.connected && !s.admin, s.badge);
    const before = (await getProject()).updatedAt;
    await admin.eval(`state.events[0].title += ' X'; saveToStorage(); true`);
    await sleep(2000);
    t.check('錯誤密碼時修改不會寫入 D1', (await getProject()).updatedAt === before);

    // 3. 管理者端：正確密碼
    await admin.eval(`localStorage.setItem(CLOUD_CFG_KEY, JSON.stringify({ adminToken: ${JSON.stringify(token)} })); true`);
    await admin.reload(); await sleep(3500);
    s = await admin.eval(snapshot);
    t.check('正確密碼 → 可編輯', s.connected && s.admin && s.badge.includes('可編輯'), s.badge);
    t.check('重新整理後，本機未上傳的修改被雲端資料蓋回', !(await admin.eval(`state.events[0].title`)).endsWith(' X'));

    const newTitle = `E2E ${Date.now()}`;
    await admin.eval(`state.events[0].title = ${JSON.stringify(newTitle)}; saveToStorage(); true`);
    for (let i = 0; i < 5; i++) await admin.eval(`saveToStorage(); true`);
    await sleep(2000);
    const saved = await getProject();
    t.check('管理者修改自動寫入 D1', saved.events[0].title === newTitle, saved.events[0].title);
    t.check('寫入後其他欄位不變（跨場地、extra 欄位）',
      JSON.stringify(saved.events[1].venueIds) === JSON.stringify(fixture.events[1].venueIds)
      && JSON.stringify(saved.events[1].customNote) === JSON.stringify(fixture.events[1].customNote));

    // 4. 老師端輪詢更新
    await sleep(5000);
    const seen = await teacher.eval(`state.events[0].title`);
    t.check('老師端輪詢後自動看到新資料', seen === newTitle, seen);

    // 5. 匯出網頁不含密碼
    const exported = await admin.eval(`(() => {
      const orig = URL.createObjectURL;
      URL.createObjectURL = (b) => { window.__blob = b; return 'blob:test'; };
      const click = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {};
      exportStandaloneHtml();
      URL.createObjectURL = orig; HTMLAnchorElement.prototype.click = click;
      return window.__blob.text();
    })()`);
    t.check('匯出網頁內嵌 API 位置', exported.includes(`"apiBase":"${base}"`));
    t.check('匯出網頁不含管理者密碼', !exported.includes(token));

    const errors = tabs.flatMap(tab => tab.errors);
    t.check('瀏覽器沒有 JS 錯誤', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (err) {
    t.check('端對端測試執行', false, err.message);
  } finally {
    tabs.forEach(tab => tab.close());
    browser.kill();
    await sleep(500);
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }
  return t.summary();
}
