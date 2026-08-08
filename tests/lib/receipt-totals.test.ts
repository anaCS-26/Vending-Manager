import { describe, it, expect } from 'vitest';
import { computeReceiptTotals, SAUDI_VAT_RATE } from '@/lib/receipt-totals';

describe('computeReceiptTotals', () => {
    it('returns zeros for an empty receipt', () => {
        const t = computeReceiptTotals([]);
        expect(t).toEqual({ lineCount: 0, totalUnits: 0, subtotal: 0, vat: 0, grandTotal: 0 });
    });

    it('sums units and value across lines', () => {
        const t = computeReceiptTotals([
            { quantity: 10, unitCost: 2 },
            { quantity: 5, unitCost: 4 },
        ]);
        expect(t.lineCount).toBe(2);
        expect(t.totalUnits).toBe(15);
        expect(t.subtotal).toBe(40);
        expect(t.vat).toBeCloseTo(6, 10);
        expect(t.grandTotal).toBeCloseTo(46, 10);
    });

    it('counts zero-quantity lines as lines but not value', () => {
        // A shorted line (received 0 of a requested item) still appears on screen.
        const t = computeReceiptTotals([
            { quantity: 0, unitCost: 99 },
            { quantity: 3, unitCost: 1 },
        ]);
        expect(t.lineCount).toBe(2);
        expect(t.totalUnits).toBe(3);
        expect(t.subtotal).toBe(3);
    });

    it('matches a real supplier tax invoice (Nahla Al Wadi NHD252348800)', () => {
        // The invoice attached to issue #6: 16 lines, carton prices pre-VAT.
        const t = computeReceiptTotals([
            { quantity: 30, unitCost: 17.5 },   // Al Marai flav milk
            { quantity: 8, unitCost: 28 },      // KDD apple
            { quantity: 5, unitCost: 28 },      // KDD mango
            { quantity: 8, unitCost: 28 },      // KDD mix
            { quantity: 5, unitCost: 28 },      // KDD orange
            { quantity: 55, unitCost: 30.5 },   // Pringles small
            { quantity: 8, unitCost: 62 },      // Zoi ice tea berry
            { quantity: 5, unitCost: 62 },      // Zoi ice tea tropical
            { quantity: 14, unitCost: 78.17 },  // Code Red small
            { quantity: 70, unitCost: 45.22 },  // Pepsi can long
            { quantity: 50, unitCost: 11 },     // Aquafina water
            { quantity: 2, unitCost: 375 },     // Bounty
            { quantity: 3, unitCost: 483 },     // Kinder Abu Walad
            { quantity: 3, unitCost: 263 },     // Kinder Bueno
            { quantity: 15, unitCost: 65 },     // Maltesers
            { quantity: 15, unitCost: 32.5 },   // Vimto Hany
        ]);
        expect(t.lineCount).toBe(16);
        expect(t.totalUnits).toBe(296);
        expect(t.subtotal).toBeCloseTo(12996.78, 2);   // invoice "Total Amount"
        expect(t.vat).toBeCloseTo(1949.52, 2);
        // The paper invoice reads 14,946.29 because the supplier rounds VAT
        // per line; our single-pass 15% gives 14,946.30. A halala-level drift
        // is expected and the UI copy tells the receiver to tolerate it.
        expect(t.grandTotal).toBeCloseTo(14946.3, 2);
    });

    it('uses the 15% Saudi VAT rate by default and accepts an override', () => {
        expect(SAUDI_VAT_RATE).toBe(0.15);
        const t = computeReceiptTotals([{ quantity: 1, unitCost: 100 }], 0);
        expect(t.vat).toBe(0);
        expect(t.grandTotal).toBe(100);
    });
});
