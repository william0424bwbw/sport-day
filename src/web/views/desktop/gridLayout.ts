// 電腦版格狀表的尺寸與座標換算（與舊版相同：每 10 分鐘一格、每格 20px）
import { DAY_END_MIN, DAY_START_MIN, STEP_MINUTES } from '@shared/constants';
import type { ScheduleEvent, Venue } from '@shared/types';

/** 每 10 分鐘的高度（px），1 小時 = 120px */
export const SLOT_HEIGHT = 20;
/** 左側時間軸寬度（px，對應 Tailwind w-16） */
export const TIME_AXIS_WIDTH = 64;
/** 場地欄最小寬度（px） */
export const VENUE_MIN_WIDTH = 145;
/** 新增賽程的預設長度（分鐘，與 createEvent 相同） */
export const NEW_EVENT_MINUTES = 40;

/** 07:00、07:10…16:50，每一列的開始時間 */
export const SLOT_STARTS: number[] = Array.from(
  { length: (DAY_END_MIN - DAY_START_MIN) / STEP_MINUTES },
  (_, i) => DAY_START_MIN + i * STEP_MINUTES,
);

/** 整個時間軸的高度（px） */
export const GRID_HEIGHT = SLOT_STARTS.length * SLOT_HEIGHT;

/** 分鐘 → 距離時間軸頂端的 px */
export function minToY(min: number): number {
  return ((min - DAY_START_MIN) / STEP_MINUTES) * SLOT_HEIGHT;
}

/** 場地欄位的 grid-template-columns（與舊版相同） */
export function venueColumns(count: number): string {
  return `repeat(${Math.max(1, count)}, minmax(${VENUE_MIN_WIDTH}px, 1fr))`;
}

/**
 * 賽程佔用的欄位（舊版：依場地順序取最左到最右，連續橫跨）。
 * 找不到任何場地時放在第一欄。
 */
export function eventColumns(ev: ScheduleEvent, venues: Venue[]): { minCol: number; span: number } {
  const idx = (ev.venueIds || [])
    .map((vid) => venues.findIndex((v) => v.id === vid))
    .filter((i) => i !== -1)
    .sort((a, b) => a - b);
  if (idx.length === 0) return { minCol: 0, span: 1 };
  return { minCol: idx[0], span: idx[idx.length - 1] - idx[0] + 1 };
}

/** 方塊的水平位置（左右各留 5px，與舊版相同） */
export function columnStyle(minCol: number, span: number, count: number): { left: string; width: string } {
  const n = Math.max(1, count);
  const s = Math.max(1, Math.min(span, n - minCol));
  return {
    left: `calc(${(minCol / n) * 100}% + 5px)`,
    width: `calc(${(s / n) * 100}% - 10px)`,
  };
}
