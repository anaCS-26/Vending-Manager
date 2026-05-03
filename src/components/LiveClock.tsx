"use client";

import { useEffect, useState } from "react";

export default function LiveClock() {
    // Render same string server- and client-side initially to avoid hydration mismatch.
    const [now, setNow] = useState<Date | null>(null);

    useEffect(() => {
        setNow(new Date());
        const id = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    const timeStr = now
        ? now.toLocaleTimeString("en-US", {
              timeZone: "Asia/Riyadh",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
          })
        : "--:--";

    const seconds = now
        ? now.toLocaleTimeString("en-US", {
              timeZone: "Asia/Riyadh",
              second: "2-digit",
          })
        : "--";

    return (
        <div className="flex items-baseline gap-1 font-mono tabular-nums">
            <span className="text-4xl font-bold text-slate-900 dark:text-white tracking-tight">
                {timeStr}
            </span>
            <span className="text-sm text-slate-400 dark:text-slate-500">:{seconds}</span>
            <span className="ml-2 text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Riyadh
            </span>
        </div>
    );
}
