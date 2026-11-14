import type { ProjectRoom } from './project-room.ts';

/** Worker 與 Durable Object 共用的綁定（對應 wrangler.jsonc） */
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  PROJECT_ROOM: DurableObjectNamespace<ProjectRoom>;
  /** 管理者密碼（只放在 .dev.vars／Secrets，不進版控） */
  ADMIN_TOKEN: string;
}

/** Worker 轉交 WebSocket 升級請求給 ProjectRoom 時，用這個標頭帶入目前版本號 */
export const UPDATED_AT_HEADER = 'X-Project-Updated-At';
