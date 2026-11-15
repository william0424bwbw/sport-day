#!/usr/bin/env bash
# Playwright 端對端測試用的本機 D1：每次清空並重新套用 migrations，不會碰到正式環境
# 由 playwright.config.ts 在啟動 wrangler dev 之前自動執行，不需手動執行
#   E2E_API_PORT：Worker 連接埠（預設 8798）；資料庫放在 .wrangler/e2e-state-<port>
# 注意：這裡只做準備、不啟動 wrangler dev。Windows 的 Git Bash 用 exec 啟動長時間執行的程序時，
# Playwright 結束測試後關不掉它（程序樹會斷開），整個測試會卡住，所以 wrangler dev 由 Playwright 直接啟動
set -euo pipefail
cd "$(dirname "$0")/.."
export WRANGLER_SEND_METRICS=false
PORT="${E2E_API_PORT:-8798}"
STATE=".wrangler/e2e-state-$PORT"
rm -rf "$STATE"
mkdir -p dist
[ -f dist/index.html ] || echo '<!doctype html><title>e2e</title>' > dist/index.html
npx --no-install wrangler d1 migrations apply sport-day-db --local --persist-to "$STATE" >/dev/null
