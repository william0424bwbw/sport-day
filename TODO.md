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
- **輪詢**：前端每 4 秒打一次輕量的 `GET /api/projects/:id/version`，版本有變才抓完整資料，可以省下 D1 讀取量（之後改為 Durable Object 即時推送，見 §J）

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

### E. CI/CD（push 不自動部署）
- [x] push 到 `main` 或開 PR：GitHub Actions 只跑測試（`.github/workflows/test.yml`），不需要 Secrets
- [x] 部署平常用本機的 `bash scripts/deploy.sh`
- [ ] （選用）若要從 GitHub 手動部署：到 repo → Settings → Secrets and variables → Actions 新增 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`ADMIN_TOKEN`，之後在 Actions → Deploy to Cloudflare → Run workflow 手動執行
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

### H. 資料正規化：把一整串 JSON 拆成資料表

**現況**：`projects` 表每個專案只有一列，`data` 欄位放整份 JSON（約 18 KB）。用 SQL 查不到單一賽程，在 D1 Console 也很難看、很難改。

**原則**
- **API 不變**：`GET`/`PUT /api/projects/:id` 的 JSON 格式完全不變，只改 Worker 讀寫資料庫的方式，**前端不用改**。
- **不遺失資料**：前端以後新增欄位、但資料表還沒有對應欄位時，先放進 `extra`（JSON）欄位，不會被丟掉。
- **可以回復**：搬移前先備份；測試階段經確認無誤後，已直接刪除舊的 `projects.data`（`migrations/0004`）。
- **全部自動化**：用 migration 搬資料，由 `deploy.sh` 或 CI 自動套用，不手動操作 Console。

**資料表設計**（每張表都用 `project_id` 區分不同場運動會）

| 資料表 | 一列代表 | 主要欄位 | 對應目前 JSON |
|---|---|---|---|
| `projects` | 一場運動會 | `id`, `updated_at` | 專案本身 |
| `venues` | 場地 | `id`, `sort_order`, `name`, `subtitle` | `venues[]` |
| `days` | 比賽日 | `id`, `sort_order`, `label`, `category`, `command_deck_enabled`, `staff_hosts`, `staff_recorders`, `staff_stage_control` | `dates[]` 與 `generalStaff` |
| `command_slots` | 司令台播報時段 | `id`, `day_id`, `type`, `start_min`, `end_min`, `staff`, `content` | `dates[].commandSlots[]` |
| `events` | 一個賽程方塊 | `id`, `day_id`, `title`, `color`, `start_min`, `end_min`, `check_in_offset_min`, `link_prev`, `volunteer_count`, `volunteer_task`, `student_count`, `student_task`, `lane_note`, `actual_start_min`, `actual_end_min`, `extra` | `events[]` |
| `event_venues` | 賽程使用的場地（一個賽程可跨多場地） | `event_id`, `venue_id`, `sort_order` | `events[].venueIds[]` |
| `event_referees` | 裁判／工作分配 | `event_id`, `sort_order`, `role`, `name` | `events[].referees[]` |
| `event_equipment` | 器材 | `event_id`, `sort_order`, `item` | `events[].equipment[]` |
| `event_attachments` | 道次表附件 | `event_id`, `sort_order`, `name`, `type`, `r2_key` | `events[].attachments[]`（之後改存 R2） |

- 主鍵一律是 `(project_id, id)`，因為 `A`、`12-19` 這類代號在不同專案會重複。
- 子表用外鍵加 `ON DELETE CASCADE` 指向 `events` 或 `days`。`event_venues.venue_id` **不加外鍵**，避免前端刪除場地時整次儲存失敗；改用檢查查詢找出孤兒資料。
- 時間維持「從 0:00 起算的分鐘數」，和前端一致。另外建 view `v_schedule`，把時間轉成 `HH:MM`，並帶出場地名稱，方便在 Console 閱讀。
- 不做成資料表：`currentDateId`、`simTimeMin` 屬於每台裝置自己的畫面狀態，留在 localStorage。

**寫入方式**
- `PUT` 時用一個 D1 `batch`（交易）：刪除這個專案的子資料，再整批寫入。任何一步失敗都會整批回復，不會寫到一半。
- 每張表只用 **1 條 SQL**：`INSERT ... SELECT ... FROM json_each(?)`，把整個陣列當成一個參數傳入。這樣不會碰到 D1「每條 SQL 最多 100 個參數」和免費方案「每次請求最多 50 條查詢」的限制。
- `GET` 時用幾條 `SELECT` 讀出各表，在 Worker 組回原本的 JSON 格式。

