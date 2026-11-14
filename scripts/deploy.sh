#!/usr/bin/env bash
# 日常部署：套用 D1 migrations → 部署 Worker → 同步 ADMIN_TOKEN secret
. "$(dirname "$0")/_env.sh"

echo "▶ 套用 D1 migrations"
$WR d1 migrations apply sport-day-db --remote

echo "▶ 部署 Worker"
$WR deploy

if [ -n "${ADMIN_TOKEN:-}" ]; then
  echo "▶ 同步 ADMIN_TOKEN secret"
  printf '%s' "$ADMIN_TOKEN" | $WR secret put ADMIN_TOKEN
fi
