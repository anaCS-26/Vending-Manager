import { defaultCache } from "@serwist/next/worker";
import { Serwist, StaleWhileRevalidate, NetworkFirst, ExpirationPlugin, CacheableResponsePlugin, type PrecacheEntry, type SerwistGlobalConfig } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ request, url }) => request.destination === "document" && url.pathname.startsWith("/driver"),
      handler: new NetworkFirst({
        cacheName: 'driver-offline-page',
        plugins: [
          new ExpirationPlugin({
            maxEntries: 5,
            maxAgeSeconds: 7 * 24 * 60 * 60, // 1 Week
          }),
          {
            cacheWillUpdate: async ({ response }) => {
              // Next.js App Router 'force-dynamic' strictly enforces Cache-Control: no-store
              // Workbox natively refuses to cache no-store responses.
              // To enable offline hydration we clone the response and forcefully strip the restrictions.
              const newHeaders = new Headers(response.headers);
              newHeaders.delete('Cache-Control');
              newHeaders.set('Cache-Control', 'public, max-age=31536000');
              
              return new Response(response.body, {
                status: response.status,
                statusText: response.statusText,
                headers: newHeaders,
              });
            }
          }
        ],
      }),
    },
    {
      matcher: ({ url }) => url.hostname.includes("vercel-storage.com"),
      handler: new StaleWhileRevalidate({
        cacheName: 'vercel-blob-images',
        plugins: [
          new ExpirationPlugin({
            maxEntries: 500,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
          }),
          new CacheableResponsePlugin({
            statuses: [0, 200], // 0 is required for opaque cross-origin responses
          }),
        ],
      }),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

/* ==========================================================================
 * WEB PUSH
 *
 * Serwist's addEventListeners() wires install/activate/fetch/message only —
 * push is ours. Without the listener below a delivered notification is
 * silently dropped by the browser, which is half of why this feature has
 * never visibly worked (the other half was the in-memory subscription store).
 *
 * Payload shape is defined by PushPayload in src/lib/push.ts. Keep the two
 * in sync: everything here is best-effort parsing of data the server sent.
 * ========================================================================== */

type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  requireInteraction?: boolean;
};

const DEFAULT_PUSH: PushPayload = {
  title: "NexGen Vending",
  body: "You have a new update.",
  url: "/driver",
};

self.addEventListener("push", (event) => {
  let payload = DEFAULT_PUSH;
  try {
    // A push with no data is legal (some services send one to wake the SW).
    // Showing the generic fallback is required regardless: on Chrome, a push
    // handled without displaying a notification counts against the origin's
    // budget and repeated offences revoke the push permission entirely.
    if (event.data) payload = { ...DEFAULT_PUSH, ...(event.data.json() as PushPayload) };
  } catch {
    // Non-JSON body — fall through to the default rather than showing nothing.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      // Collapse key: a second assignment alert replaces the first instead of
      // stacking, so a driver's lock screen shows the current state, not a
      // history of it. The server sets this per notification kind.
      tag: payload.tag,
      requireInteraction: payload.requireInteraction ?? false,
      // Read back by the click handler to know where to navigate.
      data: { url: payload.url ?? "/driver" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data as { url?: string } | undefined)?.url ?? "/driver";

  event.waitUntil(
    (async () => {
      const url = new URL(target, self.location.origin);
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

      // Reuse an open tab where possible. Drivers run this as an installed PWA
      // with a single window; opening a second one loses their in-progress
      // refill sheet.
      for (const client of clients) {
        if (new URL(client.url).origin !== url.origin) continue;
        await client.focus();
        if ("navigate" in client && client.url !== url.href) {
          await client.navigate(url.href).catch(() => undefined);
        }
        return;
      }
      await self.clients.openWindow(url.href);
    })()
  );
});

/**
 * The browser rotated this device's subscription (key refresh, or the push
 * service moved the endpoint). Re-subscribe immediately so the registration
 * isn't lost outright.
 *
 * KNOWN GAP: a service worker can't invoke a Next.js server action, so the new
 * endpoint isn't persisted here — the app only learns about it the next time
 * the driver opens the portal, where usePushNotifications re-syncs on mount.
 * The window is self-healing rather than silent: pushes to the stale endpoint
 * come back 404/410 and sendToSubscriptions prunes it, so nothing accumulates.
 * Closing the gap properly needs a REST endpoint the SW can POST to.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  const e = event as ExtendableEvent & {
    oldSubscription?: PushSubscription | null;
    newSubscription?: PushSubscription | null;
  };
  if (e.newSubscription) return; // browser already replaced it for us

  const applicationServerKey = e.oldSubscription?.options?.applicationServerKey;
  if (!applicationServerKey) return;

  e.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey })
      .then(() => undefined)
      .catch(() => undefined)
  );
});
