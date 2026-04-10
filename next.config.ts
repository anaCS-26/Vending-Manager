import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  // The 'register' and 'skipWaiting' are enabled by default in @ducanh2912/next-pwa
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  extendDefaultRuntimeCaching: true,
  fallbacks: {
    // This tells the PWA wrapper to load our custom offline page when network fails
    document: "/~offline",
  },
  workboxOptions: {
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
      }
    ]
  }
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
