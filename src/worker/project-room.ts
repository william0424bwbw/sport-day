import { DurableObject } from 'cloudflare:workers';
import { PING, PONG, type ServerMessage } from '../shared/realtime.ts';
import { UPDATED_AT_HEADER, type Env } from './env.ts';

// 每場運動會（projectId）一個實例，負責 WebSocket 連線與「有新版本」廣播（§J）。
// 使用 WebSocket Hibernation API：沒有訊息時 Durable Object 會休眠，不計執行時間。
// 資料仍以 D1 為準，這裡只負責通知，不保存賽程。
export class ProjectRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // 心跳由執行環境自動回覆，不喚醒 Durable Object
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  /** 由 Worker 轉交的 WebSocket 升級請求（Worker 已檢查專案代碼與 Upgrade 標頭） */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('需要 WebSocket 連線', { status: 426 });
    }

    const raw = request.headers.get(UPDATED_AT_HEADER);
    const parsed = raw ? Number(raw) : NaN;
    const updatedAt = Number.isFinite(parsed) ? parsed : null;

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);

    const online = this.openSockets().length;
    this.send(server, { type: 'hello', updatedAt, online });
    this.broadcast({ type: 'presence', online });

    return new Response(null, { status: 101, webSocket: client });
  }

  /** RPC：管理者儲存成功後由 Worker 呼叫，通知所有裝置下載新版本 */
  async notifyUpdated(updatedAt: number): Promise<void> {
    this.broadcast({ type: 'updated', updatedAt });
  }

  // 前端目前只會送心跳（已由 setWebSocketAutoResponse 處理），其他訊息一律忽略
  async webSocketMessage(_ws: WebSocket, _message: string | ArrayBuffer): Promise<void> {}

  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    this.closeQuietly(ws);
    this.broadcastPresence(ws);
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    this.closeQuietly(ws);
    this.broadcastPresence(ws);
  }

  /** 目前仍開著的連線（可排除正在關閉的那一條） */
  private openSockets(exclude?: WebSocket): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => ws !== exclude && ws.readyState === WebSocket.OPEN);
  }

  private broadcastPresence(closed: WebSocket): void {
    const sockets = this.openSockets(closed);
    const message: ServerMessage = { type: 'presence', online: sockets.length };
    for (const ws of sockets) this.send(ws, message);
  }

  private broadcast(message: ServerMessage): void {
    for (const ws of this.openSockets()) this.send(ws, message);
  }

  /** 單一連線送出失敗（例如對方剛斷線）不影響其他連線 */
  private send(ws: WebSocket, message: ServerMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch (err) {
      console.warn('WebSocket 送出失敗', err);
    }
  }

  private closeQuietly(ws: WebSocket): void {
    try {
      ws.close(1000, 'bye');
    } catch {
      // 已經關閉
    }
  }
}
