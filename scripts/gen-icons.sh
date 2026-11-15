#!/usr/bin/env bash
# 由 public/icon.svg 產生 PWA 與 iPhone 用的 PNG 圖示（改了 icon.svg 之後執行一次，再 commit 產生的 PNG）
#   bash scripts/gen-icons.sh
# 使用已安裝的 Playwright + 本機 Chrome 轉檔，不需要額外安裝影像處理套件
set -euo pipefail
cd "$(dirname "$0")/.."
if pwd -W >/dev/null 2>&1; then cd "$(pwd -W)"; fi

node --input-type=module - <<'EOF'
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const svg = readFileSync('public/icon.svg', 'utf8');
const sizes = [
  ['public/pwa-192.png', 192],
  ['public/pwa-512.png', 512],
  ['public/apple-touch-icon.png', 180],
];
const browser = await chromium.launch(process.env.CI ? {} : { channel: 'chrome' });
const page = await browser.newPage();
for (const [file, size] of sizes) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${size}" height="${size}" style="display:block"></body></html>`,
  );
  await page.screenshot({ path: file, omitBackground: false });
  console.log(`✔ ${file}（${size}×${size}）`);
}
await browser.close();
EOF
