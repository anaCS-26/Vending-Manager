"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
            // eslint-disable-next-line react-hooks/set-state-in-effect
        setMounted(true);
    }, []);

    if (!mounted) return <div className="w-10 h-10" />;

    return (
        <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="p-2 rounded-xl border border-border bg-background hover:bg-neo-surface transition-colors flex items-center justify-center relative overflow-hidden group"
            aria-label="Toggle Theme"
        >
            <div className="relative w-6 h-6 flex items-center justify-center">
                <Sun className={`absolute w-5 h-5 transition-all duration-300 text-amber-500 scale-0 opacity-0 dark:scale-100 dark:opacity-100`} />
                <Moon className={`absolute w-5 h-5 transition-all duration-300 text-slate-700 scale-100 opacity-100 dark:scale-0 dark:opacity-0`} />
            </div>
        </button>
    );
}
