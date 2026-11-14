// 排程商業邏輯（純函式，前端與 Worker 共用）
// 由舊版 legacy/index.html 抽出；行為必須與舊版一致（見 schedule.test.ts 的行為對照測試）。
// 所有函式都不修改傳入的陣列或物件，回傳新的資料（沒有變動的賽程物件可能沿用同一個參照）。

import { DAY_END_MIN, DAY_START_MIN, GRADE_BLOCKS, STEP_MINUTES } from './constants';
import type { GradeId } from './constants';
import { clampToDay } from './time';
import type { Day, EventStatus, Referee, ScheduleEvent } from './types';

/** 舊版沒有場地資料時的預設場地 id */
const FALLBACK_VENUE = 'A';

/** 實際時間是否有紀錄（舊版以真偽值判斷，0 視為沒有紀錄） */
const hasActual = (v: number | null | undefined): v is number => Boolean(v);

/** 以 id 取代陣列中「第一個」符合的賽程（與舊版 state.events.find 相同只認第一個） */
function replaceFirst(
  events: ScheduleEvent[],
  id: string,
  update: (ev: ScheduleEvent) => ScheduleEvent,
): ScheduleEvent[] {
  const idx = events.findIndex((e) => e.id === id);
  if (idx === -1) return events.slice();
  const out = events.slice();
  out[idx] = update(events[idx]);
  return out;
}

/**
 * 補齊缺少的欄位（舊版 normalizeEventData）：
 * - venueIds：沒有時改用舊欄位 venueId，再沒有就用 fallbackVenueId（舊版為第一個場地，預設 'A'）
 * - checkInOffsetMin：不是數字時為 10
 * - linkPrev 轉成布林；referees、equipment、attachments 不是陣列時為 []
 * - laneNote 預設 ''；actualStartMin、actualEndMin 為假值時為 null
 * - 舊版不處理、但型別必填的欄位（dateId、startMin、endMin、title、color）缺少時補預設值
 */
export function normalizeEvent(
  raw: Partial<ScheduleEvent> & { id: string },
  fallbackVenueId: string = FALLBACK_VENUE,
): ScheduleEvent {
  const legacyVenueId = typeof raw.venueId === 'string' && raw.venueId ? raw.venueId : null;
  const startMin = typeof raw.startMin === 'number' ? raw.startMin : DAY_START_MIN;
  return {
    ...raw,
    dateId: raw.dateId ?? '',
    startMin,
    endMin: typeof raw.endMin === 'number' ? raw.endMin : Math.min(DAY_END_MIN, startMin + 40),
    title: raw.title ?? '',
    color: raw.color ?? 'blue',
    venueIds: raw.venueIds || (legacyVenueId ? [legacyVenueId] : [fallbackVenueId || FALLBACK_VENUE]),
    checkInOffsetMin: typeof raw.checkInOffsetMin === 'number' ? raw.checkInOffsetMin : 10,
    linkPrev: Boolean(raw.linkPrev),
    referees: Array.isArray(raw.referees) ? raw.referees : [],
    equipment: Array.isArray(raw.equipment) ? raw.equipment : [],
    attachments: Array.isArray(raw.attachments) ? raw.attachments : [],
    laneNote: raw.laneNote || '',
    actualStartMin: raw.actualStartMin || null,
    actualEndMin: raw.actualEndMin || null,
  };
}

/**
 * 補齊比賽日欄位（舊版 init() 中的日期正規化）：
 * - commandDeckEnabled：不是布林時，有司令台時段就啟用（舊版在沒有 commandSlots 時會得到 undefined，這裡改成 false）
 * - generalStaff 預設三個空字串；commandSlots 預設 []；label 缺少時為 ''
 */
export function normalizeDay(raw: Partial<Day> & { id: string }): Day {
  return {
    ...raw,
    label: raw.label ?? '',
    commandDeckEnabled:
      typeof raw.commandDeckEnabled === 'boolean'
        ? raw.commandDeckEnabled
        : Boolean(raw.commandSlots && raw.commandSlots.length > 0),
    generalStaff: raw.generalStaff || { hosts: '', recorders: '', stageControl: '' },
    commandSlots: raw.commandSlots || [],
  };
}

