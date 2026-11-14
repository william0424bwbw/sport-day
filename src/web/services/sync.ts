// I3/I4：同步服務（載入、延遲寫入、斷線補傳、WebSocket 即時推送、退回輪詢）
// 由舊版 legacy/index.html 的 connectCloudDatabase / scheduleCloudPush / pushLocalToCloudNow / pollCloudUpdates 改寫。
// 原則：雲端（D1）是唯一資料來源；localStorage 只當離線快取，讓畫面立即顯示。

import type { ProjectData, ProjectResponse } from '@shared/types';
import { onLocalChange, projectSnapshot, useProject } from '../stores/project';
import { useSession } from '../stores/session';
import { toast } from '../ui/Toast';
import { ApiError, checkAdmin, fetchProject, fetchVersion, putProject } from './api';
import { startRealtime, type RealtimeHandle, type TransportState } from './realtime';
import { loadCache, saveCache } from './storage';

/** 本機修改後延遲多久上傳（合併拖曳等連續修改） */
export const PUSH_DEBOUNCE_MS = 800;
/** 「尚未輸入密碼」提醒的最短間隔 */
const READ_ONLY_WARN_MS = 15_000;

const MSG = {
  offline: '無法連線雲端，目前顯示這台裝置上次同步的賽程',
  tokenExpired: '管理者密碼已失效，修改只存在這台裝置，請重新輸入密碼',
  tokenOk: '管理者密碼正確，之後的修改會自動儲存到雲端',
  tokenWrong: '管理者密碼不正確，目前只能瀏覽',
  readOnly: '尚未輸入管理者密碼：修改只存在這台裝置，不會存到雲端（到「設定」輸入密碼）',
  storageFull: '提醒：本機空間較滿，建議刪除過大的道次表圖片或改用 PDF',
  conflict: '雲端賽程已被其他裝置更新，這台裝置離線時的修改沒有上傳',
  notVerified: '管理者密碼尚未通過驗證，這台裝置離線時的修改沒有上傳',
  saveFailed: (m: string) => `雲端儲存失敗：${m}`,
};

const session = () => useSession.getState();
const setSync = (patch: Parameters<ReturnType<typeof session>['setSync']>[0]) => session().setSync(patch);

/** 可以把修改寫入雲端：管理者視角、密碼已驗證 */
const canPush = () => {
  const s = session();
  return s.role === 'admin' && Boolean(s.adminToken) && s.sync.adminVerified;
};

/** 一個專案的同步工作（切換 projectId 時整個重建） */
class ProjectSync {
  private stopped = false;
  /** 最後一次與雲端一致的版本號 */
  private version: number | null = null;
  /** 已成功從雲端載入過（或確認雲端沒有這個專案） */
  private cloudLoaded = false;
  /** 有尚未上傳的修改 */
  private dirty = false;
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  private pushAgain = false;
  /** 上傳期間收到其他版本的通知，上傳完成後要再查一次 */
  private remoteSeen = false;
  private transport: TransportState = 'connecting';
  private realtime: RealtimeHandle | null = null;
  private checking: Promise<void> | null = null;

  constructor(readonly projectId: string) {}

  start() {
    // 1. 先用本機快取立即顯示
    const cache = loadCache(this.projectId);
    if (cache) {
      useProject.getState().replaceAll(cache, 'remote');
      this.version = cache.updatedAt;
      this.dirty = cache.pending;
    } else {
      useProject.setState({ venues: [], dates: [], events: [], loaded: false });
    }
    setSync({ connection: 'connecting', pending: this.dirty, updatedAt: this.version, online: null, error: null });

    // 2. 從雲端載入（雲端為準），3. 開啟即時連線
    this.checking = this.loadFromCloud().finally(() => {
      this.checking = null;
    });
    this.realtime = startRealtime({
      projectId: this.projectId,
      onOpen: () => void this.checkVersion(),
      onPoll: () => void this.checkVersion(),
      onMessage: (msg) => {
        if (msg.type === 'presence') {
          setSync({ online: msg.online });
          return;
        }
        if (msg.type === 'hello') setSync({ online: msg.online });
        if (msg.updatedAt !== null) this.onRemoteVersion(msg.updatedAt);
      },
      onStateChange: (state) => {
        this.transport = state;
        if (session().sync.connection !== 'offline' || state === 'live') setSync({ connection: state });
      },
    });
  }

  stop() {
    this.stopped = true;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = null;
    this.realtime?.stop();
    this.realtime = null;
  }

  /** 網路恢復、畫面回到前景 */
  wake() {
    if (this.stopped) return;
    this.realtime?.wake();
    void this.checkVersion();
  }

  private get busy() {
    return this.dirty || this.inFlight || this.pushTimer !== null;
  }

  private markOnline() {
    const patch: Parameters<typeof setSync>[0] = { error: null };
    if (session().sync.connection === 'offline' || session().sync.connection === 'local') {
      patch.connection = this.transport;
    }
    setSync(patch);
  }

