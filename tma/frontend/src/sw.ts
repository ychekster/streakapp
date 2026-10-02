/// <reference lib="webworker" />
/**
 * Service worker of the web app (spec 4.1, §9). Registered only outside Telegram.
 *
 * - Caches the app shell only (the built JS/CSS/HTML, list injected by vite-plugin-pwa),
 *   so the installed app opens instantly. API requests (`/api/…`) are never cached —
 *   they always go to the network.
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
    self.registration.showNotification(data.title ?? "StreakApp", {
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
