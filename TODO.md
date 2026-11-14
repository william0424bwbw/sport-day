# TODO：遷移至 Cloudflare Workers + D1

目標：把前端（`index.html`）和後端 API 都放到 **同一個 Cloudflare Worker**，資料存在 **D1**，取代目前的 Firebase REST 同步。
之後的建立、遷移、部署和設定密鑰都交給 **腳本 / GitHub Actions** 處理，不用到 Dashboard 手動上傳。

---

## 專案規範（必須遵守）
- **腳本一律寫成 `.sh`，用 Git Bash 執行**（`#!/usr/bin/env bash`）。不寫 `.ps1`、`.bat`、`.cmd`，`package.json` 的 scripts 也只呼叫 `bash scripts/*.sh` 或跨平台指令。
- **所有文字檔一律 UTF-8（無 BOM）+ LF**。
  - `.gitattributes` 設定 `* text=auto eol=lf`，覆蓋本機的 `core.autocrlf=true`
  - `.editorconfig` 與 `.vscode/settings.json` 設定 `utf-8` 與 `lf`
  - 不要用 PowerShell 的 `Set-Content` 或 `Out-File` 寫檔，它們預設會寫成 ANSI 或帶 BOM 的檔案
- 新增腳本後執行 `git update-index --chmod=+x scripts/<名稱>.sh`，讓 CI（Linux）也能直接執行。

---

## 0. 架構總覽

```
瀏覽器 ──► https://sport-day.<子網域>.workers.dev
            │
            ├─ /            → Worker 靜態資源 (public/index.html)
            └─ /api/*       → Worker 程式 (src/worker.js)
                               └─ D1 資料庫 sport-day-db
                                  └─ projects 表（每個專案一列 JSON）
```

- **讀取**（老師、工作人員）：不用驗證，`GET /api/projects/:id`
- **寫入**（管理者）：要帶 `Authorization: Bearer <ADMIN_TOKEN>`，`PUT /api/projects/:id`
- **輪詢**：前端每 4 秒打一次輕量的 `GET /api/projects/:id/version`，版本有變才抓完整資料，可以省下 D1 讀取量

---

## 1. 步驟清單

### A. 一次性準備（只做一次）
- [x] 安裝 Node.js LTS（目前電腦上沒有；這台 Windows LTSC 沒有 winget）：到 https://nodejs.org 下載 **LTS 版 Windows Installer (.msi, x64)**，用預設選項安裝，裝完**完全關閉並重開 VS Code**，在 Git Bash 用 `node -v && npm -v` 確認
- [x] 註冊或登入 Cloudflare，在 Dashboard 右側記下 **Account ID**
- [x] 建立 **API Token**（My Profile → API Tokens → Create Custom Token），權限如下：
  - Account › **Workers Scripts** › Edit
  - Account › **D1** › Edit
  - Account › **Account Settings** › Read
  - User › **User Details** › Read
  - User › **Memberships** › Read
  - Account Resources：只勾自己的帳號
- [x] 產生一組管理者密碼 `ADMIN_TOKEN`（隨機字串，例如 `openssl rand -hex 24`）
- [x] 複製 `.env.example` 成 `.env`，填入上面三個值（`.env` **不可以 commit**）

### B. 調整專案結構
- [x] 把 `index.html` 移到 `public/index.html`（`git mv index.html public/index.html`）
- [x] 依照「§2 樣板」新增這些檔案：`package.json`、`wrangler.jsonc`、`src/worker.js`、`migrations/0001_init.sql`、`.env.example`、`.gitignore`、`scripts/*.sh`、`.github/workflows/deploy.yml`
- [x] `npm install`

### C. 建立 Worker 與 D1（用腳本，一次性）
- [x] `bash scripts/bootstrap.sh`，會依序：
  1. 建立 D1 資料庫 `sport-day-db`，並把 `database_id` 自動寫回 `wrangler.jsonc`
  2. 在遠端 D1 套用 migrations
  3. 第一次部署 Worker（Worker 會在這一步自動建立）
  4. 把 `ADMIN_TOKEN` 設成 Worker secret
- [x] commit 更新過的 `wrangler.jsonc`（只有 `database_id`，不是機密）

