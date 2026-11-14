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

  // /api/projects/:id  與  /api/projects/:id/version
  const m = url.pathname.match(/^\/api\/projects\/([^/]+)(\/version)?$/);
  if (!m || !ID_RE.test(m[1])) return json({ error: 'not_found' }, 404);
  const [, id, versionOnly] = m;

  if (request.method === 'GET') {
    if (versionOnly) {
      const row = await env.DB.prepare('SELECT updated_at FROM projects WHERE id = ?')
        .bind(id).first();
      return json({ updatedAt: row?.updated_at ?? null });
    }
    const row = await env.DB.prepare('SELECT data, updated_at FROM projects WHERE id = ?')
      .bind(id).first();
    if (!row) return json(null);
    return json({ ...JSON.parse(row.data), updatedAt: row.updated_at });
  }

  if (request.method === 'PUT' && !versionOnly) {
    if (!isAdmin(request, env)) return json({ error: 'unauthorized' }, 401);

    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
    if (!body || !Array.isArray(body.events)) return json({ error: 'invalid_payload' }, 400);

    const updatedAt = Date.now();
    const data = JSON.stringify({
      venues: body.venues ?? [],
      dates: body.dates ?? [],
      events: body.events,
    });
    await env.DB.prepare(
      `INSERT INTO projects (id, data, updated_at) VALUES (?1, ?2, ?3)
       ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
    ).bind(id, data, updatedAt).run();

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
