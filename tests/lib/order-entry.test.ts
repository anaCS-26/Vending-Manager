import { describe, it, expect } from 'vitest';
import {
  adjustOrderQuantity,
  defaultOrderQuantity,
  linesFromDeficits,
  linesFromPreviousOrder,
  mergeOrderLines,
  roundUpToBatch,
} from '@/lib/order-entry';

describe('defaultOrderQuantity', () => {
  it('starts a new line at one case', () => {
    expect(defaultOrderQuantity(24)).toBe(24);
  });

  // The admin's complaint: every one of ~60 lines opened at 1 and had to be retyped.
  it('falls back to 1 only when the item has no case pack', () => {
    expect(defaultOrderQuantity(0)).toBe(1);
    expect(defaultOrderQuantity(null)).toBe(1);
    expect(defaultOrderQuantity(undefined)).toBe(1);
    expect(defaultOrderQuantity(-5)).toBe(1);
    expect(defaultOrderQuantity(NaN)).toBe(1);
  });
});

describe('adjustOrderQuantity', () => {
  it('adds and removes whole cases', () => {
    expect(adjustOrderQuantity(24, 24)).toBe(48);
    expect(adjustOrderQuantity(48, -24)).toBe(24);
  });

  it('refuses a -case that would empty the line instead of clamping to 1', () => {
    // Clamping 24 - 24 to 1 would make the next +24 land on 25: no number of cases.
    expect(adjustOrderQuantity(24, -24)).toBe(24);
    expect(adjustOrderQuantity(10, -24)).toBe(10);
  });

  it('never returns less than 1', () => {
    expect(adjustOrderQuantity(0, -24)).toBe(1);
    expect(adjustOrderQuantity(NaN, 24)).toBe(1);
  });
});

describe('roundUpToBatch', () => {
  it('covers the quantity in whole cases', () => {
    expect(roundUpToBatch(25, 24)).toBe(48);
    expect(roundUpToBatch(24, 24)).toBe(24);
    expect(roundUpToBatch(1, 24)).toBe(24);
  });

  it('passes the quantity through when there is no case pack', () => {
    expect(roundUpToBatch(7, 0)).toBe(7);
  });

  it('returns 0 for nothing owed', () => {
    expect(roundUpToBatch(0, 24)).toBe(0);
    expect(roundUpToBatch(-3, 24)).toBe(0);
  });
});

describe('mergeOrderLines', () => {
  it('appends new items and reports how many', () => {
    const r = mergeOrderLines(
      [{ itemId: 1, quantityRequested: 24 }],
      [{ itemId: 2, quantityRequested: 12 }, { itemId: 3, quantityRequested: 6 }],
    );
    expect(r.added).toBe(2);
    expect(r.lines.map(l => l.itemId)).toEqual([1, 2, 3]);
  });

  it('never overwrites a quantity the admin already typed', () => {
    const r = mergeOrderLines(
      [{ itemId: 1, quantityRequested: 72 }],
      [{ itemId: 1, quantityRequested: 24 }],
    );
    expect(r.added).toBe(0);
    expect(r.lines).toEqual([{ itemId: 1, quantityRequested: 72 }]);
  });

  it('drops zero-quantity and duplicate incoming lines', () => {
    const r = mergeOrderLines([], [
      { itemId: 1, quantityRequested: 0 },
      { itemId: 2, quantityRequested: 5 },
      { itemId: 2, quantityRequested: 9 },
    ]);
    expect(r.lines).toEqual([{ itemId: 2, quantityRequested: 5 }]);
  });

  it('does not mutate its input', () => {
    const existing = [{ itemId: 1, quantityRequested: 24 }];
    mergeOrderLines(existing, [{ itemId: 2, quantityRequested: 12 }]);
    expect(existing).toHaveLength(1);
  });
});

describe('linesFromPreviousOrder', () => {
  it('repeats what was requested', () => {
    const r = linesFromPreviousOrder([{ itemId: 1, quantityRequested: 48 }], new Set([1]));
    expect(r).toEqual({ lines: [{ itemId: 1, quantityRequested: 48 }], skipped: 0 });
  });

  it('skips and counts items that have since been deactivated', () => {
    const r = linesFromPreviousOrder(
      [{ itemId: 1, quantityRequested: 48 }, { itemId: 2, quantityRequested: 24 }],
      new Set([1]),
    );
    expect(r.lines.map(l => l.itemId)).toEqual([1]);
    expect(r.skipped).toBe(1);
  });

  it('sums an item that appeared on two lines of the old order', () => {
    const r = linesFromPreviousOrder(
      [{ itemId: 1, quantityRequested: 24 }, { itemId: 1, quantityRequested: 12 }],
      new Set([1]),
    );
    expect(r.lines).toEqual([{ itemId: 1, quantityRequested: 36 }]);
  });
});

describe('linesFromDeficits', () => {
  const items = [
    { id: 1, pieces_per_box: 24, WarehouseStock: [{ warehouseId: 7, pending_deficit: 30 }] },
    { id: 2, pieces_per_box: null, WarehouseStock: [{ warehouseId: 7, pending_deficit: 5 }] },
    { id: 3, pieces_per_box: 12, WarehouseStock: [{ warehouseId: 7, pending_deficit: 0 }] },
    { id: 4, pieces_per_box: 12, WarehouseStock: [{ warehouseId: 9, pending_deficit: 40 }] },
    { id: 5, pieces_per_box: 12 },
  ];

  it('orders what the supplier still owes this warehouse, in whole boxes', () => {
    expect(linesFromDeficits(items, 7)).toEqual([
      { itemId: 1, quantityRequested: 48 },
      { itemId: 2, quantityRequested: 5 },
    ]);
  });

  it('ignores the deficits of another warehouse', () => {
    expect(linesFromDeficits(items, 9)).toEqual([{ itemId: 4, quantityRequested: 48 }]);
  });
});
