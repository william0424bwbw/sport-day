#!/usr/bin/env bash
# 把前端匯出的 JSON 備份寫進 D1（透過 Worker API）
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