**步驟**
- [x] H1. `migrations/0002_normalized_tables.sql`：建立上面的資料表、索引、view `v_schedule`、`v_integrity_issues`
- [x] H2. `migrations/0003_copy_json_to_tables.sql`：純 SQL 用 `json_each` 把現有的 `projects.data` 拆到各表（部署時自動執行）
- [x] H3. Worker 改成從資料表讀寫（`src/db.js`）
- [x] H4. 加入自動測試，放進 repo，用 `bash scripts/test.sh` 執行：
  - **來回測試**：用目前正式資料 `PUT` 進去再 `GET` 出來，必須和原本 JSON 完全相同
  - **端對端測試**：前面用過的無頭 Chrome 測試，移進 `tests/`
  - CI 部署前先跑測試，失敗就不部署
- [x] H5. 部署前先執行 `bash scripts/backup.sh`；部署後比對正式環境的 `GET` 結果和搬移前一致
- [x] H6. `migrations/0004_drop_projects_data.sql` 移除 `projects.data`（測試階段，使用者決定直接刪除）
- [ ] H7.（之後）附件改存 R2：新增 `/api/files` 上傳 API，`event_attachments` 只存 `r2_key`
- [ ] H8.（之後，選做）細部 API，例如 `PATCH /api/projects/:id/events/:eventId`，多位管理者同時編輯時不會互相覆蓋；以及 `event_changes` 異動紀錄表，可以查「誰在何時改了什麼」

**之後可以直接用 SQL 維護**（範例）
```bash
# 列出 12/19 所有賽程
npx wrangler d1 execute sport-day-db --remote --command \
  "SELECT start_hhmm, end_hhmm, venue_names, title FROM v_schedule WHERE day_id='12-19' ORDER BY start_min"
# 查某位老師負責哪些項目
npx wrangler d1 execute sport-day-db --remote --command \
  "SELECT e.title, r.role FROM event_referees r JOIN events e USING(project_id) WHERE r.event_id=e.id AND r.name LIKE '%林老師%'"
```

### I. 前端重構（方案 C）：以長期好維護為優先

**目標**
- 拆掉 3,200 行的單一 `index.html`，改成有型別、有測試、可以分開修改的元件。
- **手機優先**：老師與工作人員用手機順暢查看，不會被切到或擋住；電腦版保留完整排程功能。
- **完全不依賴外部 CDN**：樣式、圖示、字型都由自己的 Worker 提供，學校網路擋掉外部網站也能正常使用。
- **PWA**：可以加到手機桌面，現場網路不穩時仍能看到最後同步的賽程。

**技術選型（已決定：React + Vite，2026-11-14）**
| 項目 | 選擇 | 理由 |
|---|---|---|
| 語言 | TypeScript | 前端、Worker 共用資料型別，改欄位時編輯器會指出所有要跟著改的地方 |
| 框架 | **React 19** | 生態系最大，套件、範例、教學最多；之後找人接手或用 AI 協助維護都最容易 |
| 建置 | **Vite**（前端）+ wrangler（Worker） | Vite 建置到 `dist/`，由 Worker 靜態資源提供；`npm run dev` 同時啟動 wrangler dev（API、D1、Durable Object）與 Vite，`/api` 自動轉給 Worker。未採用 `@cloudflare/vite-plugin`，架構較單純、測試沿用 wrangler dev |
| 不採用 Next.js | — | 這個專案幾乎都在瀏覽器裡運作、不需要 SEO；Next.js 要透過 OpenNext 轉接才能跑在 Workers 上，打包容易超過免費方案 3 MB 上限，PWA 較難做，大版本升級成本高 |
| 狀態管理 | Zustand | 輕量，取代現在的全域 `state` 物件 |
| 路由 | React Router（函式庫模式） | 單頁應用內的頁面切換，例如 `/day/:id`、`/event/:id` |
| 拖曳 | dnd-kit | 同時支援滑鼠與觸控，平板也能拖 |
| 樣式 | Tailwind CSS（建置時產生） | 沿用現有的 class 寫法，不再用 Play CDN |
| 圖示 | `lucide-react` | 只打包有用到的圖示 |
| 字型 | 系統字型（蘋方、微軟正黑體） | 不載入數 MB 的網路字型，手機開啟更快 |
| 資料檢查 | Zod（前端與 Worker 共用） | 一份 schema 同時用於型別、API 輸入檢查、匯入 JSON 檢查 |
| Worker 路由 | 自行撰寫（不用 Hono） | 路由只有幾條；當時鎖定的 Hono 版本有「中介層被繞過」的安全公告，修正版發布未滿兩週，因此不引入（2026-11-14） |
| 即時同步 | **Durable Object + WebSocket**（取代每 4 秒輪詢，見 §J） | 有修改時伺服器主動推送，幾乎即時；沒有修改時不產生請求 |
| 單元測試 | Vitest | 排程邏輯（磁吸、檢錄重疊、時間換算）與 Worker API |
| 端對端測試 | Playwright | 取代自寫的 CDP 腳本，可同時測桌機與手機尺寸 |
| 程式風格 | ESLint + Prettier | 搭配 `.editorconfig`，統一 UTF-8 + LF |
| PWA | `vite-plugin-pwa` | 離線快取與「有新版本，點此更新」提示 |

