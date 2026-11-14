// API client：與網頁同網域的 /api/...（Worker 提供）

import type { ProjectData, ProjectResponse } from '@shared/types';

/** API 回應錯誤（status 0 = 網路錯誤、連不上） */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** 專案代碼只允許英數、底線、連字號（與 Worker 一致） */
export const PROJECT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export const projectPath = (id: string) => `/api/projects/${encodeURIComponent(id)}`;

/** WebSocket 網址：依目前頁面的 http/https 決定 ws/wss */
export function wsUrl(id: string): string {
  const loc = typeof location === 'undefined' ? null : location;
  if (!loc) return `ws://localhost${projectPath(id)}/ws`;
  const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${loc.host}${projectPath(id)}/ws`;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store', ...init });
  } catch {
    throw new ApiError(0, '無法連線雲端，請檢查網路');
  }
  if (!res.ok) {
    let message = `雲端回應錯誤（HTTP ${res.status}）`;
    try {
      const body = (await res.json()) as { message?: string; error?: string };
      if (body?.message) message = body.message;
    } catch {
      // 回應不是 JSON
    }
    throw new ApiError(res.status, message);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError(res.status, '雲端回應格式錯誤');
  }
}

/** 下載整份賽程；雲端還沒有這個專案時回傳 null */
export async function fetchProject(id: string): Promise<ProjectResponse | null> {
  const data = await request<ProjectResponse | null>(projectPath(id));
  return data && Array.isArray(data.events) ? data : null;
}

/** 只查版本號（很輕量） */
export async function fetchVersion(id: string): Promise<number | null> {
  const data = await request<{ updatedAt: number | null }>(`${projectPath(id)}/version`);
  return typeof data?.updatedAt === 'number' ? data.updatedAt : null;
}

/** 上傳整份賽程（需要管理者密碼），回傳新的版本號 */
export async function putProject(id: string, data: ProjectData, token: string): Promise<number> {
  const body: ProjectData = { venues: data.venues, dates: data.dates, events: data.events };
  const res = await request<{ updatedAt: number }>(projectPath(id), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return res.updatedAt;
}

/** 檢查管理者密碼是否正確 */
export async function checkAdmin(token: string): Promise<boolean> {
  if (!token) return false;
  const res = await request<{ admin?: boolean }>('/api/auth', {
    headers: { Authorization: `Bearer ${token}` },
  });
  return Boolean(res?.admin);
}
