import { describe, it, expect } from 'vitest';
import {
    seedRefillQuantity,
    refillSections,
    countUnconfirmed,
    adjustByBatch,
    type RefillRowLike,
} from '@/lib/refill-entry';

/**
 * These rules decide what lands in RefillLog, and RefillLog rows are booked as
 * sales revenue and never rewritten. The invariant every test below defends is
 * the same one: a quantity the driver has not looked at cannot be submitted.
 */

function row(overrides: Partial<RefillRowLike> = {}): RefillRowLike {
    return { refilled: 0, confirmed: true, ...overrides };
}

describe('seedRefillQuantity', () => {
    it('leaves every box empty in quick mode, even with history available', () => {
        expect(seedRefillQuantity('quick', 8, 20)).toEqual({ refilled: 0, prefilled: false, confirmed: true });
    });

    it('seeds last visit\'s quantity in prefill mode, marked unconfirmed', () => {
        expect(seedRefillQuantity('prefill', 8, 20)).toEqual({ refilled: 8, prefilled: true, confirmed: false });
    });

    it('caps the seed to what is actually in the bag', () => {
        // The driver cannot load 8 from a bag holding 3, and an over-budget seed
        // would be rejected by the server's per-row gte guard on DriverStock.
        expect(seedRefillQuantity('prefill', 8, 3)).toEqual({ refilled: 3, prefilled: true, confirmed: false });
    });

    it('seeds nothing when the machine has no history for the item', () => {
        expect(seedRefillQuantity('prefill', null, 20)).toEqual({ refilled: 0, prefilled: false, confirmed: true });
    });

    it('treats a zero seed as confirmed — there is nothing to check about not refilling', () => {
        expect(seedRefillQuantity('prefill', 8, 0).confirmed).toBe(true);
    });
});

describe('refillSections', () => {
    /** A sheet row as the ordering sees it: the item, plus live quantities it must ignore. */
    const line = (sku: string, name: string, category: string, refilled = 0) =>
        ({ item: { sku, name, category }, refilled, estimated_stock: 5 });

    // Real catalogue names and categories from production, shuffled.
    const sheet = [
        line('0010', 'PEPSI CaN', 'Soft Drinks'),
        line('0157', 'ZOI ICE TEA BERRY', 'Iced Tea'),
        line('0103', 'PRINGLES RED ORIGINAL', 'Chips'),
        line('0033', 'SNICKERS', 'Chocolate'),
        line('0045', 'AQUAFINA WATER', 'Water'),
        line('0018', 'KDD MANGO', 'Juices & Dairy'),
        line('0052', 'LAYS YELLOW SALT', 'Chips'),
        line('0028', 'OREO BISCUIT VANIL', 'Biscuits & Wafers'),
        line('0170', 'CHOCOLATE CAKE', 'Cakes'),
        line('0165', 'MOVENPICK CAPPUCINO', 'Coffee'),
        line('0197', 'landessa', 'coffe'),
        line('0195', 'AMADA MOOD', 'Uncategorized'),
        line('0050', 'DORITOS ORANGE CHEESE', 'Chips'),
    ];

    it('lists snacks first and drinks after, in the order the drivers asked for', () => {
        expect(refillSections(sheet).map(s => s.label)).toEqual([
            'Chips', 'Chocolate', 'Biscuits & Wafers', 'Cakes',
            'Juices & Dairy', 'Soft Drinks', 'Iced Tea', 'Coffee', 'Water', 'Other',
        ]);
    });

    it('sorts A–Z inside a group, so Pringles sit together among the chips', () => {
        const chips = refillSections(sheet)[0].rows.map(r => r.item.name);
        expect(chips).toEqual(['DORITOS ORANGE CHEESE', 'LAYS YELLOW SALT', 'PRINGLES RED ORIGINAL']);
    });

    it('files a misspelled category with its group instead of starting a new one', () => {
        const coffee = refillSections(sheet).find(s => s.label === 'Coffee')!;
        expect(coffee.rows.map(r => r.item.sku)).toEqual(['0197', '0165']);
    });

    it('puts categories it does not know after the known ones, by name', () => {
        const labels = refillSections([
            line('1', 'X', 'Zebra snacks'),
            line('2', 'Y', 'Gum'),
            line('3', 'Z', 'Water'),
            line('4', 'W', ''),
        ]).map(s => s.label);
        expect(labels).toEqual(['Water', 'Gum', 'Other', 'Zebra snacks']);
    });

    it('never drops or duplicates a row', () => {
        const out = refillSections(sheet).flatMap(s => s.rows);
        expect(out).toHaveLength(sheet.length);
        sheet.forEach(r => expect(out).toContain(r));
    });

    // The regression the old estimate-based order had: staging a quantity moved
    // the row, so the second tap of a ±batch button landed on a different item
    // and refill quantity is booked as sold. Position must depend on the item only.
    it('keeps every row in place across a burst of taps', () => {
        const order = (rows: typeof sheet) => refillSections(rows).flatMap(s => s.rows.map(r => r.item.sku));
        const before = order(sheet);
        const tapped = sheet.map((r, i) => ({ ...r, refilled: i % 2 ? 18 : 0, estimated_stock: i }));
        expect(order(tapped)).toEqual(before);
    });
});

