import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Конфигурация сборки фронтенда TMA.
// Базовый URL API задаётся переменной окружения VITE_API_BASE_URL (см. .env.example)
// и читается в коде через import.meta.env — здесь хардкода адресов нет.
// `vite preview` берёт host, allowedHosts и proxy отсюда же (из `server`).
export default defineConfig({
  plugins: [react()],
  server: {
    // Только локальный интерфейс: туннель (cloudflared) подключается к 127.0.0.1, а из
    // локальной сети (Wi-Fi) сервер недоступен. Для проверки с телефона в той же сети —
    // запуск с флагом --host.
    host: "127.0.0.1",
    port: 5173,
    // Разрешить запросы через Cloudflare Tunnel (адрес *.trycloudflare.com меняется при каждом запуске).
    allowedHosts: [".trycloudflare.com"],
    // Как nginx в продакшене: /api/* → API-сервер (tma/backend) со срезанием /api.
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
