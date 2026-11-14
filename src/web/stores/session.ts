// I3：工作階段 store（角色、密碼、選取、篩選、時鐘、同步狀態；實作 SessionStore 合約）
import { create } from 'zustand';
import { DEFAULT_PROJECT_ID } from '@shared/constants';
import type { SessionStore } from './contracts';

export const useSession = create<SessionStore>((set) => ({
  role: 'teacher',
  projectId: DEFAULT_PROJECT_ID,
  adminToken: '',
  currentDayId: null,
  selectedEventId: null,
  filter: { grade: null, venueId: null, query: '' },
  clock: { mode: 'real', simMin: 610, autoplay: false },
  sync: { connection: 'connecting', pending: false, updatedAt: null, adminVerified: false, online: null, error: null },
  setRole: (role) => set({ role }),
  setAdminToken: (adminToken) => set({ adminToken }),
  setProjectId: (projectId) => set({ projectId }),
  setCurrentDay: (currentDayId) => set({ currentDayId }),
  selectEvent: (selectedEventId) => set({ selectedEventId }),
  setFilter: (patch) => set((s) => ({ filter: { ...s.filter, ...patch } })),
  clearFilter: () => set({ filter: { grade: null, venueId: null, query: '' } }),
  setClock: (patch) => set((s) => ({ clock: { ...s.clock, ...patch } })),
  setSync: (patch) => set((s) => ({ sync: { ...s.sync, ...patch } })),
}));
