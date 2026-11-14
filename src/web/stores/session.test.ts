// 工作階段 store 測試：網址參數、localStorage 保存、舊版設定搬移、模擬時間快轉
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage } from '../services/test-helpers';

vi.mock('../ui/Toast', () => ({ toast: vi.fn() }));

let storage: MemoryStorage;

async function load(search = '', seed: Record<string, string> = {}) {
  vi.resetModules();
  storage = new MemoryStorage();
  for (const [k, v] of Object.entries(seed)) storage.setItem(k, v);
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('location', { protocol: 'http:', host: 'localhost', search });
  return import('./session');
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('session 初始值', () => {
  it('預設：導師視角、預設專案', async () => {
    const { useSession } = await load();
    const s = useSession.getState();
    expect(s.role).toBe('teacher');
    expect(s.projectId).toBe('school-sports-115');
    expect(s.adminToken).toBe('');
  });

  it('網址 ?role= 與 ?project= 優先於本機設定', async () => {
    const { useSession } = await load('?role=admin&project=abc_1', {
      'sport-day:v1:role': 'staff',
      'sport-day:v1:projectId': 'saved',
    });
    expect(useSession.getState().role).toBe('admin');
    expect(useSession.getState().projectId).toBe('abc_1');
  });

  it('不合法的網址參數會被忽略', async () => {
    const { useSession } = await load('?role=root&project=../x', { 'sport-day:v1:role': 'staff' });
    expect(useSession.getState().role).toBe('staff');
    expect(useSession.getState().projectId).toBe('school-sports-115');
  });

  it('搬移舊版的管理者密碼與專案代碼（只搬一次）', async () => {
    const legacy = JSON.stringify({ adminToken: 'old-pass', projectId: 'legacy-proj' });
    const { useSession } = await load('', { school_sports_day_cloud_cfg_v1: legacy });
    expect(useSession.getState().adminToken).toBe('old-pass');
    expect(useSession.getState().projectId).toBe('legacy-proj');
    expect(storage.getItem('sport-day:v1:legacyMigrated')).toBe('1');
  });

  it('新版已有設定時不被舊版覆蓋', async () => {
    const legacy = JSON.stringify({ adminToken: 'old-pass', projectId: 'legacy-proj' });
    const { useSession } = await load('', {
      school_sports_day_cloud_cfg_v1: legacy,
      'sport-day:v1:adminToken': 'new-pass',
    });
    expect(useSession.getState().adminToken).toBe('new-pass');
  });
});

describe('session 保存與動作', () => {
  it('密碼、專案、角色寫入 localStorage', async () => {
    const { useSession } = await load();
    const s = useSession.getState();
    s.setAdminToken(' pass ');
    s.setProjectId('my proj');
    s.setRole('staff');
    expect(storage.getItem('sport-day:v1:adminToken')).toBe('pass');
    expect(storage.getItem('sport-day:v1:projectId')).toBe('my_proj');
    expect(storage.getItem('sport-day:v1:role')).toBe('staff');
    s.setAdminToken('');
    expect(storage.getItem('sport-day:v1:adminToken')).toBeNull();
  });

  it('切換專案時清除選取', async () => {
    const { useSession } = await load();
    useSession.setState({ currentDayId: 'd1', selectedEventId: 'e1' });
    useSession.getState().setProjectId('other');
    expect(useSession.getState().currentDayId).toBeNull();
    expect(useSession.getState().selectedEventId).toBeNull();
  });

  it('篩選', async () => {
    const { useSession } = await load();
    useSession.getState().setFilter({ query: '王' });
    useSession.getState().setFilter({ venueId: 'A' });
    expect(useSession.getState().filter).toEqual({ grade: null, venueId: 'A', query: '王' });
    useSession.getState().clearFilter();
    expect(useSession.getState().filter).toEqual({ grade: null, venueId: null, query: '' });
  });

  it('currentClockMin：模擬模式用模擬時間', async () => {
    const { useSession, currentClockMin } = await load();
    vi.setSystemTime(new Date(2026, 11, 14, 9, 30, 40));
    expect(currentClockMin()).toBe(570);
    useSession.getState().setClock({ mode: 'sim', simMin: 600 });
    expect(currentClockMin()).toBe(600);
  });
});

describe('模擬時間快轉', () => {
  it('每 5 秒前進 10 分鐘，到 17:00 前自動停止', async () => {
    const { useSession } = await load();
    useSession.getState().setClock({ simMin: 990, autoplay: true });
    expect(useSession.getState().clock.mode).toBe('sim');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(useSession.getState().clock.simMin).toBe(1000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(useSession.getState().clock.simMin).toBe(1010);
    expect(useSession.getState().clock.autoplay).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('暫停快轉會停止計時器；切回真實時間也會停止', async () => {
    const { useSession } = await load();
    useSession.getState().setClock({ autoplay: true });
    useSession.getState().setClock({ autoplay: false });
    expect(vi.getTimerCount()).toBe(0);
    useSession.getState().setClock({ autoplay: true });
    useSession.getState().setClock({ mode: 'real' });
    expect(useSession.getState().clock.autoplay).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('模擬時間會保存', async () => {
    const { useSession } = await load();
    useSession.getState().setClock({ simMin: 700 });
    expect(storage.getItem('sport-day:v1:simMin')).toBe('700');
  });
});
