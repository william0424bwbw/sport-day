// I3：賽程資料 store（實作 ProjectStore 合約）
// 所有排程邏輯都交給 @shared/schedule 的純函式；這裡只負責更新狀態與通知同步服務。
import { create } from 'zustand';
import {
  createEvent,
  delaySubsequent,
  duplicateEvent,
  markActualEnd,
  markActualStart,
  moveEvent,
  newId,
  normalizeDay,
  normalizeEvent,
  resetActual,
  setEventTime,
} from '@shared/schedule';
import type { CommandSlot, Day, ProjectData, ScheduleEvent, Venue } from '@shared/types';
import type { ProjectStore } from './contracts';
import { currentClockMin, useSession } from './session';

// ---- 本機修改通知（同步服務訂閱，用來排程上傳） ----
type LocalChangeListener = () => void;
const localListeners = new Set<LocalChangeListener>();

/** 訂閱「本機修改」（origin = 'local'）；回傳取消訂閱函式 */
export function onLocalChange(listener: LocalChangeListener): () => void {
  localListeners.add(listener);
  return () => {
    localListeners.delete(listener);
  };
}

function notifyLocal() {
  for (const l of [...localListeners]) l();
}


/** 刪除或整份取代後，清掉指向不存在資料的選取狀態 */
function fixSessionRefs(data: Pick<ProjectData, 'dates' | 'events' | 'venues'>) {
  const s = useSession.getState();
  const patch: Partial<{ selectedEventId: null; currentDayId: null }> = {};
  if (s.selectedEventId && !data.events.some((e) => e.id === s.selectedEventId)) patch.selectedEventId = null;
  if (s.currentDayId && !data.dates.some((d) => d.id === s.currentDayId)) patch.currentDayId = null;
  if (Object.keys(patch).length) useSession.setState(patch);
  if (s.filter.venueId && !data.venues.some((v) => v.id === s.filter.venueId)) s.setFilter({ venueId: null });
}

