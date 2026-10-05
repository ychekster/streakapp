import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Конфигурация сборки фронтенда TMA.
// Базовый URL API задаётся переменной окружения VITE_API_BASE_URL (см. .env.example)
// и читается в коде через import.meta.env — здесь хардкода адресов нет.
// `vite preview` берёт host, allowedHosts и proxy отсюда же (из `server`).
export default defineConfig({
  plugins: [
    react(),
    // Installable web app (spec §4): manifest + service worker (src/sw.ts — app shell
    // cache and push). The worker is registered in main.tsx, never inside Telegram.
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectRegister: false,
      registerType: "autoUpdate",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,png,svg,ico,webmanifest}"],
      },
      includeAssets: ["icons/apple-touch-icon.png", "icons/favicon-32.png"],
      manifest: {
        id: "/app",
        name: "Knot",
        short_name: "Knot",
        description: "Трекер привычек: отмечайте дни и копите стрики",
        lang: "ru",
        // pwa=1 — the access gate's fallback check (platform.ts).
        start_url: "/app?pwa=1",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        // Splash in the brand blue (the icon is full-bleed blue); the status bar matches
        // the app's light background so screens look native.
        background_color: "#2f8ff5",
        theme_color: "#f2f2f7",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "/icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  server: {
    // Только локальный интерфейс: туннель (cloudflared) подключается к 127.0.0.1, а из
    // локальной сети (Wi-Fi) сервер недоступен. Для проверки с телефона в той же сети —
    // запуск с флагом --host.
    host: "127.0.0.1",
    port: 5173,
    // Разрешить запросы через Cloudflare Tunnel (адрес *.trycloudflare.com меняется при каждом запуске).
    allowedHosts: [".trycloudflare.com"],
    // Как nginx в продакшене: /api/* → API-сервер (backend) со срезанием /api.
    // Так фронт и API доступны через один HTTPS-туннель (VITE_API_BASE_URL=/api).
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  build: {
    outDir: "dist",
    // Без source map: сборку раздают публично, а карта — это весь исходный код с
    // комментариями.
    sourcemap: false,
  },
});
