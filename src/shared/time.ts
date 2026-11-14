import { DAY_END_MIN, DAY_START_MIN, STEP_MINUTES } from './constants';

/** 540 → "09:00" */
export function minToTime(totalMin: number): string {
  const m = Math.round(totalMin);
  const h = Math.floor(m / 60);
  const mm = ((m % 60) + 60) % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** "09:00" → 540；格式錯誤回傳 null */
export function timeToMin(text: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/** "09:00–10:10" */
export function formatRange(startMin: number, endMin: number): string {
  return `${minToTime(startMin)}–${minToTime(endMin)}`;
}

export function clampToDay(min: number): number {
  return Math.min(DAY_END_MIN, Math.max(DAY_START_MIN, min));
}

/** 對齊到網格（預設 10 分鐘） */
export function snapToStep(min: number, step = STEP_MINUTES): number {
  return Math.round(min / step) * step;
}

/** 時間下拉選單選項：07:00、07:10…17:00 */
export function timeOptions(step = STEP_MINUTES): { value: number; label: string }[] {
  const out: { value: number; label: string }[] = [];
  for (let m = DAY_START_MIN; m <= DAY_END_MIN; m += step) out.push({ value: m, label: minToTime(m) });
  return out;
}

/** 現在時間（分鐘，本地時區） */
export function nowMinutes(date = new Date()): number {
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}
