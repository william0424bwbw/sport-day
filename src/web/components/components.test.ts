import { describe, expect, it } from 'vitest';
import { createEvent } from '@shared/schedule';
import { countShifted, formatVersion, groupByCategory, refereeSummary, slotTypeLabel, venueNames } from './common/labels';
import { attachmentName, fileKind, fitWithin } from './event/attachmentUtils';
import { addItem, moveStartKeepDuration, toggleItem, toggleVenue, validateDraft } from './event/editorUtils';

describe('attachmentUtils', () => {
  it('fitWithin：長邊縮到 1280，不放大', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(4000, 3000)).toEqual({ width: 1280, height: 960 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 960, height: 1280 });
    expect(fitWithin(2000, 2000)).toEqual({ width: 1280, height: 1280 });
  });

  it('fileKind：依 MIME 或副檔名判斷', () => {
    expect(fileKind({ type: 'application/pdf', name: 'a' })).toBe('pdf');
    expect(fileKind({ type: '', name: '道次.PDF' })).toBe('pdf');
    expect(fileKind({ type: 'image/jpeg', name: 'a.jpg' })).toBe('image');
    expect(fileKind({ type: 'text/plain', name: 'a.txt' })).toBeNull();
  });

  it('attachmentName：相機預設檔名改成含時間的名稱', () => {
    const now = new Date(2026, 10, 14, 9, 5, 7);
    expect(attachmentName('image.jpg', now)).toBe('拍照 090507.jpg');
    expect(attachmentName('', now)).toBe('拍照 090507.jpg');
    expect(attachmentName('道次表.png', now)).toBe('道次表.png');
  });
});

describe('editorUtils', () => {
  const base = { dateId: 'd1', startMin: 540, endMin: 580, venueIds: ['A'], checkInOffsetMin: 10 };

  it('validateDraft：結束必須晚於開始', () => {
    expect(validateDraft(base)).toBeNull();
    expect(validateDraft({ ...base, endMin: 540 })).toBe('結束時間必須晚於開始時間');
    expect(validateDraft({ ...base, venueIds: [] })).toBe('請至少選擇一個場地');
    expect(validateDraft({ ...base, dateId: '' })).toBe('請選擇比賽日');
    expect(validateDraft({ ...base, checkInOffsetMin: -5 })).not.toBeNull();
  });

  it('moveStartKeepDuration：保留長度、不超過 17:00', () => {
    expect(moveStartKeepDuration(540, 580, 600)).toEqual({ startMin: 600, endMin: 640 });
    expect(moveStartKeepDuration(540, 600, 1000)).toEqual({ startMin: 1000, endMin: 1020 });
  });

  it('toggleVenue：至少保留一個，保留主要場地在第一位', () => {
    const order = ['A', 'B', 'C'];
    expect(toggleVenue(['A'], 'A', order)).toBeNull();
    expect(toggleVenue(['B'], 'A', order)).toEqual(['B', 'A']);
    expect(toggleVenue(['B', 'C'], 'A', order)).toEqual(['B', 'A', 'C']);
    expect(toggleVenue(['A', 'B'], 'B', order)).toEqual(['A']);
  });

  it('toggleItem / addItem', () => {
    expect(toggleItem(['a'], 'a')).toEqual([]);
    expect(toggleItem(['a'], 'b')).toEqual(['a', 'b']);
    expect(addItem(['a'], '  b ')).toEqual(['a', 'b']);
    expect(addItem(['a'], 'a')).toEqual(['a']);
    expect(addItem(['a'], '   ')).toEqual(['a']);
  });
});

describe('labels', () => {
  it('groupByCategory：固定分類在前、未分類最後、空的固定分類保留', () => {
    const groups = groupByCategory([
      { id: '1', category: '運動會正式賽' },
      { id: '2' },
      { id: '3', category: '其他' },
    ]);
    expect(groups.map((g) => g.category)).toEqual(['會前賽', '運動會正式賽', '其他', '未分類']);
    expect(groups[0].items).toEqual([]);
    expect(groups[3].items.map((x) => x.id)).toEqual(['2']);
  });

  it('slotTypeLabel', () => {
    expect(slotTypeLabel('host')).toBe('司儀播報');
    expect(slotTypeLabel('award')).toBe('穿插頒獎');
    expect(slotTypeLabel('record')).toBe('成績公告');
    expect(slotTypeLabel('xyz')).toBe('xyz');
  });

  it('venueNames / refereeSummary', () => {
    const ev = createEvent(
      { dateId: 'd', venueIds: ['A', 'Z'], startMin: 540, referees: [{ role: '裁判長', name: '王' }, { role: '發令', name: '' }] },
      'e1',
    );
    expect(venueNames(ev, [{ id: 'A', name: '跑道' }])).toEqual(['跑道', 'Z']);
    expect(refereeSummary(ev)).toBe('裁判長 王');
  });

  it('countShifted：只算時間有變的其他賽程', () => {
    const a = createEvent({ dateId: 'd', venueIds: ['A'], startMin: 540 }, 'a');
    const b = createEvent({ dateId: 'd', venueIds: ['A'], startMin: 580 }, 'b');
    const c = createEvent({ dateId: 'd', venueIds: ['A'], startMin: 700 }, 'c');
    const after = [{ ...a, startMin: 550 }, { ...b, startMin: 590, endMin: 630 }, c];
    expect(countShifted([a, b, c], after, 'a')).toBe(1);
  });

  it('formatVersion', () => {
    expect(formatVersion(null)).toBe('—');
    expect(formatVersion(12)).toBe('12');
    expect(formatVersion(new Date(2026, 10, 14, 9, 5, 7).getTime())).toBe('11/14 09:05:07');
  });
});
