#!/usr/bin/env bash
# Playwright 端對端測試用的 API 伺服器：獨立的本機 D1，不會碰到正式環境
# 由 playwright.config.ts 自動啟動與關閉，不需手動執行
#   E2E_API_PORT：Worker 連接埠（預設 8798）；資料庫放在 .wrangler/e2e-state-<port>
set -euo pipefail
cd "$(dirname "$0")/.."
export WRANGLER_SEND_METRICS=false
PORT="${E2E_API_PORT:-8798}"
STATE=".wrangler/e2e-state-$PORT"
rm -rf "$STATE"
mkdir -p dist
[ -f dist/index.html ] || echo '<!doctype html><title>e2e</title>' > dist/index.html
npx --no-install wrangler d1 migrations apply sport-day-db --local --persist-to "$STATE" >/dev/null
exec npx --no-install wrangler dev --ip 127.0.0.1 --port "$PORT" --persist-to "$STATE" \
  --var ADMIN_TOKEN:e2e-admin-token --show-interactive-dev-session=false
