// 前端 store 的介面合約（UI 元件只依賴這裡定義的 API）
// 實作：src/web/stores/project.ts、session.ts，同步：src/web/services/*

import type { GradeId } from '@shared/constants';
import type { CommandSlot, Day, ProjectData, Role, ScheduleEvent, Venue } from '@shared/types';

/** 雲端連線狀態 */
export type ConnectionState =
  | 'connecting' // 連線中
  | 'live' // WebSocket 即時推送
  | 'polling' // WebSocket 失敗，退回輪詢
  | 'offline' // 斷線（顯示本機快取）
  | 'local'; // 沒有 API（例如單元測試）

export interface SyncStatus {
  connection: ConnectionState;
  /** 本機有尚未上傳的修改 */
  pending: boolean;
  /** 最後一次與雲端一致的版本號 */
  updatedAt: number | null;
  /** 管理者密碼已通過驗證 */
  adminVerified: boolean;
  /** 線上人數（Durable Object 推送） */
  online: number | null;
  /** 最近一次錯誤訊息（中文） */
  error: string | null;
}

export interface ProjectStore extends ProjectData {
  /** 是否已載入過資料（雲端或本機快取） */
  loaded: boolean;

  // ---- 賽程 ----
  addEvent(init: Partial<ScheduleEvent> & { dateId: string; venueIds: string[]; startMin: number }): string;
  updateEvent(id: string, patch: Partial<ScheduleEvent>): void;
  /** 改時間（套用磁吸連動） */
  setEventTime(id: string, startMin: number, endMin: number): void;
  /** 拖曳移動（保留長度，可換主要場地） */
  moveEvent(id: string, startMin: number, venueId?: string): void;
  duplicateEvent(id: string): string;
  deleteEvent(id: string): void;
  /** 現場調度 */
  markActualStart(id: string, min?: number): void;
  markActualEnd(id: string, min?: number): void;
  resetActual(id: string): void;
  delaySubsequent(id: string, deltaMin: number): void;

  // ---- 場地 ----
  addVenue(init?: Partial<Venue>): string;
  updateVenue(id: string, patch: Partial<Venue>): void;
  deleteVenue(id: string): void;

  // ---- 比賽日與司令台 ----
  addDay(init: Partial<Day> & { label: string }): string;
  updateDay(id: string, patch: Partial<Day>): void;
  deleteDay(id: string): void;
  upsertCommandSlot(dayId: string, slot: Omit<CommandSlot, 'id'> & { id?: string }): string;
  deleteCommandSlot(dayId: string, slotId: string): void;

  /** 整份取代（匯入 JSON、載入範例、收到雲端新版本） */
  replaceAll(data: ProjectData, origin: 'remote' | 'local'): void;
}

export interface ClockState {
  mode: 'real' | 'sim';
  /** 模擬時間（分鐘） */
  simMin: number;
  autoplay: boolean;
}

export interface SessionStore {
  role: Role;
  projectId: string;
  adminToken: string;
  currentDayId: string | null;
  selectedEventId: string | null;
  filter: { grade: GradeId | null; venueId: string | null; query: string };
  clock: ClockState;
  sync: SyncStatus;

  setRole(role: Role): void;
  setAdminToken(token: string): void;
  setProjectId(id: string): void;
  setCurrentDay(id: string | null): void;
  selectEvent(id: string | null): void;
  setFilter(patch: Partial<SessionStore['filter']>): void;
  clearFilter(): void;
  setClock(patch: Partial<ClockState>): void;
  /** 由同步服務更新 */
  setSync(patch: Partial<SyncStatus>): void;
}
