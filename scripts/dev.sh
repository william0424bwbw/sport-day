#!/usr/bin/env bash
# 本機開發：同時啟動 Worker（API + D1 + Durable Object，port 8787）與 Vite（前端，port 5173）
# 打開 http://localhost:5173 ；/api 會自動轉給 Worker
set -euo pipefail
cd "$(dirname "$0")/.."
export WRANGLER_SEND_METRICS=false
npx --no-install wrangler d1 migrations apply sport-day-db --local
# Worker 需要 dist/ 存在才能啟動（實際前端由 Vite 提供）
[ -f dist/index.html ] || npx --no-install vite build
npx --no-install concurrently -k -n worker,web -c blue,green \
  "wrangler dev --port 8787 --show-interactive-dev-session=false" \
  "vite --port 5173"