/** 主要場地（舊版以 venueIds[0] 作為磁吸判斷依據；沒有 venueIds 時視為 'A'，空陣列時為 ''） */
export function primaryVenue(ev: ScheduleEvent): string {
  return (ev.venueIds || [FALLBACK_VENUE])[0] ?? '';
}

/** 某日的賽程，依開始時間排序（穩定排序：同時間者維持原陣列順序） */
export function eventsOfDay(events: ScheduleEvent[], dayId: string): ScheduleEvent[] {
  return events.filter((e) => e.dateId === dayId).sort((a, b) => a.startMin - b.startMin);
}

/** 檢錄開始時間 = startMin - checkInOffsetMin（不早於 DAY_START_MIN）；沒有檢錄時等於 startMin */
export function checkInStart(ev: ScheduleEvent): number {
  return Math.max(DAY_START_MIN, ev.startMin - (ev.checkInOffsetMin || 0));
}

/**
 * 檢錄時段是否與同日、共用任一場地的其他賽程重疊（舊版 checkIfCheckInOverlaps）。
 * 檢錄時段為 [checkInStart, startMin)；其他賽程 [startMin, endMin) 與它有交集即算重疊。
 * 沒有檢錄時段（offset 為 0 或已被 07:00 截掉）時一律 false。
 */
export function checkInOverlaps(events: ScheduleEvent[], ev: ScheduleEvent): boolean {
  const ciStart = checkInStart(ev);
  if (ciStart >= ev.startMin) return false;
  const myVenues = ev.venueIds || [FALLBACK_VENUE];
  return events.some((other) => {
    if (other.id === ev.id || other.dateId !== ev.dateId) return false;
    const otherVenues = other.venueIds || [FALLBACK_VENUE];
    if (!myVenues.some((v) => otherVenues.includes(v))) return false;
    return other.endMin > ciStart && other.startMin < ev.startMin;
  });
}

/**
 * 雙向連鎖磁吸（舊版 applyMagneticChain）：
 * 某賽程結束時間由 oldEndMin 改為 newEndMin 時，同日、同主要場地、linkPrev=true 的後續賽程跟著平移。
 *
 * 規則（與舊版相同）：
 * 1. 同日、主要場地（venueIds[0]）相同的其他賽程依開始時間排序後逐一檢查。
 * 2. 若 linkPrev=true 且開始時間 ≥ 前一項舊結束時間 - 10：保留與前一項的間隔（gap）與長度，
 *    新開始 = max(07:00, 前一項新結束 + gap)，新結束 = min(17:00, 新開始 + 長度)，並成為下一輪的「前一項」。
 * 3. 否則若開始時間 ≥ 前一項舊結束時間：連鎖中斷。
 * 4. 其他情況（開始時間在前一項結束前、未連動）略過，繼續檢查下一個。
 *
 * 與舊版唯一差異：舊版平移後開始時間可能超過 17:00（結束早於開始），這裡把開始時間也限制在 17:00 以內。
 */
export function applyMagneticChain(
  events: ScheduleEvent[],
  anchorId: string,
  oldEndMin: number,
  newEndMin: number,
): ScheduleEvent[] {
  const delta = newEndMin - oldEndMin;
  if (delta === 0) return events.slice();
  const anchor = events.find((e) => e.id === anchorId);
  if (!anchor) return events.slice();

  const venue = primaryVenue(anchor);
  const sameVenue = events
    .filter((e) => e.dateId === anchor.dateId && e.id !== anchor.id && primaryVenue(e) === venue)
    .sort((a, b) => a.startMin - b.startMin);

  const updates = new Map<ScheduleEvent, { startMin: number; endMin: number }>();
  let prevOldEnd = oldEndMin;
  let prevNewEnd = newEndMin;

  for (const next of sameVenue) {
    if (next.linkPrev && next.startMin >= prevOldEnd - 10) {
      const gap = next.startMin - prevOldEnd;
      const duration = next.endMin - next.startMin;
      const startMin = Math.min(DAY_END_MIN, Math.max(DAY_START_MIN, prevNewEnd + gap));
      const endMin = Math.min(DAY_END_MIN, startMin + duration);
      updates.set(next, { startMin, endMin });
      prevOldEnd = next.endMin;
      prevNewEnd = endMin;
    } else if (next.startMin >= prevOldEnd) {
      break;
    }
  }

  return events.map((e) => {
    const u = updates.get(e);
    return u ? { ...e, ...u } : e;
  });
}

