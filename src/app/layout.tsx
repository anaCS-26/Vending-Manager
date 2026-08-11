import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Geist, Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import { RealtimeRefresher } from "@/components/RealtimeRefresher";
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

// Display face — headings and KPI values only. The `opsz` axis is the reason
// this one works here: Bricolage's ink traps and eccentric proportions bloom at
// large sizes and quietly normalise at small ones, so the same family can be
// characterful in a page title without becoming a legibility risk if it ever
// lands on something small. Caps at 800 — never style it `font-black` (900) or
// the browser will synthesise the weight.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["opsz"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Vending Manager Pro",
  description: "A professional inventory management system for vending routes.",
  manifest: "/manifest.json",
  // Drivers run this from the home screen on iOS, where the tab-bar chrome is
  // gone and the status bar overlaps the page unless it's declared translucent.
  appleWebApp: {
    capable: true,
    title: "NexGen VMS",
    statusBarStyle: "black-translucent",
  },
  // iOS ignores the manifest's icon list entirely and reads only this. The file
  // isn't in the repo yet — see public/icons/README.md for the spec. Until it
  // lands the browser falls back to /favicon.ico, exactly as it does today.
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/apple-touch-icon.png",
  },
};

/**
 * `viewportFit: "cover"` lets the app paint under the notch and the iOS home
 * indicator; everything that sits at a screen edge then pays that back with the
 * `pb-safe` / `pt-safe` utilities in globals.css. Without it, `env(safe-area-inset-*)`
 * resolves to 0 and the driver's Submit bar sits under the home indicator.
 *
 * `maximumScale` is deliberately left unset — pinch-zoom is an accessibility
 * affordance, and the iOS focus-zoom it's usually suppressed for is already
 * handled by keeping every input at >=16px.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geist.variable} ${bricolage.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body className="antialiased font-sans transition-colors duration-300" suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <RealtimeRefresher />
          {children}
          <SpeedInsights />
          <Analytics />
          <Toaster
            position="bottom-right"
            toastOptions={{
              className: "dark:!bg-zinc-900 dark:!border-slate-200 dark:border-white/10 dark:!text-slate-50 !bg-white !border-slate-200 !text-slate-900",
              style: {
                fontFamily: "var(--font-geist)",
              },
            }}
            richColors
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
