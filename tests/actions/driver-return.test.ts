import { describe, it, expect, beforeEach, vi } from 'vitest';
import { returnDriverStockToWarehouse } from '@/actions/driver-stock';
import { prismaMock } from '../__helpers__/prisma-mock';
import { setAdminSession, setDriverSession, clearSession } from '../__helpers__/session-mock';
import { makeItem, makeDriverStock, makeDriver, makeWarehouse } from '../__helpers__/fixtures';
import { writeAuditLog } from '@/lib/audit-utils';
import { notifyClients } from '@/lib/notify';
import { sendPushToDriver } from '@/lib/push';
import { revalidatePath } from 'next/cache';

/**
 * Admin-initiated end-of-day return: bag → warehouse. The stock writes are raw
 * set-based SQL, so these assert statement text and a constant statement count.
 */

/** Bag of 10 × item 1 and 6 × item 2, one active warehouse. */
function wireReturn() {
  prismaMock.driver.findUnique.mockResolvedValue(makeDriver({ id: 10, name: 'Ali' }) as any);
  prismaMock.warehouse.findUnique.mockResolvedValue(makeWarehouse({ id: 1, name: 'Central Warehouse' }) as any);
  // Honour the `in` filter like the real client: the action compares the row
  // count against the ids it asked for.
  const catalogue = [
    makeItem({ id: 1, name: 'KITKAT', price_standard: 5 }),
    makeItem({ id: 2, name: 'KINDER', price_standard: 7 }),
  ];
  prismaMock.item.findMany.mockImplementation(async (args: any) =>
    catalogue.filter((i) => args.where.id.in.includes(i.id)) as any);
  const bag = [
    makeDriverStock({ itemId: 1, quantity_on_hand: 10 }),
    makeDriverStock({ itemId: 2, quantity_on_hand: 6 }),
  ];
  prismaMock.driverStock.findMany.mockImplementation(async (args: any) =>
    bag.filter((r) => args.where.itemId.in.includes(r.itemId)) as any);
  prismaMock.$queryRaw.mockResolvedValue([{ itemId: 1 }, { itemId: 2 }]);
  prismaMock.$executeRaw.mockResolvedValue(2);
  prismaMock.returnVerification.createMany.mockResolvedValue({ count: 2 });
  prismaMock.inventoryAdjustment.createMany.mockResolvedValue({ count: 2 });
}