**專案結構（規劃）**
```
src/
  shared/          前端與 Worker 共用
    types.ts         Venue、Day、CommandSlot、ScheduleEvent…
    schema.ts        Zod schema（API 與匯入檢查）
    time.ts          分鐘 ⇄ HH:MM、時間選項
    schedule.ts      磁吸連動、檢錄重疊、延後後續賽程…（純函式，有單元測試）
    realtime.ts      WebSocket 訊息格式
  worker/
    index.ts         路由、權限
    db.ts            D1 讀寫（由現在的 src/db.js 轉成 TypeScript）
    project-room.ts  Durable Object：管理每場運動會的 WebSocket 連線與廣播
  web/
    main.tsx、App.tsx、router.tsx
    stores/          project（賽程資料）、session（角色、密碼、篩選）
    services/        api.ts、sync.ts（延遲寫入、斷線補傳）、realtime.ts（WebSocket 連線、自動重連）
    components/      EventCard、EventDetailSheet、FilterChips、TimeInput…
    views/mobile/    今日總覽、賽程列表、篩選、設定
    views/desktop/   時間軸格狀表、細節面板、司令台、場地與日期管理
    features/        細流表輸出、JSON 匯出入、附件
tests/e2e/         Playwright（桌機 + 手機尺寸）
migrations/        D1（不變）
scripts/           *.sh（不變，部署前多一步 npm run build）
```

**原則：所有功能不分裝置都要能用**（臨時找不到電腦時，手機也能完成所有管理工作）。手機與電腦只是「排版」不同，功能相同。

**手機版畫面**
- 首頁：「進行中」與「下一項（幾分鐘後檢錄）」大卡片
- 賽程列表：依時間排列，可依年級、場地、人員姓名篩選
- 點卡片從底部滑出細節：檢錄時間、場地、裁判、器材、道次表
- 底部導覽列：今日、列表、篩選、設定；按鈕至少 44px
- **管理者在手機上擁有完整功能**：
  - 新增、編輯、複製、刪除賽程：用全螢幕表單（時間、場地、裁判、器材、志工、公差、備註）
  - 單一場地時間軸：長按賽程卡片拖曳調整時間、拉動邊緣調整長度（dnd-kit 觸控）
  - 現場調度：標記開始/結束、時間 ±5 分鐘、延後後續賽程（磁吸連動）
  - 道次表附件：可直接用手機相機拍照上傳
  - 場地、比賽日、司令台時段、大會人員的新增與編輯
  - 細流表輸出、JSON 匯出與匯入、雲端同步設定

**電腦版畫面**
- 保留現在的「時間 × 場地」格狀表與右側細節面板，外觀盡量維持
- 拖曳改用 dnd-kit，滑鼠與觸控都能用（平板也能拖）
- 和手機版共用同一套表單與商業邏輯，只是排版不同

**不做的功能**
- ~~匯出獨立分享網頁~~：改由 PWA 提供「安裝到手機、離線瀏覽」，不再匯出 HTML 檔（2026-11-14 決定）