export const useProject = create<ProjectStore>((set, get) => {
  /** 本機修改：更新狀態並通知同步服務 */
  const commit = (patch: Partial<ProjectData>) => {
    set(patch);
    notifyLocal();
  };
  const mapEvent = (id: string, fn: (ev: ScheduleEvent) => ScheduleEvent) => {
    const { events } = get();
    if (!events.some((e) => e.id === id)) return;
    commit({ events: events.map((e) => (e.id === id ? fn(e) : e)) });
  };
  const mapDay = (id: string, fn: (d: Day) => Day) => {
    const { dates } = get();
    if (!dates.some((d) => d.id === id)) return;
    commit({ dates: dates.map((d) => (d.id === id ? fn(d) : d)) });
  };

  return {
    venues: [],
    dates: [],
    events: [],
    settings: {},
    loaded: false,

    // ---- 專案設定 ----
    updateSettings: (patch) => commit({ settings: { ...get().settings, ...patch } }),

    // ---- 賽程 ----
    addEvent: (init) => {
      const id = typeof init.id === 'string' && init.id ? init.id : newId('ev');
      commit({ events: [...get().events, createEvent(init, id)] });
      return id;
    },
    updateEvent: (id, patch) => mapEvent(id, (ev) => ({ ...ev, ...patch, id })),
    setEventTime: (id, startMin, endMin) => {
      if (!get().events.some((e) => e.id === id)) return;
      commit({ events: setEventTime(get().events, id, startMin, endMin) });
    },
    moveEvent: (id, startMin, venueId) => {
      if (!get().events.some((e) => e.id === id)) return;
      // 傳入場地順序：跨多個場地的賽程換場地時保留跨度（與舊版相同）
      const venueOrder = get().venues.map((v) => v.id);
      commit({ events: moveEvent(get().events, id, startMin, venueId, venueOrder) });
    },
    duplicateEvent: (id) => {
      if (!get().events.some((e) => e.id === id)) return '';
      const copyId = newId('ev');
      commit({ events: duplicateEvent(get().events, id, copyId) });
      return copyId;
    },
    deleteEvent: (id) => {
      const events = get().events.filter((e) => e.id !== id);
      if (events.length === get().events.length) return;
      commit({ events });
      if (useSession.getState().selectedEventId === id) useSession.getState().selectEvent(null);
    },

    // ---- 現場調度（舊版 triggerLiveActualStart / End / resetLiveActualRecords） ----
    // 對齊網格、移動方塊與磁吸連動都在 @shared/schedule；min 預設為目前時鐘（真實或模擬時間）
    markActualStart: (id, min) => {
      if (!get().events.some((e) => e.id === id)) return;
      commit({ events: markActualStart(get().events, id, min ?? currentClockMin()) });
    },
    markActualEnd: (id, min) => {
      if (!get().events.some((e) => e.id === id)) return;
      commit({ events: markActualEnd(get().events, id, min ?? currentClockMin()) });
    },
    resetActual: (id) => {
      if (!get().events.some((e) => e.id === id)) return;
      commit({ events: resetActual(get().events, id) });
    },
    delaySubsequent: (id, deltaMin) => {
      // deltaMin = 0 也要執行：等同舊版「後續賽程往後推到不重疊」按鈕
      if (!get().events.some((e) => e.id === id)) return;
      commit({ events: delaySubsequent(get().events, id, deltaMin) });
    },

    // ---- 場地 ----
    addVenue: (init) => {
      const id = typeof init?.id === 'string' && init.id ? init.id : newId('V');
      const venue: Venue = { name: `新場地 ${get().venues.length + 1}`, subtitle: '', ...init, id };
      commit({ venues: [...get().venues, venue] });
      return id;
    },
    updateVenue: (id, patch) => {
      const { venues } = get();
      if (!venues.some((v) => v.id === id)) return;
      commit({ venues: venues.map((v) => (v.id === id ? { ...v, ...patch, id } : v)) });
    },
    deleteVenue: (id) => {
      // 舊版 deleteVenueByIndex：至少保留一個場地；賽程移除此場地，沒有場地的改到第一個場地
      const venues = get().venues.filter((v) => v.id !== id);
      if (venues.length === get().venues.length || venues.length === 0) return;
      const fallback = venues[0].id;
      const events = get().events.map((ev) => {
        if (!ev.venueIds.includes(id)) return ev;
        const venueIds = ev.venueIds.filter((v) => v !== id);
        return { ...ev, venueIds: venueIds.length ? venueIds : [fallback] };
      });
      commit({ venues, events });
      fixSessionRefs(get());
    },

    // ---- 比賽日與司令台 ----
    addDay: (init) => {
      const id = typeof init.id === 'string' && init.id ? init.id : newId('date');
      commit({ dates: [...get().dates, normalizeDay({ commandDeckEnabled: false, ...init, id })] });
      return id;
    },
    updateDay: (id, patch) => mapDay(id, (d) => ({ ...d, ...patch, id })),
    deleteDay: (id) => {
      // 舊版 deleteDateConfirm：至少保留一天；同時刪除該日的賽程
      const dates = get().dates.filter((d) => d.id !== id);
      if (dates.length === get().dates.length || dates.length === 0) return;
      commit({ dates, events: get().events.filter((e) => e.dateId !== id) });
      fixSessionRefs(get());
    },
    upsertCommandSlot: (dayId, slot) => {
      if (!get().dates.some((d) => d.id === dayId)) return '';
      const id = slot.id || newId('cmd');
      mapDay(dayId, (d) => {
        const slots = d.commandSlots ?? [];
        // Omit<> 遇到索引簽章會丟掉已知欄位，這裡明確轉型
        const next = { ...slot, id } as CommandSlot;
        return {
          ...d,
          commandSlots: slots.some((s) => s.id === id)
            ? slots.map((s) => (s.id === id ? { ...s, ...next } : s))
            : [...slots, next],
        };
      });
      return id;
    },
    deleteCommandSlot: (dayId, slotId) =>
      mapDay(dayId, (d) => ({ ...d, commandSlots: (d.commandSlots ?? []).filter((s) => s.id !== slotId) })),

    replaceAll: (data, origin) => {
      const venues = Array.isArray(data.venues) ? data.venues : [];
      // 沒有場地的賽程（舊資料）放到第一個場地
      const fallbackVenue = venues[0]?.id;
      const next: ProjectData = {
        venues,
        dates: (Array.isArray(data.dates) ? data.dates : []).map((d) => normalizeDay(d)),
        events: (Array.isArray(data.events) ? data.events : []).map((e) => normalizeEvent(e, fallbackVenue)),
        settings: data.settings && typeof data.settings === 'object' ? data.settings : {},
      };
      set({ ...next, loaded: true });
      fixSessionRefs(next);
      if (origin === 'local') notifyLocal();
    },
  };
});

/** 目前的賽程資料（不含 actions），上傳與快取用 */
export function projectSnapshot(): ProjectData {
  const { venues, dates, events, settings } = useProject.getState();
  return { venues, dates, events, settings: settings ?? {} };
}
