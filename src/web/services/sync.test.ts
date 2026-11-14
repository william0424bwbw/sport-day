// 同步服務測試：假的 fetch、WebSocket、localStorage 與假時鐘
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectData } from '@shared/types';
import { FakeServer, FakeWebSocket, MemoryStorage, ev, project } from './test-helpers';

vi.mock('../ui/Toast', () => ({ toast: vi.fn() }));

const CACHE_KEY = 'sport-day:v1:cache:p1';

let server: FakeServer;
let storage: MemoryStorage;
let win: EventTarget;
let doc: EventTarget & { visibilityState: string };

interface SetupOptions {
  role?: 'admin' | 'staff' | 'teacher';
  token?: string;
  cache?: ProjectData & { updatedAt: number | null; pending?: boolean };
  withWebSocket?: boolean;
}

async function setup(opts: SetupOptions = {}) {
  vi.resetModules();
  storage = new MemoryStorage();
  if (opts.token) storage.setItem('sport-day:v1:adminToken', opts.token);
  if (opts.cache) storage.setItem(CACHE_KEY, JSON.stringify({ pending: false, ...opts.cache }));
  win = new EventTarget();
  doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('location', { protocol: 'https:', host: 'sport.test', search: `?project=p1&role=${opts.role ?? 'teacher'}` });
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('fetch', vi.fn(server.fetch));
  vi.stubGlobal('WebSocket', opts.withWebSocket === false ? undefined : FakeWebSocket);

  const { useSession } = await import('../stores/session');
  const { useProject } = await import('../stores/project');
  const { startSync } = await import('./sync');
  const { toast } = await import('../ui/Toast');
  return { useSession, useProject, startSync, toast: vi.mocked(toast) };
}

/** 讓 promise 鏈跑完（不推進時間） */
async function flush() {
  for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(0);
}

const GET_P = '/api/projects/p1';
const GET_V = '/api/projects/p1/version';
/** 讀取假伺服器目前的資料（避免 TypeScript 在設為 null 後收窄型別） */
const cloud = () => server.project;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  server = new FakeServer();
  FakeWebSocket.reset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('初始載入', () => {
  it('先顯示本機快取，再以雲端資料為準', async () => {
    server.project = project(2, [ev('cloud')]);
    const t = await setup({ cache: { ...project(1, [ev('cached')]) } });
    const stop = t.startSync();

    // 同步顯示快取
    expect(t.useProject.getState().loaded).toBe(true);
    expect(t.useProject.getState().events.map((e) => e.id)).toEqual(['cached']);
    expect(t.useSession.getState().sync.updatedAt).toBe(1);

    await flush();
    expect(t.useProject.getState().events.map((e) => e.id)).toEqual(['cloud']);
    expect(t.useSession.getState().sync.updatedAt).toBe(2);
    expect(JSON.parse(storage.getItem(CACHE_KEY)!).events[0].id).toBe('cloud');
    stop();
  });

  it('沒有快取：雲端載入後 loaded = true', async () => {
    server.project = project(5, [ev('a')]);
    const t = await setup();
    const stop = t.startSync();
    expect(t.useProject.getState().loaded).toBe(false);
    await flush();
    expect(t.useProject.getState().loaded).toBe(true);
    expect(t.useProject.getState().events).toHaveLength(1);
    stop();
  });

  it('連不上雲端：保留快取並顯示離線', async () => {
    server.down = true;
    const t = await setup({ cache: { ...project(1, [ev('cached')]) } });
    const stop = t.startSync();
    await flush();
    expect(t.useProject.getState().events.map((e) => e.id)).toEqual(['cached']);
    expect(t.useSession.getState().sync.connection).toBe('offline');
    expect(t.useSession.getState().sync.error).toBeTruthy();
    stop();
  });

  it('雲端沒有專案且管理者已驗證：上傳本機資料建立', async () => {
    server.project = null;
    const t = await setup({ role: 'admin', token: 'secret', cache: { ...project(0, [ev('local')]), updatedAt: null } });
    const stop = t.startSync();
    await flush();
    expect(server.count('PUT', GET_P)).toBe(1);
    expect(cloud()?.events.map((e) => e.id)).toEqual(['local']);
    expect(t.useSession.getState().sync.updatedAt).toBe(cloud()?.updatedAt);
    stop();
  });

  it('啟動時驗證管理者密碼', async () => {
    server.project = project(1, []);
    const t = await setup({ role: 'admin', token: 'secret' });
    const stop = t.startSync();
    await flush();
    expect(t.useSession.getState().sync.adminVerified).toBe(true);
    stop();
  });
});

