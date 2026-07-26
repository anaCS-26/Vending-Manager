"use client";

import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return <div className="w-10 h-10" />;

    return (
        <button
            onClick={() => {
                const nextTheme = theme === "dark" ? "light" : "dark";
                if (!document.startViewTransition) {
                    setTheme(nextTheme);
                    return;
                }
                document.startViewTransition(() => {
                    // Force the actual CSS DOM change synchronously so the Browser's 
                    // View Transition API captures the "new" screenshot immediately
                    document.documentElement.classList.remove(theme === "dark" ? "dark" : "light");
                    document.documentElement.classList.add(nextTheme);
                    document.documentElement.style.colorScheme = nextTheme;
                    
                    // Sync up the React/Next-Themes state afterward
                    setTheme(nextTheme);
                });
            }}
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
