/**
 * ============================================================================
 * ANALYTICS MATH
 *
 * Every number the admin Analytics page renders is derived here. Pure
 * functions only — no Prisma, no React, no `new Date()` outside an explicit
 * argument — so the whole page's arithmetic is unit-testable without a DB
 * (tests/lib/analytics.test.ts), the same split `src/lib/forecast.ts` and
 * `src/lib/refill-entry.ts` use.
 *
 * TWO THINGS ABOUT THIS DOMAIN THAT THE CHARTS MUST NOT MISREPRESENT:
 *
 * 1. There is no point-of-sale telemetry. A `RefillLog` row says "when I
 *    arrived, N units were gone since my last visit" — so revenue is
 *    attributed to the instant of the *refill*, not to the instants of the
 *    sales, which happened spread across the preceding interval. Bucketing
 *    revenue by day is therefore lumpy by construction, and anything that
 *    reads as "sales by hour" would be a lie: it would be plotting the
 *    driver's route, not the customers. `buildServiceRhythm` is deliberately
 *    labelled as service visits for exactly this reason.
 *
 * 2. Money is read from the per-row snapshots (`sales_revenue`,
 *    `price_at_refill`, `cost_at_refill`) and never re-derived from the live
 *    `Item` — see vms-accounting-wac. `rowRevenue`/`rowCogs` are the only
 *    two places that decide this, and they fall back to the live item values
 *    only for legacy rows written before the snapshot columns existed.
 * ============================================================================
 */

export const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Asia/Riyadh is a fixed +03:00 offset year-round (no DST), so bucketing by
 *  Riyadh calendar day/hour is exact arithmetic rather than an Intl round-trip
 *  per row — which matters when this runs over tens of thousands of rows. */
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Range
// ---------------------------------------------------------------------------

export type AnalyticsRange = "7d" | "30d" | "90d";

export const RANGE_DAYS: Record<AnalyticsRange, number> = { "7d": 7, "30d": 30, "90d": 90 };

export const RANGE_LABELS: Record<AnalyticsRange, string> = {
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    "90d": "Last 90 days",
};

/** Anything unrecognised (including undefined) falls back to 30 days. */
export function parseRange(value: string | undefined): AnalyticsRange {
    return value === "7d" || value === "30d" || value === "90d" ? value : "30d";
}

// ---------------------------------------------------------------------------
// Riyadh calendar bucketing
// ---------------------------------------------------------------------------

/** `YYYY-MM-DD` for the Riyadh calendar day containing this instant. */
export function riyadhDayKey(date: Date | number): string {
    const shifted = new Date(toMs(date) + RIYADH_OFFSET_MS);
    return shifted.toISOString().slice(0, 10);
}

/** Riyadh weekday, 0 = Sunday (the first working day of the Saudi week). */
export function riyadhWeekday(date: Date | number): number {
    return new Date(toMs(date) + RIYADH_OFFSET_MS).getUTCDay();
}

/** Riyadh hour of day, 0–23. */
export function riyadhHour(date: Date | number): number {
    return new Date(toMs(date) + RIYADH_OFFSET_MS).getUTCHours();
}

function toMs(date: Date | number): number {
    return typeof date === "number" ? date : date.getTime();
}

/** Sunday-first, matching `riyadhWeekday`. */
export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

// ---------------------------------------------------------------------------
// Row shapes (structural — the page selects exactly these columns)
// ---------------------------------------------------------------------------

export type RefillRow = {
    machineId: number;
    itemId: number;
    driverId: number | null;
    refilled_at: Date;
    quantity_refilled: number;
    items_sold_since_last_refill: number | null;
    sales_revenue: number;
    price_at_refill: number;
    cost_at_refill: number;
};

export type ReturnRow = {
    itemId: number;
    driverId: number | null;
    quantity: number;
    reason: string;
    reported_at: Date;
    item: { cost: number };
};

/** Units the row reports as sold. Null means "not measured", not zero sales —
 *  but there is nothing to count either way, so it floors to 0. */
export function rowUnits(row: Pick<RefillRow, "items_sold_since_last_refill">): number {
    return row.items_sold_since_last_refill ?? 0;
}

