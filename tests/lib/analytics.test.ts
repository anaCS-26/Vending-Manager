import { describe, it, expect } from 'vitest';
import {
    MS_PER_DAY,
    buildCategoryMix,
    buildDailySeries,
    buildDriverActivity,
    buildLossSeries,
    buildMovers,
    buildPareto,
    buildServiceRhythm,
    collapseVisits,
    formatCompact,
    formatSignedPct,
    median,
    movingAverage,
    parseRange,
    pctDelta,
    riyadhDayKey,
    riyadhHour,
    riyadhWeekday,
    rollup,
    rowCogs,
    rowRevenue,
    summarize,
    type RefillRow,
    type ReturnRow,
} from '@/lib/analytics';

/**
 * The Analytics page is read by people deciding what to stock and which
 * machines to keep. Every test here defends one of two things: that a figure
 * means what its label says, or that a missing basis for comparison is
 * reported as missing rather than invented.
 */

/** 2026-03-10 is a Tuesday. 09:30 UTC = 12:30 Riyadh. */
const T0 = new Date('2026-03-10T09:30:00.000Z');

function refill(overrides: Partial<RefillRow> = {}): RefillRow {
    return {
        machineId: 1,
        itemId: 1,
        driverId: 1,
        refilled_at: T0,
        quantity_refilled: 10,
        items_sold_since_last_refill: 10,
        sales_revenue: 50,
        price_at_refill: 5,
        cost_at_refill: 2,
        ...overrides,
    };
}

function ret(overrides: Partial<ReturnRow> = {}): ReturnRow {
    return {
        itemId: 1,
        driverId: 1,
        quantity: 2,
        reason: 'DAMAGED',
        reported_at: T0,
        item: { cost: 3 },
        ...overrides,
    };
}

describe('parseRange', () => {
    it('accepts the three supported windows', () => {
        expect(parseRange('7d')).toBe('7d');
        expect(parseRange('90d')).toBe('90d');
    });

    it('falls back to 30 days for anything else, including a hand-edited URL', () => {
        expect(parseRange(undefined)).toBe('30d');
        expect(parseRange('all')).toBe('30d');
        expect(parseRange('1000d')).toBe('30d');
    });
});

describe('Riyadh bucketing', () => {
    it('buckets an instant into the Riyadh calendar day, not the UTC one', () => {
        // 22:30 UTC on the 9th is already 01:30 on the 10th in Riyadh (+03:00).
        expect(riyadhDayKey(new Date('2026-03-09T22:30:00.000Z'))).toBe('2026-03-10');
        expect(riyadhHour(new Date('2026-03-09T22:30:00.000Z'))).toBe(1);
    });

    it('reports weekday Sunday-first', () => {
        // 2026-03-08 is a Sunday.
        expect(riyadhWeekday(new Date('2026-03-08T09:00:00.000Z'))).toBe(0);
        expect(riyadhWeekday(T0)).toBe(2); // Tuesday
    });
});

describe('rowRevenue / rowCogs', () => {
    it('prefers the captured sales_revenue snapshot over recomputing it', () => {
        // A refill whose price changed after the fact must still report what it
        // actually took. 50 is the snapshot; 10 × 5 would coincidentally agree,
        // so make them disagree to prove which one is read.
        expect(rowRevenue(refill({ sales_revenue: 47, price_at_refill: 5 }))).toBe(47);
    });

    it('falls back to units × snapshot price for legacy rows with no revenue captured', () => {
        expect(rowRevenue(refill({ sales_revenue: 0, items_sold_since_last_refill: 4, price_at_refill: 2.5 }))).toBe(10);
    });

    it('treats an unmeasured sold count as no units rather than as an error', () => {
        expect(rowCogs(refill({ items_sold_since_last_refill: null }))).toBe(0);
        expect(rowRevenue(refill({ items_sold_since_last_refill: null, sales_revenue: 0 }))).toBe(0);
    });
});

