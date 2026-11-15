// 賽程表單的純函式（草稿檢查、場地與器材切換），可在 node 環境測試
import { DAY_END_MIN, DAY_START_MIN } from '@shared/constants';
import type { ScheduleEvent } from '@shared/types';

/** 表單草稿（新增時 id 為 'draft'，儲存時不使用草稿的 id） */
export type EventDraft = ScheduleEvent;

/** 檢查草稿；回傳第一個錯誤訊息，沒有錯誤時回傳 null */
export function validateDraft(d: Pick<EventDraft, 'startMin' | 'endMin' | 'venueIds' | 'dateId' | 'checkInOffsetMin'>): string | null {
  if (!d.dateId) return '請選擇比賽日';
  if (d.endMin <= d.startMin) return '結束時間必須晚於開始時間';
  if (d.startMin < DAY_START_MIN || d.endMin > DAY_END_MIN) return '時間必須在 07:00–17:00 之間';
  if (!d.venueIds.length) return '請至少選擇一個場地';
  if (!Number.isFinite(d.checkInOffsetMin) || d.checkInOffsetMin < 0) return '檢錄提早分鐘數不可小於 0';
  return null;
}

/** 改開始時間時保留長度（結束不超過 17:00） */
export function moveStartKeepDuration(startMin: number, endMin: number, newStart: number): { startMin: number; endMin: number } {
  const dur = Math.max(10, endMin - startMin);
  return { startMin: newStart, endMin: Math.min(DAY_END_MIN, newStart + dur) };
}

/** 切換場地；至少保留一個（回傳 null 代表不能再取消） */
export function toggleVenue(venueIds: string[], id: string, order: string[]): string[] | null {
  if (venueIds.includes(id)) {
    if (venueIds.length <= 1) return null;
    return venueIds.filter((v) => v !== id);
  }
  // 依畫面上的場地順序排列（第一個為主要場地，磁吸判斷用）——但保留原本的主要場地在第一位
  const next = [...venueIds, id];
  const primary = venueIds[0];
  const rest = next.filter((v) => v !== primary).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return primary ? [primary, ...rest] : rest;
}

/** 切換器材（有就移除、沒有就加在最後） */
export function toggleItem(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

/** 新增自訂器材（去空白、略過重複） */
export function addItem(list: string[], raw: string): string[] {
  const item = raw.trim();
  if (!item || list.includes(item)) return list;
  return [...list, item];
}