export function rowRevenue(row: RefillRow): number {
    return row.sales_revenue || rowUnits(row) * (row.price_at_refill || 0);
}

export function rowCogs(row: RefillRow): number {
    return rowUnits(row) * (row.cost_at_refill || 0);
}

// ---------------------------------------------------------------------------
// Service visits (sessions)
// ---------------------------------------------------------------------------

/** Two refills by the same driver at the same machine inside this gap are the
 *  same physical visit. One visit writes one row per item slot touched — the
 *  fleet's mean is 7.6 — so counting rows would overstate visits ~8x. */
export const VISIT_GAP_MS = 30 * 60 * 1000;

export type Visit = { machineId: number; driverId: number | null; at: Date; rows: number };

/**
 * Collapses refill rows into physical visits: same machine + same driver,
 * consecutive in time with no gap longer than `VISIT_GAP_MS`. The visit's
 * timestamp is its first row's.
 *
 * Greedy over a sorted list rather than a fixed 10-minute bucket, because a
 * bucket boundary landing mid-refill splits one visit into two and a driver
 * working a large machine routinely takes longer than one bucket.
 */
export function collapseVisits(rows: RefillRow[]): Visit[] {
    const byKey = new Map<string, RefillRow[]>();
    for (const r of rows) {
        const key = `${r.machineId}:${r.driverId ?? "none"}`;
        const bucket = byKey.get(key);
        if (bucket) bucket.push(r);
        else byKey.set(key, [r]);
    }

    const visits: Visit[] = [];
    for (const [, bucket] of byKey) {
        bucket.sort((a, b) => a.refilled_at.getTime() - b.refilled_at.getTime());
        let current: Visit | null = null;
        let lastAt = 0;
        for (const r of bucket) {
            const at = r.refilled_at.getTime();
            if (current && at - lastAt <= VISIT_GAP_MS) {
                current.rows += 1;
            } else {
                current = { machineId: r.machineId, driverId: r.driverId, at: r.refilled_at, rows: 1 };
                visits.push(current);
            }
            lastAt = at;
        }
    }
    return visits.sort((a, b) => a.at.getTime() - b.at.getTime());
}

// ---------------------------------------------------------------------------
// Totals
// ---------------------------------------------------------------------------

export type Totals = {
    revenue: number;
    cogs: number;
    grossProfit: number;
    /** Gross margin as a percentage of revenue. 0 revenue → 0, never NaN. */
    marginPct: number;
    units: number;
    visits: number;
    machinesServed: number;
    shrinkageUnits: number;
    shrinkageValue: number;
};

export function summarize(rows: RefillRow[], returns: ReturnRow[]): Totals {
    let revenue = 0;
    let cogs = 0;
    let units = 0;
    const machines = new Set<number>();

    for (const r of rows) {
        revenue += rowRevenue(r);
        cogs += rowCogs(r);
        units += rowUnits(r);
        machines.add(r.machineId);
    }

    let shrinkageUnits = 0;
    let shrinkageValue = 0;
    for (const rv of returns) {
        shrinkageUnits += rv.quantity;
        shrinkageValue += rv.quantity * (rv.item.cost || 0);
    }

    const grossProfit = revenue - cogs;
    return {
        revenue,
        cogs,
        grossProfit,
        marginPct: revenue > 0 ? (grossProfit / revenue) * 100 : 0,
        units,
        visits: collapseVisits(rows).length,
        machinesServed: machines.size,
        shrinkageUnits,
        shrinkageValue,
    };
}

/**
 * Percentage change, or null when there is no basis for one. A previous value
 * of 0 is NOT a 100% rise — it's "no comparison", and the UI says so rather
 * than printing a number the reader would take literally.
 */
export function pctDelta(current: number, previous: number): number | null {
    if (previous === 0) return current === 0 ? 0 : null;
    return ((current - previous) / previous) * 100;
}

// ---------------------------------------------------------------------------
// Daily series
// ---------------------------------------------------------------------------

