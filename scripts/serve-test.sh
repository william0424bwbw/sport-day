#!/usr/bin/env bash
# Playwright 端對端測試用伺服器：獨立的本機 D1（.wrangler/e2e-state）+ 已建置的前端
# 由 playwright.config.ts 自動啟動與關閉，不需手動執行
set -euo pipefail
cd "$(dirname "$0")/.."
export WRANGLER_SEND_METRICS=false
STATE=.wrangler/e2e-state
rm -rf "$STATE"
npx --no-install wrangler d1 migrations apply sport-day-db --local --persist-to "$STATE" >/dev/null
exec npx --no-install wrangler dev --port 8798 --persist-to "$STATE" \
  --var ADMIN_TOKEN:e2e-admin-token --show-interactive-dev-session=false
