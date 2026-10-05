/// <reference lib="webworker" />
/**
 * Service worker of the web app (spec 4.1, §9). Registered only outside Telegram.
 *
 * - Caches the app shell (the built JS/CSS/HTML, list injected by vite-plugin-pwa) and
 *   the Telegram SDK script, so the installed app opens instantly — and without a
 *   connection. API requests (`/api/…`) are never cached — they always go to the
 *   network; the data itself is kept by the app (data/store.ts).
 * - Shows push reminders and, on tap, opens the app on the reminded habit (or focuses
 *   the open app and tells it which habit to show).
 */

import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

declare const self: ServiceWorkerGlobalScope;

// New versions take over at once (the app shell is small and self-consistent).
self.addEventListener("install", () => {
  void self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Page navigations (/, /app, /install) are answered with the cached shell — except the
// API and the OAuth callback, which must reach the server.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL("/index.html"), {
    denylist: [/^\/api\//],
  }),
);

// The Telegram SDK (index.html loads it in every mode, before the app): from the cache at
// once, refreshed in the background. Otherwise a slow connection holds the start, and
// none at all makes the script fail.
const TELEGRAM_SDK = "https://telegram.org/js/telegram-web-app.js";
const TELEGRAM_SDK_CACHE = "telegram-sdk";

registerRoute(
  ({ url }) => url.href.split("?")[0] === TELEGRAM_SDK,
  async ({ request, event }) => {
    const cache = await caches.open(TELEGRAM_SDK_CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });
    const fresh = fetch(request).then(async (response) => {
      // A classic <script> loads without CORS: the response is opaque (status 0).
      if (response.ok || response.type === "opaque") {
        await cache.put(request, response.clone());
      }
      return response;
    });
    if (cached) {
      event.waitUntil(fresh.catch(() => undefined));
      return cached;
    }
    return fresh;
  },
);

interface PushData {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
}

self.addEventListener("push", (event) => {
  let data: PushData = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Knot", {
      body: data.body ?? "",
      tag: data.tag,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url ?? "/app?pwa=1" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data as { url?: string } | null)?.url ?? "/app?pwa=1",
    self.location.origin,
  );
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === target.origin);
      if (open) {
        open.postMessage({ type: "open-habit", url: target.toString() });
        await open.focus();
        return;
      }
      await self.clients.openWindow(target.toString());
    })(),
  );
});