  private markOffline(err: unknown) {
    const message = err instanceof ApiError && err.status !== 0 ? err.message : MSG.offline;
    setSync({ connection: 'offline', error: message });
  }

  private writeCache(data: ProjectData = projectSnapshot()) {
    const ok = saveCache(this.projectId, { ...data, updatedAt: this.version, pending: this.dirty });
    if (!ok) warnOnce('storage', MSG.storageFull, READ_ONLY_WARN_MS);
  }

  /** 套用雲端版本（本機有尚未上傳的修改時不套用） */
  private applyRemote(data: ProjectResponse) {
    if (this.stopped || this.busy) return;
    this.version = data.updatedAt;
    useProject.getState().replaceAll(data, 'remote');
    this.writeCache(data);
    setSync({ updatedAt: data.updatedAt, pending: false });
  }

  /** 完整載入（舊版 connectCloudDatabase） */
  async loadFromCloud(): Promise<void> {
    let data: ProjectResponse | null;
    try {
      data = await fetchProject(this.projectId);
    } catch (err) {
      if (!this.stopped) this.markOffline(err);
      return;
    }
    if (this.stopped) return;
    this.cloudLoaded = true;
    this.markOnline();
    await ensureVerified(); // 等密碼驗證完成，才知道能不能上傳
    if (this.stopped) return;

    if (data) {
      if (this.dirty && !this.inFlight && !this.pushTimer) {
        // 離線時修改過：雲端沒有被別人改過才補傳，否則以雲端為準
        if (canPush() && data.updatedAt === this.version) {
          void this.flushPush();
          return;
        }
        this.dirty = false;
        toast(canPush() ? MSG.conflict : MSG.notVerified, 'error');
      }
      if (data.updatedAt !== this.version || !useProject.getState().loaded) this.applyRemote(data);
      return;
    }

    // 雲端還沒有這個專案
    if (!useProject.getState().loaded) useProject.getState().replaceAll({ venues: [], dates: [], events: [] }, 'remote');
    const local = projectSnapshot();
    const hasData = local.events.length > 0 || local.venues.length > 0 || local.dates.length > 0;
    if (canPush() && hasData) {
      // 由管理者把本機賽程上傳建立
      this.dirty = true;
      void this.flushPush();
    }
  }

  /** 查版本號，有變才下載（舊版 pollCloudUpdates）；同時只跑一個 */
  checkVersion(): Promise<void> {
    if (!this.checking) {
      this.checking = this.doCheckVersion().finally(() => {
        this.checking = null;
      });
    }
    return this.checking;
  }

  private async doCheckVersion(): Promise<void> {
    if (this.stopped) return;
    if (!this.cloudLoaded) return this.loadFromCloud();
    let remote: number | null;
    try {
      remote = await fetchVersion(this.projectId);
    } catch (err) {
      if (!this.stopped) this.markOffline(err);
      return;
    }
    if (this.stopped) return;
    this.markOnline();
    await ensureVerified();
    if (this.stopped) return;

    // 本機有尚未上傳的修改：先補傳，不要被雲端資料蓋掉
    if (this.dirty && !canPush()) this.dirty = false;
    if (this.busy) {
      if (this.dirty && !this.inFlight && !this.pushTimer) void this.flushPush();
      return;
    }
    if (remote === null || remote === this.version) return;
    await this.fetchAndApply();
  }

  private async fetchAndApply() {
    try {
      const data = await fetchProject(this.projectId);
      if (data) this.applyRemote(data);
    } catch (err) {
      if (!this.stopped) this.markOffline(err);
    }
  }

  /** WebSocket 通知新版本 */
  private onRemoteVersion(updatedAt: number) {
    if (this.stopped || updatedAt === this.version) return;
    if (!this.cloudLoaded) {
      void this.checkVersion();
      return;
    }
    if (this.busy) {
      this.remoteSeen = true;
      return;
    }
    void this.fetchAndApply();
  }

  /** 本機修改（舊版 saveToStorage） */
  onLocalChange() {
    if (this.stopped) return;
    if (canPush()) {
      this.dirty = true;
      setSync({ pending: true });
      this.schedulePush();
    } else if (session().role === 'admin') {
      warnOnce('readOnly', MSG.readOnly, READ_ONLY_WARN_MS);
    }
    this.writeCache();
  }

