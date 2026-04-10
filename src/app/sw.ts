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