describe('collapseVisits', () => {
    it('counts one physical visit no matter how many item lines it wrote', () => {
        // A real stop touches ~7.6 slots; counting rows would report 8 visits.
        const rows = Array.from({ length: 8 }, (_, i) =>
            refill({ itemId: i + 1, refilled_at: new Date(T0.getTime() + i * 60_000) }),
        );
        expect(collapseVisits(rows)).toHaveLength(1);
        expect(collapseVisits(rows)[0].rows).toBe(8);
    });

    it('splits two stops at the same machine hours apart', () => {
        const rows = [refill(), refill({ refilled_at: new Date(T0.getTime() + 4 * 60 * 60_000) })];
        expect(collapseVisits(rows)).toHaveLength(2);
    });

    it('keeps two drivers at the same machine separate', () => {
        const rows = [refill({ driverId: 1 }), refill({ driverId: 2 })];
        expect(collapseVisits(rows)).toHaveLength(2);
    });

    it('does not merge across machines even for the same driver at the same minute', () => {
        const rows = [refill({ machineId: 1 }), refill({ machineId: 2 })];
        expect(collapseVisits(rows)).toHaveLength(2);
    });
});

describe('summarize', () => {
    it('rolls up revenue, cost, margin, units and write-offs', () => {
        const totals = summarize(
            [refill({ sales_revenue: 100, items_sold_since_last_refill: 20, cost_at_refill: 3 })],
            [ret({ quantity: 5, item: { cost: 4 } })],
        );
        expect(totals.revenue).toBe(100);
        expect(totals.cogs).toBe(60);
        expect(totals.grossProfit).toBe(40);
        expect(totals.marginPct).toBe(40);
        expect(totals.units).toBe(20);
        expect(totals.shrinkageUnits).toBe(5);
        expect(totals.shrinkageValue).toBe(20);
    });

    it('reports a 0% margin rather than NaN when nothing sold', () => {
        expect(summarize([], []).marginPct).toBe(0);
    });
});

describe('pctDelta', () => {
    it('returns null when the previous period gives no basis, instead of a fake +100%', () => {
        expect(pctDelta(500, 0)).toBeNull();
    });

    it('calls zero-to-zero flat rather than incomparable', () => {
        expect(pctDelta(0, 0)).toBe(0);
    });

    it('signs a decline negative', () => {
        expect(pctDelta(75, 100)).toBe(-25);
    });
});

describe('buildDailySeries', () => {
    it('zero-fills quiet days so the axis cannot compress them away', () => {
        const end = new Date('2026-03-10T20:00:00.000Z').getTime();
        const series = buildDailySeries([refill({ refilled_at: T0 })], end, 5);

        expect(series).toHaveLength(5);
        expect(series.map((d) => d.date)).toEqual([
            '2026-03-06',
            '2026-03-07',
            '2026-03-08',
            '2026-03-09',
            '2026-03-10',
        ]);
        expect(series.slice(0, 4).every((d) => d.revenue === 0)).toBe(true);
        expect(series[4].revenue).toBe(50);
        expect(series[4].grossProfit).toBe(30);
        expect(series[4].visits).toBe(1);
    });

    it('drops rows outside the window rather than folding them into the edge day', () => {
        const end = new Date('2026-03-10T20:00:00.000Z').getTime();
        const old = refill({ refilled_at: new Date(T0.getTime() - 30 * MS_PER_DAY) });
        const series = buildDailySeries([old], end, 5);
        expect(series.every((d) => d.revenue === 0)).toBe(true);
    });
});

describe('movingAverage', () => {
    it('holds back until the window is full, so the line never ramps from a partial average', () => {
        expect(movingAverage([1, 2, 3, 4], 3)).toEqual([null, null, 2, 3]);
    });
});

describe('buildServiceRhythm', () => {
    it('returns a dense 7×24 grid — an empty hour is information', () => {
        expect(buildServiceRhythm([])).toHaveLength(168);
    });

    it('places a visit in its Riyadh weekday-hour cell', () => {
        const cells = buildServiceRhythm([refill()]); // Tuesday 12:30 Riyadh
        const hit = cells.filter((c) => c.visits > 0);
        expect(hit).toEqual([{ weekday: 2, hour: 12, visits: 1 }]);
    });
});

