// I3：工作階段 store（角色、密碼、選取、篩選、時鐘、同步狀態；實作 SessionStore 合約）
import { create } from 'zustand';
import { DAY_END_MIN, DAY_START_MIN, DEFAULT_PROJECT_ID } from '@shared/constants';
import { nowMinutes } from '@shared/time';
import type { Role } from '@shared/types';
import { PROJECT_ID_RE } from '../services/api';
import { KEYS, LEGACY_CLOUD_CFG_KEY, readJSON, readString, writeString } from '../services/storage';
import { toast } from '../ui/Toast';
import type { ClockState, SessionStore, SyncStatus } from './contracts';

const ROLES: readonly Role[] = ['admin', 'staff', 'teacher'];
const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v);
const isProjectId = (v: unknown): v is string => typeof v === 'string' && PROJECT_ID_RE.test(v);

/** 模擬時間快轉：每 5 秒（真實時間）前進 10 分鐘（與舊版 toggleAutoPlaySim 相同） */
export const AUTOPLAY_INTERVAL_MS = 5_000;
export const AUTOPLAY_STEP_MIN = 10;
const DEFAULT_SIM_MIN = 610;

/**
 * 舊版（同網域）存過的雲端設定搬到新版：管理者不用重新輸入密碼。
 * 只在新版沒有對應設定時搬移，搬過一次就不再處理。
 */
export function migrateLegacySettings(): void {
  if (readString(KEYS.legacyMigrated)) return;
  const legacy = readJSON<{ adminToken?: unknown; projectId?: unknown }>(LEGACY_CLOUD_CFG_KEY);
  if (legacy) {
    if (typeof legacy.adminToken === 'string' && legacy.adminToken && readString(KEYS.adminToken) === null) {
      writeString(KEYS.adminToken, legacy.adminToken);
    }
    if (isProjectId(legacy.projectId) && readString(KEYS.projectId) === null) {
      writeString(KEYS.projectId, legacy.projectId);
    }
  }
  writeString(KEYS.legacyMigrated, '1');
}

function urlParams(): URLSearchParams {
  try {
    return new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
  } catch {
    return new URLSearchParams();
  }
}

/** 初始值：網址列 ?role= / ?project= 優先，其次是 localStorage */
function initialState(): Pick<SessionStore, 'role' | 'projectId' | 'adminToken' | 'clock'> {
  migrateLegacySettings();
  const params = urlParams();
  const urlRole = params.get('role');
  const urlProject = params.get('project');
  const savedRole = readString(KEYS.role);
  const savedProject = readString(KEYS.projectId);
  const savedSim = Number(readString(KEYS.simMin));
  return {
    role: isRole(urlRole) ? urlRole : isRole(savedRole) ? savedRole : 'teacher',
    projectId: isProjectId(urlProject) ? urlProject : isProjectId(savedProject) ? savedProject : DEFAULT_PROJECT_ID,
    adminToken: readString(KEYS.adminToken) ?? '',
    clock: {
      mode: 'real',
      simMin: Number.isFinite(savedSim) && savedSim >= DAY_START_MIN && savedSim <= DAY_END_MIN ? savedSim : DEFAULT_SIM_MIN,
      autoplay: false,
    },
  };
}

export const INITIAL_SYNC: SyncStatus = {
  connection: 'connecting',
  pending: false,
  updatedAt: null,
  adminVerified: false,
  online: null,
  error: null,
};

const EMPTY_FILTER: SessionStore['filter'] = { grade: null, venueId: null, query: '' };

export const useSession = create<SessionStore>((set) => ({
  ...initialState(),
  currentDayId: null,
  selectedEventId: null,
  filter: EMPTY_FILTER,
  sync: INITIAL_SYNC,
  setRole: (role) => set({ role }),
  setAdminToken: (token) => set({ adminToken: token.trim() }),
  setProjectId: (id) => {
    const projectId = id.trim().replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64) || DEFAULT_PROJECT_ID;
    set((s) => (s.projectId === projectId ? s : { projectId, currentDayId: null, selectedEventId: null }));
  },
  setCurrentDay: (currentDayId) => set({ currentDayId }),
  selectEvent: (selectedEventId) => set({ selectedEventId }),
  setFilter: (patch) => set((s) => ({ filter: { ...s.filter, ...patch } })),
  clearFilter: () => set({ filter: EMPTY_FILTER }),
  setClock: (patch) =>
    set((s) => {
      const clock: ClockState = { ...s.clock, ...patch };
      clock.simMin = Math.min(DAY_END_MIN, Math.max(DAY_START_MIN, clock.simMin));
      // 快轉只在模擬模式有意義
      if (patch.autoplay) clock.mode = 'sim';
      if (clock.mode === 'real') clock.autoplay = false;
      return { clock };
    }),
  setSync: (patch) => set((s) => ({ sync: { ...s.sync, ...patch } })),
}));

/** 目前時間（分鐘）：模擬模式用模擬時間，否則用真實時間（取整數分鐘，與舊版 getCurrentLiveMinutes 相同） */
export function currentClockMin(): number {
  const { clock } = useSession.getState();
  return clock.mode === 'sim' ? clock.simMin : Math.floor(nowMinutes());
}

// ---- 保存設定到 localStorage ----
useSession.subscribe((s, prev) => {
  if (s.adminToken !== prev.adminToken) writeString(KEYS.adminToken, s.adminToken || null);
  if (s.projectId !== prev.projectId) writeString(KEYS.projectId, s.projectId);
  if (s.role !== prev.role) writeString(KEYS.role, s.role);
  if (s.clock.simMin !== prev.clock.simMin) writeString(KEYS.simMin, String(s.clock.simMin));
});

// ---- 模擬時間快轉（舊版 toggleAutoPlaySim） ----
let autoplayTimer: ReturnType<typeof setInterval> | null = null;

function stopAutoplayTimer() {
  if (autoplayTimer) clearInterval(autoplayTimer);
  autoplayTimer = null;
}

useSession.subscribe((s, prev) => {
  if (s.clock.autoplay === prev.clock.autoplay) return;
  if (s.clock.autoplay) {
    stopAutoplayTimer();
    autoplayTimer = setInterval(() => {
      const { clock, setClock } = useSession.getState();
      if (clock.simMin >= DAY_END_MIN - AUTOPLAY_STEP_MIN) {
        setClock({ autoplay: false });
        toast('模擬時間已抵達 17:00 結束');
        return;
      }
      setClock({ simMin: clock.simMin + AUTOPLAY_STEP_MIN });
    }, AUTOPLAY_INTERVAL_MS);
    toast('▶ 啟動快轉測試：每 5 秒時間線自動前進 10 分鐘');
  } else {
    const reachedEnd = s.clock.simMin >= DAY_END_MIN - AUTOPLAY_STEP_MIN;
    stopAutoplayTimer();
    if (!reachedEnd) toast('已暫停自動快轉模擬');
  }
});