describe('returnDriverStockToWarehouse', () => {
  // The side-effect mocks in vitest.setup.ts are module-level and are not reset
  // between tests, so "was not called" needs a clean slate.
  beforeEach(() => {
    vi.mocked(writeAuditLog).mockClear();
  });

  it('throws when no session', async () => {
    clearSession();
    await expect(returnDriverStockToWarehouse(10, 1, [{ itemId: 1, quantity: 5 }])).rejects.toThrow(/UNAUTHORIZED/);
  });

  it('throws FORBIDDEN for driver callers (a driver must not restock their own bag)', async () => {
    setDriverSession(10);
    await expect(returnDriverStockToWarehouse(10, 1, [{ itemId: 1, quantity: 5 }])).rejects.toThrow(/FORBIDDEN/);
  });

  it('rejects an empty or all-zero return, and bad quantities', async () => {
    setAdminSession(1);
    expect((await returnDriverStockToWarehouse(10, 1, [])).success).toBe(false);
    expect((await returnDriverStockToWarehouse(10, 1, [{ itemId: 1, quantity: 0 }])).success).toBe(false);
    expect((await returnDriverStockToWarehouse(10, 1, [{ itemId: 1, quantity: -2 }])).success).toBe(false);
    expect((await returnDriverStockToWarehouse(10, 1, [{ itemId: 1, quantity: 1.5 }])).success).toBe(false);
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it('rejects an inactive warehouse', async () => {
    setAdminSession(1);
    wireReturn();
    prismaMock.warehouse.findUnique.mockResolvedValue(makeWarehouse({ isActive: false }) as any);
    const r = await returnDriverStockToWarehouse(10, 1, [{ itemId: 1, quantity: 5 }]);
    expect(r.success).toBe(false);
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it('rejects returning more than the bag holds, naming the item, before any write', async () => {
    setAdminSession(1);
    wireReturn();
    const r = await returnDriverStockToWarehouse(10, 1, [{ itemId: 1, quantity: 11 }]);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/KITKAT \(bag 10, returning 11\)/);
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it('happy path: bag down, warehouse up, closed RESTOCKED rows, ledger, audit, notify, push', async () => {
    setAdminSession(1);
    wireReturn();

    // Partial on purpose: 5 of 10 KitKat, all 6 Kinder.
    const r = await returnDriverStockToWarehouse(10, 1, [
      { itemId: 1, quantity: 5 },
      { itemId: 2, quantity: 6 },
    ]);
    expect(r).toEqual({ success: true, data: { lines: 2, units: 11 } });

    const decrementSql = (prismaMock.$queryRaw.mock.calls[0][0] as unknown as string[]).join('?');
    expect(decrementSql).toContain('UPDATE "DriverStock"');
    expect(decrementSql).toContain('quantity_on_hand >= v.qty');

    const upsertSql = (prismaMock.$executeRaw.mock.calls[0][0] as unknown as string[]).join('?');
    expect(upsertSql).toContain('INSERT INTO "WarehouseStock"');
    expect(upsertSql).toContain('"WarehouseStock".quantity_on_hand + EXCLUDED.quantity_on_hand');

    // RESTOCKED, never APPROVED: APPROVED is read as shrinkage by Financials.
    expect(prismaMock.returnVerification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          driverId: 10, dispatchId: null, itemId: 1, quantity: 5,
          reason: 'SURPLUS', status: 'RESTOCKED', verified_at: expect.any(Date),
        }),
        expect.objectContaining({ itemId: 2, quantity: 6, status: 'RESTOCKED' }),
      ],
    });
    expect(prismaMock.inventoryAdjustment.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ itemId: 1, quantity: 5, priceAtAdjustment: 5, locationName: 'Ali → Central Warehouse' }),
        expect.objectContaining({ itemId: 2, quantity: 6, priceAtAdjustment: 7 }),
      ],
    });

    // Moving stock between two locations is not a sale.
    expect(prismaMock.refillLog.createMany).not.toHaveBeenCalled();

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(), 'ADMIN_DRIVER_RETURN', 'Driver', 10, null,
      { warehouseId: 1, items: [{ itemId: 1, quantity: 5 }, { itemId: 2, quantity: 6 }] },
      expect.stringContaining('11 unit(s)'),
    );
    expect(notifyClients).toHaveBeenCalledWith('driverStock');
    expect(revalidatePath).toHaveBeenCalledWith('/admin/driver-stock');
    expect(sendPushToDriver).toHaveBeenCalledWith(10, expect.objectContaining({ url: '/driver' }), { urgency: 'low' });
  });

  it('merges duplicate lines additively before the set-based statements', async () => {
    setAdminSession(1);
    wireReturn();
    prismaMock.$queryRaw.mockResolvedValue([{ itemId: 1 }]);
    const r = await returnDriverStockToWarehouse(10, 1, [
      { itemId: 1, quantity: 3 },
      { itemId: 1, quantity: 4 },
    ]);
    expect(r).toEqual({ success: true, data: { lines: 1, units: 7 } });
  });

  it('rolls back when the driver spends the stock mid-count (row misses the gte guard)', async () => {
    setAdminSession(1);
    wireReturn();
    prismaMock.$queryRaw.mockResolvedValue([{ itemId: 2 }]); // item 1 dropped out of RETURNING

    const r = await returnDriverStockToWarehouse(10, 1, [
      { itemId: 1, quantity: 5 },
      { itemId: 2, quantity: 6 },
    ]);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/bag changed.*KITKAT/);
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it('issues a constant number of statements regardless of line count', async () => {
    setAdminSession(1);
    const n = 40;
    const ids = Array.from({ length: n }, (_, i) => i + 1);
    prismaMock.driver.findUnique.mockResolvedValue(makeDriver() as any);
    prismaMock.warehouse.findUnique.mockResolvedValue(makeWarehouse() as any);
    prismaMock.item.findMany.mockResolvedValue(ids.map((id) => makeItem({ id })) as any);
    prismaMock.driverStock.findMany.mockResolvedValue(
      ids.map((id) => makeDriverStock({ itemId: id, quantity_on_hand: 9 })) as any,
    );
    prismaMock.$queryRaw.mockResolvedValue(ids.map((itemId) => ({ itemId })));
    prismaMock.$executeRaw.mockResolvedValue(n);
    prismaMock.returnVerification.createMany.mockResolvedValue({ count: n });
    prismaMock.inventoryAdjustment.createMany.mockResolvedValue({ count: n });

    const r = await returnDriverStockToWarehouse(10, 1, ids.map((itemId) => ({ itemId, quantity: 9 })));
    expect(r.success).toBe(true);

    // Four statements inside the tx, whether it is 1 line or 40 (the P2028 guard).
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prismaMock.returnVerification.createMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.inventoryAdjustment.createMany).toHaveBeenCalledTimes(1);
  });
});
