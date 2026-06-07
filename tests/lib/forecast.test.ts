import { describe, it, expect } from "vitest";
import {
    mean,
    averageDailyDemand,
    demandStdDev,
    ewma,
    zScore,
    daysUntilEmpty,
    recommendReplenishment,
    confidenceFromObservations,
} from "@/lib/forecast";

/**
 * Forecast primitives back the experimental AI Lab (Stockout Radar +
 * Silent-Failure Watch). They drive replenishment recommendations and anomaly
 * flags shown to admins, so the edge cases (empty / single / zero-variance
 * series) matter as much as the happy path — a NaN here surfaces as a garbage
 * recommendation in the console.
 */

describe("mean / averageDailyDemand", () => {
    it("returns 0 for an empty series (never NaN)", () => {
        expect(mean([])).toBe(0);
        expect(averageDailyDemand([])).toBe(0);
    });

    it("averages a flat series to its constant", () => {
        expect(averageDailyDemand([5, 5, 5, 5])).toBe(5);
    });

    it("averages a mixed series", () => {
        expect(mean([2, 4, 6])).toBe(4);
    });
});

describe("demandStdDev", () => {
    it("is 0 for fewer than two points (no spread measurable)", () => {
        expect(demandStdDev([])).toBe(0);
        expect(demandStdDev([7])).toBe(0);
    });

    it("is 0 for a perfectly flat series", () => {
        expect(demandStdDev([3, 3, 3, 3])).toBe(0);
    });

    it("computes population standard deviation", () => {
        // mean 4, deviations -2,0,2 → variance (4+0+4)/3 = 2.666… → √ ≈ 1.633
        expect(demandStdDev([2, 4, 6])).toBeCloseTo(1.632993, 5);
    });
});

describe("ewma", () => {
    it("returns 0 for an empty series", () => {
        expect(ewma([])).toBe(0);
    });

    it("returns the single value for a one-element series", () => {
        expect(ewma([9])).toBe(9);
    });

    it("equals the constant for a flat series regardless of alpha", () => {
        expect(ewma([4, 4, 4, 4], 0.4)).toBeCloseTo(4, 10);
        expect(ewma([4, 4, 4, 4], 0.9)).toBeCloseTo(4, 10);
    });

    it("weights recent intervals more heavily than the simple mean on a rising trend", () => {
        const series = [1, 2, 3, 4, 5];
        // EWMA tracks toward the latest value, so it sits above the plain mean (3).
        expect(ewma(series, 0.5)).toBeGreaterThan(mean(series));
    });

    it("reacts faster with a higher alpha", () => {
        const series = [1, 1, 1, 10];
        expect(ewma(series, 0.8)).toBeGreaterThan(ewma(series, 0.2));
    });
});

describe("zScore", () => {
    it("is 0 when baseline std is zero or invalid (can't judge an outlier)", () => {
        expect(zScore(100, 5, 0)).toBe(0);
        expect(zScore(100, 5, -1)).toBe(0);
    });

    it("is negative for a collapse below baseline", () => {
        // recent 1 vs baseline mean 10, std 2 → (1-10)/2 = -4.5
        expect(zScore(1, 10, 2)).toBeCloseTo(-4.5, 10);
    });

    it("is positive for a spike above baseline", () => {
        expect(zScore(20, 10, 2)).toBeCloseTo(5, 10);
    });
});

describe("daysUntilEmpty", () => {
    it("returns null when there is no measurable demand", () => {
        expect(daysUntilEmpty(100, 0)).toBeNull();
        expect(daysUntilEmpty(100, -3)).toBeNull();
    });

    it("divides stock by daily demand", () => {
        expect(daysUntilEmpty(20, 4)).toBe(5);
        expect(daysUntilEmpty(0, 4)).toBe(0);
    });
});

describe("recommendReplenishment", () => {
    it("covers lead-time demand with zero safety stock when demand is steady", () => {
        // 4/day × 7 days + 1.65×0×√7 = 28
        expect(recommendReplenishment({ dailyDemand: 4, std: 0, leadDays: 7 })).toBe(28);
    });

    it("adds a safety buffer proportional to volatility and √leadDays", () => {
        // 4×7 + 1.65×3×√7 = 28 + 13.099… = 41.099… → ceil 42
        expect(recommendReplenishment({ dailyDemand: 4, std: 3, leadDays: 7 })).toBe(42);
    });

    it("rounds up (no fractional units)", () => {
        // 1.1/day × 3 = 3.3 → ceil 4
        expect(recommendReplenishment({ dailyDemand: 1.1, std: 0, leadDays: 3 })).toBe(4);
    });

    it("never returns negative for degenerate inputs", () => {
        expect(recommendReplenishment({ dailyDemand: 0, std: 0, leadDays: 0 })).toBe(0);
        expect(recommendReplenishment({ dailyDemand: -5, std: -5, leadDays: -5 })).toBe(0);
    });

    it("honours a custom service-level Z", () => {
        // higher service level → bigger safety buffer
        const z95 = recommendReplenishment({ dailyDemand: 2, std: 4, leadDays: 4, serviceZ: 1.65 });
        const z99 = recommendReplenishment({ dailyDemand: 2, std: 4, leadDays: 4, serviceZ: 2.33 });
        expect(z99).toBeGreaterThan(z95);
    });
});

describe("confidenceFromObservations", () => {
    it("maps observation counts to confidence bands", () => {
        expect(confidenceFromObservations(0)).toBe("low");
        expect(confidenceFromObservations(4)).toBe("low");
        expect(confidenceFromObservations(5)).toBe("medium");
        expect(confidenceFromObservations(11)).toBe("medium");
        expect(confidenceFromObservations(12)).toBe("high");
        expect(confidenceFromObservations(50)).toBe("high");
    });
});