### D. 改寫前端同步邏輯（`public/index.html`）
- [x] 把 `getCloudEndpointUrl()` 改成同網域的 `/api/projects/<projectId>`
- [x] `pushLocalToCloudNow()`：PUT 時加上 `Authorization: Bearer <adminToken>` 標頭
- [x] `pollCloudUpdates()`：先打 `/version`，`updatedAt` 有變才 GET 完整資料
- [x] 「雲端同步設定」視窗：把 Firebase 網址欄位改成「管理者密碼」欄位（存在 localStorage，只有管理者需要填）
- [x] 部署在 Worker 上時，預設自動連線（不用再輸入網址）
- [x] 把 Lucide 鎖定版本，已鎖定 `lucide@1.66.0`，Tailwind 鎖定 `3.4.17`
- [x] 把舊的 Firebase 資料搬到 D1（2026-11-14 完成：7 場地、5 日、33 筆賽程）

### E. CI/CD 自動部署
- [ ] 在 GitHub repo → Settings → Secrets and variables → Actions 新增：
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
  - `ADMIN_TOKEN`
- [ ] 之後 **push 到 `main` 就會自動執行**：套用 D1 migrations → 部署 Worker → 同步 secret
- [ ] 確認部署網址可以正常開啟，三種角色（admin / staff / teacher）都測試一遍

### F. 日常維護（全部用腳本）
| 要做的事 | 指令 |
|---|---|
| 本機開發（含本機 D1） | `npm run dev` |
| 新增資料表或欄位 | `npm run db:new -- <名稱>`，編輯產生的 SQL 後 push |
| 手動部署 | `bash scripts/deploy.sh` |
| 更換管理者密碼 | 改 `.env` 和 GitHub Secret 的 `ADMIN_TOKEN`，再執行 `bash scripts/deploy.sh` |
| 備份 D1 | `bash scripts/backup.sh`（輸出到 `backups/`） |
| 匯入 JSON 備份 | `bash scripts/import-json.sh <檔案.json> [projectId]` |
| 看線上 log | `npm run tail` |

### G. 注意事項
- [ ] D1 單一欄位上限約 **2 MB**。如果道次表附件用 base64 圖片存在 events 裡，資料會很快變大，之後建議把附件改存到 **R2**，D1 只存網址
- [ ] 目前寫入權限只用一組共用密碼保護。如果之後需要多位管理者，可以考慮 Cloudflare Access
- [ ] 停用舊 Firebase（`sportday-8d61c`）：目前規則是測試模式，任何人都能讀寫。確認大家都改用 Worker 網址後，把 Realtime Database 規則改成 `{".read": false, ".write": false}` 或刪除專案
- [ ] Tailwind Play CDN、Google Fonts、unpkg 仍是外部服務；若要完全只靠 Cloudflare，可改成建置時產生 CSS，並把字型與圖示放進 `public/`

---

## 2. 樣板

### `.env.example`
```bash
# 複製為 .env 後填入（.env 已列入 .gitignore）
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_ACCOUNT_ID=
ADMIN_TOKEN=
```

### `.gitignore`
```gitignore
node_modules/
.env
.dev.vars
.wrangler/
backups/
.claude/settings.local.json
```

### `package.json`
```json
{
  "name": "sport-day",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler d1 migrations apply sport-day-db --local && wrangler dev",
    "deploy": "bash scripts/deploy.sh",
    "db:new": "wrangler d1 migrations create sport-day-db",
    "db:migrate": "wrangler d1 migrations apply sport-day-db --remote",
    "tail": "wrangler tail"
  },
  "devDependencies": {
    "wrangler": "4.156.0"
  }
}
```

### `wrangler.jsonc`
```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "sport-day",
  "main": "src/worker.js",
  "compatibility_date": "2026-10-01",
  "assets": {
    "directory": "./public",
    "binding": "ASSETS"
  },
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "sport-day-db",
      "database_id": "REPLACE_WITH_D1_ID",   // bootstrap.sh 會自動填入
      "migrations_dir": "migrations"
    }
  ],
  "observability": { "enabled": true }
}
```

### `migrations/0001_init.sql`
```sql
-- 每個專案（例如 school-sports-115）存一份完整賽程 JSON
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  data        TEXT    NOT NULL,          -- { venues, dates, events }
  updated_at  INTEGER NOT NULL           -- epoch ms，前端用來判斷有沒有新版本
);
```

