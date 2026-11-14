#!/usr/bin/env bash
# 匯出遠端 D1 為 SQL 檔到 backups/
. "$(dirname "$0")/_env.sh"
mkdir -p backups
FILE="backups/sport-day-$(date +%Y%m%d-%H%M%S).sql"
$WR d1 export sport-day-db --remote --output "$FILE"
echo "✔ 已備份到 $FILE"
