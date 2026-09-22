import { describe, it, expect } from 'vitest';
import {
  defaultOrderQuantity,
  formatOrderQuantity,
  lastOrderedByItem,
  lineCount,
  lineUnit,
  linesFromDeficits,
  linesFromPreviousOrder,
  mergeOrderLines,
  orderAsText,
  roundUpToBatch,
  startingQuantity,
  stepLine,
  unitsFor,
  unitSize,
  withCount,
  withUnit,
} from '@/lib/order-entry';
import { levelsOf } from '@/lib/packaging';

const SIPP = levelsOf({ pieces_per_box: 20, packets_per_carton: 8 }); // carton = 8 packets × 20 = 160
const WATER = levelsOf({ pieces_per_box: 40 }); // carton = 40, no packets
const LOOSE = levelsOf({ pieces_per_box: null });

describe('defaultOrderQuantity', () => {
  it('starts a new line at one carton', () => {
    expect(defaultOrderQuantity(160)).toBe(160);
  });

  // The admin's complaint: every one of ~60 lines opened at 1 and had to be retyped.
  it('falls back to 1 only when the item has no carton', () => {
    expect(defaultOrderQuantity(0)).toBe(1);
    expect(defaultOrderQuantity(null)).toBe(1);
    expect(defaultOrderQuantity(undefined)).toBe(1);
    expect(defaultOrderQuantity(-5)).toBe(1);
    expect(defaultOrderQuantity(NaN)).toBe(1);
  });
});

describe('startingQuantity', () => {
  it('starts where the item was last ordered, so a routine order is mostly Enter', () => {
    expect(startingQuantity(160, 800)).toBe(800);
  });

  // Found in the browser: 700 opened as "35 packets", so typing 5 ordered 5 packets.
  it('rounds last time up to whole cartons, so the line opens in cartons', () => {
    expect(startingQuantity(160, 700)).toBe(800);
    expect(startingQuantity(40, 900)).toBe(920);
  });

  it('starts at one carton when there is no history', () => {
    expect(startingQuantity(160, undefined)).toBe(160);
  });

  // Production has 1-piece test orders from the first week.
  it('never starts below one carton', () => {
    expect(startingQuantity(160, 1)).toBe(160);
    expect(startingQuantity(1, 1)).toBe(1);
  });
});

describe('order units', () => {
  it('offers only the units an item has, biggest first', () => {
    expect(unitsFor(SIPP)).toEqual(['carton', 'packet', 'piece']);
    expect(unitsFor(WATER)).toEqual(['carton', 'piece']);
    expect(unitsFor(LOOSE)).toEqual(['piece']);
  });

  it('knows how many pieces each unit is', () => {
    expect(unitSize('carton', SIPP)).toBe(160);
    expect(unitSize('packet', SIPP)).toBe(20);
    expect(unitSize('piece', SIPP)).toBe(1);
    expect(unitSize('packet', WATER)).toBe(1);
  });

  // The report: the admin typing an order works in cartons.
  it('types a line in cartons and stores pieces', () => {
    const line = withCount({ itemId: 1, quantityRequested: 160 }, 5, SIPP);
    expect(line).toEqual({ itemId: 1, quantityRequested: 800, unit: 'carton' });
    expect(lineCount(line, SIPP)).toBe(5);
  });

  it('shows an inherited quantity in the biggest unit that divides it — never rounded', () => {
    // A repeated order of 700 SIPP is 35 packets, not "4 or 5 cartons".
    expect(lineUnit({ itemId: 1, quantityRequested: 700 }, SIPP)).toBe('packet');
    expect(lineCount({ itemId: 1, quantityRequested: 700 }, SIPP)).toBe(35);
    expect(lineUnit({ itemId: 1, quantityRequested: 900 }, WATER)).toBe('piece');
    expect(lineUnit({ itemId: 1, quantityRequested: 800 }, SIPP)).toBe('carton');
  });

  it('keeps the unit the admin picked while typing', () => {
    // Switched to pieces, typing 160 must not flip back to "1 carton".
    const line = withCount({ itemId: 1, quantityRequested: 1, unit: 'piece' }, 160, SIPP);
    expect(lineUnit(line, SIPP)).toBe('piece');
    expect(lineCount(line, SIPP)).toBe(160);
  });

  it('rounds up to whole units when the unit changes', () => {
    expect(withUnit({ itemId: 1, quantityRequested: 700 }, 'carton', SIPP)).toEqual({ itemId: 1, quantityRequested: 800, unit: 'carton' });
    expect(withUnit({ itemId: 1, quantityRequested: 800 }, 'piece', SIPP).quantityRequested).toBe(800);
    expect(withUnit({ itemId: 1, quantityRequested: 0 }, 'carton', SIPP).quantityRequested).toBe(160);
  });

  it('steps by one unit and will not drop a line below one', () => {
    const one = { itemId: 1, quantityRequested: 160 };
    expect(stepLine(one, 1, SIPP).quantityRequested).toBe(320);
    expect(stepLine(one, -1, SIPP)).toBe(one);
    expect(stepLine({ itemId: 1, quantityRequested: 700 }, 1, SIPP).quantityRequested).toBe(720); // 36 packets
  });
});

