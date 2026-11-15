// 賽程 store 測試：使用真正的 @shared/schedule（排程細節由 schedule.test.ts 測試），
// 這裡檢查 store 更新狀態、通知同步服務、清除選取，以及傳給純函式的參數（場地順序、目前時鐘）。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryStorage, ev, project } from '../services/test-helpers';

vi.mock('../ui/Toast', () => ({ toast: vi.fn() }));

async function load() {
  vi.resetModules();
  vi.stubGlobal('localStorage', new MemoryStorage());
  vi.stubGlobal('location', { protocol: 'http:', host: 'localhost', search: '' });
  const { useProject, onLocalChange } = await import('./project');
  const { useSession } = await import('./session');
  const changes = vi.fn();
  onLocalChange(changes);
  useProject.getState().replaceAll(
    {
      venues: [
        { id: 'A', name: 'A' },
        { id: 'B', name: 'B' },
        { id: 'C', name: 'C' },
      ],
      dates: [
        { id: 'd1', label: '第一天' },
        { id: 'd2', label: '第二天' },
      ],
      events: [
        ev('a', { startMin: 540, endMin: 560 }),
        ev('b', { dateId: 'd2' }),
        ev('next', { startMin: 560, endMin: 580, linkPrev: true }),
      ],
    },
    'remote',
  );
  return { useProject, useSession, changes };
}

const byId = <T extends { id: string }>(list: T[], id: string): T => list.find((e) => e.id === id)!;

afterEach(() => vi.unstubAllGlobals());

