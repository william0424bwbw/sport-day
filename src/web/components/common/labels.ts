// 元件共用的文字與小工具（純函式，可在 node 環境測試）
import { COMMAND_SLOT_TYPES } from '@shared/constants';
import type { EventStatus, ScheduleEvent, Venue } from '@shared/types';
import type { ConnectionState } from '../../stores/contracts';

export const STATUS_LABEL: Record<EventStatus, string> = {
  upcoming: '未開始',
  checkin: '檢錄中',
  live: '進行中',
  done: '已結束',
};

export const STATUS_CLASS: Record<EventStatus, string> = {
  upcoming: 'bg-slate-100 text-slate-600',
  checkin: 'bg-amber-100 text-amber-800',
  live: 'bg-emerald-600 text-white',
  done: 'bg-slate-200 text-slate-500',
};

export const CONNECTION_LABEL: Record<ConnectionState, string> = {
  connecting: '連線中',
  live: '即時同步',
  polling: '輪詢中',
  offline: '離線',
  local: '本機',
};

export const CONNECTION_DOT: Record<ConnectionState, string> = {
  connecting: 'bg-slate-400 animate-pulse',
  live: 'bg-emerald-500',
  polling: 'bg-amber-500',
  offline: 'bg-rose-500',
  local: 'bg-slate-400',
};

export const ROLE_OPTIONS = [
  { id: 'admin', label: '管理者' },
  { id: 'staff', label: '工作人員' },
  { id: 'teacher', label: '導師' },
] as const;

/** 比賽日分類（與舊版相同的兩類，另外保留資料中出現的其他分類） */
export const DAY_CATEGORIES = ['會前賽', '運動會正式賽'];
export const UNCATEGORIZED = '未分類';

/** 依分類分組（固定分類在前，其他分類依出現順序，沒有分類的放最後） */
export function groupByCategory<T extends { category?: string }>(items: T[]): { category: string; items: T[] }[] {
  const order = [...DAY_CATEGORIES];
  for (const it of items) {
    const c = it.category || UNCATEGORIZED;
    if (!order.includes(c)) order.push(c);
  }
  // 「未分類」一律放最後
  const sorted = order.filter((c) => c !== UNCATEGORIZED).concat(order.includes(UNCATEGORIZED) ? [UNCATEGORIZED] : []);
  return sorted
    .map((category) => ({ category, items: items.filter((it) => (it.category || UNCATEGORIZED) === category) }))
    .filter((g) => g.items.length > 0 || DAY_CATEGORIES.includes(g.category));
}

/** 司令台時段類型的中文名稱 */
export function slotTypeLabel(type: string): string {
  if (type === 'record') return '成績公告';
  return COMMAND_SLOT_TYPES.find((t) => t.id === type)?.label ?? type;
}

/** 賽程的場地名稱（依賽程中的順序；找不到的場地顯示 id） */
export function venueNames(ev: Pick<ScheduleEvent, 'venueIds'>, venues: Venue[]): string[] {
  return (ev.venueIds || []).map((id) => venues.find((v) => v.id === id)?.name ?? id);
}

/** 裁判摘要：「裁判長 王老師、發令 李老師」；沒有姓名的列略過 */
export function refereeSummary(ev: Pick<ScheduleEvent, 'referees'>): string {
  return (ev.referees || [])
    .filter((r) => (r.name || '').trim())
    .map((r) => `${(r.role || '').trim()} ${(r.name || '').trim()}`.trim())
    .join('、');
}

/** 延後後續賽程前後比較：被移動的賽程數（不含自己） */
export function countShifted(before: ScheduleEvent[], after: ScheduleEvent[], selfId: string): number {
  const map = new Map(before.map((e) => [e.id, e]));
  return after.filter((e) => {
    if (e.id === selfId) return false;
    const old = map.get(e.id);
    return old !== undefined && (old.startMin !== e.startMin || old.endMin !== e.endMin);
  }).length;
}

/** 版本號（毫秒時間戳）轉成「11/14 09:30:12」；不是時間戳時直接顯示數字 */
export function formatVersion(v: number | null): string {
  if (v === null) return '—';
  if (v < 1e11) return String(v);
  const d = new Date(v);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