export type DailyPoint = {
    /** Riyadh calendar day, `YYYY-MM-DD`. */
    date: string;
    revenue: number;
    cogs: number;
    grossProfit: number;
    units: number;
    visits: number;
};

/**
 * Zero-filled daily series covering exactly `days` Riyadh calendar days ending
 * on the day containing `endMs`. Zero-filling is load-bearing: a day with no
 * refills is a real zero, and letting the x-axis skip it (which the previous
 * chart did) compresses quiet stretches and makes the line lie about slope.
 */
export function buildDailySeries(rows: RefillRow[], endMs: number, days: number): DailyPoint[] {
    const series: DailyPoint[] = [];
    const index = new Map<string, DailyPoint>();

    for (let i = days - 1; i >= 0; i--) {
        const point: DailyPoint = {
            date: riyadhDayKey(endMs - i * MS_PER_DAY),
            revenue: 0,
            cogs: 0,
            grossProfit: 0,
            units: 0,
            visits: 0,
        };
        series.push(point);
        index.set(point.date, point);
    }

    for (const r of rows) {
        const point = index.get(riyadhDayKey(r.refilled_at));
        if (!point) continue;
        point.revenue += rowRevenue(r);
        point.cogs += rowCogs(r);
        point.units += rowUnits(r);
    }
    for (const v of collapseVisits(rows)) {
        const point = index.get(riyadhDayKey(v.at));
        if (point) point.visits += 1;
    }
    for (const point of series) point.grossProfit = point.revenue - point.cogs;

    return series;
}

/**
 * Trailing moving average. Entries before the window is full are null so the
 * line starts where it becomes meaningful instead of ramping up from a partial
 * average that reads as a trend.
 */
export function movingAverage(values: number[], window: number): (number | null)[] {
    const out: (number | null)[] = [];
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
        sum += values[i];
        if (i >= window) sum -= values[i - window];
        out.push(i >= window - 1 ? sum / window : null);
    }
    return out;
}

// ---------------------------------------------------------------------------
// Service rhythm (weekday × hour)
// ---------------------------------------------------------------------------

export type RhythmCell = { weekday: number; hour: number; visits: number };

/**
 * Dense 7×24 grid of service visits by Riyadh weekday and hour. Dense, not
 * sparse: an empty cell is information (nobody services this machine on a
 * Friday evening) and a heatmap with holes in it can't show that.
 */
export function buildServiceRhythm(rows: RefillRow[]): RhythmCell[] {
    const counts = new Array(7 * 24).fill(0);
    for (const v of collapseVisits(rows)) {
        counts[riyadhWeekday(v.at) * 24 + riyadhHour(v.at)] += 1;
    }
    const cells: RhythmCell[] = [];
    for (let weekday = 0; weekday < 7; weekday++) {
        for (let hour = 0; hour < 24; hour++) {
            cells.push({ weekday, hour, visits: counts[weekday * 24 + hour] });
        }
    }
    return cells;
}

// ---------------------------------------------------------------------------
// Per-entity roll-ups
// ---------------------------------------------------------------------------

export type EntityTotals = {
    id: number;
    revenue: number;
    cogs: number;
    grossProfit: number;
    marginPct: number;
    units: number;
    visits: number;
};

/** Roll refill rows up by machine or by item. `by` picks the key column. */
export function rollup(rows: RefillRow[], by: "machineId" | "itemId"): Map<number, EntityTotals> {
    const out = new Map<number, EntityTotals>();
    for (const r of rows) {
        const id = r[by];
        let e = out.get(id);
        if (!e) {
            e = { id, revenue: 0, cogs: 0, grossProfit: 0, marginPct: 0, units: 0, visits: 0 };
            out.set(id, e);
        }
        e.revenue += rowRevenue(r);
        e.cogs += rowCogs(r);
        e.units += rowUnits(r);
    }
    if (by === "machineId") {
        for (const v of collapseVisits(rows)) {
            const e = out.get(v.machineId);
            if (e) e.visits += 1;
        }
    }
    for (const e of out.values()) {
        e.grossProfit = e.revenue - e.cogs;
        e.marginPct = e.revenue > 0 ? (e.grossProfit / e.revenue) * 100 : 0;
    }
    return out;
}

