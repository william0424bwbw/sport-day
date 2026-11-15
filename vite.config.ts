import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

// 前端：Vite 建置到 dist/，由 Worker 的靜態資源提供
// 開發時 /api（含 WebSocket）轉給 wrangler dev（scripts/dev.sh 會同時啟動）
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PWA（I9）：可安裝到桌面、離線開啟、有新版本時提示更新
    // - Service Worker 只快取網頁本身（HTML、JS、CSS、圖示）；/api 一律不快取，
    //   離線時的賽程來自同步服務的本機快取（src/web/services/sync.ts）
    // - registerType: 'prompt'：新版本不會自動套用（避免比賽中畫面突然重新整理），由使用者點「更新」
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: '小學運動會賽程系統',
        short_name: '運動會賽程',
        description: '小學運動會視覺化賽程：今日進行中、賽程列表、場地時間軸',
        lang: 'zh-TW',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f8fafc',
        theme_color: '#2563eb',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@web': fileURLToPath(new URL('./src/web', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: `http://127.0.0.1:${process.env.API_PORT ?? 8787}`, ws: true, changeOrigin: true },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
