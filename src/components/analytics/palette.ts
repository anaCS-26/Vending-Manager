import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

/**
 * ============================================================================
 * CHART PALETTE
 *
 * Chart colour is not styling — it is the encoding, so it is validated rather
 * than chosen. Every set below was run through the data-viz validator against
 * the surface it actually paints on (the glass panel over `--background`:
 * ~#fdfdfe light, ~#131315 dark) and clears the lightness band, chroma floor,
 * colour-blind separation (ΔE ≥ 8, OKLab ×100), normal-vision separation
 * (ΔE ≥ 15) and 3:1 contrast checks.
 *
 * THE DARK COLUMN IS NOT AN AUTOMATIC FLIP of the light one. Raw
 * `accent-orange` (#f97316) and `accent-green` (#10b981) sit at OKLCH L 0.70,
 * outside the 0.48–0.67 band a dark surface needs — they glare. The dark
 * column steps both down one notch (#ea580c / #059669) and was validated as
 * its own set. Do not "simplify" this to one palette.
 *
 * Three rules for anyone extending this:
 *
 * 1. **Assign slots in fixed order and never cycle.** `series[0]` is the first
 *    series in a chart, always. A 6th series is not a generated 6th hue — fold
 *    the tail into "Other" (the grey `deemphasis` token) or facet. The
 *    predecessor cycled a 10-colour list by array index, which meant a filter
 *    that changed the series count repainted the survivors.
 * 2. **Colour follows the entity, not its rank.** Never key a colour off a
 *    sort position.
 * 3. **Status is reserved.** `status.*` means good/warning/critical and never
 *    "series 4"; and because red↔green is the classic colour-blind collision,
 *    a status colour always ships beside an icon and a word, never alone.
 *
 * Both orange and green fall below 3:1 against the LIGHT surface. That is a
 * documented warning, not a pass: it obligates every chart using them to carry
 * visible labels or a table view. `ChartCard` gives every chart a table view,
 * which is what discharges it.
 * ============================================================================
 */

export type VizMode = "light" | "dark";

export type VizPalette = {
    mode: VizMode;
    /** Categorical identity slots, in assignment order. */
    series: [string, string, string, string, string];
    /** Continuous magnitude, low → high. On dark this runs dark → light, so the
     *  low end recedes into the surface in both modes. */
    sequential: string[];
    /** Reserved state colours. Always paired with an icon + label. */
    status: { good: string; warning: string; critical: string };
    /** "Everything else" / context marks. Never carries identity. */
    deemphasis: string;
    grid: string;
    axis: string;
    /** Panel background — also the colour of the 2px gaps between marks. */
    surface: string;
    tooltipBg: string;
    tooltipBorder: string;
    ink: string;
};

const LIGHT: VizPalette = {
    mode: "light",
    series: ["#3b82f6", "#f97316", "#10b981", "#6366f1", "#f43f5e"],
    sequential: ["#eff6ff", "#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb", "#1d4ed8"],
    status: { good: "#0ca30c", warning: "#d97706", critical: "#d03b3b" },
    deemphasis: "#cbd5e1",
    grid: "rgba(100,116,139,0.16)",
    axis: "#94a3b8",
    surface: "#ffffff",
    tooltipBg: "rgba(255,255,255,0.98)",
    tooltipBorder: "rgba(15,23,42,0.12)",
    ink: "#0f172a",
};

const DARK: VizPalette = {
    mode: "dark",
    series: ["#3b82f6", "#ea580c", "#059669", "#6366f1", "#f43f5e"],
    sequential: ["#111827", "#172554", "#1e3a8a", "#1e40af", "#2563eb", "#3b82f6", "#60a5fa", "#93c5fd"],
    status: { good: "#0ca30c", warning: "#fab219", critical: "#e05252" },
    deemphasis: "#475569",
    grid: "rgba(148,163,184,0.14)",
    axis: "#64748b",
    surface: "#131315",
    tooltipBg: "rgba(9,9,11,0.95)",
    tooltipBorder: "rgba(255,255,255,0.12)",
    ink: "#f8fafc",
};

export const VIZ: Record<VizMode, VizPalette> = { light: LIGHT, dark: DARK };

/**
 * Resolves the palette for the active theme.
 *
 * `mounted` is returned rather than swallowed because charts must not render
 * before it: `resolvedTheme` is undefined on the server and on first paint, so
 * a chart that painted immediately would flash the light palette on a dark
 * page. Every chart here holds a skeleton until this reports true — which also
 * covers Recharts, which needs a measured DOM box regardless.
 */
export function useVizPalette(): VizPalette & { mounted: boolean } {
    const { resolvedTheme } = useTheme();
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const palette = mounted && resolvedTheme === "light" ? LIGHT : DARK;
    return { ...palette, mounted };
}

/**
 * Picks white or near-black ink for text sitting ON a coloured fill (a heat
 * cell, a stacked segment), by the fill's relative luminance. The one place
 * text is allowed to sit inside a data colour — everywhere else labels wear
 * text tokens and identity comes from a swatch beside them.
 */
export function inkOn(hex: string): string {
    const n = hex.replace("#", "");
    const to = (i: number) => parseInt(n.slice(i, i + 2), 16) / 255;
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const luminance = 0.2126 * lin(to(0)) + 0.7152 * lin(to(2)) + 0.0722 * lin(to(4));
    return luminance > 0.42 ? "#0f172a" : "#ffffff";
}

/**
 * Maps a 0–1 magnitude onto the sequential ramp. Zero is deliberately excluded
 * by callers (an empty cell gets the surface, not the ramp's first step) so the
 * ramp's whole length is spent on values that exist.
 */
export function sequentialStep(palette: VizPalette, t: number): string {
    const steps = palette.sequential;
    const i = Math.min(steps.length - 1, Math.max(0, Math.round(t * (steps.length - 1))));
    return steps[i];
}