describe('延遲寫入', () => {
  it('連續多次修改只送出一次 PUT（800 ms 合併）', async () => {
    server.project = project(1, [ev('a')]);
    const t = await setup({ role: 'admin', token: 'secret' });
    const stop = t.startSync();
    await flush();

    for (let i = 0; i < 5; i++) {
      t.useProject.getState().updateEvent('a', { title: `第 ${i} 次` });
      await vi.advanceTimersByTimeAsync(500);
    }
    expect(server.count('PUT', GET_P)).toBe(0);
    expect(t.useSession.getState().sync.pending).toBe(true);

    await vi.advanceTimersByTimeAsync(800);
    await flush();
    expect(server.count('PUT', GET_P)).toBe(1);
    expect(server.project?.events[0].title).toBe('第 4 次');
    expect(t.useSession.getState().sync.pending).toBe(false);
    expect(t.useSession.getState().sync.updatedAt).toBe(server.project?.updatedAt);
    stop();
  });

  it('瀏覽者（未驗證）修改不上傳', async () => {
    server.project = project(1, [ev('a')]);
    const t = await setup({ role: 'admin', token: 'wrong' });
    const stop = t.startSync();
    await flush();
    t.useProject.getState().updateEvent('a', { title: 'x' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(server.count('PUT', GET_P)).toBe(0);
    expect(t.toast).toHaveBeenCalled(); // 提醒尚未輸入密碼
    stop();
  });

  it('等待上傳或上傳中時，不套用雲端的新版本', async () => {
    server.project = project(1, [ev('a')]);
    const t = await setup({ role: 'admin', token: 'secret' });
    const stop = t.startSync();
    await flush();
    FakeWebSocket.last.open();
    await flush();
    const fullGets = server.count('GET', GET_P);

    // 1. 等待延遲寫入時收到別人的更新
    t.useProject.getState().updateEvent('a', { title: '本機' });
    server.project = project(50, [ev('a', { title: '別人' })]);
    FakeWebSocket.last.message({ type: 'updated', updatedAt: 50 });
    await flush();
    expect(server.count('GET', GET_P)).toBe(fullGets);
    expect(t.useProject.getState().events[0].title).toBe('本機');

    // 2. 上傳中又收到更新
    server.holdPuts();
    await vi.advanceTimersByTimeAsync(800);
    FakeWebSocket.last.message({ type: 'updated', updatedAt: 51 });
    await flush();
    expect(server.count('GET', GET_P)).toBe(fullGets);
    expect(t.useProject.getState().events[0].title).toBe('本機');

    server.releasePuts();
    await flush();
    expect(server.project?.events[0].title).toBe('本機');
    expect(t.useSession.getState().sync.pending).toBe(false);
    stop();
  });

  it('PUT 回應 401：取消管理者驗證並提示', async () => {
    server.project = project(1, [ev('a')]);
    const t = await setup({ role: 'admin', token: 'secret' });
    const stop = t.startSync();
    await flush();
    server.adminToken = 'changed';
    t.useProject.getState().updateEvent('a', { title: 'x' });
    await vi.advanceTimersByTimeAsync(800);
    await flush();
    expect(t.useSession.getState().sync.adminVerified).toBe(false);
    expect(t.useSession.getState().sync.pending).toBe(false);
    expect(t.toast).toHaveBeenCalledWith(expect.stringContaining('密碼已失效'), 'error');
    stop();
  });

  it('網路錯誤：保留待上傳，恢復連線後補傳', async () => {
    server.project = project(1, [ev('a')]);
    const t = await setup({ role: 'admin', token: 'secret' });
    const stop = t.startSync();
    await flush();
    server.down = true;
    t.useProject.getState().updateEvent('a', { title: '離線修改' });
    await vi.advanceTimersByTimeAsync(800);
    await flush();
    expect(t.useSession.getState().sync.pending).toBe(true);
    expect(t.useSession.getState().sync.connection).toBe('offline');
    expect(JSON.parse(storage.getItem(CACHE_KEY)!).pending).toBe(true);

    server.down = false;
    win.dispatchEvent(new Event('online'));
    await flush();
    expect(server.project?.events[0].title).toBe('離線修改');
    expect(t.useSession.getState().sync.pending).toBe(false);
    stop();
  });

  it('資料格式錯誤（400）：不重試並顯示錯誤', async () => {
    server.project = project(1, [ev('a')]);
    const t = await setup({ role: 'admin', token: 'secret' });
    const stop = t.startSync();
    await flush();
    server.putStatus = 400;
    t.useProject.getState().updateEvent('a', { title: 'x' });
    await vi.advanceTimersByTimeAsync(800);
    await flush();
    expect(t.useSession.getState().sync.pending).toBe(false);
    expect(t.useSession.getState().sync.error).toContain('資料格式錯誤');
    stop();
  });

  it('離線時的修改：重新整理後，雲端沒變就補傳', async () => {
    server.project = project(7, [ev('a')]);
    const t = await setup({
      role: 'admin',
      token: 'secret',
      cache: { ...project(7, [ev('a', { title: '離線修改' })]), pending: true },
    });
    const stop = t.startSync();
    await flush();
    expect(server.count('PUT', GET_P)).toBe(1);
    expect(server.project?.events[0].title).toBe('離線修改');
    stop();
  });
});

describe('即時同步（WebSocket）', () => {
  it('連線網址使用 wss 與專案代碼', async () => {
    server.project = project(1, []);
    const t = await setup();
    const stop = t.startSync();
    expect(FakeWebSocket.last.url).toBe('wss://sport.test/api/projects/p1/ws');
    stop();
  });

  it('hello / updated：版本不同才下載', async () => {
    server.project = project(1, [ev('a')]);
    const t = await setup();
    const stop = t.startSync();
    await flush();
    const ws = FakeWebSocket.last;
    ws.open();
    await flush();
    expect(t.useSession.getState().sync.connection).toBe('live');
    expect(server.count('GET', GET_V)).toBe(1); // 連線後先查一次版本
    const gets = server.count('GET', GET_P);

    ws.message({ type: 'hello', updatedAt: 1, online: 3 });
    await flush();
    expect(server.count('GET', GET_P)).toBe(gets);
    expect(t.useSession.getState().sync.online).toBe(3);

    ws.message({ type: 'updated', updatedAt: 1 });
    await flush();
    expect(server.count('GET', GET_P)).toBe(gets);

    server.project = project(2, [ev('b')]);
    ws.message({ type: 'updated', updatedAt: 2 });
    await flush();
    expect(server.count('GET', GET_P)).toBe(gets + 1);
    expect(t.useProject.getState().events.map((e) => e.id)).toEqual(['b']);
    expect(t.useSession.getState().sync.updatedAt).toBe(2);

    ws.message({ type: 'presence', online: 7 });
    expect(t.useSession.getState().sync.online).toBe(7);
    stop();
  });

  it('每 25 秒送出心跳', async () => {
    server.project = project(1, []);
    const t = await setup();
    const stop = t.startSync();
    await flush();
    FakeWebSocket.last.open();
    await vi.advanceTimersByTimeAsync(25_000);
    expect(FakeWebSocket.last.sent).toEqual(['ping']);
    stop();
  });

  it('斷線後以指數退避重連，重連成功立即查版本', async () => {
    server.project = project(1, []);
    const t = await setup();
    const stop = t.startSync();
    await flush();
    FakeWebSocket.last.open();
    await flush();
    FakeWebSocket.last.fail();
    expect(t.useSession.getState().sync.connection).toBe('connecting');
    await vi.advanceTimersByTimeAsync(999);
    expect(FakeWebSocket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeWebSocket.instances).toHaveLength(2);
    const v = server.count('GET', GET_V);
    FakeWebSocket.last.open();
    await flush();
    expect(server.count('GET', GET_V)).toBe(v + 1);
    stop();
  });

  it('連續失敗 3 次退回每 30 秒輪詢，並每 60 秒重試 WebSocket', async () => {
    server.project = project(1, []);
    const t = await setup();
    const stop = t.startSync();
    await flush();
    FakeWebSocket.last.fail(); // 1
    await vi.advanceTimersByTimeAsync(1_000);
    FakeWebSocket.last.fail(); // 2
    await vi.advanceTimersByTimeAsync(2_000);
    expect(FakeWebSocket.instances).toHaveLength(3);
    const v0 = server.count('GET', GET_V);
    FakeWebSocket.last.fail(); // 3
    await flush();
    expect(t.useSession.getState().sync.connection).toBe('polling');
    expect(server.count('GET', GET_V)).toBe(v0 + 1);

    server.project = project(2, [ev('new')]);
    await vi.advanceTimersByTimeAsync(30_000);
    await flush();
    expect(server.count('GET', GET_V)).toBe(v0 + 2);
    expect(t.useProject.getState().events.map((e) => e.id)).toEqual(['new']);
    expect(FakeWebSocket.instances).toHaveLength(3);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(FakeWebSocket.instances).toHaveLength(4); // 60 秒後重試
    FakeWebSocket.last.open();
    await flush();
    expect(t.useSession.getState().sync.connection).toBe('live');
    const v1 = server.count('GET', GET_V);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(server.count('GET', GET_V)).toBe(v1); // 已停止輪詢
    stop();
  });

  it('不支援 WebSocket：直接輪詢', async () => {
    server.project = project(1, []);
    const t = await setup({ withWebSocket: false });
    const stop = t.startSync();
    await flush();
    expect(t.useSession.getState().sync.connection).toBe('polling');
    const v = server.count('GET', GET_V);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(server.count('GET', GET_V)).toBe(v + 1);
    stop();
  });

  it('畫面回到前景時立即查版本', async () => {
    server.project = project(1, []);
    const t = await setup();
    const stop = t.startSync();
    await flush();
    const v = server.count('GET', GET_V);
    doc.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(server.count('GET', GET_V)).toBe(v + 1);
    stop();
  });
});

describe('切換與停止', () => {
  it('切換 projectId 會重新載入', async () => {
    server.project = project(1, [ev('a')]);
    const t = await setup();
    const stop = t.startSync();
    await flush();
    const firstWs = FakeWebSocket.last;
    t.useSession.getState().setProjectId('p2');
    expect(firstWs.closed).toBe(true);
    await flush();
    expect(server.count('GET', '/api/projects/p2')).toBe(1);
    expect(FakeWebSocket.last.url).toContain('/api/projects/p2/ws');
    stop();
  });

  it('停止後不再有任何請求、計時器與連線', async () => {
    server.project = project(1, [ev('a')]);
    const t = await setup({ role: 'admin', token: 'secret' });
    const stop = t.startSync();
    await flush();
    const ws = FakeWebSocket.last;
    ws.open();
    await flush();
    t.useProject.getState().updateEvent('a', { title: 'x' }); // 有排程中的上傳
    stop();
    expect(ws.closed).toBe(true);

    const calls = server.calls.length;
    t.useProject.getState().updateEvent('a', { title: 'y' });
    t.useSession.getState().setProjectId('p3');
    t.useSession.getState().setAdminToken('other');
    win.dispatchEvent(new Event('online'));
    doc.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(120_000);
    expect(server.calls.length).toBe(calls);
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('StrictMode：啟動、停止、再啟動只保留一組連線', async () => {
    server.project = project(1, []);
    const t = await setup();
    const stop1 = t.startSync();
    stop1();
    const stop2 = t.startSync();
    await flush();
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.instances[0].closed).toBe(true);
    expect(FakeWebSocket.instances[1].closed).toBe(false);
    stop2();
  });

  it('更改管理者密碼後重新驗證並提示結果', async () => {
    server.project = project(1, []);
    const t = await setup({ role: 'admin' });
    const stop = t.startSync();
    await flush();
    expect(t.useSession.getState().sync.adminVerified).toBe(false);
    t.useSession.getState().setAdminToken('secret');
    await flush();
    expect(t.useSession.getState().sync.adminVerified).toBe(true);
    expect(t.toast).toHaveBeenCalledWith(expect.stringContaining('密碼正確'), 'success');
    expect(storage.getItem('sport-day:v1:adminToken')).toBe('secret');
    stop();
  });
});
