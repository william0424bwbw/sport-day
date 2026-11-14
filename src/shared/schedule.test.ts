// schedule.ts 單元測試 + 與舊版 legacy/index.html 的行為對照（characterization）測試
import { beforeAll, describe, expect, it } from 'vitest';
import legacyHtml from '../../legacy/index.html?raw';
import { DAY_END_MIN, DAY_START_MIN, END_HOUR, GRADE_BLOCKS, START_HOUR, STEP_MINUTES } from './constants';
import {
  applyMagneticChain,
  checkInOverlaps,
  checkInStart,
  createEvent,
  delaySubsequent,
  duplicateEvent,
  eventGrades,
  eventStatus,
  eventsOfDay,
  liveAndNext,
  markActualEnd,
  markActualStart,
  matchesFilter,
  moveEvent,
  newId,
  normalizeDay,
  normalizeEvent,
  peopleOfDay,
  primaryVenue,
  resetActual,
  setEventTime,
} from './schedule';
import type { Day, ScheduleEvent } from './types';

// ==================== 共用工具 ====================

/** 深層凍結：確認函式不會修改傳入的資料（修改凍結物件在嚴格模式會丟錯） */
function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.values(obj).forEach(deepFreeze);
    Object.freeze(obj);
  }
  return obj;
}
const frozen = <T>(obj: T): T => deepFreeze(structuredClone(obj));

let seq = 0;
function ev(p: Partial<ScheduleEvent> & { startMin: number; endMin: number }): ScheduleEvent {
  seq += 1;
  return {
    id: `t${seq}`,
    dateId: 'd1',
    venueIds: ['A'],
    checkInOffsetMin: 0,
    linkPrev: false,
    title: `項目${seq}`,
    color: 'blue',
    referees: [],
    equipment: [],
    attachments: [],
    laneNote: '',
    actualStartMin: null,
    actualEndMin: null,
    ...p,
  };
}

const times = (list: ScheduleEvent[]) => Object.fromEntries(list.map((e) => [e.id, [e.startMin, e.endMin]]));

// ==================== 單元測試 ====================

describe('normalizeEvent / normalizeDay', () => {
  it('補齊缺少的欄位（舊版 normalizeEventData）', () => {
    const raw = frozen({ id: 'x', dateId: 'd1', startMin: 540, endMin: 600, title: 'T', color: 'rose' });
    const n = normalizeEvent(raw);
    expect(n).toMatchObject({
      id: 'x',
      venueIds: ['A'],
      checkInOffsetMin: 10,
      linkPrev: false,
      referees: [],
      equipment: [],
      attachments: [],
      laneNote: '',
      actualStartMin: null,
      actualEndMin: null,
      color: 'rose',
    });
  });
  it('舊欄位 venueId、fallback 場地、0 分檢錄、actual 0 → null、保留額外欄位', () => {
    expect(normalizeEvent({ id: 'x', venueId: 'C' }).venueIds).toEqual(['C']);
    expect(normalizeEvent({ id: 'x' }, 'Q').venueIds).toEqual(['Q']);
    expect(normalizeEvent({ id: 'x', venueIds: [] }).venueIds).toEqual([]);
    const n = normalizeEvent({
      id: 'x',
      checkInOffsetMin: 0,
      actualStartMin: 0,
      linkPrev: 1 as unknown as boolean,
      foo: 1,
    });
    expect(n.checkInOffsetMin).toBe(0);
    expect(n.actualStartMin).toBeNull();
    expect(n.linkPrev).toBe(true);
    expect(n.foo).toBe(1);
  });
  it('缺少必填欄位時補預設值', () => {
    const n = normalizeEvent({ id: 'x' });
    expect(n).toMatchObject({
      dateId: '',
      startMin: DAY_START_MIN,
      endMin: DAY_START_MIN + 40,
      title: '',
      color: 'blue',
    });
  });
  it('normalizeDay', () => {
    expect(normalizeDay(frozen({ id: 'd' }))).toEqual({
      id: 'd',
      label: '',
      commandDeckEnabled: false,
      generalStaff: { hosts: '', recorders: '', stageControl: '' },
      commandSlots: [],
    });
    const slots = [{ id: 's', type: 'host', startMin: 480, endMin: 490 }];
    expect(normalizeDay({ id: 'd', label: 'L', commandSlots: slots }).commandDeckEnabled).toBe(true);
    expect(
      normalizeDay({ id: 'd', label: 'L', commandSlots: slots, commandDeckEnabled: false })
        .commandDeckEnabled,
    ).toBe(false);
    expect(normalizeDay({ id: 'd', label: 'L', commandSlots: [] }).commandDeckEnabled).toBe(false);
  });
});

describe('primaryVenue / eventsOfDay / checkInStart', () => {
  it('primaryVenue', () => {
    expect(primaryVenue(ev({ startMin: 0, endMin: 0, venueIds: ['B', 'C'] }))).toBe('B');
    expect(
      primaryVenue({ ...ev({ startMin: 0, endMin: 0 }), venueIds: undefined as unknown as string[] }),
    ).toBe('A');
  });
  it('eventsOfDay 篩選日期並穩定排序', () => {
    const a = ev({ startMin: 600, endMin: 610 });
    const b = ev({ startMin: 540, endMin: 550 });
    const c = ev({ startMin: 600, endMin: 620 });
    const d = ev({ startMin: 500, endMin: 510, dateId: 'd2' });
    const list = frozen([a, b, c, d]);
    expect(eventsOfDay(list, 'd1').map((e) => e.id)).toEqual([b.id, a.id, c.id]);
    expect(eventsOfDay([], 'd1')).toEqual([]);
  });
  it('checkInStart', () => {
    expect(checkInStart(ev({ startMin: 600, endMin: 640, checkInOffsetMin: 20 }))).toBe(580);
    expect(checkInStart(ev({ startMin: 430, endMin: 440, checkInOffsetMin: 30 }))).toBe(DAY_START_MIN);
    expect(checkInStart(ev({ startMin: 600, endMin: 640, checkInOffsetMin: 0 }))).toBe(600);
  });
});

