#!/usr/bin/env bash
# 執行所有測試（本機獨立資料庫，不會碰到正式環境）
#   bash scripts/test.sh                       # API + 端對端測試
#   bash scripts/test.sh --skip-e2e            # 只跑 API 測試
#   bash scripts/test.sh --snapshot <檔案.json> # 另外用正式資料快照做來回測試
set -euo pipefail
cd "$(dirname "$0")/.."
node tests/run.mjs "$@"
