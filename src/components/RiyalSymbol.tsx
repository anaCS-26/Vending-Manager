"use client";

import { useEffect, useState } from "react";

/** U+20C1 SAUDI RIYAL SIGN — the same literal `formatCurrency` emits. */
const RIYAL = "⃁";

/** U+FFFF: a permanent noncharacter, so no font may ever map it. */
const NONCHARACTER = "￿";

/**
 * Renders the real riyal character, falling back to `SAR` only on devices whose
 * fonts can't draw it.
 *
 * U+20C1 is a 2025 Unicode addition, so coverage is good on current iOS and
 * absent on most Android builds — where it renders as tofu. An SVG rendition
 * fixes that everywhere but looks like a drawing sitting in a line of type, so
 * this keeps the character wherever the device can actually show it and swaps in
 * the ISO code only where it can't.
 */

// Measured once per page load; every instance reads the same answer.
let cachedSupport: boolean | null = null;

function detectRiyalGlyph(): boolean {
    if (cachedSupport !== null) return cachedSupport;

    try {
        const ctx = document.createElement("canvas").getContext("2d");
        if (!ctx) return (cachedSupport = true);

        // Measured against U+FFFF, a permanent noncharacter that no font may map,
        // so its width is by definition the .notdef box. A character that
        // measures the same width is being drawn as that same box — i.e. tofu.
        // `sans-serif` rather than the app's stack because the browser resolves a
        // glyph missing from a webfont through the system fonts anyway.
        ctx.font = "72px sans-serif";
        const riyal = ctx.measureText(RIYAL).width;
        const notdef = ctx.measureText(NONCHARACTER).width;

        cachedSupport = riyal > 0 && Math.abs(riyal - notdef) > 0.01;
    } catch {
        // Canvas blocked (privacy settings, some embedded webviews). Assume the
        // glyph works: a wrong "supported" shows tofu, a wrong "missing" shows
        // SAR to everyone, and the first is the smaller regression.
        cachedSupport = true;
    }

    return cachedSupport;
}

function useRiyalGlyph(): boolean {
    // Optimistic: server render and first paint both emit the character, so
    // hydration matches and devices that can draw it never flicker. The swap to
    // SAR happens on mount, on the minority of devices that can't.
    const [supported, setSupported] = useState(true);

    useEffect(() => {
        setSupported(detectRiyalGlyph());
    }, []);

    return supported;
}

export function RiyalSymbol({ className = "" }: { className?: string }) {
    const supported = useRiyalGlyph();

    return (
        <span className={className} aria-label="Saudi riyal" role="img">
            {supported ? RIYAL : "SAR"}
        </span>
    );
}

/**
 * A currency figure for display: the mark plus a grouped number.
 *
 * Unlike `formatCurrency` this groups thousands, because the figures it's used
 * on are the big ones — a seven-digit inventory value is unreadable unbroken.
 * `decimals={0}` for counts-of-riyals like the day's revenue.
 */
export function Money({
    amount,
    decimals = 2,
    className = "",
}: {
    amount: number;
    decimals?: number;
    className?: string;
}) {
    const supported = useRiyalGlyph();

    return (
        <span className={`inline-flex items-baseline gap-1.5 ${className}`}>
            {/* The ISO code is a word, so it needs to sit back from the number the
                way a symbol does — hence the size step-down when it's in use. */}
            <span className={supported ? "opacity-80" : "text-[0.5em] font-mono font-bold opacity-70"}>
                {supported ? RIYAL : "SAR"}
            </span>
            <span>
                {amount.toLocaleString("en-US", {
                    minimumFractionDigits: decimals,
                    maximumFractionDigits: decimals,
                })}
            </span>
        </span>
    );
}
