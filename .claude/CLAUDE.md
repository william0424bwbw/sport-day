# sport-day 專案說明（給 Claude Code）

小學運動會視覺化賽程排程系統，部署在 Cloudflare Workers + D1（https://sport-day.teacherbear.workers.dev）。進度與待辦見 `TODO.md`。目前是測試階段，系統仍在大幅改動。

## 專案規範（必須遵守）
- **腳本一律寫成 `.sh`，用 Git Bash 執行**
  - 第一行 `#!/usr/bin/env bash`，放在 `scripts/` 底下
  - 不寫 `.ps1`、`.bat`、`.cmd`；`package.json` 的 scripts 只呼叫 `bash scripts/*.sh` 或跨平台指令
  - 新增腳本後執行 `git update-index --chmod=+x scripts/<名稱>.sh`
- **所有文字檔一律 UTF-8（無 BOM）+ LF**
  - 由 `.gitattributes`（`* text=auto eol=lf`）、`.editorconfig`、`.vscode/settings.json` 強制
  - 不要用 PowerShell 的 `Set-Content`、`Out-File` 寫檔；用 Write、Edit 工具或 Bash
  - 終端指令優先用 Bash（Git Bash）工具，不用 PowerShell
- **機密不進版控**：`.env`、`.dev.vars` 不可以 commit；API Token 和 `ADMIN_TOKEN` 只放在 `.env` 和 GitHub Secrets。
- 部署和維護都用腳本或 CI，不要指示使用者到 Cloudflare Dashboard 手動上傳。

## 架構
- `public/index.html`：整個前端。資料以 D1 為準，localStorage 只當離線快取。
- `src/worker.js`：API 路由與權限；`src/db.js`：JSON ⇄ 資料表的讀寫。
- D1 資料表：`venues`、`days`、`command_slots`、`events`、`event_venues`、`event_referees`、`event_equipment`、`event_attachments`，以及 view `v_schedule`、`v_integrity_issues`。
- API 對前端仍是同一份 JSON（`{ venues, dates, events }`）。資料表沒有對應欄位的屬性會存進 `extra`。
- **新增欄位時**：新增 migration 加欄位，同時修改 `src/db.js` 的 `WRITE_SQL`（含 `json_remove` 清單）與 `readProject`，再執行測試。

## 常用指令
- 本機開發：`npm run dev`
- 測試：`bash scripts/test.sh`（獨立本機資料庫；CI 部署前也會執行）
- 部署：`bash scripts/deploy.sh`（**push 不會自動部署**；GitHub Actions 的 `test.yml` 只跑測試，`deploy.yml` 只能手動觸發）
- 新增 D1 migration：`npm run db:new -- <名稱>`
- 備份：`bash scripts/backup.sh`
