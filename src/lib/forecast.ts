/**
 * Pure statistical primitives for demand forecasting & anomaly detection.
 *
 * No Prisma, no IO, no dates — just numbers in, numbers out. That keeps these
 * unit-testable in isolation (tests/lib/forecast.test.ts) and reusable across
 * actions. The action layer (src/actions/ai-lab.ts) is responsible for turning
 * RefillLog rows into the numeric series these functions consume.
 *
 * "Demand" throughout means UNITS SOLD PER DAY, reconstructed from
 * RefillLog.items_sold_since_last_refill — which is refilled-minus-returns, NOT
 * point-of-sale telemetry. Every refill event yields one observation of the
 * average daily sales rate over the interval that just closed. These functions
 * therefore operate on an array of per-interval daily rates (oldest → newest).
 */

export type Confidence = "low" | "medium" | "high";

/** Arithmetic mean. Empty input → 0 (so callers never get NaN). */
export function mean(series: number[]): number {
    if (series.length === 0) return 0;
    return series.reduce((s, x) => s + x, 0) / series.length;
}

/** Average daily demand across the sample. Alias of `mean` for call-site clarity. */
export function averageDailyDemand(series: number[]): number {
    return mean(series);
}

/**
 * Population standard deviation — our volatility proxy for safety-stock sizing.
 * Fewer than 2 points → 0 (a single observation has no spread to measure).
 */
export function demandStdDev(series: number[]): number {
    if (series.length < 2) return 0;
    const m = mean(series);
    const variance = series.reduce((s, x) => s + (x - m) ** 2, 0) / series.length;
    return Math.sqrt(variance);
}

/**
 * Exponentially weighted moving average over an oldest→newest series. Returns the
 * smoothed *current level* of demand, weighting recent intervals more heavily than
 * old ones (a machine's last few weeks predict next week better than two months ago).
 * `alpha` in (0,1]: higher = more reactive to recent data. Empty input → 0.
 */
export function ewma(series: number[], alpha = 0.4): number {
    if (series.length === 0) return 0;
    let level = series[0];
    for (let i = 1; i < series.length; i++) {
        level = alpha * series[i] + (1 - alpha) * level;
    }
    return level;
}

/**
 * Standard score of `value` against a baseline distribution. Used to decide how
 * abnormal the most recent interval is relative to a machine-item's own history.
 * A zero (or non-finite) baseline std → 0, since with no historical spread we
 * can't call anything an outlier on this signal alone.
 */
export function zScore(value: number, baselineMean: number, baselineStd: number): number {
    if (!baselineStd || baselineStd <= 0) return 0;
    return (value - baselineMean) / baselineStd;
}

/**
 * Estimated days until a machine-item runs dry at the given demand rate.
 * Demand ≤ 0 → null (no measurable consumption, so "never" rather than Infinity).
 * NOTE: `currentStock` is MachineStock.estimated_stock — an estimate, not a meter
 * reading — so the result is an estimate too. Surface it as such in the UI.
 */
export function daysUntilEmpty(currentStock: number, dailyDemand: number): number | null {
    if (dailyDemand <= 0) return null;
    return currentStock / dailyDemand;
}

/**
 * Recommended replenishment quantity to carry a machine-item to its next expected
 * visit without stocking out: forecast demand over the lead time plus a safety
 * buffer scaled by demand volatility.
 *
 *   recommended = dailyDemand × leadDays  +  serviceZ × std × √leadDays
 *
 * `serviceZ` is the service-level multiplier (≈1.65 ≈ 95% in-stock). The √leadDays
 * term is the textbook safety-stock formula (variance accumulates linearly over
 * independent days). Rounded up — you can't stock a fraction of a can.
 */
export function recommendReplenishment(opts: {
    dailyDemand: number;
    std: number;
    leadDays: number;
    serviceZ?: number;
}): number {
    const { dailyDemand, std, leadDays } = opts;
    const serviceZ = opts.serviceZ ?? 1.65;
    const lead = Math.max(0, leadDays);
    const cycleDemand = Math.max(0, dailyDemand) * lead;
    const safetyStock = serviceZ * Math.max(0, std) * Math.sqrt(lead);
    return Math.ceil(cycleDemand + safetyStock);
}

/**
 * Confidence in a per-machine-item estimate, driven by how many independent demand
 * observations (closed refill intervals) we have. Thin history = don't trust the
 * number. Thresholds are deliberately conservative for an experimental tool.
 */
export function confidenceFromObservations(n: number): Confidence {
    if (n >= 12) return "high";
    if (n >= 5) return "medium";
    return "low";
}