/** Median of a numeric list (mean of the middle pair when even). Empty → 0. */
export function median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ---------------------------------------------------------------------------
// Concentration (Pareto)
// ---------------------------------------------------------------------------

export type ParetoSlice = {
    name: string;
    revenue: number;
    /** This entry's share of total revenue, 0–100. */
    share: number;
    /** Running total of `share` including this entry, 0–100. */
    cumulative: number;
    /** True for the folded tail row. */
    isTail: boolean;
};

/**
 * Revenue concentration, plotted in share-space.
 *
 * Both series are percentages so they sit on ONE axis — the textbook Pareto
 * (revenue bars + cumulative-% line) is a dual-axis chart, which invents a
 * relationship between two arbitrary scales. Per-entry share and cumulative
 * share are the same unit, so the reading is honest and the 80% line means
 * what it looks like it means.
 *
 * Everything past `topN` folds into one "Other" row rather than being dropped:
 * the whole point of the chart is that the tail sums to something.
 */
export function buildPareto(
    entries: { name: string; revenue: number }[],
    topN: number,
): { slices: ParetoSlice[]; total: number; itemsTo80: number } {
    const positive = entries.filter((e) => e.revenue > 0).sort((a, b) => b.revenue - a.revenue);
    const total = positive.reduce((s, e) => s + e.revenue, 0);
    if (total <= 0) return { slices: [], total: 0, itemsTo80: 0 };

    // How many entries it takes to reach 80% of revenue — computed on the
    // unfolded list, so the headline isn't distorted by where we cut the chart.
    let running = 0;
    let itemsTo80 = 0;
    for (const e of positive) {
        running += e.revenue;
        itemsTo80 += 1;
        if ((running / total) * 100 >= 80) break;
    }

    const head = positive.slice(0, topN);
    const tail = positive.slice(topN);
    const rows = [...head];
    if (tail.length > 0) {
        rows.push({ name: `Other (${tail.length})`, revenue: tail.reduce((s, e) => s + e.revenue, 0) });
    }

    let cumulative = 0;
    const slices = rows.map((e, i) => {
        const share = (e.revenue / total) * 100;
        cumulative += share;
        return {
            name: e.name,
            revenue: e.revenue,
            share,
            // Guard the float drift that otherwise prints 100.00000000000003.
            cumulative: Math.min(100, cumulative),
            isTail: tail.length > 0 && i === rows.length - 1,
        };
    });

    return { slices, total, itemsTo80 };
}

// ---------------------------------------------------------------------------
// Movers
// ---------------------------------------------------------------------------

export type Mover = {
    id: number;
    name: string;
    current: number;
    previous: number;
    delta: number;
    /** Null when the previous window had none of this item — see `pctDelta`. */
    deltaPct: number | null;
};

/**
 * Biggest absolute revenue swings between two equal-length windows.
 *
 * Ranked by absolute change, not by percentage: an item that went from SAR 4 to
 * SAR 12 is a 200% riser and nobody cares, while the line that quietly dropped
 * SAR 900 is the one an admin needs to see. Percentage is shown alongside, as
 * context for the number that did the sorting.
 */
export function buildMovers(
    current: Map<number, EntityTotals>,
    previous: Map<number, EntityTotals>,
    names: Map<number, string>,
    limit: number,
): { risers: Mover[]; fallers: Mover[] } {
    const ids = new Set<number>([...current.keys(), ...previous.keys()]);
    const movers: Mover[] = [];

    for (const id of ids) {
        const curr = current.get(id)?.revenue ?? 0;
        const prev = previous.get(id)?.revenue ?? 0;
        const delta = curr - prev;
        if (delta === 0) continue;
        movers.push({
            id,
            name: names.get(id) ?? `#${id}`,
            current: curr,
            previous: prev,
            delta,
            deltaPct: pctDelta(curr, prev),
        });
    }

    const byDelta = [...movers].sort((a, b) => b.delta - a.delta);
    return {
        risers: byDelta.filter((m) => m.delta > 0).slice(0, limit),
        fallers: byDelta
            .filter((m) => m.delta < 0)
            .reverse()
            .slice(0, limit),
    };
}