/**
 * 設定開始／結束時間，並以「舊結束 → 新結束」套用磁吸連動。
 * 合併舊版 updateEventStartTime、updateEventEndTime 與邊緣拉伸 startResizeEvent：
 * - 開始時間夾在 07:00 ~ 16:50（17:00 - 一格）
 * - 結束時間夾在當日範圍內，且至少比開始晚一格（10 分鐘）
 * - 只改開始時間（結束不變）時不會觸發磁吸，與舊版拉伸上緣相同
 */
export function setEventTime(
  events: ScheduleEvent[],
  id: string,
  startMin: number,
  endMin: number,
): ScheduleEvent[] {
  const ev = events.find((e) => e.id === id);
  if (!ev) return events.slice();
  const s = Math.min(clampToDay(startMin), DAY_END_MIN - STEP_MINUTES);
  const e = Math.max(s + STEP_MINUTES, clampToDay(endMin));
  const prevEnd = ev.endMin;
  const updated = replaceFirst(events, id, (x) => ({ ...x, startMin: s, endMin: e }));
  return applyMagneticChain(updated, id, prevEnd, e);
}

/**
 * 移動賽程（保留長度；舊版 moveEventTo），並以「舊結束 → 新結束」套用磁吸連動。
 * - 新開始時間夾在當日範圍內，新結束 = min(17:00, 新開始 + 原長度)
 * - 指定 venueId 且提供 venueOrder（畫面上場地的順序）時，與舊版相同：
 *   從 venueId 起往右取「原本跨幾個場地」個連續場地（超出最右邊就截掉）；venueId 不在清單中則場地不變
 * - 指定 venueId 但沒有 venueOrder 時：把主要場地換成 venueId，其餘場地保留（移除重複）
 */
export function moveEvent(
  events: ScheduleEvent[],
  id: string,
  startMin: number,
  venueId?: string,
  venueOrder?: string[],
): ScheduleEvent[] {
  const ev = events.find((e) => e.id === id);
  if (!ev) return events.slice();
  const prevEnd = ev.endMin;
  const duration = ev.endMin - ev.startMin;

  let venueIds = ev.venueIds;
  if (venueId !== undefined) {
    if (venueOrder) {
      const spanCount = (ev.venueIds || [venueId]).length;
      const startIdx = venueOrder.indexOf(venueId);
      if (startIdx !== -1) {
        const endIdx = Math.min(venueOrder.length - 1, startIdx + spanCount - 1);
        venueIds = venueOrder.slice(startIdx, endIdx + 1);
      }
    } else {
      venueIds = [venueId, ...(ev.venueIds || []).slice(1).filter((v) => v !== venueId)];
    }
  }

  const s = clampToDay(startMin);
  const e = Math.min(DAY_END_MIN, s + duration);
  const updated = replaceFirst(events, id, (x) => ({ ...x, venueIds, startMin: s, endMin: e }));
  return applyMagneticChain(updated, id, prevEnd, e);
}

/**
 * 現場延後（舊版 cascadeDelaySubsequentEvents，加上延後分鐘數）：
 * 1. 該賽程先延後 deltaMin（開始夾在當日範圍內、保留長度、結束不超過 17:00）；deltaMin = 0 時即為舊版按鈕行為。
 * 2. 同日、同主要場地的其他賽程依開始時間排序，游標 cursorEnd 從該賽程（延後後）的結束時間開始：
 *    - 開始時間 ≥ 該賽程開始 - 30 且早於 cursorEnd：接在 cursorEnd 之後（保留長度、結束不超過 17:00），游標移到它的結束
 *    - 開始時間 ≥ cursorEnd（有空檔）：不移動，游標移到它的結束
 *    - 其他（比該賽程開始早 30 分鐘以上）：不處理
 * 因此後續賽程只會被「推」到不重疊為止，原有空檔會吸收延誤，不是全部等量平移。
 * 本函式不套用磁吸連動（與舊版相同）。
 */
