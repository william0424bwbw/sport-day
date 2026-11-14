#!/usr/bin/env bash
# 共用：讀取 .env 並檢查必要變數（由其他腳本 source）
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [ -f .env ]; then set -a; . ./.env; set +a; fi
: "${CLOUDFLARE_API_TOKEN:?請在 .env 設定 CLOUDFLARE_API_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?請在 .env 設定 CLOUDFLARE_ACCOUNT_ID}"
export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
WR="npx --no-install wrangler"
