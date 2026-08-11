/**
 * The Saudi Riyal mark, drawn rather than typed.
 *
 * The character form (U+20C1) is a 2025 Unicode addition. Most Android builds
 * and any iOS older than the current major have no glyph for it, so on the
 * phones this app is actually read from it renders as tofu — which is what the
 * admin dashboard's revenue KPI was doing. An inline SVG has no font dependency
 * and renders identically everywhere.
 *
 * `formatCurrency` in src/lib/utils.ts deliberately keeps the character: it
 * returns a `string` that the Excel export depends on, and a component can't go
 * in a spreadsheet cell. Use this for *display* figures — KPI values, headline
 * totals, anything set large enough that a missing glyph is the first thing you
 * see. Small tabular figures can keep the string form.
 *
 * ⚠️ This path is a hand-built rendition in the stroke idiom of the lucide icons
 * used everywhere else, not the official artwork. If brand exactness matters,
 * replace the path with SAMA's published asset — nothing else needs to change.
 */
export function RiyalSymbol({
    className = "",
    label,
}: {
    className?: string;
    /** Set when the symbol appears without adjacent context naming the currency. */
    label?: string;
}) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            // 1em square and baseline-nudged so it sits in a line of text like a
            // glyph would, at whatever size the surrounding type happens to be.
            className={`inline-block w-[1em] h-[1em] -mb-[0.08em] shrink-0 ${className}`}
            role={label ? "img" : "presentation"}
            aria-label={label}
            aria-hidden={label ? undefined : true}
        >
            {/* Two uprights descending from the top, joined low — the reh form. */}
            <path d="M8 4v9.5a3.5 3.5 0 0 0 3.5 3.5H16" />
            <path d="M16 4v8" />
            {/* The pair of horizontal bars that mark it as a currency sign. */}
            <path d="M4 17.5 20 15" />
            <path d="M4 21 20 18.5" />
        </svg>
    );
}

/**
 * A currency figure for display: the drawn mark plus a grouped number.
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
    return (
        <span className={`inline-flex items-baseline gap-1.5 ${className}`}>
            <RiyalSymbol className="opacity-70" label="Saudi riyal" />
            <span>
                {amount.toLocaleString("en-US", {
                    minimumFractionDigits: decimals,
                    maximumFractionDigits: decimals,
                })}
            </span>
        </span>
    );
}