export function delaySubsequent(events: ScheduleEvent[], id: string, deltaMin: number): ScheduleEvent[] {
  const orig = events.find((e) => e.id === id);
  if (!orig) return events.slice();

  let anchor = orig;
  let base = events;
  if (deltaMin !== 0) {
    const duration = orig.endMin - orig.startMin;
    const s = clampToDay(orig.startMin + deltaMin);
    anchor = { ...orig, startMin: s, endMin: Math.min(DAY_END_MIN, s + duration) };
    base = events.map((e) => (e === orig ? anchor : e));
  }

  const venue = primaryVenue(anchor);
  const sameVenue = base
    .filter((e) => e.dateId === anchor.dateId && e.id !== anchor.id && primaryVenue(e) === venue)
    .sort((a, b) => a.startMin - b.startMin);

  const updates = new Map<ScheduleEvent, { startMin: number; endMin: number }>();
  let cursorEnd = anchor.endMin;
  for (const next of sameVenue) {
    if (next.startMin >= anchor.startMin - 30 && next.startMin < cursorEnd) {
      const duration = next.endMin - next.startMin;
      const startMin = cursorEnd;
      const endMin = Math.min(DAY_END_MIN, startMin + duration);
      updates.set(next, { startMin, endMin });
      cursorEnd = endMin;
    } else if (next.startMin >= cursorEnd) {
      cursorEnd = next.endMin;
    }
  }

  return base.map((e) => {
    const u = updates.get(e);
    return u ? { ...e, ...u } : e;
  });
}

/**
 * 記錄實際開賽（舊版 triggerLiveActualStart）：
 * actualStartMin = nowMin，清除 actualEndMin；排定時間對齊到 nowMin 最近的 10 分鐘
 * （夾在 07:00 ~ 16:40），保留長度，並套用磁吸連動。
 */
export function markActualStart(events: ScheduleEvent[], id: string, nowMin: number): ScheduleEvent[] {
  const ev = events.find((e) => e.id === id);
  if (!ev) return events.slice();
  const snapped = Math.max(DAY_START_MIN, Math.min(DAY_END_MIN - 20, Math.round(nowMin / 10) * 10));
  const duration = ev.endMin - ev.startMin;
  const prevEnd = ev.endMin;
  const endMin = Math.min(DAY_END_MIN, snapped + duration);
  const updated = replaceFirst(events, id, (x) => ({
    ...x,
    actualStartMin: nowMin,
    startMin: snapped,
    endMin,
    actualEndMin: null,
  }));
  return applyMagneticChain(updated, id, prevEnd, endMin);
}

/**
 * 記錄實際結束（舊版 triggerLiveActualEnd）：
 * actualEndMin = nowMin；排定結束改為 nowMin 最近的 10 分鐘（不超過 17:00、至少開始 + 10），
 * 並套用磁吸連動（後續連動賽程往前接上或往後順延）。
 */
export function markActualEnd(events: ScheduleEvent[], id: string, nowMin: number): ScheduleEvent[] {
  const ev = events.find((e) => e.id === id);
  if (!ev) return events.slice();
  const snappedEnd = Math.max(ev.startMin + 10, Math.min(DAY_END_MIN, Math.round(nowMin / 10) * 10));
  const prevEnd = ev.endMin;
  const updated = replaceFirst(events, id, (x) => ({ ...x, actualEndMin: nowMin, endMin: snappedEnd }));
  return applyMagneticChain(updated, id, prevEnd, snappedEnd);
}

/** 清除現場實測紀錄（舊版 resetLiveActualRecords）：actualStartMin、actualEndMin 設為 null，排定時間不變 */
export function resetActual(events: ScheduleEvent[], id: string): ScheduleEvent[] {
  return replaceFirst(events, id, (x) => ({ ...x, actualStartMin: null, actualEndMin: null }));
}

