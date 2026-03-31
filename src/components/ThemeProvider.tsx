"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { type ThemeProviderProps } from "next-themes";

// Suppress the React 19 "Encountered a script tag" false-positive warning
// This occurs because next-themes injects a script to prevent theme flashing
if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
    const originalError = console.error;
    console.error = (...args) => {
        if (typeof args[0] === "string" && args[0].includes("Encountered a script tag")) {
            return;
        }
        originalError.apply(console, args);
    };
}

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
    return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