describe('formatOrderQuantity', () => {
  it('says it the way a supplier would', () => {
    expect(formatOrderQuantity(800, SIPP)).toBe('5 cartons');
    expect(formatOrderQuantity(700, SIPP)).toBe('4 cartons + 3 packets');
    expect(formatOrderQuantity(900, WATER)).toBe('22 cartons + 20 pcs');
    expect(formatOrderQuantity(30, LOOSE)).toBe('30 pcs');
    expect(formatOrderQuantity(1, LOOSE)).toBe('1 pc');
  });
});

describe('orderAsText', () => {
  it('writes the order as a message the supplier can read', () => {
    const text = orderAsText({
      id: 29, warehouseName: 'Riyadh Central', date: '20 Sep 2026',
      lines: [
        { name: 'SIPP GREEN', quantity: 800, levels: SIPP },
        { name: 'AQUAFINA WATER', quantity: 900, levels: WATER },
      ],
    });
    expect(text).toBe([
      'Purchase order PO-0029',
      'Deliver to: Riyadh Central',
      'Date: 20 Sep 2026',
      '',
      '1. SIPP GREEN — 5 cartons',
      '2. AQUAFINA WATER — 22 cartons + 20 pcs',
      '',
      '2 items',
    ].join('\n'));
  });
});

describe('lastOrderedByItem', () => {
  const orders = [
    { id: 1, status: 'COMPLETED', createdAt: new Date('2026-08-13'), Items: [{ itemId: 1, quantityRequested: 1000 }, { itemId: 2, quantityRequested: 1000 }] },
    { id: 2, status: 'CANCELLED', createdAt: new Date('2026-09-01'), Items: [{ itemId: 1, quantityRequested: 5 }] },
    { id: 3, status: 'PENDING', createdAt: new Date('2026-09-20'), Items: [{ itemId: 1, quantityRequested: 400 }, { itemId: 1, quantityRequested: 300 }] },
  ];

  it('takes the newest order that was not cancelled, per item', () => {
    const last = lastOrderedByItem(orders);
    expect(last.get(1)).toEqual({ quantity: 700, orderId: 3, date: new Date('2026-09-20') });
    expect(last.get(2)?.quantity).toBe(1000);
    expect(last.has(3)).toBe(false);
  });
});

describe('roundUpToBatch', () => {
  it('covers the quantity in whole cartons', () => {
    expect(roundUpToBatch(25, 24)).toBe(48);
    expect(roundUpToBatch(24, 24)).toBe(24);
    expect(roundUpToBatch(1, 24)).toBe(24);
  });

  it('passes the quantity through when there is no carton', () => {
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

  it('orders what the supplier still owes this warehouse, in whole cartons', () => {
    expect(linesFromDeficits(items, 7)).toEqual([
      { itemId: 1, quantityRequested: 48 },
      { itemId: 2, quantityRequested: 5 },
    ]);
  });

  // SIPP GREEN owes 400 in production: 3 cartons of 160, not 20 packets.
  it('rounds up to the whole carton when the carton holds packets', () => {
    const sipp = [{ id: 33, pieces_per_box: 20, packets_per_carton: 8, WarehouseStock: [{ warehouseId: 1, pending_deficit: 400 }] }];
    expect(linesFromDeficits(sipp, 1)).toEqual([{ itemId: 33, quantityRequested: 480 }]);
  });

  it('ignores the deficits of another warehouse', () => {
    expect(linesFromDeficits(items, 9)).toEqual([{ itemId: 4, quantityRequested: 48 }]);
  });
});
