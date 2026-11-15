// I8 輸出功能的純函式：細流表資料、CSV、JSON 匯出與匯入檢查（不碰 DOM，可在 node 環境測試）
// 舊版：legacy/index.html 的 renderRundownContent、exportRundownCsv、exportJsonData、importJsonData
import { describeIssues, projectDataSchema } from '@shared/schema';
import { checkInStart, eventsOfDay } from '@shared/schedule';
import { formatRange, minToTime } from '@shared/time';
import type { CommandSlot, Day, GeneralStaff, ProjectData, ScheduleEvent } from '@shared/types';
import { slotTypeLabel, venueNames } from '../components/common/labels';

/** 大會人員欄位（細流表上方三格） */
export const GENERAL_STAFF_FIELDS: { key: keyof GeneralStaff; label: string; placeholder: string }[] = [
  { key: 'hosts', label: '主持人／司儀播報', placeholder: '輸入主持人名單' },
  { key: 'recorders', label: '大會紀錄與成績公告', placeholder: '輸入紀錄組名單' },
  { key: 'stageControl', label: '場控／攝影志工', placeholder: '輸入場控與志工' },
];

export type RundownScope = 'current' | 'all';

/** 細流表範圍內的比賽日：當日只取目前比賽日，全部則依原本順序 */
export function rundownDays(dates: Day[], scope: RundownScope, currentDayId: string | null): Day[] {
  if (scope === 'all') return dates;
  const day = dates.find((d) => d.id === currentDayId) ?? dates[0];
  return day ? [day] : [];
}

/** 檢錄文字：有提早檢錄時回傳檢錄開始時間，否則 null */
export function checkInText(ev: ScheduleEvent): string | null {
  return (ev.checkInOffsetMin || 0) > 0 ? minToTime(checkInStart(ev)) : null;
}

/** 有填職務或姓名的裁判列 */
export function validReferees(ev: ScheduleEvent) {
  return (ev.referees || []).filter((r) => (r.role || '').trim() || (r.name || '').trim());
}

/** 公差／志工的一行文字，例如「公差學生 ×10（舉道次牌）」；人數為 0 時回傳 null */
export function helperText(label: string, count: number | undefined, task: string | undefined): string | null {
  if (!count || count <= 0) return null;
  return `${label} ×${count}${task ? `（${task}）` : ''}`;
}

/** 細流表要顯示的司令台時段：啟用中且有時段時依時間排序，否則空陣列 */
export function rundownSlots(day: Day): CommandSlot[] {
  if (!day.commandDeckEnabled) return [];
  return [...(day.commandSlots || [])].sort((a, b) => a.startMin - b.startMin);
}

/** Excel 用來辨識 UTF-8 的 BOM（寫成跳脫字元，原始碼本身不含 BOM） */
const BOM = String.fromCharCode(0xfeff);
const BOM_PREFIX = new RegExp('^' + BOM);

export const CSV_HEADER = [
  '日期分類',
  '日期名稱',
  '主持人/播報',
  '大會紀錄公告',
  '場控與志工',
  '檢錄時間',
  '正式比賽時段',
  '場地位置',
  '比賽項目名稱',
  '裁判分工明細',
  '公差學生人數與任務',
  '志工人數與任務',
  '器材清單',
  '道次與備註',
];

/** 細流表的表格列（第一列是標題），欄位與舊版 CSV 相同 */
export function rundownRows(data: ProjectData, days: Day[]): string[][] {
  const rows: string[][] = [CSV_HEADER];
  for (const d of days) {
    const gs = d.generalStaff ?? {};
    for (const ev of eventsOfDay(data.events, d.id)) {
      rows.push([
        d.category ?? '',
        d.label,
        gs.hosts ?? '',
        gs.recorders ?? '',
        gs.stageControl ?? '',
        checkInText(ev) ?? '無',
        formatRange(ev.startMin, ev.endMin).replace(/\s/g, ''),
        venueNames(ev, data.venues).join('/'),
        ev.title,
        validReferees(ev)
          .map((r) => `${(r.role || '').trim()}:${(r.name || '').trim()}`)
          .join('；'),
        helperText('學生', ev.studentCount, ev.studentTask) ?? '',
        helperText('志工', ev.volunteerCount, ev.volunteerTask) ?? '',
        (ev.equipment || []).join('、'),
        ev.laneNote ?? '',
      ]);
    }
  }
  return rows;
}

/**
 * 轉成 Excel 可直接開啟的 CSV：開頭加 BOM（中文不亂碼）、每格加引號、換行用 CRLF。
 * 以 = + - @ 開頭的格子前面加 '，避免 Excel 當成公式執行（CSV injection）。
 */
export function toCsv(rows: string[][]): string {
  const cell = (v: string) => {
    const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return BOM + rows.map((r) => r.map(cell).join(',')).join('\r\n');
}

/** 檔名用的本地日期，例如 2026-12-14 */
export function dateStamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const rundownFileName = (date?: Date) => `小學運動會賽務細流表_${dateStamp(date)}.csv`;
export const backupFileName = (date?: Date) => `運動會排程備份_${dateStamp(date)}.json`;

/** JSON 備份內容（與 API 相同的 { venues, dates, events }） */
export function toBackupJson(data: ProjectData): string {
  return JSON.stringify({ settings: data.settings ?? {}, venues: data.venues, dates: data.dates, events: data.events }, null, 2);
}

export type ImportResult = { ok: true; data: ProjectData } | { ok: false; error: string };

/** 檢查匯入的 JSON 文字：格式錯誤時回傳中文錯誤訊息，不會丟出例外 */
export function parseBackupJson(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text.replace(BOM_PREFIX, ''));
  } catch {
    return { ok: false, error: '不是有效的 JSON 檔案' };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: '檔案內容不是運動會排程備份' };
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.dates) || !Array.isArray(obj.events)) {
    return { ok: false, error: '檔案缺少比賽日（dates）或賽程（events）' };
  }
  const parsed = projectDataSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: describeIssues(parsed.error) };
  return { ok: true, data: parsed.data as unknown as ProjectData };
}

/** 匯入前的摘要，例如「7 個場地、5 個比賽日、33 筆賽程」 */
export function summarize(data: Pick<ProjectData, 'venues' | 'dates' | 'events'>): string {
  return `${data.venues.length} 個場地、${data.dates.length} 個比賽日、${data.events.length} 筆賽程`;
}

/** 司令台時段一行文字，例如「穿插頒獎 10:00–10:20 王老師：100M 頒獎」 */
export function slotLine(slot: CommandSlot): string {
  const who = [slot.staff, slot.content].filter(Boolean).join('：');
  return `${slotTypeLabel(slot.type)} ${formatRange(slot.startMin, slot.endMin)}${who ? ` ${who}` : ''}`;
}
