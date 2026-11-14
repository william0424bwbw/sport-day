#!/usr/bin/env bash
# 一次性：建立 D1 資料庫、寫回 database_id、首次部署 Worker
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
