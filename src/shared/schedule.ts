// 排程商業邏輯（純函式，前端與 Worker 共用）
// 由舊版 legacy/index.html 抽出；行為必須與舊版一致（見 schedule.test.ts 的行為對照測試）。
// 所有函式都不修改傳入的陣列或物件，回傳新的資料。

import type { GradeId } from './constants';
import type { Day, EventStatus, ScheduleEvent } from './types';

const TODO = (name: string): never => {
  throw new Error(`schedule.${name} 尚未實作`);
};

/** 補齊缺少的欄位（舊版 normalizeEventData）：venueIds、checkInOffsetMin=10、陣列、actual* = null… */
export function normalizeEvent(_raw: Partial<ScheduleEvent> & { id: string }): ScheduleEvent {
  return TODO('normalizeEvent');
}

/** 補齊比賽日欄位：commandDeckEnabled、generalStaff、commandSlots */
export function normalizeDay(_raw: Partial<Day> & { id: string }): Day {
  return TODO('normalizeDay');
}

/** 主要場地（舊版以 venueIds[0] 作為磁吸判斷依據） */
export function primaryVenue(_ev: ScheduleEvent): string {
  return TODO('primaryVenue');
}

/** 某日的賽程，依開始時間排序 */
export function eventsOfDay(_events: ScheduleEvent[], _dayId: string): ScheduleEvent[] {
  return TODO('eventsOfDay');
}

/** 檢錄開始時間 = startMin - checkInOffsetMin（不早於 DAY_START_MIN） */
export function checkInStart(_ev: ScheduleEvent): number {
  return TODO('checkInStart');
}

/** 檢錄時段是否與同場地、同日的其他賽程重疊（舊版 checkIfCheckInOverlaps） */
export function checkInOverlaps(_events: ScheduleEvent[], _ev: ScheduleEvent): boolean {
  return TODO('checkInOverlaps');
}

/**
 * 雙向連鎖磁吸（舊版 applyMagneticChain）：
 * 某賽程結束時間由 oldEndMin 改為 newEndMin 時，同日、同主要場地、linkPrev=true 的後續賽程跟著平移。
 */
export function applyMagneticChain(
  _events: ScheduleEvent[],
  _anchorId: string,
  _oldEndMin: number,
  _newEndMin: number,
): ScheduleEvent[] {
  return TODO('applyMagneticChain');
}

/** 設定開始／結束時間（夾在當日範圍內），並套用磁吸連動 */
export function setEventTime(
  _events: ScheduleEvent[],
  _id: string,
  _startMin: number,
  _endMin: number,
): ScheduleEvent[] {
  return TODO('setEventTime');
}

/** 移動賽程（保留長度）；可同時改主要場地（舊版 moveEventTo） */
export function moveEvent(
  _events: ScheduleEvent[],
  _id: string,
  _startMin: number,
  _venueId?: string,
): ScheduleEvent[] {
  return TODO('moveEvent');
}

/** 現場延後：該賽程及同場地之後的賽程整體延後 deltaMin（舊版 cascadeDelaySubsequentEvents） */
export function delaySubsequent(_events: ScheduleEvent[], _id: string, _deltaMin: number): ScheduleEvent[] {
  return TODO('delaySubsequent');
}

/** 建立新賽程（舊版 createNewEventAt 的預設值） */
export function createEvent(
  _init: Partial<ScheduleEvent> & { dateId: string; venueIds: string[]; startMin: number },
  _id?: string,
): ScheduleEvent {
  return TODO('createEvent');
}

/** 複製賽程（舊版 duplicateEvent：標題加「(複製)」、接在原賽程之後、清除實際時間） */
export function duplicateEvent(_events: ScheduleEvent[], _id: string, _newId?: string): ScheduleEvent[] {
  return TODO('duplicateEvent');
}

/** 狀態：upcoming（未開始）、checkin（檢錄中）、live（進行中）、done（已結束，含 actualEndMin） */
export function eventStatus(_ev: ScheduleEvent, _nowMin: number): EventStatus {
  return TODO('eventStatus');
}

/** 手機首頁：進行中的賽程、下一個賽程與其檢錄時間 */
export function liveAndNext(
  _events: ScheduleEvent[],
  _dayId: string,
  _nowMin: number,
): { live: ScheduleEvent[]; next: ScheduleEvent[] } {
  return TODO('liveAndNext');
}

/** 依標題關鍵字判斷所屬年級（舊版 GRADE_BLOCKS） */
export function eventGrades(_ev: ScheduleEvent): GradeId[] {
  return TODO('eventGrades');
}

/** 篩選：年級、場地、人員姓名／職稱／標題關鍵字（舊版 doesEventMatchActiveFilter） */
export function matchesFilter(
  _ev: ScheduleEvent,
  _filter: { grade?: GradeId | null; venueId?: string | null; query?: string },
): boolean {
  return TODO('matchesFilter');
}

/** 某日所有出現過的人員姓名（工作人員篩選晶片用，舊版 renderPersonFilterBar） */
export function peopleOfDay(_events: ScheduleEvent[], _dayId: string): string[] {
  return TODO('peopleOfDay');
}

/** 產生不重複的 id，例如 newId('ev') → 'ev-lk3j2h-x8' */
export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