describe('checkInOverlaps', () => {
  const me = ev({ id: 'me', startMin: 600, endMin: 640, checkInOffsetMin: 20 });
  it('同場地、前一場尾端蓋到檢錄時段', () => {
    expect(checkInOverlaps(frozen([me, ev({ startMin: 540, endMin: 590 })]), me)).toBe(true);
    expect(checkInOverlaps([me, ev({ startMin: 540, endMin: 580 })], me)).toBe(false);
  });
  it('不同場地、不同日期、沒有檢錄、自己不算', () => {
    expect(checkInOverlaps([me, ev({ startMin: 540, endMin: 590, venueIds: ['B'] })], me)).toBe(false);
    expect(checkInOverlaps([me, ev({ startMin: 540, endMin: 590, dateId: 'd2' })], me)).toBe(false);
    expect(checkInOverlaps([me], me)).toBe(false);
    const noCi = { ...me, checkInOffsetMin: 0 };
    expect(checkInOverlaps([noCi, ev({ startMin: 540, endMin: 610 })], noCi)).toBe(false);
  });
  it('多場地：任一場地相同即算', () => {
    const multi = { ...me, venueIds: ['C', 'A'] };
    expect(checkInOverlaps([multi, ev({ startMin: 590, endMin: 700, venueIds: ['B', 'C'] })], multi)).toBe(
      true,
    );
    expect(checkInOverlaps([multi, ev({ startMin: 590, endMin: 700, venueIds: ['D'] })], multi)).toBe(false);
  });
  it('檢錄被 07:00 截掉的情況', () => {
    const early = ev({ startMin: 425, endMin: 460, checkInOffsetMin: 20 });
    expect(checkInOverlaps([early, ev({ startMin: 420, endMin: 430 })], early)).toBe(true);
  });
});

/** 磁吸測試用的固定場景 */
function chainScenario() {
  const a1 = ev({ id: 'a1', startMin: 540, endMin: 600 });
  const a2 = ev({ id: 'a2', startMin: 600, endMin: 640, linkPrev: true });
  const a3 = ev({ id: 'a3', startMin: 650, endMin: 700, linkPrev: true }); // 與 a2 間隔 10 分
  const a4 = ev({ id: 'a4', startMin: 700, endMin: 720 }); // 未連動 → 中斷
  const a5 = ev({ id: 'a5', startMin: 720, endMin: 760, linkPrev: true });
  const b1 = ev({ id: 'b1', startMin: 600, endMin: 650, linkPrev: true, venueIds: ['B'] });
  const other = ev({ id: 'o1', startMin: 600, endMin: 640, linkPrev: true, dateId: 'd2' });
  return frozen([a1, a2, a3, a4, a5, b1, other]);
}

describe('applyMagneticChain', () => {
  it('延長：連動項目保留間隔與長度往後移，遇到未連動項目停止', () => {
    const list = chainScenario();
    const out = applyMagneticChain(list, 'a1', 600, 620);
    expect(times(out)).toMatchObject({
      a2: [620, 660],
      a3: [670, 720],
      a4: [700, 720],
      a5: [720, 760],
      b1: [600, 650],
      o1: [600, 640],
    });
    expect(out).not.toBe(list);
    expect(out[3]).toBe(list[3]); // 未變動者沿用參照
  });
  it('縮短：連動項目往前接上', () => {
    const out = applyMagneticChain(chainScenario(), 'a1', 600, 580);
    expect(times(out)).toMatchObject({ a2: [580, 620], a3: [630, 680], a4: [700, 720] });
  });
  it('delta 為 0 或找不到賽程時不變', () => {
    const list = chainScenario();
    expect(applyMagneticChain(list, 'a1', 600, 600)).toEqual(list);
    expect(applyMagneticChain(list, 'zz', 600, 620)).toEqual(list);
    expect(applyMagneticChain([], 'a1', 600, 620)).toEqual([]);
  });
  it('容許前一項結束前 10 分鐘開始的連動項目', () => {
    const list = frozen([
      ev({ id: 'x', startMin: 540, endMin: 600 }),
      ev({ id: 'y', startMin: 590, endMin: 620, linkPrev: true }),
      ev({ id: 'z', startMin: 580, endMin: 620, linkPrev: true }), // 早於 590 → 略過但不中斷
    ]);
    const out = applyMagneticChain(list, 'x', 600, 630);
    expect(times(out)).toMatchObject({ y: [620, 650], z: [580, 620] });
  });
  it('只看主要場地（venueIds[0]）', () => {
    const list = frozen([
      ev({ id: 'x', startMin: 540, endMin: 600, venueIds: ['A', 'B'] }),
      ev({ id: 'y', startMin: 600, endMin: 620, linkPrev: true, venueIds: ['B', 'A'] }),
      ev({ id: 'z', startMin: 600, endMin: 620, linkPrev: true, venueIds: ['A', 'C'] }),
    ]);
    const out = applyMagneticChain(list, 'x', 600, 610);
    expect(times(out)).toMatchObject({ y: [600, 620], z: [610, 630] });
  });
  it('夾在 17:00 以內（開始也不超過 17:00）', () => {
    const list = frozen([
      ev({ id: 'x', startMin: 900, endMin: 1000 }),
      ev({ id: 'y', startMin: 1000, endMin: 1020, linkPrev: true }),
    ]);
    expect(times(applyMagneticChain(list, 'x', 1000, 1010))).toMatchObject({ y: [1010, 1020] });
    expect(times(applyMagneticChain(list, 'x', 1000, 1040))).toMatchObject({ y: [1020, 1020] });
  });
  it('夾在 07:00 以後', () => {
    const list = frozen([
      ev({ id: 'x', startMin: 420, endMin: 440 }),
      ev({ id: 'y', startMin: 440, endMin: 460, linkPrev: true }),
    ]);
    expect(times(applyMagneticChain(list, 'x', 440, 400))).toMatchObject({ y: [420, 440] });
  });
});