describe('project store', () => {
  it('replaceAll：正規化資料、設定 loaded；remote 不通知、local 通知', async () => {
    const { useProject, changes } = await load();
    expect(useProject.getState().loaded).toBe(true);
    expect(useProject.getState().dates[0]).toMatchObject({ commandSlots: [], commandDeckEnabled: false });
    expect(changes).not.toHaveBeenCalled();
    useProject.getState().replaceAll(project(2, []), 'local');
    expect(changes).toHaveBeenCalledTimes(1);
  });

  it('replaceAll：沒有場地的舊資料放到第一個場地', async () => {
    const { useProject } = await load();
    useProject.getState().replaceAll(
      { venues: [{ id: 'X', name: 'X' }], dates: [], events: [{ id: 'old' } as never] },
      'remote',
    );
    expect(useProject.getState().events[0].venueIds).toEqual(['X']);
  });

  it('replaceAll 清除指向不存在資料的選取', async () => {
    const { useProject, useSession } = await load();
    useSession.setState({ selectedEventId: 'a', currentDayId: 'd1' });
    useProject.getState().replaceAll({ venues: [], dates: [], events: [] }, 'remote');
    expect(useSession.getState().selectedEventId).toBeNull();
    expect(useSession.getState().currentDayId).toBeNull();
  });

  it('addEvent 回傳新 id 並通知', async () => {
    const { useProject, changes } = await load();
    const id = useProject.getState().addEvent({ dateId: 'd1', venueIds: ['A'], startMin: 600 });
    expect(id).toMatch(/^ev-/);
    expect(byId(useProject.getState().events, id)).toMatchObject({ startMin: 600, endMin: 640 });
    expect(changes).toHaveBeenCalledTimes(1);
  });

  it('setEventTime 套用磁吸連動', async () => {
    const { useProject, changes } = await load();
    useProject.getState().setEventTime('a', 540, 570);
    expect(byId(useProject.getState().events, 'next')).toMatchObject({ startMin: 570, endMin: 590 });
    expect(changes).toHaveBeenCalledTimes(1);
    // 不存在的賽程不做事
    useProject.getState().setEventTime('zzz', 600, 630);
    expect(changes).toHaveBeenCalledTimes(1);
  });

  it('moveEvent 傳入場地順序：跨場地賽程保留跨度', async () => {
    const { useProject } = await load();
    useProject.getState().updateEvent('b', { venueIds: ['A', 'B'] });
    useProject.getState().moveEvent('b', 600, 'B');
    expect(byId(useProject.getState().events, 'b')).toMatchObject({ venueIds: ['B', 'C'], startMin: 600 });
  });

  it('delaySubsequent 延後並推動後續賽程', async () => {
    const { useProject } = await load();
    useProject.getState().delaySubsequent('a', 10);
    expect(byId(useProject.getState().events, 'a')).toMatchObject({ startMin: 550, endMin: 570 });
    expect(byId(useProject.getState().events, 'next').startMin).toBeGreaterThanOrEqual(570);
  });

  it('duplicateEvent 回傳新 id', async () => {
    const { useProject } = await load();
    const id = useProject.getState().duplicateEvent('a');
    expect(id).toMatch(/^ev-/);
    expect(byId(useProject.getState().events, id).title).toBe('a (複製)');
    expect(useProject.getState().duplicateEvent('zzz')).toBe('');
  });

  it('deleteEvent 清除選取', async () => {
    const { useProject, useSession } = await load();
    useSession.getState().selectEvent('a');
    useProject.getState().deleteEvent('a');
    expect(useProject.getState().events.map((e) => e.id)).toEqual(['b', 'next']);
    expect(useSession.getState().selectedEventId).toBeNull();
  });

  it('markActualStart 預設用目前時鐘（模擬時間）', async () => {
    const { useProject, useSession } = await load();
    useSession.getState().setClock({ mode: 'sim', simMin: 603 });
    useProject.getState().markActualStart('a');
    expect(byId(useProject.getState().events, 'a')).toMatchObject({
      actualStartMin: 603,
      actualEndMin: null,
      startMin: 600,
      endMin: 620,
    });
  });

  it('markActualEnd / resetActual', async () => {
    const { useProject } = await load();
    useProject.getState().markActualEnd('a', 541);
    expect(byId(useProject.getState().events, 'a')).toMatchObject({ actualEndMin: 541, endMin: 550 });
    useProject.getState().resetActual('a');
    expect(byId(useProject.getState().events, 'a')).toMatchObject({ actualStartMin: null, actualEndMin: null });
  });

  it('deleteVenue：賽程改到剩下的場地；至少保留一個場地', async () => {
    const { useProject, useSession } = await load();
    useSession.getState().setFilter({ venueId: 'A' });
    useProject.getState().deleteVenue('A');
    useProject.getState().deleteVenue('C');
    expect(useProject.getState().venues.map((v) => v.id)).toEqual(['B']);
    expect(byId(useProject.getState().events, 'a').venueIds).toEqual(['B']);
    expect(useSession.getState().filter.venueId).toBeNull();
    useProject.getState().deleteVenue('B');
    expect(useProject.getState().venues).toHaveLength(1);
  });

  it('deleteDay：刪除該日賽程並清除目前日期；至少保留一天', async () => {
    const { useProject, useSession } = await load();
    useSession.getState().setCurrentDay('d2');
    useProject.getState().deleteDay('d2');
    expect(useProject.getState().dates.map((d) => d.id)).toEqual(['d1']);
    expect(useProject.getState().events.map((e) => e.id)).toEqual(['a', 'next']);
    expect(useSession.getState().currentDayId).toBeNull();
    useProject.getState().deleteDay('d1');
    expect(useProject.getState().dates).toHaveLength(1);
  });

  it('addDay / addVenue', async () => {
    const { useProject } = await load();
    const dayId = useProject.getState().addDay({ label: '第三天' });
    expect(byId(useProject.getState().dates, dayId)).toMatchObject({
      label: '第三天',
      commandDeckEnabled: false,
      commandSlots: [],
    });
    const venueId = useProject.getState().addVenue();
    expect(byId(useProject.getState().venues, venueId)).toMatchObject({ name: '新場地 4' });
  });

  it('司令台時段：新增、修改、刪除', async () => {
    const { useProject } = await load();
    const id = useProject.getState().upsertCommandSlot('d1', { type: 'award', startMin: 570, endMin: 630 });
    useProject.getState().upsertCommandSlot('d1', { id, type: 'host', startMin: 580, endMin: 600 });
    const day = () => byId(useProject.getState().dates, 'd1');
    expect(day().commandSlots).toEqual([{ id, type: 'host', startMin: 580, endMin: 600 }]);
    useProject.getState().deleteCommandSlot('d1', id);
    expect(day().commandSlots).toEqual([]);
  });

  it('updateEvent / updateVenue / updateDay 合併欄位，不能改 id', async () => {
    const { useProject, changes } = await load();
    useProject.getState().updateEvent('a', { title: '改', id: 'hack' });
    expect(useProject.getState().events[0]).toMatchObject({ id: 'a', title: '改' });
    useProject.getState().updateVenue('A', { name: '操場' });
    useProject.getState().updateDay('d1', { label: 'Day 1' });
    expect(useProject.getState().venues[0].name).toBe('操場');
    expect(useProject.getState().dates[0].label).toBe('Day 1');
    expect(changes).toHaveBeenCalledTimes(3);
  });

  it('updateSettings：合併設定、通知同步；replaceAll 讀入或清空設定；snapshot 一定帶 settings', async () => {
    const { useProject, changes } = await load();
    const { projectSnapshot } = await import('./project');
    expect(projectSnapshot().settings).toEqual({});
    useProject.getState().updateSettings({ contact: '體育組 楊合萍老師' });
    expect(useProject.getState().settings).toEqual({ contact: '體育組 楊合萍老師' });
    expect(projectSnapshot().settings?.contact).toBe('體育組 楊合萍老師');
    expect(changes).toHaveBeenCalledTimes(1);
    useProject.getState().replaceAll({ venues: [], dates: [], events: [], settings: { contact: '雲端的值' } }, 'remote');
    expect(useProject.getState().settings?.contact).toBe('雲端的值');
    useProject.getState().replaceAll({ venues: [], dates: [], events: [] }, 'remote');
    expect(useProject.getState().settings).toEqual({});
  });
});