/**
 * 建立新賽程（舊版 createNewEventAt 的預設值）：
 * 長度 40 分鐘（不超過 17:00）、檢錄 10 分鐘、不連動、藍色、一列空白「裁判長」。
 * init 的欄位會覆蓋預設值；開始時間夾在當日範圍內。id 省略時自動產生。
 */
export function createEvent(
  init: Partial<ScheduleEvent> & { dateId: string; venueIds: string[]; startMin: number },
  id?: string,
): ScheduleEvent {
  const startMin = clampToDay(init.startMin);
  return {
    checkInOffsetMin: 10,
    linkPrev: false,
    title: '新比賽項目（點擊右側修改名稱）',
    color: 'blue',
    referees: [{ role: '裁判長', name: '' }],
    volunteerCount: 0,
    volunteerTask: '',
    studentCount: 0,
    studentTask: '',
    equipment: [],
    laneNote: '',
    attachments: [],
    actualStartMin: null,
    actualEndMin: null,
    ...init,
    id: id ?? init.id ?? newId('ev'),
    venueIds: init.venueIds.slice(),
    startMin,
    endMin: init.endMin ?? Math.min(DAY_END_MIN, startMin + 40),
  };
}

/**
 * 複製賽程（舊版 duplicateEvent）：深層複製，標題加「 (複製)」，
 * 開始 = min(17:00 - 長度, 原結束)、結束 = min(17:00, 開始 + 長度)，清除實際時間，附加在陣列最後。
 * 找不到 id 時回傳原內容的複本。
 */
export function duplicateEvent(events: ScheduleEvent[], id: string, newEventId?: string): ScheduleEvent[] {
  const orig = events.find((e) => e.id === id);
  if (!orig) return events.slice();
  const dur = orig.endMin - orig.startMin;
  const copy: ScheduleEvent = structuredClone(orig);
  copy.id = newEventId ?? newId('ev');
  copy.title = `${orig.title} (複製)`;
  copy.startMin = Math.min(DAY_END_MIN - dur, orig.endMin);
  copy.endMin = Math.min(DAY_END_MIN, copy.startMin + dur);
  copy.actualStartMin = null;
  copy.actualEndMin = null;
  return [...events, copy];
}

/**
 * 賽程狀態（新功能，手機首頁用），依序判斷：
 * 1. done：有 actualEndMin（已記錄實際結束）
 * 2. live：有 actualStartMin（已按開賽、尚未結束；不論現在時間）
 * 3. live：startMin ≤ nowMin < endMin（與舊版畫面「進行中」相同）
 * 4. done：nowMin ≥ endMin（排定時間已過）
 * 5. checkin：checkInStart ≤ nowMin < startMin（檢錄中；沒有檢錄時段時不會出現）
 * 6. upcoming：其他（尚未開始）
 */
export function eventStatus(ev: ScheduleEvent, nowMin: number): EventStatus {
  if (hasActual(ev.actualEndMin)) return 'done';
  if (hasActual(ev.actualStartMin)) return 'live';
  if (nowMin >= ev.startMin && nowMin < ev.endMin) return 'live';
  if (nowMin >= ev.endMin) return 'done';
  if (nowMin >= checkInStart(ev)) return 'checkin';
  return 'upcoming';
}

/**
 * 手機首頁：某日進行中的賽程與下一個賽程。
 * - live：狀態為 live 的賽程（見 eventStatus），依開始時間排序
 * - next：狀態為 upcoming 或 checkin（尚未開始）的賽程中，開始時間最早的「全部」賽程（同時開始的都列出）；
 *   檢錄時間可用 checkInStart(ev) 取得
 */
