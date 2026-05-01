import type { Metadata } from "next";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Outfit, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import { RealtimeRefresher } from "@/components/RealtimeRefresher";
const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
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
    <html lang="en" className={`${outfit.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
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
                fontFamily: "var(--font-outfit)",
              },
            }}
            richColors
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