// ---------------------------------------------------------------------------
// Loss
// ---------------------------------------------------------------------------

export type LossBucket = { date: string; damaged: number; expired: number };

/**
 * Damaged/expired loss value bucketed into `bucketDays`-wide bins ending on
 * `endMs`, oldest first. Weekly bins for a 90-day window; a daily loss series
 * is almost all zeros because returns are verified in batches.
 */
export function buildLossSeries(
    returns: ReturnRow[],
    endMs: number,
    days: number,
    bucketDays: number,
): LossBucket[] {
    const bucketCount = Math.ceil(days / bucketDays);
    const buckets: LossBucket[] = [];
    for (let i = bucketCount - 1; i >= 0; i--) {
        buckets.push({
            date: riyadhDayKey(endMs - ((i + 1) * bucketDays - 1) * MS_PER_DAY),
            damaged: 0,
            expired: 0,
        });
    }

    const windowStart = endMs - (days - 1) * MS_PER_DAY;
    for (const rv of returns) {
        const age = endMs - rv.reported_at.getTime();
        if (rv.reported_at.getTime() < windowStart - MS_PER_DAY || age < 0) continue;
        const index = bucketCount - 1 - Math.floor(age / (bucketDays * MS_PER_DAY));
        if (index < 0 || index >= bucketCount) continue;
        const value = rv.quantity * (rv.item.cost || 0);
        if (rv.reason === "EXPIRED") buckets[index].expired += value;
        else buckets[index].damaged += value;
    }

    return buckets;
}

