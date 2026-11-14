#!/usr/bin/env bash
# 建置前端到 dist/（部署前必須執行）
set -euo pipefail
cd "$(dirname "$0")/.."
npx --no-install tsc -b
npx --no-install vite build
