// WebSocket 訊息格式（Durable Object ProjectRoom ⇄ 前端）

/** 伺服器 → 前端 */
export type ServerMessage =
  /** 連線成功，附上目前版本號與線上人數 */
  | { type: 'hello'; updatedAt: number | null; online: number }
  /** 賽程已更新，前端應重新下載（若 updatedAt 與本機不同） */
  | { type: 'updated'; updatedAt: number }
  /** 線上人數變動 */
  | { type: 'presence'; online: number };

/** 前端 → 伺服器（目前只有心跳；心跳由 setWebSocketAutoResponse 自動回覆，不喚醒 Durable Object） */
export const PING = 'ping';
export const PONG = 'pong';

export function parseServerMessage(raw: string): ServerMessage | null {
  try {
    const msg = JSON.parse(raw) as ServerMessage;
    if (msg && typeof msg === 'object' && typeof msg.type === 'string') return msg;
  } catch {
    // 非 JSON（例如 pong）
  }
  return null;
}