describe('setEventTime', () => {
  it('改結束時間並套用磁吸', () => {
    const out = setEventTime(chainScenario(), 'a1', 540, 620);
    expect(times(out)).toMatchObject({ a1: [540, 620], a2: [620, 660], a3: [670, 720] });
  });
  it('只改開始時間不觸發磁吸', () => {
    const out = setEventTime(chainScenario(), 'a1', 560, 600);
    expect(times(out)).toMatchObject({ a1: [560, 600], a2: [600, 640] });
  });
  it('夾在當日範圍、結束至少比開始晚一格', () => {
    const list = chainScenario();
    expect(times(setEventTime(list, 'a5', 300, 2000))).toMatchObject({ a5: [DAY_START_MIN, DAY_END_MIN] });
    expect(times(setEventTime(list, 'a5', 700, 690))).toMatchObject({ a5: [700, 700 + STEP_MINUTES] });
    expect(times(setEventTime(list, 'a5', 1020, 1020))).toMatchObject({ a5: [1010, 1020] });
  });
  it('找不到 id 時不變', () => {
    const list = chainScenario();
    expect(setEventTime(list, 'nope', 500, 600)).toEqual(list);
  });
});

describe('moveEvent', () => {
  const order = ['A', 'B', 'C', 'D', 'E'];
  it('保留長度並套用磁吸', () => {
    const out = moveEvent(chainScenario(), 'a1', 560);
    expect(times(out)).toMatchObject({ a1: [560, 620], a2: [620, 660], a3: [670, 720] });
  });
  it('依場地順序保留跨欄數，超出右邊截掉', () => {
    const list = frozen([ev({ id: 'm', startMin: 540, endMin: 600, venueIds: ['A', 'B'] })]);
    expect(moveEvent(list, 'm', 540, 'D', order)[0].venueIds).toEqual(['D', 'E']);
    expect(moveEvent(list, 'm', 540, 'E', order)[0].venueIds).toEqual(['E']);
    expect(moveEvent(list, 'm', 540, 'Z', order)[0].venueIds).toEqual(['A', 'B']);
  });
  it('沒有場地順序時只換主要場地', () => {
    const list = frozen([ev({ id: 'm', startMin: 540, endMin: 600, venueIds: ['A', 'B', 'C'] })]);
    expect(moveEvent(list, 'm', 540, 'D')[0].venueIds).toEqual(['D', 'B', 'C']);
    expect(moveEvent(list, 'm', 540, 'B')[0].venueIds).toEqual(['B', 'C']);
  });
  it('換場地後磁吸以新場地計算；結束夾在 17:00', () => {
    const list = frozen([
      ev({ id: 'm', startMin: 540, endMin: 600 }),
      ev({ id: 'n', startMin: 600, endMin: 620, linkPrev: true, venueIds: ['B'] }),
      ev({ id: 'k', startMin: 600, endMin: 620, linkPrev: true }),
    ]);
    const out = moveEvent(list, 'm', 550, 'B');
    expect(times(out)).toMatchObject({ m: [550, 610], n: [610, 630], k: [600, 620] });
    expect(times(moveEvent(list, 'm', 1000))).toMatchObject({ m: [1000, 1020] });
  });
});

describe('delaySubsequent', () => {
  const base = () =>
    frozen([
      ev({ id: 'x', startMin: 540, endMin: 600 }),
      ev({ id: 'y', startMin: 600, endMin: 640 }),
      ev({ id: 'z', startMin: 650, endMin: 700 }),
      ev({ id: 'w', startMin: 760, endMin: 800 }),
      ev({ id: 'b', startMin: 600, endMin: 640, venueIds: ['B'] }),
      ev({ id: 'o', startMin: 600, endMin: 640, dateId: 'd2' }),
    ]);
  it('延後並把重疊的後續賽程往後推，空檔吸收延誤', () => {
    const out = delaySubsequent(base(), 'x', 20);
    expect(times(out)).toMatchObject({
      x: [560, 620],
      y: [620, 660],
      z: [660, 710],
      w: [760, 800],
      b: [600, 640],
      o: [600, 640],
    });
  });
  it('delta 0 = 舊版按鈕：沒有重疊就不動', () => {
    const list = base();
    expect(delaySubsequent(list, 'x', 0)).toEqual(list);
  });
  it('結束夾在 17:00、找不到 id 不變', () => {
    const list = frozen([
      ev({ id: 'x', startMin: 960, endMin: 1000 }),
      ev({ id: 'y', startMin: 1000, endMin: 1020 }),
    ]);
    expect(times(delaySubsequent(list, 'x', 30))).toMatchObject({ x: [990, 1020], y: [1020, 1020] });
    expect(delaySubsequent(list, 'nope', 30)).toEqual(list);
  });
});