/** Loss value per item over the window, worst first. */
export function topLossItems(
    returns: ReturnRow[],
    names: Map<number, string>,
    limit: number,
): { id: number; name: string; units: number; value: number }[] {
    const byItem = new Map<number, { units: number; value: number }>();
    for (const rv of returns) {
        const e = byItem.get(rv.itemId) ?? { units: 0, value: 0 };
        e.units += rv.quantity;
        e.value += rv.quantity * (rv.item.cost || 0);
        byItem.set(rv.itemId, e);
    }
    return [...byItem.entries()]
        .map(([id, e]) => ({ id, name: names.get(id) ?? `#${id}`, ...e }))
        .sort((a, b) => b.value - a.value)
        .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Category mix
// ---------------------------------------------------------------------------

export type CategorySlice = {
    name: string;
    revenue: number;
    units: number;
    share: number;
    /** True for the folded "Other" row, which wears the de-emphasis grey. */
    isTail: boolean;
};

/**
 * Revenue share by product category, top `topN` plus a folded remainder.
 *
 * `topN` is capped at 4 by the caller for a reason worth stating: past roughly
 * seven colour classes adjacent hues stop being separable, and the categorical
 * palette here is five slots deep — four identities plus one grey "Other" is
 * exactly what it can carry honestly. The predecessor cycled a ten-colour list
 * by array index across the full catalogue.
 */
export function buildCategoryMix(
    rows: RefillRow[],
    categoryOf: Map<number, string>,
    topN: number,
): CategorySlice[] {
    const byCategory = new Map<string, { revenue: number; units: number }>();
    for (const r of rows) {
        const name = categoryOf.get(r.itemId) || "Uncategorised";
        const e = byCategory.get(name) ?? { revenue: 0, units: 0 };
        e.revenue += rowRevenue(r);
        e.units += rowUnits(r);
        byCategory.set(name, e);
    }

    const ranked = [...byCategory.entries()]
        .map(([name, e]) => ({ name, ...e }))
        .filter((e) => e.revenue > 0)
        .sort((a, b) => b.revenue - a.revenue);

    const total = ranked.reduce((s, e) => s + e.revenue, 0);
    if (total <= 0) return [];

    const head = ranked.slice(0, topN);
    const tail = ranked.slice(topN);
    const slices = head.map((e) => ({ ...e, share: (e.revenue / total) * 100, isTail: false }));

    if (tail.length > 0) {
        const revenue = tail.reduce((s, e) => s + e.revenue, 0);
        slices.push({
            name: `Other (${tail.length})`,
            revenue,
            units: tail.reduce((s, e) => s + e.units, 0),
            share: (revenue / total) * 100,
            isTail: true,
        });
    }

    return slices;
}

// ---------------------------------------------------------------------------
// Driver activity
// ---------------------------------------------------------------------------

export type DriverActivity = {
    id: number;
    name: string;
    visits: number;
    machines: number;
    unitsRefilled: number;
    revenue: number;
    writeOffUnits: number;
    writeOffValue: number;
    /** Written-off units as a share of units refilled, 0–100. */
    writeOffRate: number;
    /** Mean item lines touched per visit — how deep a stop goes. */
    linesPerVisit: number;
};

/**
 * Per-driver workload and handling. Rows with no `driverId` are skipped rather
 * than bucketed into an "unknown" driver: legacy dispatch-path refills carry
 * the driver on the dispatch instead, and inventing a driver for them would
 * quietly put one route's numbers under a name that never drove it.
 */
export function buildDriverActivity(
    rows: RefillRow[],
    returns: ReturnRow[],
    names: Map<number, string>,
): DriverActivity[] {
    type Acc = { lines: number; machines: Set<number>; unitsRefilled: number; revenue: number };
    const byDriver = new Map<number, Acc>();

    for (const r of rows) {
        if (r.driverId == null) continue;
        let a = byDriver.get(r.driverId);
        if (!a) {
            a = { lines: 0, machines: new Set(), unitsRefilled: 0, revenue: 0 };
            byDriver.set(r.driverId, a);
        }
        a.lines += 1;
        a.machines.add(r.machineId);
        a.unitsRefilled += r.quantity_refilled;
        a.revenue += rowRevenue(r);
    }

    const visitsByDriver = new Map<number, number>();
    for (const v of collapseVisits(rows)) {
        if (v.driverId == null) continue;
        visitsByDriver.set(v.driverId, (visitsByDriver.get(v.driverId) ?? 0) + 1);
    }

    const writeOffs = new Map<number, { units: number; value: number }>();
    for (const rv of returns) {
        if (rv.driverId == null) continue;
        const e = writeOffs.get(rv.driverId) ?? { units: 0, value: 0 };
        e.units += rv.quantity;
        e.value += rv.quantity * (rv.item.cost || 0);
        writeOffs.set(rv.driverId, e);
    }

    const out: DriverActivity[] = [];
    for (const [id, a] of byDriver) {
        const visits = visitsByDriver.get(id) ?? 0;
        const off = writeOffs.get(id) ?? { units: 0, value: 0 };
        out.push({
            id,
            name: names.get(id) ?? `#${id}`,
            visits,
            machines: a.machines.size,
            unitsRefilled: a.unitsRefilled,
            revenue: a.revenue,
            writeOffUnits: off.units,
            writeOffValue: off.value,
            writeOffRate: a.unitsRefilled > 0 ? (off.units / a.unitsRefilled) * 100 : 0,
            linesPerVisit: visits > 0 ? a.lines / visits : 0,
        });
    }

    return out.sort((a, b) => b.visits - a.visits || b.unitsRefilled - a.unitsRefilled);
}

// ---------------------------------------------------------------------------
// Formatting helpers shared by axes, tooltips and table views
// ---------------------------------------------------------------------------

/**
 * Axis-tick money: "1.2k" / "84" / "3.1M". Axis labels have a few characters
 * of room and the tooltip carries the exact figure, so the tick's job is
 * ordering, not precision.
 */
export function formatCompact(value: number): string {
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
    if (abs >= 1_000) return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
    return Math.round(value).toString();
}

/** Thousands-grouped money with 2dp — the exact figure, for tooltips and tables. */
export function formatMoney(value: number): string {
    return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Signed percentage to one decimal, or an em dash when there's no basis. */
export function formatSignedPct(value: number | null): string {
    if (value === null) return "—";
    const rounded = Math.abs(value) < 0.05 ? 0 : value;
    return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}%`;
}
