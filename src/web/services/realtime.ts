// I4 / J4：即時同步連線（WebSocket，自動重連；連不上時退回輪詢）

import { PING, parseServerMessage, type ServerMessage } from '@shared/realtime';
import { wsUrl } from './api';

/** 心跳間隔 */
export const PING_INTERVAL_MS = 25_000;
/** 重連等待時間：1 秒起每次加倍，最多 30 秒（另加隨機抖動） */
export const RECONNECT_BASE_MS = 1_000;
export const RECONNECT_MAX_MS = 30_000;
/** 連續失敗幾次後退回輪詢 */
export const MAX_WS_FAILURES = 3;
/** 輪詢間隔（備援） */
export const POLL_INTERVAL_MS = 30_000;
/** 輪詢期間，每隔多久再試一次 WebSocket */
export const WS_RETRY_WHILE_POLLING_MS = 60_000;

export type TransportState = 'connecting' | 'live' | 'polling';

export interface RealtimeOptions {
  projectId: string;
  /** 收到伺服器訊息 */
  onMessage(msg: ServerMessage): void;
  /** WebSocket 連線成功（含重連）：應立即查一次版本號，避免漏掉斷線期間的更新 */
  onOpen(): void;
  /** 輪詢時間到：查版本號 */
  onPoll(): void;
  /** 連線方式改變 */
  onStateChange(state: TransportState): void;
}

export interface RealtimeHandle {
  /** 立即重試連線（網路恢復、畫面回到前景時呼叫） */
  wake(): void;
  stop(): void;
  readonly state: TransportState;
}

/** 重連等待時間（含 ±25% 抖動，避免所有手機同時重連） */
export function backoffDelay(failures: number, random = Math.random): number {
  const base = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.max(0, failures - 1));
  return Math.round(Math.min(RECONNECT_MAX_MS, base * (0.75 + random() * 0.5)));
}

export function startRealtime(opts: RealtimeOptions): RealtimeHandle {
  let ws: WebSocket | null = null;
  let stopped = false;
  let failures = 0;
  let state: TransportState = 'connecting';
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const setState = (next: TransportState) => {
    if (next === state) return;
    state = next;
    opts.onStateChange(next);
  };

  const clearRetry = () => {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
  };
  const clearPing = () => {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
  };
  const stopPolling = () => {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  };

  const startPolling = () => {
    setState('polling');
    if (!pollTimer) {
      pollTimer = setInterval(() => opts.onPoll(), POLL_INTERVAL_MS);
      // 剛退回輪詢時先查一次
      opts.onPoll();
    }
  };

  const scheduleRetry = (delay: number) => {
    clearRetry();
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, delay);
  };

  const detach = (sock: WebSocket) => {
    sock.onopen = null;
    sock.onmessage = null;
    sock.onclose = null;
    sock.onerror = null;
  };

  const handleFailure = () => {
    failures++;
    if (failures >= MAX_WS_FAILURES) {
      startPolling();
      scheduleRetry(WS_RETRY_WHILE_POLLING_MS);
    } else {
      if (!pollTimer) setState('connecting');
      scheduleRetry(backoffDelay(failures));
    }
  };

  function connect() {
    if (stopped || ws) return;
    clearRetry();
    if (typeof WebSocket === 'undefined') {
      // 瀏覽器不支援：只用輪詢
      failures = MAX_WS_FAILURES;
      startPolling();
      return;
    }
    let sock: WebSocket;
    try {
      sock = new WebSocket(wsUrl(opts.projectId));
    } catch {
      handleFailure();
      return;
    }
    ws = sock;
    sock.onopen = () => {
      if (stopped) return;
      failures = 0;
      stopPolling();
      setState('live');
      clearPing();
      pingTimer = setInterval(() => {
        try {
          if (sock.readyState === 1) sock.send(PING);
        } catch {
          // 送不出去時等 onclose 處理
        }
      }, PING_INTERVAL_MS);
      opts.onOpen();
    };
    sock.onmessage = (ev: MessageEvent) => {
      if (stopped || typeof ev.data !== 'string') return;
      const msg = parseServerMessage(ev.data);
      if (msg) opts.onMessage(msg);
    };
    sock.onerror = () => {
      // 之後一定會觸發 onclose，在那裡處理
    };
    sock.onclose = () => {
      detach(sock);
      if (ws === sock) ws = null;
      clearPing();
      if (stopped) return;
      handleFailure();
    };
  }

  connect();

  return {
    get state() {
      return state;
    },
    wake() {
      if (stopped || ws) return;
      // 已經在輪詢時保留失敗次數（再失敗就繼續輪詢）；否則重新從 1 秒開始退避
      if (!pollTimer) failures = 0;
      connect();
    },
    stop() {
      stopped = true;
      clearRetry();
      clearPing();
      stopPolling();
      if (ws) {
        const sock = ws;
        ws = null;
        detach(sock);
        try {
          sock.close(1000, 'stop');
        } catch {
          // 已關閉
        }
      }
    },
  };
}