describe('現場紀錄 markActualStart / markActualEnd / resetActual', () => {
  it('開賽：對齊 10 分鐘並保留長度、磁吸', () => {
    const out = markActualStart(chainScenario(), 'a1', 553);
    expect(out[0]).toMatchObject({ actualStartMin: 553, actualEndMin: null, startMin: 550, endMin: 610 });
    expect(times(out)).toMatchObject({ a2: [610, 650] });
    expect(markActualStart(chainScenario(), 'a1', 1019)[0]).toMatchObject({ startMin: 1000, endMin: 1020 });
    expect(markActualStart(chainScenario(), 'a1', 300)[0]).toMatchObject({ startMin: 420, endMin: 480 });
  });
  it('結束：對齊 10 分鐘、至少開始 + 10、磁吸', () => {
    const out = markActualEnd(chainScenario(), 'a1', 584);
    expect(out[0]).toMatchObject({ actualEndMin: 584, endMin: 580 });
    expect(times(out)).toMatchObject({ a2: [580, 620] });
    expect(markActualEnd(chainScenario(), 'a1', 500)[0]).toMatchObject({ endMin: 550 });
  });
  it('重設', () => {
    const list = frozen([
      ev({ id: 'r', startMin: 540, endMin: 600, actualStartMin: 541, actualEndMin: 599 }),
    ]);
    expect(resetActual(list, 'r')[0]).toMatchObject({
      actualStartMin: null,
      actualEndMin: null,
      startMin: 540,
    });
    expect(resetActual(list, 'nope')).toEqual(list);
  });
});

describe('createEvent / duplicateEvent / newId', () => {
  it('createEvent 預設值', () => {
    const e = createEvent(frozen({ dateId: 'd1', venueIds: ['C'], startMin: 600 }), 'ev-1');
    expect(e).toEqual({
      id: 'ev-1',
      dateId: 'd1',
      venueIds: ['C'],
      startMin: 600,
      endMin: 640,
      checkInOffsetMin: 10,
      linkPrev: false,
      title: '新比賽項目（點擊右側修改名稱）',
      color: 'blue',
      referees: [{ role: '裁判長', name: '' }],
      volunteerCount: 0,
      volunteerTask: '',
      studentCount: 0,
      studentTask: '',
      equipment: [],
      laneNote: '',
      attachments: [],
      actualStartMin: null,
      actualEndMin: null,
    });
    expect(createEvent({ dateId: 'd1', venueIds: ['C'], startMin: 1000 }).endMin).toBe(1020);
    expect(
      createEvent({ dateId: 'd1', venueIds: ['C'], startMin: 600, endMin: 700, title: 'T' }),
    ).toMatchObject({
      endMin: 700,
      title: 'T',
    });
    expect(createEvent({ dateId: 'd1', venueIds: ['C'], startMin: 600 }).id).toMatch(/^ev-/);
  });
  it('duplicateEvent', () => {
    const orig = ev({
      id: 'o',
      startMin: 540,
      endMin: 600,
      title: '跳遠',
      actualStartMin: 541,
      actualEndMin: 600,
    });
    orig.referees = [{ role: '裁判長', name: '王' }];
    const list = frozen([orig]);
    const out = duplicateEvent(list, 'o', 'ev-copy');
    expect(out).toHaveLength(2);
    expect(out[0]).toBe(list[0]);
    expect(out[1]).toMatchObject({
      id: 'ev-copy',
      title: '跳遠 (複製)',
      startMin: 600,
      endMin: 660,
      actualStartMin: null,
      actualEndMin: null,
      referees: [{ role: '裁判長', name: '王' }],
    });
    expect(out[1].referees).not.toBe(orig.referees);
    expect(Object.isFrozen(out[1].referees)).toBe(false);
    const late = frozen([ev({ id: 'l', startMin: 960, endMin: 1010 })]);
    expect(times(duplicateEvent(late, 'l', 'c'))).toMatchObject({ c: [970, 1020] });
    expect(duplicateEvent(list, 'nope')).toEqual(list);
    expect(duplicateEvent(list, 'o')[1].id).toMatch(/^ev-/);
  });
  it('newId', () => {
    expect(newId('ev')).toMatch(/^ev-[0-9a-z]+-[0-9a-z]+$/);
    expect(newId('ev')).not.toBe(newId('ev'));
  });
});

describe('eventStatus / liveAndNext', () => {
  const e = ev({ startMin: 600, endMin: 640, checkInOffsetMin: 20 });
  it('依時間判斷', () => {
    expect(eventStatus(e, 570)).toBe('upcoming');
    expect(eventStatus(e, 580)).toBe('checkin');
    expect(eventStatus(e, 599.5)).toBe('checkin');
    expect(eventStatus(e, 600)).toBe('live');
    expect(eventStatus(e, 639)).toBe('live');
    expect(eventStatus(e, 640)).toBe('done');
    expect(eventStatus({ ...e, checkInOffsetMin: 0 }, 590)).toBe('upcoming');
  });
  it('實際紀錄優先', () => {
    expect(eventStatus({ ...e, actualStartMin: 590 }, 560)).toBe('live');
    expect(eventStatus({ ...e, actualStartMin: 600 }, 700)).toBe('live');
    expect(eventStatus({ ...e, actualEndMin: 620 }, 610)).toBe('done');
    expect(eventStatus({ ...e, actualStartMin: 600, actualEndMin: 620 }, 500)).toBe('done');
  });
  it('liveAndNext', () => {
    const list = frozen([
      ev({ id: 'l1', startMin: 540, endMin: 620 }),
      ev({ id: 'l2', startMin: 500, endMin: 530, actualStartMin: 505 }),
      ev({ id: 'd', startMin: 500, endMin: 560 }),
      ev({ id: 'n2', startMin: 620, endMin: 640, venueIds: ['B'] }),
      ev({ id: 'n1', startMin: 620, endMin: 650, checkInOffsetMin: 10 }),
      ev({ id: 'later', startMin: 700, endMin: 720 }),
      ev({ id: 'ended', startMin: 610, endMin: 640, actualEndMin: 580 }),
      ev({ id: 'other', startMin: 600, endMin: 700, dateId: 'd2' }),
    ]);
    const r = liveAndNext(list, 'd1', 612);
    expect(r.live.map((x) => x.id)).toEqual(['l2', 'l1']);
    expect(r.next.map((x) => x.id)).toEqual(['n2', 'n1']);
    expect(liveAndNext(list, 'd1', 800)).toEqual({ live: [list[1]], next: [] });
    expect(liveAndNext([], 'd1', 600)).toEqual({ live: [], next: [] });
  });
});

