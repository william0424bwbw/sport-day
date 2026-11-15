// 本機儲存（localStorage）：設定與離線快取。所有讀寫都包 try/catch（無痕模式、空間不足時不會讓程式中斷）

import type { ProjectData } from '@shared/types';

/** 新版所有 localStorage key 的前綴 */
export const STORAGE_PREFIX = 'sport-day:v1:';
/** 舊版雲端設定（adminToken、projectId），首次載入時搬到新版 */
export const LEGACY_CLOUD_CFG_KEY = 'school_sports_day_cloud_cfg_v1';

export const KEYS = {
  adminToken: `${STORAGE_PREFIX}adminToken`,
  projectId: `${STORAGE_PREFIX}projectId`,
  role: `${STORAGE_PREFIX}role`,
  simMin: `${STORAGE_PREFIX}simMin`,
  /** 已處理過舊版設定搬移 */
  legacyMigrated: `${STORAGE_PREFIX}legacyMigrated`,
  cache: (projectId: string) => `${STORAGE_PREFIX}cache:${projectId}`,
} as const;

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readString(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** 寫入字串；value 為 null 時刪除。回傳是否成功（空間不足時為 false） */
export function writeString(key: string, value: string | null): boolean {
  const s = storage();
  if (!s) return false;
  try {
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function readJSON<T>(key: string): T | null {
  const raw = readString(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJSON(key: string, value: unknown): boolean {
  try {
    return writeString(key, JSON.stringify(value));
  } catch {
    return false;
  }
}

/** 離線快取：最後一次看到的賽程，加上版本號與「有尚未上傳的修改」標記 */
export interface CachedProject extends ProjectData {
  /** 這份資料所根據的雲端版本（null = 從未與雲端同步） */
  updatedAt: number | null;
  /** 有尚未上傳到雲端的修改（離線時編輯） */
  pending: boolean;
}

export function loadCache(projectId: string): CachedProject | null {
  const c = readJSON<Partial<CachedProject>>(KEYS.cache(projectId));
  if (!c || !Array.isArray(c.events)) return null;
  return {
    venues: Array.isArray(c.venues) ? c.venues : [],
    dates: Array.isArray(c.dates) ? c.dates : [],
    events: c.events,
    // 聯絡窗口等專案設定也要快取，否則離線或版本相同時會顯示不出來
    settings: c.settings && typeof c.settings === 'object' && !Array.isArray(c.settings) ? c.settings : {},
    updatedAt: typeof c.updatedAt === 'number' ? c.updatedAt : null,
    pending: c.pending === true,
  };
}

export function saveCache(projectId: string, cache: CachedProject): boolean {
  return writeJSON(KEYS.cache(projectId), cache);
}
