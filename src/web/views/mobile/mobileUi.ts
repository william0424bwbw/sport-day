// 手機版畫面狀態（只在手機排版使用）：目前場地、賽程表單
// 賽程細節面板沿用 session.selectedEventId（刪除賽程時 store 會自動清除）
import { create } from 'zustand';
import type { ScheduleEvent, Venue } from '@shared/types';
import { useProject } from '../../stores/project';

export type EditorInit = Partial<ScheduleEvent> & { dateId: string; venueIds: string[]; startMin: number };

/** 賽程表單：編輯既有賽程，或以初始值新增 */
export type EditorState = { eventId: string } | { init: EditorInit } | null;

interface MobileUiState {
  /** 場地頁選取的場地（null = 第一個場地） */
  venueId: string | null;
  editor: EditorState;
  setVenueId(id: string | null): void;
  openEditor(editor: EditorState): void;
  closeEditor(): void;
}

export const useMobileUi = create<MobileUiState>((set) => ({
  venueId: null,
  editor: null,
  setVenueId: (venueId) => set({ venueId }),
  openEditor: (editor) => set({ editor }),
  closeEditor: () => set({ editor: null }),
}));

/** 場地頁目前的場地：選取的場地不存在時用第一個場地 */
export function useMobileVenue(): Venue | null {
  const venues = useProject((s) => s.venues);
  const venueId = useMobileUi((s) => s.venueId);
  return venues.find((v) => v.id === venueId) ?? venues[0] ?? null;
}
