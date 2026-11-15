// 手機版時間計算（純函式，方便測試）
import { DAY_END_MIN, DAY_START_MIN, STEP_MINUTES } from '@shared/constants';
import type { ScheduleEvent } from '@shared/types';

/** 新增賽程的預設長度（分鐘），與 createEvent 預設相同 */
export const NEW_EVENT_DURATION = 40;

/**
 * 找某日、某場地「下一個空檔」的開始時間（10 分鐘一格）：
 * 從 fromMin（向上取整到 10 分鐘，限制在 07:00–17:00）開始，找第一個能放下 duration 分鐘且不與該場地賽程重疊的時間。
 * 找不到時回傳 fromMin 對齊後的時間（仍可新增，只是會重疊）。
 */
export function nextFreeSlot(
  events: ScheduleEvent[],
  dayId: string,
  venueId: string | null,
  fromMin: number,
  duration = NEW_EVENT_DURATION,
): number {
  const latest = DAY_END_MIN - Math.min(duration, DAY_END_MIN - DAY_START_MIN);
  const base = Math.min(latest, Math.max(DAY_START_MIN, Math.ceil(fromMin / STEP_MINUTES) * STEP_MINUTES));
  const busy = events.filter((e) => e.dateId === dayId && (!venueId || (e.venueIds || []).includes(venueId)));
  for (let t = base; t <= latest; t += STEP_MINUTES) {
    const end = t + duration;
    if (!busy.some((e) => e.startMin < end && e.endMin > t)) return t;
  }
  return base;
}

/** 把畫面上的位移（px）換成分鐘，並對齊 10 分鐘 */
export function pxToSnappedMin(px: number, pxPerMin: number): number {
  // 加 0 把 -0 轉成 0
  return Math.round(px / pxPerMin / STEP_MINUTES) * STEP_MINUTES + 0;
}

/** 拖曳移動後的新開始時間：保留長度，限制在當日範圍內 */
export function clampMove(startMin: number, endMin: number, deltaMin: number): number {
  const duration = endMin - startMin;
  return Math.min(DAY_END_MIN - duration, Math.max(DAY_START_MIN, startMin + deltaMin));
}

/** 拖曳下緣後的新結束時間：至少 10 分鐘，不超過 17:00 */
export function clampResizeEnd(startMin: number, endMin: number, deltaMin: number): number {
  return Math.min(DAY_END_MIN, Math.max(startMin + STEP_MINUTES, endMin + deltaMin));
}

/** 拖曳上緣後的新開始時間：至少 10 分鐘，不早於 07:00 */
export function clampResizeStart(startMin: number, endMin: number, deltaMin: number): number {
  return Math.max(DAY_START_MIN, Math.min(endMin - STEP_MINUTES, startMin + deltaMin));
}

/**
 * 同一場地時間重疊的賽程並排顯示：依開始時間分到最左邊可用的欄，
 * 互相重疊的一群賽程共用相同欄數。回傳每個賽程的欄位（lane）與該群的欄數（lanes）。
 */
export function layoutLanes(
  events: Pick<ScheduleEvent, 'id' | 'startMin' | 'endMin'>[],
): Map<string, { lane: number; lanes: number }> {
  const sorted = [...events].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const out = new Map<string, { lane: number; lanes: number }>();
  let cluster: { id: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    for (const c of cluster) out.set(c.id, { lane: c.lane, lanes: laneEnds.length });
    cluster = [];
    laneEnds = [];
  };
  for (const ev of sorted) {
    if (ev.startMin >= clusterEnd) {
      flush();
      clusterEnd = -Infinity;
    }
    let lane = laneEnds.findIndex((end) => end <= ev.startMin);
    if (lane === -1) lane = laneEnds.push(ev.endMin) - 1;
    else laneEnds[lane] = ev.endMin;
    cluster.push({ id: ev.id, lane });
    clusterEnd = Math.max(clusterEnd, ev.endMin);
  }
  flush();
  return out;
}
