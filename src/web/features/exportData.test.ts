import { describe, expect, it } from 'vitest';
import { normalizeDay, normalizeEvent } from '@shared/schedule';
import type { ProjectData } from '@shared/types';
import {
  CSV_HEADER,
  checkInText,
  dateStamp,
  helperText,
  parseBackupJson,
  rundownDays,
  rundownRows,
  rundownSlots,
  summarize,
  toBackupJson,
  toCsv,
} from './exportData';

const data: ProjectData = {
  venues: [
    { id: 'A', name: 'A 跑道區' },
    { id: 'B', name: 'B 沙坑' },
  ],
  dates: [
    normalizeDay({
      id: 'd1',
      label: '12/14 會前賽',
      category: '會前賽',
      generalStaff: { hosts: '王老師', recorders: '李老師', stageControl: '' },
      commandDeckEnabled: true,
      commandSlots: [
        { id: 's2', type: 'award', startMin: 600, endMin: 620, staff: '校長' },
        { id: 's1', type: 'host', startMin: 540, endMin: 600 },
      ],
    }),
    normalizeDay({ id: 'd2', label: '12/19 正式賽', category: '運動會正式賽' }),
  ],
  events: [
    normalizeEvent({
      id: 'e2',
      dateId: 'd1',
      venueIds: ['A', 'B'],
      startMin: 600,
      endMin: 640,
      checkInOffsetMin: 0,
      title: '=SUM(A1) 跳遠 "決賽"',
      referees: [{ role: '裁判長', name: '陳老師' }, { role: '', name: '' }, { role: '丈量' }],
      studentCount: 4,
      studentTask: '耙沙',
      equipment: ['捲尺', '耙子'],
      laneNote: '第1道紅',
    }),
    normalizeEvent({ id: 'e1', dateId: 'd1', venueIds: ['A'], startMin: 540, endMin: 580, checkInOffsetMin: 20, title: '60M' }),
    normalizeEvent({ id: 'e3', dateId: 'd2', venueIds: ['Z'], startMin: 425, endMin: 450, checkInOffsetMin: 30, title: '早場' }),
  ],
};

describe('rundownDays', () => {
  it('當日：目前比賽日；找不到時用第一天；全部：依原本順序', () => {
    expect(rundownDays(data.dates, 'current', 'd2').map((d) => d.id)).toEqual(['d2']);
    expect(rundownDays(data.dates, 'current', 'nope').map((d) => d.id)).toEqual(['d1']);
    expect(rundownDays(data.dates, 'current', null).map((d) => d.id)).toEqual(['d1']);
    expect(rundownDays(data.dates, 'all', 'd2').map((d) => d.id)).toEqual(['d1', 'd2']);
    expect(rundownDays([], 'current', null)).toEqual([]);
  });
});

describe('細流表欄位', () => {
  it('檢錄時間：沒有提早時為 null，不早於 07:00', () => {
    expect(checkInText(data.events[1])).toBe('08:40');
    expect(checkInText(data.events[0])).toBeNull();
    expect(checkInText(data.events[2])).toBe('07:00');
  });

  it('公差／志工：人數為 0 或未填時不顯示', () => {
    expect(helperText('學生', 4, '耙沙')).toBe('學生 ×4（耙沙）');
    expect(helperText('志工', 2, '')).toBe('志工 ×2');
    expect(helperText('志工', 0, '拉線')).toBeNull();
    expect(helperText('志工', undefined, undefined)).toBeNull();
  });

  it('司令台時段：啟用時依時間排序，停用時不顯示', () => {
    expect(rundownSlots(data.dates[0]).map((s) => s.id)).toEqual(['s1', 's2']);
    expect(rundownSlots({ ...data.dates[0], commandDeckEnabled: false })).toEqual([]);
  });
});

describe('rundownRows / toCsv', () => {
  it('每個賽程一列，依時間排序，欄位與舊版相同', () => {
    const rows = rundownRows(data, rundownDays(data.dates, 'all', null));
    expect(rows[0]).toEqual(CSV_HEADER);
    expect(rows).toHaveLength(4);
    expect(rows[1]).toEqual(['會前賽', '12/14 會前賽', '王老師', '李老師', '', '08:40', '09:00–09:40', 'A 跑道區', '60M', '', '', '', '', '']);
    expect(rows[2].slice(5)).toEqual([
      '無',
      '10:00–10:40',
      'A 跑道區/B 沙坑',
      '=SUM(A1) 跳遠 "決賽"',
      '裁判長:陳老師；丈量:',
      '學生 ×4（耙沙）',
      '',
      '捲尺、耙子',
      '第1道紅',
    ]);
    // 找不到的場地顯示 id
    expect(rows[3][7]).toBe('Z');
  });

  it('CSV：開頭有 BOM、引號跳脫、CRLF、公式開頭加單引號', () => {
    const csv = toCsv([
      ['a', 'b "c"'],
      ['=1+1', '-5'],
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe('"a","b ""c"""\r\n"\'=1+1","\'-5"');
  });
});

describe('JSON 備份', () => {
  it('匯出後再匯入，資料不變', () => {
    const result = parseBackupJson(toBackupJson(data));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.events.map((e) => e.id)).toEqual(['e2', 'e1', 'e3']);
      expect(result.data.dates[0].generalStaff?.hosts).toBe('王老師');
      expect(summarize(result.data)).toBe('2 個場地、2 個比賽日、3 筆賽程');
    }
  });

  it('接受開頭有 BOM 的檔案（Windows 記事本存檔）', () => {
    expect(parseBackupJson(String.fromCharCode(0xfeff) + toBackupJson(data)).ok).toBe(true);
  });

  it('格式錯誤時回傳中文錯誤訊息', () => {
    const err = (text: string) => {
      const r = parseBackupJson(text);
      return r.ok ? null : r.error;
    };
    expect(err('{')).toBe('不是有效的 JSON 檔案');
    expect(err('[]')).toBe('檔案內容不是運動會排程備份');
    expect(err('{"venues":[]}')).toContain('dates');
    expect(err('{"dates":[],"events":[{"id":"x"},{"id":"x"}]}')).toContain('id 重複');
    expect(err('{"dates":[],"events":[{"title":"沒有 id"}]}')).toContain('events.0.id');
  });

  it('dateStamp：本地日期', () => {
    expect(dateStamp(new Date(2026, 11, 4, 23, 59))).toBe('2026-12-04');
  });
});
