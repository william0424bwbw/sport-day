import { describe, expect, it } from 'vitest';
import type { ScheduleEvent } from '@shared/types';
import { clampMove, clampResizeEnd, clampResizeStart, layoutLanes, nextFreeSlot, pxToSnappedMin } from './slots';

const ev = (id: string, startMin: number, endMin: number, venueIds = ['A'], dateId = 'd1') =>
  ({ id, dateId, venueIds, startMin, endMin }) as ScheduleEvent;

describe('nextFreeSlot', () => {
  it('從現在時間向上取整，跳過已有賽程', () => {
    const events = [ev('a', 540, 600), ev('b', 610, 640)];
    expect(nextFreeSlot(events, 'd1', 'A', 535)).toBe(640);
    expect(nextFreeSlot(events, 'd1', 'A', 400)).toBe(420);
  });
  it('只看同日、同場地', () => {
    const events = [ev('a', 540, 600, ['B']), ev('b', 540, 600, ['A'], 'd2')];
    expect(nextFreeSlot(events, 'd1', 'A', 540)).toBe(540);
  });
  it('超過 17:00 時退到最後可放下的時間', () => {
    expect(nextFreeSlot([], 'd1', 'A', 1100)).toBe(980);
  });
});

describe('拖曳計算', () => {
  it('位移對齊 10 分鐘', () => {
    expect(pxToSnappedMin(41, 2)).toBe(20);
    expect(pxToSnappedMin(-9, 2)).toBe(0);
    expect(pxToSnappedMin(-11, 2)).toBe(-10);
  });
  it('移動保留長度並限制在當日', () => {
    expect(clampMove(540, 600, 30)).toBe(570);
    expect(clampMove(540, 600, -200)).toBe(420);
    expect(clampMove(540, 600, 500)).toBe(960);
  });
  it('調整長度至少 10 分鐘', () => {
    expect(clampResizeEnd(540, 600, -100)).toBe(550);
    expect(clampResizeEnd(540, 600, 1000)).toBe(1020);
    expect(clampResizeStart(540, 600, 100)).toBe(590);
    expect(clampResizeStart(540, 600, -200)).toBe(420);
  });
});

describe('layoutLanes', () => {
  it('不重疊的賽程各自一欄', () => {
    const m = layoutLanes([ev('a', 540, 600), ev('b', 600, 650)]);
    expect(m.get('a')).toEqual({ lane: 0, lanes: 1 });
    expect(m.get('b')).toEqual({ lane: 0, lanes: 1 });
  });
  it('重疊的賽程並排，空出的欄可以重複使用', () => {
    const m = layoutLanes([ev('a', 540, 600), ev('b', 550, 580), ev('c', 590, 620), ev('d', 700, 710)]);
    expect(m.get('a')).toEqual({ lane: 0, lanes: 2 });
    expect(m.get('b')).toEqual({ lane: 1, lanes: 2 });
    expect(m.get('c')).toEqual({ lane: 1, lanes: 2 });
    expect(m.get('d')).toEqual({ lane: 0, lanes: 1 });
  });
});