describe('eventGrades / matchesFilter / peopleOfDay', () => {
  it('eventGrades', () => {
    expect(eventGrades(ev({ startMin: 0, endMin: 0, title: '二年級 立定跳遠' }))).toEqual(['二年級']);
    expect(eventGrades(ev({ startMin: 0, endMin: 0, title: '五、六年級 400M 接力' }))).toEqual([
      '五年級',
      '六年級',
    ]);
    expect(eventGrades(ev({ startMin: 0, endMin: 0, title: '全校運動會開幕與進場總預演' }))).toEqual(
      GRADE_BLOCKS.map((g) => g.id),
    );
    expect(eventGrades(ev({ startMin: 0, endMin: 0, title: '親師接力' }))).toEqual(['全校']);
    expect(eventGrades(ev({ startMin: 0, endMin: 0, title: '跳遠', laneNote: '特教班' }))).toEqual(['特教']);
    expect(eventGrades(ev({ startMin: 0, endMin: 0, title: '男子組 跳高' }))).toEqual([]);
  });
  it('matchesFilter', () => {
    const e = frozen(
      ev({
        startMin: 0,
        endMin: 0,
        title: '三年級 Relay',
        venueIds: ['A', 'B'],
        referees: [{ role: '發令', name: '體育組長' }],
      }),
    );
    expect(matchesFilter(e, {})).toBe(true);
    expect(matchesFilter(e, { grade: '三年級' })).toBe(true);
    expect(matchesFilter(e, { grade: '四年級' })).toBe(false);
    expect(matchesFilter(e, { grade: 'X' as never })).toBe(true);
    expect(matchesFilter(e, { venueId: 'B' })).toBe(true);
    expect(matchesFilter(e, { venueId: 'C' })).toBe(false);
    expect(matchesFilter(e, { query: '  relay ' })).toBe(true);
    expect(matchesFilter(e, { query: '組長' })).toBe(true);
    expect(matchesFilter(e, { query: '發令' })).toBe(true);
    expect(matchesFilter(e, { query: '王' })).toBe(false);
    expect(matchesFilter(e, { query: '   ' })).toBe(true);
    expect(matchesFilter(e, { grade: '三年級', venueId: 'A', query: '組長' })).toBe(true);
    expect(matchesFilter(e, { grade: '三年級', venueId: 'C', query: '組長' })).toBe(false);
    expect(matchesFilter(e, { grade: null, venueId: null, query: '' })).toBe(true);
  });
  it('peopleOfDay', () => {
    const list = frozen([
      ev({ startMin: 0, endMin: 0, referees: [{ role: '丈量', name: '郭老師（升橫桿）、王老師' }] }),
      ev({
        startMin: 0,
        endMin: 0,
        referees: [
          { role: '終點', name: '科任老師 x6' },
          { role: 'a', name: '王老師' },
        ],
      }),
      ev({
        startMin: 0,
        endMin: 0,
        referees: [
          { role: 'b', name: '甲' },
          { role: 'c', name: '很長很長的名字啊' },
        ],
      }),
      ev({ startMin: 0, endMin: 0, dateId: 'd2', referees: [{ role: '丈量', name: '別天老師' }] }),
    ]);
    expect(peopleOfDay(list, 'd1')).toEqual(['郭老師', '王老師', '科任老師']);
    const day: Day = {
      id: 'd1',
      label: 'L',
      commandDeckEnabled: true,
      commandSlots: [{ id: 's', type: 'host', startMin: 480, endMin: 490, staff: '訓育組長/xy' }],
    };
    expect(peopleOfDay(list, 'd1', frozen(day))).toEqual(['郭老師', '王老師', '科任老師', '訓育組長', 'xy']);
    expect(peopleOfDay(list, 'd1', { ...day, commandDeckEnabled: false })).toHaveLength(3);
    expect(peopleOfDay([], 'd1')).toEqual([]);
  });
});

// ==================== 與舊版的行為對照（characterization）測試 ====================

type Fn = (...args: unknown[]) => unknown;
interface VmModule {
  createContext(sandbox: Record<string, unknown>): Record<string, unknown>;
  runInContext(code: string, ctx: Record<string, unknown>): unknown;
}

/** 從舊版原始碼切出 `function name(...) { ... }`（以大括號配對） */
function extractFunction(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`legacy 找不到 function ${name}`);
  const open = src.indexOf('{', src.indexOf(')', start));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`legacy function ${name} 大括號不配對`);
}

/** 切出 startMarker 到 endMarker（不含）之間的原始碼 */
function extractBetween(src: string, startMarker: string, endMarker: string, includeEnd = false): string {
  const s = src.indexOf(startMarker);
  if (s === -1) throw new Error(`legacy 找不到 ${startMarker}`);
  const e = src.indexOf(endMarker, s);
  if (e === -1) throw new Error(`legacy 找不到 ${endMarker}`);
  return src.slice(s, includeEnd ? e + endMarker.length : e);
}

/** 可重現的亂數（mulberry32） */
function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (lo: number, hi: number) => lo + Math.floor(next() * (hi - lo + 1));
  const pick = <T>(arr: readonly T[]): T => arr[int(0, arr.length - 1)];
  return { next, int, pick };
}
type Rng = ReturnType<typeof rng>;

