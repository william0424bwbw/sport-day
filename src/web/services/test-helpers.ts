// 單元測試用的替身：localStorage、WebSocket、fetch（只給 *.test.ts 使用，不會被 App 引用）

import type { ProjectResponse, ScheduleEvent } from '@shared/types';

export class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
}

type Handler = ((ev: never) => void) | null;

/** 假的 WebSocket：測試用 open() / message() / fail() 控制 */
export class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static reset() {
    FakeWebSocket.instances = [];
  }
  static get last(): FakeWebSocket {
    return FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  }
  readyState = 0;
  sent: string[] = [];
  closed = false;
  onopen: Handler = null;
  onmessage: Handler = null;
  onclose: Handler = null;
  onerror: Handler = null;
  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.closed = true;
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    (this.onopen as ((ev: unknown) => void) | null)?.({});
  }
  message(obj: unknown) {
    (this.onmessage as ((ev: unknown) => void) | null)?.({ data: JSON.stringify(obj) });
  }
  fail() {
    this.readyState = 3;
    (this.onerror as ((ev: unknown) => void) | null)?.({});
    (this.onclose as ((ev: unknown) => void) | null)?.({});
  }
}

export function ev(id: string, extra: Partial<ScheduleEvent> = {}): ScheduleEvent {
  return {
    id,
    dateId: 'd1',
    venueIds: ['A'],
    startMin: 540,
    endMin: 560,
    checkInOffsetMin: 10,
    linkPrev: false,
    title: id,
    color: 'blue',
    referees: [],
    equipment: [],
    attachments: [],
    actualStartMin: null,
    actualEndMin: null,
    ...extra,
  };
}

export function project(updatedAt: number, events: ScheduleEvent[]): ProjectResponse {
  return { updatedAt, venues: [{ id: 'A', name: 'A 場' }], dates: [{ id: 'd1', label: '第一天' }], events };
}

interface Call {
  method: string;
  url: string;
  body?: unknown;
  auth?: string;
}

/** 假的 API 伺服器（取代 fetch） */
export class FakeServer {
  project: ProjectResponse | null = null;
  adminToken = 'secret';
  /** true = 模擬斷線（fetch reject） */
  down = false;
  /** 下一次 PUT 回傳的狀態碼（例如 401、500） */
  putStatus: number | null = null;
  /** 設定後 PUT 會等到 release() 才回應 */
  private gate: { promise: Promise<void>; release: () => void } | null = null;
  calls: Call[] = [];
  private nextVersion = 100;

  holdPuts() {
    let release!: () => void;
    const promise = new Promise<void>((r) => (release = r));
    this.gate = { promise, release };
  }
  releasePuts() {
    const g = this.gate;
    this.gate = null;
    g?.release();
  }

  count(method: string, url: string) {
    return this.calls.filter((c) => c.method === method && c.url === url).length;
  }

  fetch = async (input: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    const headers = (init.headers ?? {}) as Record<string, string>;
    const call: Call = { method, url: input, auth: headers.Authorization };
    if (init.body) call.body = JSON.parse(String(init.body));
    this.calls.push(call);
    if (this.down) throw new TypeError('Failed to fetch');
    const respond = (status: number, body: unknown) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    });
    if (input === '/api/auth') return respond(200, { admin: call.auth === `Bearer ${this.adminToken}` });
    const m = /^\/api\/projects\/([^/]+)(\/version)?$/.exec(input);
    if (!m) return respond(404, { error: 'not_found' });
    if (method === 'GET') {
      if (m[2]) return respond(200, { updatedAt: this.project?.updatedAt ?? null });
      return respond(200, this.project ? structuredClone(this.project) : null);
    }
    if (method === 'PUT') {
      if (this.gate) await this.gate.promise;
      if (this.down) throw new TypeError('Failed to fetch');
      if (this.putStatus) {
        const status = this.putStatus;
        this.putStatus = null;
        return respond(status, { error: 'x', message: '資料格式錯誤' });
      }
      if (call.auth !== `Bearer ${this.adminToken}`) return respond(401, { error: 'unauthorized' });
      const updatedAt = ++this.nextVersion;
      this.project = { ...(call.body as ProjectResponse), updatedAt };
      return respond(200, { ok: true, updatedAt });
    }
    return respond(405, {});
  };
}
