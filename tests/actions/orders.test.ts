import { describe, it, expect } from 'vitest';
import {
  createPurchaseOrder,
  completePurchaseOrder,
  cancelPurchaseOrder,
} from '@/actions/orders';
import { prismaMock } from '../__helpers__/prisma-mock';
import { setAdminSession, setDriverSession } from '../__helpers__/session-mock';
import { writeAuditLog } from '@/lib/audit-utils';
import { notifyClients } from '@/lib/notify';

/**
 * Purchase order lifecycle tests. The big-deal coverage is around
 * completePurchaseOrder() because it owns the WAC recompute. The pure WAC
 * formula is exercised exhaustively in tests/lib/wac-math.test.ts; here we
 * verify that the action *uses* it correctly: aggregates from the right three
 * sources, snapshots prices, handles deficits, and persists the new cost.
 */

describe('createPurchaseOrder', () => {
  it('throws for driver callers', async () => {
    setDriverSession(10);
    await expect(
      createPurchaseOrder({ warehouseId: 1, items: [{ itemId: 1, quantityRequested: 5 }] }),
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it('happy path: snapshots costPerUnit from current Item.cost', async () => {
    setAdminSession(1);
    prismaMock.item.findMany.mockResolvedValue([
      { id: 1, cost: 4.5 } as any,
      { id: 2, cost: 7 } as any,
    ]);
    prismaMock.purchaseOrder.create.mockResolvedValue({ id: 700 } as any);

    const r = await createPurchaseOrder({
      warehouseId: 1,
      items: [
        { itemId: 1, quantityRequested: 100 },
        { itemId: 2, quantityRequested: 50 },
      ],
    });
    expect(r.success).toBe(true);
    expect(prismaMock.purchaseOrder.create).toHaveBeenCalledWith({
      data: {
        warehouseId: 1,
        status: 'PENDING',
        Items: {
          create: [
            { itemId: 1, quantityRequested: 100, costPerUnit: 4.5 },
            { itemId: 2, quantityRequested: 50, costPerUnit: 7 },
          ],
        },
      },
    });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(), 'CREATE_PURCHASE_ORDER', 'PurchaseOrder', 700, null, expect.any(Object),
    );
  });
});

describe('completePurchaseOrder', () => {
  /**
   * The receipt is set-based now, so its writes are raw SQL rather than Prisma
   * model calls. These helpers pull the statement text (bind holes rendered as
   * `?`) and the flattened bound values out of a `$executeRaw` call.
   */
  const rawSql = (callIndex: number) =>
    (prismaMock.$executeRaw.mock.calls[callIndex][0] as unknown as string[]).join('?');

  const rawValues = (callIndex: number) =>
    prismaMock.$executeRaw.mock.calls[callIndex]
      .slice(1)
      .flatMap((v: any) => (v && Array.isArray(v.values) ? v.values : [v]));

  /** Index of the single `$executeRaw` call whose text contains `fragment`. */
  const stmtWith = (fragment: string) => {
    const i = prismaMock.$executeRaw.mock.calls.findIndex((c) =>
      (c[0] as unknown as string[]).join('?').includes(fragment),
    );
    expect(i, `no raw statement containing ${fragment}`).toBeGreaterThanOrEqual(0);
    return i;
  };

  /** Wires the reads a receipt makes before opening its transaction. */
  const wireReads = (opts: {
    items: Array<{ id: number; itemId: number; quantityRequested: number }>;
    warehouseQty?: number; machineQty?: number; driverQty?: number; cost?: number;
    status?: string;
  }) => {
    prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({
      id: 700, status: opts.status ?? 'PENDING', warehouseId: 1, Items: opts.items,
    } as any);
    const itemIds = [...new Set(opts.items.map((i) => i.itemId))];
    prismaMock.warehouseStock.groupBy.mockResolvedValue(
      itemIds.map((id) => ({ itemId: id, _sum: { quantity_on_hand: opts.warehouseQty ?? 0 } })) as any,
    );
    prismaMock.machineStock.groupBy.mockResolvedValue(
      itemIds.map((id) => ({ itemId: id, _sum: { estimated_stock: opts.machineQty ?? 0 } })) as any,
    );
    prismaMock.driverStock.groupBy.mockResolvedValue(
      itemIds.map((id) => ({ itemId: id, _sum: { quantity_on_hand: opts.driverQty ?? 0 } })) as any,
    );
    prismaMock.item.findMany.mockResolvedValue(
      itemIds.map((id) => ({ id, cost: opts.cost ?? 0 })) as any,
    );
    prismaMock.purchaseOrder.updateMany.mockResolvedValue({ count: 1 } as any);
    prismaMock.$executeRaw.mockResolvedValue(1 as any);
  };

  it('throws for driver callers', async () => {
    setDriverSession(10);
    await expect(completePurchaseOrder(700, [])).rejects.toThrow(/FORBIDDEN/);
  });

  it('refuses to complete an already-COMPLETED order', async () => {
    setAdminSession(1);
    prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({
      id: 700, status: 'COMPLETED', warehouseId: 1, Items: [],
    } as any);
    const r = await completePurchaseOrder(700, []);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/already completed/);
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
  });

  it('refuses when a concurrent receipt claimed the order first', async () => {
    setAdminSession(1);
    // Read as PENDING, but the guarded status flip matches no row — someone
    // else completed it between the reference read and the transaction.
    wireReads({ items: [{ id: 99, itemId: 1, quantityRequested: 100 }] });
    prismaMock.purchaseOrder.updateMany.mockResolvedValue({ count: 0 } as any);

    const r = await completePurchaseOrder(700, [
      { purchaseOrderItemId: 99, quantityReceived: 100, costPerUnit: 7,
        price_standard: 8, price_hospital: 10, price_hotel: 13 },
    ]);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/already completed/);
    // The claim is the first statement, so no stock moved before it failed.
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
  });

  it('blends WAC across Warehouse + Machine + Driver stock and updates Item.cost', async () => {
    setAdminSession(1);
    // 100 in warehouse, 50 in machines, 30 in driver bag → 180 total prior at $5
    wireReads({
      items: [{ id: 99, itemId: 1, quantityRequested: 100 }],
      warehouseQty: 100, machineQty: 50, driverQty: 30, cost: 5,
    });

    // Receiving 100 @ $7. Expected WAC = (180×5 + 100×7) / 280 = 1600/280 ≈ 5.7142857...
    const r = await completePurchaseOrder(700, [
      { purchaseOrderItemId: 99, quantityReceived: 100, costPerUnit: 7,
        price_standard: 8, price_hospital: 10, price_hotel: 13 },
    ]);
    expect(r.success).toBe(true);

    const i = stmtWith('UPDATE "Item"');
    expect(rawSql(i)).toContain('last_purchase_cost = v.last_cost');
    const [itemId, cost, lastCost, pStd, pHosp, pHotel] = rawValues(i);
    expect(itemId).toBe(1);
    expect(cost).toBeCloseTo(5.7142857, 4);
    expect([lastCost, pStd, pHosp, pHotel]).toEqual([7, 8, 10, 13]);

    // Status flip is the guarded claim at the top of the transaction.
    expect(prismaMock.purchaseOrder.updateMany).toHaveBeenCalledWith({
      where: { id: 700, status: { not: 'COMPLETED' } },
      data: expect.objectContaining({ status: 'COMPLETED', completedAt: expect.any(Date) }),
    });
    // Headroom over Prisma's 5s default — see the query-count test below.
    expect(prismaMock.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ timeout: 15_000 }),
    );
    expect(notifyClients).toHaveBeenCalledWith('purchase-order');
  });

  it('records pending_deficit when supplier shorted the order', async () => {
    setAdminSession(1);
    wireReads({ items: [{ id: 99, itemId: 1, quantityRequested: 100 }] });

    // Requested 100, only 70 received → 30 pending deficit.
    await completePurchaseOrder(700, [
      { purchaseOrderItemId: 99, quantityReceived: 70, costPerUnit: 6,
        price_standard: 8, price_hospital: 10, price_hotel: 12 },
    ]);

    const i = stmtWith('INSERT INTO "WarehouseStock"');
    expect(rawSql(i)).toContain('ON CONFLICT ("warehouseId", "itemId") DO UPDATE');
    expect(rawSql(i)).toContain('quantity_on_hand = "WarehouseStock".quantity_on_hand + EXCLUDED.quantity_on_hand');
    // (warehouseId, itemId, receivedQty, deficitChange)
    expect(rawValues(i)).toEqual([1, 1, 70, 30]);
  });

  it('pays an overage against a prior shortage and clamps the deficit at zero', async () => {
    setAdminSession(1);
    wireReads({ items: [{ id: 99, itemId: 1, quantityRequested: 50 }], cost: 5 });

    // Requested 50, received 80 → deficitChange = -30, which is added to the
    // stored deficit and then clamped. The clamp is Postgres-side now (the
    // upsert cannot express max(0, …) for the insert and update paths at once),
    // so what's asserted here is that the negative change is passed through
    // *and* that the clamping statement runs against the same rows.
    await completePurchaseOrder(700, [
      { purchaseOrderItemId: 99, quantityReceived: 80, costPerUnit: 5,
        price_standard: 7, price_hospital: 9, price_hotel: 11 },
    ]);

    expect(rawValues(stmtWith('INSERT INTO "WarehouseStock"'))).toEqual([1, 1, 80, -30]);

    const clamp = stmtWith('SET pending_deficit = 0');
    expect(rawSql(clamp)).toContain('pending_deficit < 0');
    expect(rawValues(clamp)).toEqual([1, 1]); // warehouseId, then the itemId list
  });

  it('merges two order lines for the same item into one WAC blend', async () => {
    setAdminSession(1);
    // Both PO lines point at item 1. `UPDATE … FROM (VALUES …)` is undefined
    // when two value rows hit the same target row, so they must be merged.
    wireReads({
      items: [
        { id: 99, itemId: 1, quantityRequested: 60 },
        { id: 98, itemId: 1, quantityRequested: 40 },
      ],
      warehouseQty: 100, cost: 5,
    });

    await completePurchaseOrder(700, [
      { purchaseOrderItemId: 99, quantityReceived: 60, costPerUnit: 7,
        price_standard: 8, price_hospital: 10, price_hotel: 13 },
      { purchaseOrderItemId: 98, quantityReceived: 40, costPerUnit: 9,
        price_standard: 8, price_hospital: 10, price_hotel: 13 },
    ]);

    // One stock row, one Item row. Prior 100 @ $5 + 60 @ $7 + 40 @ $9
    // = (500 + 420 + 360) / 200 = 6.40 — identical to blending the lines
    // one after the other, which is what the old sequential loop did.
    expect(rawValues(stmtWith('INSERT INTO "WarehouseStock"'))).toEqual([1, 1, 100, 0]);
    const [itemId, cost] = rawValues(stmtWith('UPDATE "Item"'));
    expect(itemId).toBe(1);
    expect(cost).toBeCloseTo(6.4, 6);
    // Both PurchaseOrderItem rows still get their own quantityReceived.
    expect(rawValues(stmtWith('UPDATE "PurchaseOrderItem"'))).toEqual([99, 60, 98, 40]);
  });

  /**
   * The regression this file exists to pin. The old implementation ran ~8
   * sequential queries per line item *inside* the interactive transaction; at
   * the Supavisor pooler's ~70-100ms per round trip a real supplier invoice
   * blew Prisma's 5s window and the receiver saw P2028 "Transaction not found".
   * Statement count must not scale with line count.
   */
  it('issues a constant number of statements regardless of line count', async () => {
    setAdminSession(1);
    const lines = Array.from({ length: 25 }, (_, n) => ({
      id: 100 + n, itemId: n + 1, quantityRequested: 10,
    }));
    wireReads({ items: lines, warehouseQty: 5, cost: 2 });

    const r = await completePurchaseOrder(700, lines.map((l) => ({
      purchaseOrderItemId: l.id, quantityReceived: 10, costPerUnit: 3,
      price_standard: 5, price_hospital: 6, price_hotel: 7,
    })));
    expect(r.success).toBe(true);

    // 4 statements: PurchaseOrderItem qtys, WarehouseStock upsert, deficit
    // clamp, Item cost/prices. Never 25 of anything.
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(4);
    // Prior-quantity reads are 1 grouped query per stock table, not 1 per item,
    // and they happen before the transaction opens.
    expect(prismaMock.warehouseStock.groupBy).toHaveBeenCalledTimes(1);
    expect(prismaMock.machineStock.groupBy).toHaveBeenCalledTimes(1);
    expect(prismaMock.driverStock.groupBy).toHaveBeenCalledTimes(1);
    expect(prismaMock.warehouseStock.aggregate).not.toHaveBeenCalled();
    expect(prismaMock.item.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.purchaseOrderItem.update).not.toHaveBeenCalled();
  });

  it('rejects a non-integer received quantity before touching the database', async () => {
    setAdminSession(1);
    wireReads({ items: [{ id: 99, itemId: 1, quantityRequested: 10 }] });

    const r = await completePurchaseOrder(700, [
      { purchaseOrderItemId: 99, quantityReceived: 7.5, costPerUnit: 3,
        price_standard: 5, price_hospital: 6, price_hotel: 7 },
    ]);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/whole number/);
    expect(prismaMock.purchaseOrder.updateMany).not.toHaveBeenCalled();
  });
});

describe('cancelPurchaseOrder', () => {
  it('throws for driver callers', async () => {
    setDriverSession(10);
    await expect(cancelPurchaseOrder(700)).rejects.toThrow(/FORBIDDEN/);
  });

  it('marks the PO as CANCELLED + audits', async () => {
    setAdminSession(1);
    prismaMock.purchaseOrder.update.mockResolvedValue({} as any);
    const r = await cancelPurchaseOrder(700);
    expect(r.success).toBe(true);
    expect(prismaMock.purchaseOrder.update).toHaveBeenCalledWith({
      where: { id: 700 }, data: { status: 'CANCELLED' },
    });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(), 'CANCEL_PURCHASE_ORDER', 'PurchaseOrder', 700, null, null,
    );
  });
});