describe('countUnconfirmed', () => {
    it('counts staged quantities the driver has not looked at', () => {
        expect(countUnconfirmed([
            row({ refilled: 6, confirmed: false }),
            row({ refilled: 4, confirmed: false }),
            row({ refilled: 2, confirmed: true }),
        ])).toBe(2);
    });

    it('ignores zeros — an untouched empty box is not something to review', () => {
        expect(countUnconfirmed([row({ refilled: 0, confirmed: false })])).toBe(0);
    });

    it('reports nothing to review for a sheet filled entirely by hand', () => {
        // Quick mode's contract: every figure was an explicit tap, so submit
        // must go straight through without a review sheet.
        const quickRows = [1, 2, 3].map(n => {
            const seeded = seedRefillQuantity('quick', 9, 20);
            return row({ ...seeded, refilled: n, confirmed: true });
        });
        expect(countUnconfirmed(quickRows)).toBe(0);
    });

    it('reports every line of a freshly prefilled sheet', () => {
        const prefilled = [6, 4, 9].map(last => row(seedRefillQuantity('prefill', last, 20)));
        expect(countUnconfirmed(prefilled)).toBe(3);
    });
});

describe('adjustByBatch', () => {
    it('adds a batch from zero', () => {
        expect(adjustByBatch(0, 14, 100)).toBe(14);
    });

    it('stacks batches', () => {
        expect(adjustByBatch(14, 14, 100)).toBe(28);
    });

    it('takes the same batch back off — the whole point of the "−" half', () => {
        // A mis-tapped "+14" used to cost fourteen presses of "−1", retyping, or
        // clearing the line and starting again.
        expect(adjustByBatch(28, -14, 100)).toBe(14);
        expect(adjustByBatch(14, -14, 100)).toBe(0);
    });

    it('floors at zero instead of going negative', () => {
        expect(adjustByBatch(6, -14, 100)).toBe(0);
    });

    it('clamps up to the ceiling instead of refusing the tap', () => {
        // "+14" with 5 on hand stages 5. A button that goes dead near the ceiling
        // is what sends people back to the keyboard.
        expect(adjustByBatch(0, 14, 5)).toBe(5);
        expect(adjustByBatch(3, 14, 5)).toBe(5);
    });

    it('never exceeds the ceiling even when already at it', () => {
        expect(adjustByBatch(5, 14, 5)).toBe(5);
    });

    it('treats a zero or negative ceiling as nothing available', () => {
        expect(adjustByBatch(0, 14, 0)).toBe(0);
        expect(adjustByBatch(0, 14, -3)).toBe(0);
    });

    it('survives a NaN without writing NaN into a quantity box', () => {
        expect(adjustByBatch(NaN, 14, 100)).toBe(0);
        expect(adjustByBatch(6, NaN, 100)).toBe(0);
    });
});
