import { describe, it, expect } from 'vitest';
import {
    seedRefillQuantity,
    needsStock,
    splitRefillRows,
    countUnconfirmed,
    type RefillRowLike,
} from '@/lib/refill-entry';

/**
 * These rules decide what lands in RefillLog, and RefillLog rows are booked as
 * sales revenue and never rewritten. The invariant every test below defends is
 * the same one: a quantity the driver has not looked at cannot be submitted.
 */

function row(overrides: Partial<RefillRowLike> = {}): RefillRowLike {
    return { refilled: 0, bag_returned: 0, estimated_stock: 5, lastQty: null, confirmed: true, ...overrides };
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

describe('needsStock', () => {
    it('flags a slot the system believes is empty', () => {
        expect(needsStock(row({ estimated_stock: 0 }))).toBe(true);
    });

    it('flags a slot holding less than one typical top-up', () => {
        expect(needsStock(row({ estimated_stock: 2, lastQty: 6 }))).toBe(true);
    });

    it('does not flag a slot still fuller than a typical top-up', () => {
        expect(needsStock(row({ estimated_stock: 9, lastQty: 6 }))).toBe(false);
    });

    it('does not flag an unknown item that still has stock', () => {
        expect(needsStock(row({ estimated_stock: 4, lastQty: null }))).toBe(false);
    });

    it('pins a row the driver has already staged, however full the slot looks', () => {
        // Otherwise a count in progress could reorder into the collapsed group
        // and vanish from under the driver's finger.
        expect(needsStock(row({ estimated_stock: 30, lastQty: 2, refilled: 4 }))).toBe(true);
        expect(needsStock(row({ estimated_stock: 30, lastQty: 2, bag_returned: 1 }))).toBe(true);
    });
});

describe('splitRefillRows', () => {
    const rows = [
        row({ estimated_stock: 0 }),                 // empty      → primary
        row({ estimated_stock: 1, lastQty: 6 }),     // low        → primary
        row({ estimated_stock: 9, lastQty: 6 }),     // stocked    → secondary
        row({ estimated_stock: 4, lastQty: null }),  // no history → secondary
    ];

    it('puts only the likely-needed rows up front and collapses the rest', () => {
        const { primary, secondary } = splitRefillRows(rows, { isSearching: false, viewMode: 'BAG' });
        expect(primary).toHaveLength(2);
        expect(secondary).toHaveLength(2);
    });

    it('never drops a row — the two groups always reconstruct the input', () => {
        const { primary, secondary } = splitRefillRows(rows, { isSearching: false, viewMode: 'BAG' });
        expect([...primary, ...secondary]).toHaveLength(rows.length);
        rows.forEach(r => expect([...primary, ...secondary]).toContain(r));
    });

    it('stays flat while searching, so a hit is never hidden behind the disclosure', () => {
        const { primary, secondary } = splitRefillRows(rows, { isSearching: true, viewMode: 'BAG' });
        expect(primary).toHaveLength(rows.length);
        expect(secondary).toHaveLength(0);
    });

    it('stays flat on the Machine tab, where "needs stock" has no meaning', () => {
        const { primary, secondary } = splitRefillRows(rows, { isSearching: false, viewMode: 'MACHINE' });
        expect(primary).toHaveLength(rows.length);
        expect(secondary).toHaveLength(0);
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