const VENUES = ['A', 'B', 'C', 'D', 'E'];
const TITLES = [
  '二年級 立定跳遠',
  '三年級 網球趣味賽',
  '五、六年級 400M 接力',
  '全校開幕總預演',
  '閉幕典禮',
  '親師接力',
  '特教班 闖關',
  '男子組 跳高 Final',
  '一網 趣味',
  '四壘 擲遠',
];
const NAMES = [
  '王老師',
  '林老師（升橫桿）',
  '科任老師 x6',
  '體育組長、徐老師',
  '甲',
  'Amy Chen',
  '二年級導師/許老師',
  '',
];
const ROLES = ['裁判長', '丈量', '發令', '終點判定', 'Recorder'];

/** 隨機產生一天或兩天的賽程：一半是同場地連續排列（容易形成磁吸鏈），一半完全隨機 */
function genEvents(r: Rng, sequentialRatio = 0.5): ScheduleEvent[] {
  const out: ScheduleEvent[] = [];
  let n = 0;
  const make = (venue: string, startMin: number, endMin: number): ScheduleEvent => {
    n += 1;
    const span = r.next() < 0.2 ? r.int(2, 3) : 1;
    const idx = VENUES.indexOf(venue);
    const venueIds = r.next() < 0.1 ? [venue, VENUES[(idx + 2) % 5]] : VENUES.slice(idx, idx + span);
    const refCount = r.int(0, 3);
    return {
      id: `e${n}`,
      dateId: r.next() < 0.8 ? 'd1' : 'd2',
      venueIds,
      startMin,
      endMin,
      checkInOffsetMin: r.pick([0, 0, 10, 20, 30, 90]),
      linkPrev: r.next() < 0.65,
      title: r.pick(TITLES),
      color: 'blue',
      referees: Array.from({ length: refCount }, () => ({ role: r.pick(ROLES), name: r.pick(NAMES) })),
      equipment: [],
      attachments: [],
      laneNote: r.next() < 0.2 ? r.pick(TITLES) : '',
      actualStartMin: r.next() < 0.15 ? r.int(420, 1020) : null,
      actualEndMin: r.next() < 0.1 ? r.int(420, 1020) : null,
    };
  };
  if (r.next() < sequentialRatio) {
    for (const venue of VENUES.slice(0, r.int(1, 5))) {
      let cursor = DAY_START_MIN + 10 * r.int(0, 20);
      const count = r.int(1, 8);
      for (let i = 0; i < count; i++) {
        const start = Math.max(
          DAY_START_MIN,
          cursor + r.pick([-20, -10, 0, 0, 0, 10, 20, 40]) + (r.next() < 0.1 ? r.int(1, 9) : 0),
        );
        if (start > DAY_END_MIN - STEP_MINUTES) break;
        const end = Math.min(DAY_END_MIN, start + 10 * r.int(1, 12));
        out.push(make(venue, start, end));
        cursor = end;
      }
    }
  } else {
    const count = r.int(0, 14);
    for (let i = 0; i < count; i++) {
      const start = DAY_START_MIN + 10 * r.int(0, 59);
      out.push(make(r.pick(VENUES), start, Math.min(DAY_END_MIN, start + 10 * r.int(1, 12))));
    }
  }
  return out;
}

