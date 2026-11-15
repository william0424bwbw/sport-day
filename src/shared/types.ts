// 賽程資料型別（前端與 Worker 共用）
// 對應 API GET/PUT /api/projects/:id 的 JSON 格式，以及 D1 資料表（src/worker/db.ts）。
// 時間欄位（*Min）一律是「從 0:00 起算的分鐘數」，例如 540 = 09:00。

export type ColorTheme = 'blue' | 'emerald' | 'amber' | 'rose' | 'purple';

export interface Venue {
  id: string;
  name: string;
  subtitle?: string;
  /** 資料表沒有對應欄位的屬性（extra） */
  [extra: string]: unknown;
}

export interface GeneralStaff {
  hosts?: string;
  recorders?: string;
  stageControl?: string;
}

export type CommandSlotType = 'host' | 'award' | string;

/** 司令台播報／頒獎時段 */
export interface CommandSlot {
  id: string;
  type: CommandSlotType;
  startMin: number;
  endMin: number;
  staff?: string;
  content?: string;
  [extra: string]: unknown;
}

/** 比賽日（API 欄位名稱為 dates） */
export interface Day {
  id: string;
  label: string;
  category?: string;
  commandDeckEnabled?: boolean;
  generalStaff?: GeneralStaff;
  commandSlots?: CommandSlot[];
  [extra: string]: unknown;
}

export interface Referee {
  role?: string;
  name?: string;
  [extra: string]: unknown;
}

export interface Attachment {
  name: string;
  type: 'image' | 'pdf' | string;
  dataUrl?: string;
  [extra: string]: unknown;
}

/** 一個賽程方塊 */
export interface ScheduleEvent {
  id: string;
  dateId: string;
  venueIds: string[];
  startMin: number;
  endMin: number;
  /** 提早幾分鐘檢錄 */
  checkInOffsetMin: number;
  /** 與同場地前一項目磁吸連動 */
  linkPrev: boolean;
  title: string;
  color: ColorTheme | string;
  referees: Referee[];
  volunteerCount?: number;
  volunteerTask?: string;
  studentCount?: number;
  studentTask?: string;
  equipment: string[];
  laneNote?: string;
  attachments: Attachment[];
  actualStartMin?: number | null;
  actualEndMin?: number | null;
  [extra: string]: unknown;
}

/** 專案設定（管理者在「設定」頁修改，所有人都看得到） */
export interface ProjectSettings {
  /** 聯絡窗口，例如「體育組 楊合萍老師」 */
  contact?: string;
  [extra: string]: unknown;
}

/** 一場運動會的完整資料 */
export interface ProjectData {
  venues: Venue[];
  dates: Day[];
  events: ScheduleEvent[];
  /** 沒有設定過時可能不存在 */
  settings?: ProjectSettings;
}

/** GET /api/projects/:id 的回應（不存在時為 null） */
export interface ProjectResponse extends ProjectData {
  updatedAt: number;
}

export type Role = 'admin' | 'staff' | 'teacher';

export type EventStatus = 'upcoming' | 'checkin' | 'live' | 'done';