describe('rollup', () => {
    it('aggregates per machine and derives margin from the aggregate, not per row', () => {
        const totals = rollup(
            [
                refill({ machineId: 7, sales_revenue: 100, items_sold_since_last_refill: 10, cost_at_refill: 4 }),
                refill({ machineId: 7, sales_revenue: 100, items_sold_since_last_refill: 10, cost_at_refill: 6 }),
            ],
            'machineId',
        );
        const m = totals.get(7)!;
        expect(m.revenue).toBe(200);
        expect(m.cogs).toBe(100);
        expect(m.marginPct).toBe(50);
        expect(m.visits).toBe(1);
    });
});

describe('median', () => {
    it('averages the middle pair on an even-length list', () => {
        expect(median([4, 1, 3, 2])).toBe(2.5);
    });

    it('returns 0 for an empty fleet rather than NaN', () => {
        expect(median([])).toBe(0);
    });
});

describe('buildPareto', () => {
    const entries = [
        { name: 'A', revenue: 50 },
        { name: 'B', revenue: 30 },
        { name: 'C', revenue: 10 },
        { name: 'D', revenue: 6 },
        { name: 'E', revenue: 4 },
    ];

    it('plots both series in share-space so they share one axis', () => {
        const { slices } = buildPareto(entries, 5);
        expect(slices.map((s) => s.share)).toEqual([50, 30, 10, 6, 4]);
        expect(slices[slices.length - 1].cumulative).toBe(100);
    });

    it('folds the tail instead of dropping it — the tail summing to something is the point', () => {
        const { slices } = buildPareto(entries, 2);
        expect(slices).toHaveLength(3);
        expect(slices[2]).toMatchObject({ name: 'Other (3)', revenue: 20, isTail: true });
        expect(slices[2].cumulative).toBe(100);
    });

    it('counts the products to 80% on the UNFOLDED list, so the headline is not distorted by the cut', () => {
        expect(buildPareto(entries, 2).itemsTo80).toBe(2);
        expect(buildPareto(entries, 5).itemsTo80).toBe(2);
    });

    it('returns nothing at all rather than dividing by zero when no product sold', () => {
        expect(buildPareto([{ name: 'A', revenue: 0 }], 5)).toEqual({ slices: [], total: 0, itemsTo80: 0 });
    });
});

describe('buildCategoryMix', () => {
    it('caps the coloured slots and folds the rest into one grey row', () => {
        const rows = ['Snacks', 'Drinks', 'Water', 'Candy', 'Coffee', 'Juice'].map((_, i) =>
            refill({ itemId: i + 1, sales_revenue: 60 - i * 10, items_sold_since_last_refill: 1 }),
        );
        const categories = new Map([
            [1, 'Snacks'],
            [2, 'Drinks'],
            [3, 'Water'],
            [4, 'Candy'],
            [5, 'Coffee'],
            [6, 'Juice'],
        ]);

        const slices = buildCategoryMix(rows, categories, 4);
        expect(slices).toHaveLength(5);
        expect(slices[4]).toMatchObject({ name: 'Other (2)', isTail: true });
        expect(slices.reduce((s, x) => s + x.share, 0)).toBeCloseTo(100, 6);
    });

    it('labels items with no category rather than dropping their revenue', () => {
        const slices = buildCategoryMix([refill()], new Map([[1, '']]), 4);
        expect(slices[0].name).toBe('Uncategorised');
    });
});