const CASES = 400;
const json = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('與舊版 legacy/index.html 行為對照', () => {
  let ctx: Record<string, unknown>;
  let L: Record<string, Fn>;
  const setState = (events: ScheduleEvent[], extra: Record<string, unknown> = {}) => {
    ctx.state = { events: json(events), venues: VENUES.map((id) => ({ id, name: id })), dates: [], ...extra };
  };
  const legacyEvents = () => json((ctx.state as { events: ScheduleEvent[] }).events);

  beforeAll(async () => {
    const VM_MODULE = 'node:vm';
    const vm = (await import(/* @vite-ignore */ VM_MODULE)) as VmModule;
    const fnNames = [
      'normalizeEventData',
      'applyMagneticChain',
      'checkIfCheckInOverlaps',
      'createNewEventAt',
      'moveEventTo',
      'triggerLiveActualStart',
      'triggerLiveActualEnd',
      'resetLiveActualRecords',
      'cascadeDelaySubsequentEvents',
      'updateEventStartTime',
      'updateEventEndTime',
      'duplicateEvent',
      'doesEventMatchActiveFilter',
    ];
    const code = [
      extractBetween(legacyHtml, 'const START_HOUR', 'const SLOT_HEIGHT').replace(/const /g, 'var '),
      extractBetween(legacyHtml, 'const GRADE_BLOCKS = [', '];', true).replace('const ', 'var '),
      ...fnNames.map((n) => extractFunction(legacyHtml, n)),
      // renderPersonFilterBar 中收集人員姓名的片段
      `function legacyPeople() {
        ${extractBetween(legacyHtml, 'const dayEvents = state.events.filter(e => e.dateId === state.currentDateId);', 'const activeFilter')}
        return peopleList;
      }`,
      // init() 中的比賽日正規化
      `function legacyNormalizeDates() {
        ${extractBetween(legacyHtml, 'state.dates = state.dates.map(d => ({', '}));', true)}
      }`,
    ].join('\n');
    const noop = () => undefined;
    ctx = vm.createContext({
      state: {},
      __now: 0,
      getCurrentLiveMinutes: () => ctx.__now,
      saveToStorage: noop,
      renderCanvasGridAndEvents: noop,
      renderInspector: noop,
      renderDateTree: noop,
      renderPersonFilterBar: noop,
      showToast: noop,
      minToTimeStr: () => '',
    });
    vm.runInContext(code, ctx);
    L = ctx as unknown as Record<string, Fn>;
  });

  it('常數與舊版相同', () => {
    expect(json(ctx.GRADE_BLOCKS)).toEqual(json(GRADE_BLOCKS));
    expect([ctx.START_HOUR, ctx.END_HOUR, ctx.STEP_MINUTES]).toEqual([START_HOUR, END_HOUR, STEP_MINUTES]);
  });

  it(`applyMagneticChain（${CASES} 組）`, () => {
    const r = rng(1);
    let moved = 0;
    for (let i = 0; i < CASES; i++) {
      const events = genEvents(r, 0.85);
      if (events.length === 0) continue;
      const anchor = r.pick(events);
      const oldEnd = r.next() < 0.8 ? anchor.endMin : r.int(420, 1020);
      const newEnd =
        oldEnd + r.pick([-60, -30, -20, -10, 0, 10, 20, 30, 60, 120]) + (r.next() < 0.1 ? r.int(-9, 9) : 0);
      setState(events);
      L.applyMagneticChain(anchor.id, oldEnd, newEnd);
      // 刻意差異：開始時間不超過 17:00
      const expected = legacyEvents().map((e) => ({ ...e, startMin: Math.min(DAY_END_MIN, e.startMin) }));
      const mine = applyMagneticChain(deepFreeze(events), anchor.id, oldEnd, newEnd);
      expect(json(mine)).toEqual(expected);
      if (JSON.stringify(mine) !== JSON.stringify(events)) moved++;
    }
    expect(moved).toBeGreaterThan(CASES / 4); // 確認隨機場景確實有觸發連動
  });

  it(`checkInOverlaps（${CASES} 組 × 每個賽程）`, () => {
    const r = rng(2);
    let trues = 0;
    for (let i = 0; i < CASES; i++) {
      const events = deepFreeze(genEvents(r));
      setState(events);
      for (const e of events) {
        const ciStart = Math.max(START_HOUR * 60, e.startMin - (e.checkInOffsetMin || 0));
        const expected = L.checkIfCheckInOverlaps(json(e), ciStart);
        const actual = checkInOverlaps(events, e);
        expect(actual).toBe(expected);
        if (actual) trues++;
      }
    }
    expect(trues).toBeGreaterThan(20);
  });

  it(`setEventTime ↔ updateEventStartTime / updateEventEndTime（${CASES} 組）`, () => {
    const r = rng(3);
    for (let i = 0; i < CASES; i++) {
      const events = genEvents(r);
      if (events.length === 0) continue;
      const target = r.pick(events);
      setState(events);
      let mine: ScheduleEvent[];
      if (r.next() < 0.5) {
        const s = DAY_START_MIN + 10 * r.int(0, 59);
        L.updateEventStartTime(target.id, s);
        const dur = target.endMin - target.startMin;
        mine = setEventTime(deepFreeze(events), target.id, s, Math.min(DAY_END_MIN, s + dur));
      } else {
        const lo = Math.ceil((target.startMin + STEP_MINUTES) / 10);
        const e = 10 * r.int(lo, 102);
        L.updateEventEndTime(target.id, e);
        mine = setEventTime(deepFreeze(events), target.id, target.startMin, e);
      }
      const expected = legacyEvents().map((e) => ({ ...e, startMin: Math.min(DAY_END_MIN, e.startMin) }));
      expect(json(mine)).toEqual(expected);
    }
  });

  it(`moveEvent ↔ moveEventTo（${CASES} 組）`, () => {
    const r = rng(4);
    for (let i = 0; i < CASES; i++) {
      const events = genEvents(r);
      if (events.length === 0) continue;
      const target = r.pick(events);
      const start = DAY_START_MIN + 10 * r.int(0, 59);
      const venue = r.pick([...VENUES, 'Z']);
      setState(events);
      L.moveEventTo(target.id, venue, start);
      const expected = legacyEvents().map((e) => ({ ...e, startMin: Math.min(DAY_END_MIN, e.startMin) }));
      expect(json(moveEvent(deepFreeze(events), target.id, start, venue, VENUES))).toEqual(expected);
    }
  });

  it(`delaySubsequent(…, 0) ↔ cascadeDelaySubsequentEvents（${CASES} 組）`, () => {
    const r = rng(5);
    let moved = 0;
    for (let i = 0; i < CASES; i++) {
      const events = genEvents(r);
      if (events.length === 0) continue;
      const target = r.pick(events);
      setState(events);
      L.cascadeDelaySubsequentEvents(target.id);
      const mine = delaySubsequent(deepFreeze(events), target.id, 0);
      expect(json(mine)).toEqual(legacyEvents());
      if (JSON.stringify(mine) !== JSON.stringify(events)) moved++;
    }
    expect(moved).toBeGreaterThan(20);
  });

  it(`markActualStart / markActualEnd / resetActual ↔ 舊版現場調度（${CASES} 組）`, () => {
    const r = rng(6);
    for (let i = 0; i < CASES; i++) {
      const events = genEvents(r);
      if (events.length === 0) continue;
      const target = r.pick(events);
      const now = r.int(380, 1060);
      ctx.__now = now;
      setState(events);
      const kind = r.int(0, 2);
      let mine: ScheduleEvent[];
      if (kind === 0) {
        L.triggerLiveActualStart(target.id);
        mine = markActualStart(deepFreeze(events), target.id, now);
      } else if (kind === 1) {
        L.triggerLiveActualEnd(target.id);
        mine = markActualEnd(deepFreeze(events), target.id, now);
      } else {
        L.resetLiveActualRecords(target.id);
        mine = resetActual(deepFreeze(events), target.id);
      }
      const expected = legacyEvents().map((e) => ({ ...e, startMin: Math.min(DAY_END_MIN, e.startMin) }));
      expect(json(mine)).toEqual(expected);
    }
  });

  it(`createEvent ↔ createNewEventAt、duplicateEvent ↔ duplicateEvent（${CASES} 組）`, () => {
    const r = rng(7);
    for (let i = 0; i < CASES; i++) {
      const events = genEvents(r);
      const venue = r.pick(VENUES);
      const start = DAY_START_MIN + 10 * r.int(0, 59);
      setState(events, { currentDateId: 'd1' });
      L.createNewEventAt(venue, start);
      const created = legacyEvents().at(-1) as ScheduleEvent;
      expect(json(createEvent({ dateId: 'd1', venueIds: [venue], startMin: start }, created.id))).toEqual(
        created,
      );

      if (events.length === 0) continue;
      const target = r.pick(events);
      setState(events);
      L.duplicateEvent(target.id);
      const expected = legacyEvents();
      const copyId = expected.at(-1)?.id;
      expect(json(duplicateEvent(deepFreeze(events), target.id, copyId))).toEqual(expected);
    }
  });

  it(`matchesFilter ↔ doesEventMatchActiveFilter（${CASES} 組 × 每個賽程）`, () => {
    const r = rng(8);
    const queries = ['', '  ', '王', '老師', 'amy', 'RECORD', '裁判', '跳高', 'final', '組長 ', 'x6'];
    for (let i = 0; i < CASES; i++) {
      const events = deepFreeze(genEvents(r));
      const grade = r.pick(['', ...GRADE_BLOCKS.map((g) => g.id)]);
      const query = r.pick(queries);
      for (const e of events) {
        setState([], { role: 'teacher', gradeFilter: grade });
        expect(matchesFilter(e, { grade: (grade || null) as never })).toBe(
          L.doesEventMatchActiveFilter(json(e)),
        );
        expect(eventGrades(e).includes(grade as never) || !grade).toBe(L.doesEventMatchActiveFilter(json(e)));
        setState([], { role: 'staff', personFilter: query });
        expect(matchesFilter(e, { query })).toBe(L.doesEventMatchActiveFilter(json(e)));
      }
    }
  });

  it(`peopleOfDay ↔ renderPersonFilterBar 人員積木（${CASES} 組，舊版只取前 18 個）`, () => {
    const r = rng(9);
    for (let i = 0; i < CASES; i++) {
      const events = deepFreeze(genEvents(r));
      const day: Day = {
        id: 'd1',
        label: 'D',
        commandDeckEnabled: r.next() < 0.6,
        commandSlots: Array.from({ length: r.int(0, 3) }, (_, k) => ({
          id: `s${k}`,
          type: 'host',
          startMin: 480,
          endMin: 490,
          staff: r.next() < 0.8 ? r.pick(NAMES) : undefined,
        })),
      };
      setState(events, { currentDateId: 'd1', dates: [json(day)] });
      expect(peopleOfDay(events, 'd1', deepFreeze(day)).slice(0, 18)).toEqual(L.legacyPeople());
    }
  });

  it(`normalizeEvent ↔ normalizeEventData、normalizeDay ↔ init() 日期正規化（${CASES} 組）`, () => {
    const r = rng(10);
    for (let i = 0; i < CASES; i++) {
      const raw: Record<string, unknown> = {
        id: `n${i}`,
        dateId: 'd1',
        startMin: 540,
        endMin: 600,
        title: 'T',
        color: 'blue',
      };
      if (r.next() < 0.5) raw.venueIds = [r.pick(VENUES)];
      if (r.next() < 0.3) raw.venueId = r.pick(VENUES);
      if (r.next() < 0.5) raw.checkInOffsetMin = r.pick([0, 10, 20]);
      if (r.next() < 0.5) raw.linkPrev = r.pick([true, false, 1, 0, 'yes']);
      if (r.next() < 0.5) raw.referees = r.next() < 0.5 ? [{ role: 'a', name: 'b' }] : 'bad';
      if (r.next() < 0.5) raw.equipment = r.next() < 0.5 ? ['x'] : null;
      if (r.next() < 0.5) raw.attachments = r.next() < 0.5 ? [] : {};
      if (r.next() < 0.5) raw.laneNote = r.pick(['', 'note']);
      if (r.next() < 0.5) raw.actualStartMin = r.pick([0, null, 541]);
      if (r.next() < 0.5) raw.actualEndMin = r.pick([0, null, 599]);
      if (r.next() < 0.3) raw.extraField = 42;
      const firstVenue = r.pick(VENUES);
      ctx.state = { venues: [{ id: firstVenue }] };
      const expected = L.normalizeEventData(json(raw));
      const mine = normalizeEvent(frozen(raw) as ScheduleEvent, firstVenue);
      expect(json(mine)).toEqual(json(expected));

      const rawDay: Record<string, unknown> = { id: `d${i}`, label: 'L' };
      if (r.next() < 0.5) rawDay.commandDeckEnabled = r.next() < 0.5;
      if (r.next() < 0.6)
        rawDay.commandSlots = r.next() < 0.5 ? [] : [{ id: 's', type: 'host', startMin: 1, endMin: 2 }];
      if (r.next() < 0.3) rawDay.generalStaff = { hosts: 'h' };
      ctx.state = { dates: [json(rawDay)] };
      L.legacyNormalizeDates();
      const legacyDay = json((ctx.state as { dates: Day[] }).dates[0]);
      // 刻意差異：沒有 commandSlots 時舊版 commandDeckEnabled 為 undefined，新版為 false
      legacyDay.commandDeckEnabled = Boolean(legacyDay.commandDeckEnabled);
      expect(json(normalizeDay(frozen(rawDay) as Day))).toEqual(legacyDay);
    }
  });
});
