// I3：賽程資料 store（實作 ProjectStore 合約）
import { create } from 'zustand';
import type { ProjectStore } from './contracts';

const notReady = () => {
  throw new Error('project store 尚未實作');
};

export const useProject = create<ProjectStore>(() => ({
  venues: [],
  dates: [],
  events: [],
  loaded: false,
  addEvent: notReady,
  updateEvent: notReady,
  setEventTime: notReady,
  moveEvent: notReady,
  duplicateEvent: notReady,
  deleteEvent: notReady,
  markActualStart: notReady,
  markActualEnd: notReady,
  resetActual: notReady,
  delaySubsequent: notReady,
  addVenue: notReady,
  updateVenue: notReady,
  deleteVenue: notReady,
  addDay: notReady,
  updateDay: notReady,
  deleteDay: notReady,
  upsertCommandSlot: notReady,
  deleteCommandSlot: notReady,
  replaceAll: notReady,
}));