describe('buildMovers', () => {
    const names = new Map([
        [1, 'Big line'],
        [2, 'Tiny line'],
        [3, 'New line'],
    ]);

    it('ranks by riyals moved, not by percentage', () => {
        // Item 2 tripled (+200%); item 1 lost far more money. The faller list
        // must lead with item 1.
        const current = rollup(
            [
                refill({ itemId: 1, sales_revenue: 100, items_sold_since_last_refill: 1 }),
                refill({ itemId: 2, sales_revenue: 12, items_sold_since_last_refill: 1 }),
            ],
            'itemId',
        );
        const previous = rollup(
            [
                refill({ itemId: 1, sales_revenue: 1000, items_sold_since_last_refill: 1 }),
                refill({ itemId: 2, sales_revenue: 4, items_sold_since_last_refill: 1 }),
            ],
            'itemId',
        );

        const { risers, fallers } = buildMovers(current, previous, names, 5);
        expect(fallers[0]).toMatchObject({ id: 1, delta: -900 });
        expect(risers[0]).toMatchObject({ id: 2, delta: 8, deltaPct: 200 });
    });

    it('reports a product absent last period as having no basis, not as +100%', () => {
        const current = rollup([refill({ itemId: 3, sales_revenue: 40, items_sold_since_last_refill: 1 })], 'itemId');
        const { risers } = buildMovers(current, new Map(), names, 5);
        expect(risers[0].deltaPct).toBeNull();
    });

    it('ignores products that did not move', () => {
        const same = rollup([refill({ itemId: 1, sales_revenue: 10, items_sold_since_last_refill: 1 })], 'itemId');
        expect(buildMovers(same, same, names, 5)).toEqual({ risers: [], fallers: [] });
    });
});

describe('buildLossSeries', () => {
    it('bins returns into fixed-width periods ending on the window end', () => {
        const end = new Date('2026-03-10T20:00:00.000Z').getTime();
        const buckets = buildLossSeries(
            [
                ret({ reported_at: new Date(end - 2 * MS_PER_DAY), quantity: 1, item: { cost: 10 } }),
                ret({
                    reported_at: new Date(end - 9 * MS_PER_DAY),
                    reason: 'EXPIRED',
                    quantity: 2,
                    item: { cost: 5 },
                }),
            ],
            end,
            28,
            7,
        );

        expect(buckets).toHaveLength(4);
        expect(buckets[3].damaged).toBe(10);
        expect(buckets[2].expired).toBe(10);
    });

    it('splits damaged from expired — they are two different management problems', () => {
        const end = T0.getTime();
        const [bucket] = buildLossSeries(
            [ret({ reason: 'EXPIRED', quantity: 3, item: { cost: 2 } }), ret({ quantity: 1, item: { cost: 2 } })],
            end,
            7,
            7,
        );
        expect(bucket).toMatchObject({ damaged: 2, expired: 6 });
    });
});

describe('buildDriverActivity', () => {
    it('reports visits, depth and write-off rate per driver', () => {
        const rows = [
            ...Array.from({ length: 3 }, (_, i) =>
                refill({ driverId: 1, itemId: i + 1, refilled_at: new Date(T0.getTime() + i * 60_000) }),
            ),
            refill({ driverId: 1, machineId: 2, refilled_at: new Date(T0.getTime() + 3 * 60 * 60_000) }),
        ];
        const [driver] = buildDriverActivity(rows, [ret({ driverId: 1, quantity: 4 })], new Map([[1, 'Chito']]));

        expect(driver).toMatchObject({ name: 'Chito', visits: 2, machines: 2, unitsRefilled: 40 });
        expect(driver.linesPerVisit).toBe(2);
        expect(driver.writeOffRate).toBe(10);
    });

    it('skips rows with no driver rather than inventing one', () => {
        // Legacy dispatch-path refills carry the driver on the Dispatch, not
        // the log — attributing them to a placeholder would put one route's
        // numbers under a name that never drove it.
        expect(buildDriverActivity([refill({ driverId: null })], [], new Map())).toEqual([]);
    });
});

describe('formatting', () => {
    it('compacts axis figures without inventing precision', () => {
        expect(formatCompact(950)).toBe('950');
        expect(formatCompact(1250)).toBe('1.3k');
        expect(formatCompact(48_000)).toBe('48k');
        expect(formatCompact(2_400_000)).toBe('2.4M');
    });

    it('prints an em dash when there is no delta to sign', () => {
        expect(formatSignedPct(null)).toBe('—');
        expect(formatSignedPct(12.34)).toBe('+12.3%');
        expect(formatSignedPct(-0.01)).toBe('0.0%');
    });
});
