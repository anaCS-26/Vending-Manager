import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // Everything in /public is precached on install by default. Release-note
  // clips are the one thing in there that is large and shown once, so keep
  // them out — otherwise every driver downloads every clip over mobile data
  // the moment the worker updates, including the admin-only ones.
  globPublicPatterns: ["**/*", "!whats-new/**"],
  // Precache the offline page so the service worker has it available
  additionalPrecacheEntries: [{ url: "/~offline", revision: "1" }],
});

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  turbopack: {},
  async headers() {
    return [
      {
        // The reset token rides in the query string. Suppress the Referer so it
        // cannot leak to any third-party origin the page happens to talk to.
        // (ResetPasswordForm also strips it from the address bar on mount.)
        source: "/reset-password",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
};

export default withSerwist(nextConfig);
