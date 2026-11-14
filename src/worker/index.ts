import { describeIssues, projectDataSchema } from '../shared/schema.ts';
import { readProject, readVersion, writeProject } from './db.ts';
import { UPDATED_AT_HEADER, type Env } from './env.ts';

// 注意：src/worker 內一律用相對路徑引用共用程式（wrangler 的 esbuild 不讀 @shared/* 別名）

export type { Env } from './env.ts';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

// 用固定時間比較，避免 timing attack
function safeEqual(a = '', b = ''): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function isAdmin(request: Request, env: Env): boolean {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return Boolean(env.ADMIN_TOKEN) && safeEqual(token, env.ADMIN_TOKEN);
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** 取得這場運動會的 Durable Object（每個 projectId 一個實例） */
const roomFor = (env: Env, id: string) => env.PROJECT_ROOM.get(env.PROJECT_ROOM.idFromName(id));

/** 廣播新版本號；任何錯誤只記錄，不往外拋 */
async function notifyRoom(env: Env, id: string, updatedAt: number): Promise<void> {
  try {
    await roomFor(env, id).notifyUpdated(updatedAt);
  } catch (err) {
    console.error('廣播更新失敗', err);
  }
}

async function handleApi(request: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  // /api/health
  if (url.pathname === '/api/health') return json({ ok: true });

  // /api/auth：檢查 Authorization 標頭裡的管理者密碼是否正確（不寫入任何資料）
  if (url.pathname === '/api/auth' && request.method === 'GET') {
    return json({ admin: isAdmin(request, env) });
  }

  // /api/projects/:id、/api/projects/:id/version、/api/projects/:id/ws
  const m = url.pathname.match(/^\/api\/projects\/([^/]+)(?:\/(version|ws))?$/);
  if (!m || !ID_RE.test(m[1])) return json({ error: 'not_found' }, 404);
  const id = m[1];
  const sub = m[2] as 'version' | 'ws' | undefined;

  // WebSocket：即時接收「有新版本」通知（§J）
  if (sub === 'ws') {
    if (request.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return json({ error: 'upgrade_required', message: '這個網址需要 WebSocket 連線' }, 426);
    }
    const updatedAt = await readVersion(env.DB, id);
    const headers = new Headers(request.headers);
    if (updatedAt !== null) headers.set(UPDATED_AT_HEADER, String(updatedAt));
    else headers.delete(UPDATED_AT_HEADER);
    return roomFor(env, id).fetch(new Request(request, { headers }));
  }

  if (request.method === 'GET') {
    if (sub === 'version') return json({ updatedAt: await readVersion(env.DB, id) });
    return json(await readProject(env.DB, id));
  }

  if (request.method === 'PUT' && !sub) {
    if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'bad_json' }, 400);
    }
    const parsed = projectDataSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: 'invalid_payload', message: describeIssues(parsed.error) }, 400);
    }

    const updatedAt = await writeProject(env.DB, id, parsed.data);
    // 通知所有連線中的裝置；廣播失敗不影響這次儲存（資料已寫入 D1）
    ctx.waitUntil(notifyRoom(env, id, updatedAt));
    return json({ ok: true, updatedAt });
  }

  return json({ error: 'method_not_allowed' }, 405);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, ctx, url);
      } catch (err) {
        console.error(err);
        return json({ error: 'internal_error' }, 500);
      }
    }
    // 其他路徑交給靜態資源（dist/）
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

// Durable Object：每場運動會一個，管理 WebSocket 連線與廣播（§J）
export { ProjectRoom } from './project-room.ts';
