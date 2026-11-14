#!/usr/bin/env bash
# 執行所有檢查與測試（本機獨立資料庫，不會碰到正式環境）
#   bash scripts/test.sh                        # 全部
#   bash scripts/test.sh --quick                # 跳過端對端測試（Playwright）
#   bash scripts/test.sh --snapshot <檔案.json>  # API 測試另外用正式資料快照做來回測試
set -euo pipefail
cd "$(dirname "$0")/.."
# Windows（Git Bash）：改用 C:/... 形式的路徑。/c/... 小寫磁碟代號會讓 Vitest 載入兩份而全部失敗
if pwd -W >/dev/null 2>&1; then cd "$(pwd -W)"; fi

QUICK=false
API_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --quick) QUICK=true ;;
    --snapshot) API_ARGS+=(--snapshot "$2"); shift ;;
  esac
  shift
done

echo "▶ 型別檢查";      npx --no-install tsc -b
echo "▶ 程式風格";      npx --no-install eslint .
echo "▶ 單元測試";      npx --no-install vitest run
echo "▶ 建置前端";      npx --no-install vite build
echo "▶ API 測試";      node tests/run.mjs "${API_ARGS[@]+"${API_ARGS[@]}"}"
if [ "$QUICK" = false ]; then
  echo "▶ 端對端測試（Playwright：桌機 + 手機）"
  npx --no-install playwright test
fi
echo "🎉 全部通過"
