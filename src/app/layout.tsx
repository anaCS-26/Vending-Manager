import type { Metadata } from "next";
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
