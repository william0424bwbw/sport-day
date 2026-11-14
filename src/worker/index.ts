// @ts-nocheck -- 由 sub-agent 轉成正式 TypeScript（I3）
import { readProject, readVersion, validatePayload, writeProject } from './db.ts';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

// 用固定時間比較，避免 timing attack
function safeEqual(a = '', b = '') {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function isAdmin(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return Boolean(env.ADMIN_TOKEN) && safeEqual(token, env.ADMIN_TOKEN);
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

async function handleApi(request, env, url) {
  // /api/health
  if (url.pathname === '/api/health') return json({ ok: true });

  // /api/auth：檢查 Authorization 標頭裡的管理者密碼是否正確（不寫入任何資料）
  if (url.pathname === '/api/auth' && request.method === 'GET') {
    return json({ admin: isAdmin(request, env) });
  }

  // /api/projects/:id  與  /api/projects/:id/version
  const m = url.pathname.match(/^\/api\/projects\/([^/]+)(\/version)?$/);
  if (!m || !ID_RE.test(m[1])) return json({ error: 'not_found' }, 404);
  const [, id, versionOnly] = m;

  if (request.method === 'GET') {
    if (versionOnly) return json({ updatedAt: await readVersion(env.DB, id) });
    return json(await readProject(env.DB, id));
  }

  if (request.method === 'PUT' && !versionOnly) {
    if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
    const problem = validatePayload(body);
    if (problem) return json({ error: 'invalid_payload', message: problem }, 400);

    const updatedAt = await writeProject(env.DB, id, body);
    return json({ ok: true, updatedAt });
  }

  return json({ error: 'method_not_allowed' }, 405);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url);
      } catch (err) {
        console.error(err);
        return json({ error: 'internal_error' }, 500);
      }
    }
    // 其他路徑交給靜態資源（public/）
    return env.ASSETS.fetch(request);
  },
};

// Durable Object：每場運動會一個，管理 WebSocket 連線與廣播（§J，I4 實作）
export { ProjectRoom } from './project-room.ts';