**階段與步驟**
- [x] I0. 決策與設計：手機版線框圖、功能對照表（現有 19 個功能區、6 個彈窗逐項列出，標記「保留 / 調整 / 刪除」）
- [x] I1. 工程骨架：Vite + React + TS + Tailwind（Worker 由 wrangler 建置）；ESLint、Prettier、Vitest、Playwright；更新 `scripts/*.sh` 與 `test.yml`
- [x] I2. 共用邏輯：把磁吸、檢錄重疊、時間換算等從舊檔案抽成 `src/shared/` 純函式，先寫「行為對照測試」確保結果和舊版一致
- [x] I3. 資料層：型別與 Zod schema、API client、同步服務、Zustand store；Worker 轉 TypeScript，現有 API 測試全部通過
- [x] I4. 即時同步：Durable Object + WebSocket（§J），新版一開始就用推送，不再實作輪詢
- [x] I5. 共用表單與檢視元件：賽程表單、場地／比賽日／司令台表單、細節面板，手機與電腦共用
- [x] I6. 手機版排版：今日總覽、賽程列表、單一場地時間軸（觸控拖曳）、底部導覽、全螢幕表單
- [x] I7. 電腦版排版：時間 × 場地格狀表、拖曳、右側細節面板
- [ ] I8. 輸出功能：細流表（公文 / CSV）、JSON 匯出與匯入、列印樣式、附件（含手機拍照上傳）
- [ ] I9. PWA 與離線：安裝到桌面、離線瀏覽、新版本提示
- [ ] I10. 切換上線：功能對照表全部完成、端對端測試（桌機 + 手機尺寸）通過、實際用手機演練管理者流程 → 新版直接取代 `/`，刪除 `public/index.html`（舊版保留在 git 歷史中）

**時程與風險**
- 運動會 12/14 開始。目標 **12/5 前完成 I10**，12/7 用新版做一次總預演。
- 目前是測試階段，**直接使用新版、不保留舊版**（2026-11-14 決定）。新版開發期間，舊版仍在正式網址運作，直到 I10 切換為止。
- 新舊版共用同一個 D1 與 API，資料不會分岔。

**已決定的事（2026-11-14）**
1. 框架：React + Vite（不用 Next.js）。
2. 不保留「匯出獨立分享網頁」，改由 PWA 提供離線瀏覽。
3. 直接切換到新版，不保留 `/legacy/`。
4. 管理者功能不分裝置都要完整提供。

### J. 即時同步：以 Durable Object 取代輪詢

**現況**：每台裝置每 4 秒問一次「版本有沒有變」。全校 100 支手機開著，就是每分鐘約 1,500 個請求，而且最慢要 4 秒才看到更新。

**新做法**
```
管理者 PUT ──► Worker ──► 寫入 D1（資料仍以 D1 為準）
                  │
                  └──► ProjectRoom（Durable Object，每場運動會一個）
                          │  廣播 { type: "updated", updatedAt }
                          ▼
              所有開著網頁的手機／電腦（WebSocket）──► 下載最新賽程
```
- 每場運動會（`projectId`）對應一個 Durable Object，負責管理所有 WebSocket 連線。
- 管理者儲存成功後，Worker 通知 Durable Object 廣播新版本號；各裝置收到後再下載完整資料（資料量小，邏輯簡單）。
- 使用 **WebSocket Hibernation API**：沒有訊息時 Durable Object 會休眠、不計執行時間，費用極低。
- 心跳用 `setWebSocketAutoResponse` 自動回應，不喚醒 Durable Object。
- **斷線處理**：前端自動重連（指數退避）；重連成功先查一次版本號，避免漏掉斷線期間的更新。
- **備援**：WebSocket 連不上（例如網路設備擋掉）時，自動退回每 30 秒輪詢一次，確保不會「被擋住就看不到更新」。
- 之後可以順便推送「目前線上人數」、「管理者正在編輯」等狀態。

**為什麼資料仍以 D1 為準**：D1 可以直接用 SQL 查詢與維護（§H），Durable Object 只負責「通知」，職責單純。之後若需要多位管理者同時編輯，再評估讓 Durable Object 負責合併修改。

**步驟**
- [x] J1. `wrangler.jsonc` 新增 Durable Object 綁定與 migration（SQLite 型，免費方案可用）
- [x] J2. `ProjectRoom`：接受 WebSocket、Hibernation、廣播、心跳自動回應
- [x] J3. API：`GET /api/projects/:id/ws` 升級為 WebSocket；`PUT` 成功後通知廣播
- [x] J4. 前端 `realtime.ts`：連線、重連、退回輪詢的備援
- [ ] J5. 測試：兩個瀏覽器分頁，一邊修改、另一邊 1 秒內更新；中斷網路再恢復能補上更新
- [ ] J6. 舊版前端在切換前仍使用輪詢（不另外改舊版）；新版上線後，`/version` 輪詢只剩備援用途

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

### `.github/workflows/deploy.yml`（已改為只能手動觸發，最新版本以 repo 內檔案為準）
```yaml
name: Deploy to Cloudflare

on:
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