export function liveAndNext(
  events: ScheduleEvent[],
  dayId: string,
  nowMin: number,
): { live: ScheduleEvent[]; next: ScheduleEvent[] } {
  const day = eventsOfDay(events, dayId);
  const live = day.filter((e) => eventStatus(e, nowMin) === 'live');
  const pending = day.filter((e) => {
    const s = eventStatus(e, nowMin);
    return s === 'upcoming' || s === 'checkin';
  });
  if (pending.length === 0) return { live, next: [] };
  const earliest = Math.min(...pending.map((e) => e.startMin));
  return { live, next: pending.filter((e) => e.startMin === earliest) };
}

/**
 * 賽程是否屬於某年級（舊版 doesEventMatchActiveFilter 的導師分支）：
 * 標題 + 道次備註含該年級任一關鍵字；或（非「全校」時）含「預演」「閉幕」也算。
 * 不認得的年級 id 一律 true。
 */
function matchesGrade(ev: ScheduleEvent, gradeId: string): boolean {
  const g = GRADE_BLOCKS.find((x) => x.id === gradeId);
  if (!g) return true;
  const text = `${ev.title || ''} ${ev.laneNote || ''}`;
  if ((g.keywords as readonly string[]).some((kw) => text.includes(kw))) return true;
  return gradeId !== '全校' && (text.includes('預演') || text.includes('閉幕'));
}

/** 依標題與道次備註關鍵字判斷所屬年級（舊版 GRADE_BLOCKS；含「預演」「閉幕」的賽程屬於所有年級） */
export function eventGrades(ev: ScheduleEvent): GradeId[] {
  return GRADE_BLOCKS.filter((g) => matchesGrade(ev, g.id)).map((g) => g.id);
}

/**
 * 篩選（舊版 doesEventMatchActiveFilter），各條件同時成立才算符合，未設定的條件略過：
 * - grade：見 eventGrades 的規則（舊版只在導師視角使用）
 * - venueId：賽程的任一場地為 venueId（新條件）
 * - query：去頭尾空白、不分大小寫，比對裁判姓名、裁判職稱、標題（舊版工作人員視角）
 */
export function matchesFilter(
  ev: ScheduleEvent,
  filter: { grade?: GradeId | null; venueId?: string | null; query?: string },
): boolean {
  if (filter.grade && !matchesGrade(ev, filter.grade)) return false;
  if (filter.venueId && !(ev.venueIds || []).includes(filter.venueId)) return false;
  const q = (filter.query || '').trim().toLowerCase();
  if (q) {
    const refMatch = (ev.referees || []).some(
      (r: Referee) => (r.name || '').toLowerCase().includes(q) || (r.role || '').toLowerCase().includes(q),
    );
    if (!refMatch && !(ev.title || '').toLowerCase().includes(q)) return false;
  }
  return true;
}

/** 把一段人員文字拆成姓名（舊版：以頓號、逗號、斜線、全形直線、空白分隔，去掉括號註記，長度 2~6） */
function splitNames(text: string, skipX: boolean): string[] {
  return text
    .split(/[、,，/｜\s]+/)
    .map((part) => part.replace(/[(（].*?[)）]/g, '').trim())
    .filter((c) => c && c.length >= 2 && c.length <= 6 && !(skipX && c.startsWith('x')));
}

/**
 * 某日所有出現過的人員姓名（工作人員篩選晶片用，舊版 renderPersonFilterBar），依出現順序、不重複：
 * - 裁判姓名（排除以 x 開頭的片段，例如「x6」）
 * - 有傳入 day 且該日啟用司令台時，加上各時段的 staff
 * 舊版畫面只顯示前 18 個，數量限制交給 UI。
 */
export function peopleOfDay(events: ScheduleEvent[], dayId: string, day?: Day): string[] {
  const people = new Set<string>();
  for (const ev of events) {
    if (ev.dateId !== dayId) continue;
    for (const r of ev.referees || []) {
      if (r.name && r.name.trim()) splitNames(r.name, true).forEach((n) => people.add(n));
    }
  }
  if (day && day.commandDeckEnabled && day.commandSlots) {
    for (const slot of day.commandSlots) {
      if (slot.staff) splitNames(slot.staff, false).forEach((n) => people.add(n));
    }
  }
  return Array.from(people);
}

/** 產生不重複的 id，例如 newId('ev') → 'ev-lk3j2h-x8' */
export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