  private schedulePush() {
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      void this.flushPush();
    }, PUSH_DEBOUNCE_MS);
  }

  /** 密碼驗證通過後：補傳離線時的修改 */
  onAdminVerified() {
    if (this.dirty && !this.busyPushing()) void this.flushPush();
  }

  private busyPushing() {
    return this.inFlight || this.pushTimer !== null;
  }

  /** 上傳（舊版 pushLocalToCloudNow） */
  async flushPush(): Promise<void> {
    if (this.stopped || !canPush()) return;
    if (this.inFlight) {
      this.pushAgain = true;
      return;
    }
    this.inFlight = true;
    this.dirty = false;
    setSync({ pending: true });
    const token = session().adminToken;
    try {
      const updatedAt = await putProject(this.projectId, projectSnapshot(), token);
      if (this.stopped) return;
      // 用伺服器回傳的版本號，避免把自己剛寫入的資料當成新版本
      this.version = updatedAt;
      this.markOnline();
      setSync({ updatedAt });
    } catch (err) {
      if (this.stopped) return;
      if (err instanceof ApiError && err.status === 401) {
        this.dirty = false;
        setSync({ adminVerified: false });
        toast(MSG.tokenExpired, 'error');
      } else if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        // 資料格式錯誤等：重試也不會成功，停止重試
        this.dirty = false;
        setSync({ error: MSG.saveFailed(err.message) });
        toast(MSG.saveFailed(err.message), 'error');
      } else {
        // 網路問題或伺服器暫時錯誤：保留待上傳標記，恢復連線後自動補傳
        this.dirty = true;
        this.markOffline(err);
      }
    } finally {
      this.inFlight = false;
      if (!this.stopped) {
        this.writeCache();
        setSync({ pending: this.dirty || this.pushTimer !== null });
        if (this.pushAgain) {
          this.pushAgain = false;
          if (this.dirty && !this.pushTimer) this.schedulePush();
        } else if (this.remoteSeen && !this.busy) {
          this.remoteSeen = false;
          void this.checkVersion();
        }
      }
    }
  }
}

// ---- 提醒節流 ----
const lastWarnAt: Record<string, number> = {};
function warnOnce(key: string, text: string, intervalMs: number) {
  const now = Date.now();
  if (now - (lastWarnAt[key] ?? -Infinity) < intervalMs) return;
  lastWarnAt[key] = now;
  toast(text);
}

// ---- 管理者密碼驗證 ----
let verifySeq = 0;
let verifyPromise: Promise<void> = Promise.resolve();
/** 最近一次驗證有連上伺服器（false = 網路錯誤，恢復連線後要再驗證） */
let verifyReached = true;

/** 等候進行中的驗證；上次因網路錯誤沒驗證成功時重新驗證 */
async function ensureVerified(): Promise<void> {
  await verifyPromise;
  if (!verifyReached && session().adminToken && !session().sync.adminVerified) await verifyAdmin(false);
}

/** 驗證目前的密碼並更新 session.sync.adminVerified；announce = 顯示結果提示 */
function verifyAdmin(announce: boolean): Promise<void> {
  const seq = ++verifySeq;
  const token = session().adminToken;
  verifyPromise = (async () => {
    if (!token) {
      verifyReached = true;
      setSync({ adminVerified: false });
      return;
    }
    let ok = false;
    let reached = true;
    try {
      ok = await checkAdmin(token);
    } catch {
      reached = false;
    }
    if (seq !== verifySeq) return; // 期間密碼又改了
    verifyReached = reached;
    setSync({ adminVerified: ok });
    if (announce && reached) toast(ok ? MSG.tokenOk : MSG.tokenWrong, ok ? 'success' : 'error');
    if (ok) current?.onAdminVerified();
  })();
  return verifyPromise;
}

let current: ProjectSync | null = null;

/** 啟動同步，回傳停止函式 */
export function startSync(): () => void {
  let active = true;
  const begin = (projectId: string) => {
    current?.stop();
    current = new ProjectSync(projectId);
    current.start();
  };

  setSync({ adminVerified: false });
  void verifyAdmin(false);
  begin(session().projectId);

  const unsubSession = useSession.subscribe((s, prev) => {
    if (!active) return;
    if (s.projectId !== prev.projectId) begin(s.projectId);
    if (s.adminToken !== prev.adminToken) {
      setSync({ adminVerified: false });
      void verifyAdmin(true);
    }
  });
  const unsubLocal = onLocalChange(() => current?.onLocalChange());

  const onVisible = () => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') current?.wake();
  };
  const onOnline = () => current?.wake();
  const onOffline = () => setSync({ connection: 'offline', error: MSG.offline });
  const win = typeof window !== 'undefined' ? window : null;
  const doc = typeof document !== 'undefined' ? document : null;
  win?.addEventListener('online', onOnline);
  win?.addEventListener('offline', onOffline);
  doc?.addEventListener('visibilitychange', onVisible);

  return () => {
    if (!active) return;
    active = false;
    unsubSession();
    unsubLocal();
    win?.removeEventListener('online', onOnline);
    win?.removeEventListener('offline', onOffline);
    doc?.removeEventListener('visibilitychange', onVisible);
    verifySeq++; // 進行中的驗證結果不再套用
    current?.stop();
    current = null;
  };
}
