# sport-day 專案說明（給 Claude Code）

小學運動會視覺化賽程排程系統。目前整個前端在單一檔案 `index.html`，正規劃遷移到 Cloudflare Workers + D1，詳細步驟和樣板見 `TODO.md`。

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

## 常用指令（遷移完成後）
- 本機開發：`npm run dev`
- 部署：`bash scripts/deploy.sh`（push 到 `main` 也會由 GitHub Actions 自動部署）
- 新增 D1 migration：`npm run db:new -- <名稱>`
- 備份：`bash scripts/backup.sh`
