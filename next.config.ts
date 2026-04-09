import type { NextConfig } from "next";
// @ts-expect-error - next-pwa does not possess types
import withPWAInit from "next-pwa";

import defaultCache from "next-pwa/cache";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/.*\.public\.blob\.vercel-storage\.com\/.*/i,
      handler: 'StaleWhileRevalidate',
      options: {
        cacheName: 'vercel-blob-images',
        expiration: {
          maxEntries: 500,
          maxAgeSeconds: 30 * 24 * 60 * 60 // 30 Days
        },
        cacheableResponse: {
          statuses: [0, 200] // 0 is required for opaque cross-origin responses
        }
      }
    },
    ...defaultCache as any
  ]
});

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  turbopack: {},
};

export default withPWA(nextConfig);