### `src/worker.js`
```js
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
```

### `scripts/_env.sh`（共用：讀 `.env`）
```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -f .env ]; then set -a; . ./.env; set +a; fi
: "${CLOUDFLARE_API_TOKEN:?請在 .env 設定 CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?請在 .env 設定 CLOUDFLARE_ACCOUNT_ID}"
export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
WR="npx --no-install wrangler"
```

### `scripts/bootstrap.sh`（一次性：建立 D1 + Worker）
```bash
#!/usr/bin/env bash
. "$(dirname "$0")/_env.sh"

if grep -q 'REPLACE_WITH_D1_ID' wrangler.jsonc; then
  echo "▶ 建立 D1 資料庫 sport-day-db"
  OUT=$($WR d1 create sport-day-db 2>&1) || { echo "$OUT"; exit 1; }
  echo "$OUT"
  DB_ID=$(echo "$OUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
  [ -n "$DB_ID" ] || { echo "抓不到 database_id"; exit 1; }
  sed -i "s/REPLACE_WITH_D1_ID/$DB_ID/" wrangler.jsonc
  echo "✔ 已寫入 database_id = $DB_ID"
else
  echo "✔ wrangler.jsonc 已有 database_id，略過建立"
fi

bash scripts/deploy.sh
echo "🎉 完成，記得 commit wrangler.jsonc"
```

### `scripts/deploy.sh`（日常部署：migrations → deploy → secret）
```bash
#!/usr/bin/env bash
. "$(dirname "$0")/_env.sh"

echo "▶ 套用 D1 migrations"
$WR d1 migrations apply sport-day-db --remote

echo "▶ 部署 Worker"
$WR deploy

if [ -n "${ADMIN_TOKEN:-}" ]; then
  echo "▶ 同步 ADMIN_TOKEN secret"
  printf '%s' "$ADMIN_TOKEN" | $WR secret put ADMIN_TOKEN
fi
```

### `scripts/backup.sh`
```bash
#!/usr/bin/env bash
. "$(dirname "$0")/_env.sh"
mkdir -p backups
FILE="backups/sport-day-$(date +%Y%m%d-%H%M%S).sql"
$WR d1 export sport-day-db --remote --output "$FILE"
echo "✔ 已備份到 $FILE"
```

### `scripts/import-json.sh`（把前端匯出的 JSON 備份寫進 D1）
```bash
#!/usr/bin/env bash
. "$(dirname "$0")/_env.sh"
FILE="${1:?用法: import-json.sh <檔案.json> [projectId]}"
PROJECT="${2:-school-sports-115}"
: "${WORKER_URL:?請在 .env 設定 WORKER_URL，例如 https://sport-day.xxx.workers.dev}"
: "${ADMIN_TOKEN:?請在 .env 設定 ADMIN_TOKEN}"

curl -fsS -X PUT "$WORKER_URL/api/projects/$PROJECT" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary "@$FILE"
echo
```

### `.github/workflows/deploy.yml`
```yaml
name: Deploy to Cloudflare

on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: deploy-production
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      - name: Migrate, deploy, sync secret
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          ADMIN_TOKEN: ${{ secrets.ADMIN_TOKEN }}
        run: bash scripts/deploy.sh
```

### 前端改寫參考（`public/index.html` 的同步函式）
```js
// 部署在 Worker 上時，API 和頁面同網域
function getCloudEndpointUrl() {
  const proj = (cloudConfig.projectId || 'school-sports-115').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `/api/projects/${proj}`;
}

// PUT 時帶上管理者密碼
await fetch(getCloudEndpointUrl(), {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${cloudConfig.adminToken}`,
  },
  body: rawJson,
});

// 輪詢：先看版本號
async function pollCloudUpdates() {
  const v = await (await fetch(getCloudEndpointUrl() + '/version')).json();
  if (!v.updatedAt || String(v.updatedAt) === cloudConfig.lastCloudHash) return;
  cloudConfig.lastCloudHash = String(v.updatedAt);
  applyCloudPayload(await (await fetch(getCloudEndpointUrl())).json());
}
```
> 注意：PUT 成功後，要用回應裡的 `updatedAt` 更新 `lastCloudHash`（伺服器時間），不要用前端的 `Date.now()`，不然自己剛寫入的資料會被當成新版本再抓一次。
