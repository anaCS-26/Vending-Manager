import { describe, it, expect, vi } from 'vitest';
import {
  getWarehouseInventory,
  getItems,
  getMachines,
  dispatchToDriver,
  logBatchRefills,
  returnDispatch,
  deleteDriver,
  createItem,
  getMachineInventoryDetails,
  getRefillHints,
} from '@/actions/inventory';
import { Prisma } from '@prisma/client';
import { prismaMock } from '../__helpers__/prisma-mock';
import {
  setAdminSession,
  setDriverSession,
  setSuperAdminSession,
  clearSession,
} from '../__helpers__/session-mock';
import {
  makeItem,
  makeMachine,
  makeDispatch,
  makeDispatchItem,
  makeWarehouseStock,
  makeDriverStock,
  makeRefillLog,
} from '../__helpers__/fixtures';
import { writeAuditLog } from '@/lib/audit-utils';
import { notifyClients } from '@/lib/notify';

describe('getWarehouseInventory', () => {
  it('throws when caller is a driver', async () => {
    setDriverSession(10);
    await expect(getWarehouseInventory()).rejects.toThrow(/FORBIDDEN/);
  });

  it('returns active warehouse stock joined with items, ordered by item name', async () => {
    setAdminSession(1);
    const rows = [makeWarehouseStock()];
    prismaMock.warehouseStock.findMany.mockResolvedValue(rows);
    const result = await getWarehouseInventory();
    expect(result).toEqual(rows);
    expect(prismaMock.warehouseStock.findMany).toHaveBeenCalledWith({
      where: { warehouse: { isActive: true }, item: { isActive: true } },
      include: { item: true, warehouse: true },
      orderBy: { item: { name: 'asc' } },
    });
  });
});

describe('getItems', () => {
  it('throws when no session', async () => {
    clearSession();
    await expect(getItems()).rejects.toThrow(/UNAUTHORIZED/);
  });

  it('drivers may call it (used by driver portal)', async () => {
    setDriverSession(10);
    prismaMock.item.findMany.mockResolvedValue([]);
    await expect(getItems()).resolves.toEqual([]);
  });

  it('returns active items only, ordered by name', async () => {
    setAdminSession(1);
    prismaMock.item.findMany.mockResolvedValue([makeItem()]);
    await getItems();
    expect(prismaMock.item.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  });
});

describe('getMachines', () => {
  it('drivers may fetch machines (mobile selector)', async () => {
    setDriverSession(10);
    prismaMock.machine.findMany.mockResolvedValue([makeMachine()]);
    const r = await getMachines();
    expect(r).toHaveLength(1);
    expect(prismaMock.machine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { id: 'asc' } }),
    );
  });
});

describe('dispatchToDriver', () => {
  it('returns error if no items', async () => {
    setAdminSession(1);
    const r = await dispatchToDriver(10, 1, []);
    expect(r.success).toBe(false);
  });

  it('returns error on insufficient warehouse stock (no DriverStock fallback)', async () => {
    setAdminSession(1);
    prismaMock.item.findMany.mockResolvedValue([makeItem({ id: 1 })]);
    prismaMock.dispatch.create.mockResolvedValue(makeDispatch());
    prismaMock.driverStock.findMany.mockResolvedValue([]);
    // The guarded set-based decrement returns no row for a short item.
    prismaMock.$queryRaw.mockResolvedValue([]);

    const r = await dispatchToDriver(10, 1, [{ itemId: 1, quantity: 10 }]);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/Insufficient stock/);
  });

  it('locks price_at_dispatch from price_standard at dispatch time', async () => {
    setAdminSession(1);
    prismaMock.item.findMany.mockResolvedValue([
      makeItem({ id: 1, price_standard: 7.5, price_hospital: 9, price_hotel: 12 }),
    ]);
    prismaMock.dispatch.create.mockResolvedValue(makeDispatch({ id: 555 }));
    prismaMock.driverStock.findMany.mockResolvedValue([]);
    prismaMock.$queryRaw.mockResolvedValue([{ itemId: 1 }]);

    const r = await dispatchToDriver(10, 1, [{ itemId: 1, quantity: 5 }]);
    expect(r.success).toBe(true);

    expect(prismaMock.dispatch.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        driverId: 10,
        warehouseId: 1,
        DispatchItems: {
          create: [{ itemId: 1, quantity_given: 5, price_at_dispatch: 7.5 }],
        },
      }),
    });

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(), 'CREATE_DISPATCH', 'Dispatch', 555, null, expect.any(Object),
    );
  });

  it('drains DriverStock first then takes the remainder from the warehouse', async () => {
    setAdminSession(1);
    prismaMock.item.findMany.mockResolvedValue([makeItem({ id: 1 })]);
    prismaMock.dispatch.create.mockResolvedValue(makeDispatch());
    // Driver already has 3 in their bag, dispatch 10 → 3 from driver, 7 from warehouse.
    prismaMock.driverStock.findMany.mockResolvedValue([{ itemId: 1, quantity_on_hand: 3 } as any]);
    prismaMock.$executeRaw.mockResolvedValue(1);
    prismaMock.$queryRaw.mockResolvedValue([{ itemId: 1 }]);

    await dispatchToDriver(10, 1, [{ itemId: 1, quantity: 10 }]);

    // Bag leg: one set-based decrement bound to (itemId, 3).
    const bagSql = (prismaMock.$executeRaw.mock.calls[0][0] as unknown as string[]).join('?');
    expect(bagSql).toContain('UPDATE "DriverStock"');
    expect((prismaMock.$executeRaw.mock.calls[0][1] as any).values).toEqual([1, 3]);

    // Warehouse leg: the remaining 7, still guarded per row.
    const whSql = (prismaMock.$queryRaw.mock.calls[0][0] as unknown as string[]).join('?');
    expect(whSql).toContain('UPDATE "WarehouseStock"');
    expect(whSql).toContain('quantity_on_hand >= v.qty');
    expect((prismaMock.$queryRaw.mock.calls[0][1] as any).values).toEqual([1, 7]);
  });

  it('issues a constant number of statements regardless of line count', async () => {
    setAdminSession(1);
    const n = 30;
    prismaMock.item.findMany.mockResolvedValue(
      Array.from({ length: n }, (_, i) => makeItem({ id: i + 1 })),
    );
    prismaMock.dispatch.create.mockResolvedValue(makeDispatch());
    prismaMock.driverStock.findMany.mockResolvedValue([]);
    prismaMock.$queryRaw.mockResolvedValue(
      Array.from({ length: n }, (_, i) => ({ itemId: i + 1 })),
    );

    const r = await dispatchToDriver(10, 1,
      Array.from({ length: n }, (_, i) => ({ itemId: i + 1, quantity: 2 })));
    expect(r.success).toBe(true);

    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prismaMock.driverStock.findUnique).not.toHaveBeenCalled();
    expect(prismaMock.warehouseStock.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({ timeout: 15_000 }),
    );
  });
});

describe('logBatchRefills (legacy dispatch path)', () => {
  it('returns error when dispatch is not found', async () => {
    setAdminSession(1);
    prismaMock.dispatch.findUnique.mockResolvedValue(null);
    const r = await logBatchRefills(500, 100, [{ itemId: 1, refilled: 1, returned: 0 }]);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/Dispatch not found/);
  });

  it('returns error when dispatch is CLOSED', async () => {
    setAdminSession(1);
    // Auth lookup
    prismaMock.dispatch.findUnique.mockResolvedValueOnce({ driverId: 10 } as any);
    // Inside the transaction
    prismaMock.dispatch.findUnique.mockResolvedValueOnce(
      makeDispatch({ status: 'CLOSED', DispatchItems: [makeDispatchItem()] } as any),
    );
    prismaMock.machine.findUnique.mockResolvedValue(makeMachine());

    const r = await logBatchRefills(500, 100, [{ itemId: 1, refilled: 1, returned: 0 }]);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/already closed/);
  });

  it('uses HOSPITAL price when machine.tier=HOSPITAL', async () => {
    setAdminSession(1);
    prismaMock.dispatch.findUnique.mockResolvedValueOnce({ driverId: 10 } as any);
    prismaMock.dispatch.findUnique.mockResolvedValueOnce(
      makeDispatch({
        status: 'OPEN',
        DispatchItems: [makeDispatchItem({ itemId: 1, quantity_given: 50 })],
      } as any),
    );
    prismaMock.machine.findUnique.mockResolvedValue(makeMachine({ tier: 'HOSPITAL' }));
    prismaMock.driverStock.findUnique.mockResolvedValue(null);
    prismaMock.refillLog.aggregate.mockResolvedValue({ _sum: { quantity_refilled: 0 } } as any);
    prismaMock.item.findUnique.mockResolvedValue(
      makeItem({ price_standard: 5, price_hospital: 7, price_hotel: 9, cost: 3 }),
    );
    prismaMock.refillLog.findFirst.mockResolvedValue(null); // no previous log
    prismaMock.refillLog.create.mockResolvedValue({} as any);
    prismaMock.machineStock.upsert.mockResolvedValue({} as any);

    await logBatchRefills(500, 100, [{ itemId: 1, refilled: 5, returned: 0 }]);

    expect(prismaMock.refillLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        price_at_refill: 7,        // hospital tier
        cost_at_refill: 3,         // current Item.cost
        sales_revenue: 35,         // 5 units × historic price (no prev log → tier price)
        quantity_refilled: 5,
      }),
    });
  });

  it('uses the previous log price (lock-in) when one exists', async () => {
    setAdminSession(1);
    prismaMock.dispatch.findUnique.mockResolvedValueOnce({ driverId: 10 } as any);
    prismaMock.dispatch.findUnique.mockResolvedValueOnce(
      makeDispatch({
        status: 'OPEN',
        DispatchItems: [makeDispatchItem({ itemId: 1, quantity_given: 50 })],
      } as any),
    );
    prismaMock.machine.findUnique.mockResolvedValue(makeMachine({ tier: 'STANDARD' }));
    prismaMock.driverStock.findUnique.mockResolvedValue(null);
    prismaMock.refillLog.aggregate.mockResolvedValue({ _sum: { quantity_refilled: 0 } } as any);
    prismaMock.item.findUnique.mockResolvedValue(
      makeItem({ price_standard: 8, cost: 3 }), // tier price 8...
    );
    prismaMock.refillLog.findFirst.mockResolvedValue({ price_at_refill: 5 } as any); // ...but historic was 5
    prismaMock.refillLog.create.mockResolvedValue({} as any);
    prismaMock.machineStock.upsert.mockResolvedValue({} as any);

    await logBatchRefills(500, 100, [{ itemId: 1, refilled: 4, returned: 0 }]);

    // sales_revenue uses HISTORIC price 5, not the new tier price 8.
    expect(prismaMock.refillLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        price_at_refill: 8,    // current tier (snapshot for next time)
        sales_revenue: 20,     // 4 × 5 historic
      }),
    });
  });

  it('rejects refilling more than driver has (totalGiven guard)', async () => {
    setAdminSession(1);
    prismaMock.dispatch.findUnique.mockResolvedValueOnce({ driverId: 10 } as any);
    prismaMock.dispatch.findUnique.mockResolvedValueOnce(
      makeDispatch({
        status: 'OPEN',
        DispatchItems: [makeDispatchItem({ itemId: 1, quantity_given: 5 })],
      } as any),
    );
    prismaMock.machine.findUnique.mockResolvedValue(makeMachine());
    prismaMock.driverStock.findUnique.mockResolvedValue(null);
    prismaMock.refillLog.aggregate.mockResolvedValue({ _sum: { quantity_refilled: 4 } } as any);

    // 5 given, 4 already consumed, 1 remaining; attempt to refill 3.
    const r = await logBatchRefills(500, 100, [{ itemId: 1, refilled: 3, returned: 0 }]);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/Not enough remaining/);
  });

  it('routes dispatchId === null into the dispatchless variant', async () => {
    // Drivers only — admin shadowing is rejected by the dispatchless path.
    setDriverSession(10);
    prismaMock.machine.findUnique.mockResolvedValue(makeMachine());
    prismaMock.driverStock.findMany.mockResolvedValue([
      makeDriverStock({ driverId: 10, itemId: 1, quantity_on_hand: 10 }),
    ]);
    prismaMock.item.findMany.mockResolvedValue([makeItem({ id: 1, price_standard: 5, cost: 3 })]);
    // Set-based raw statements: historic-price read → no prior logs; bag
    // decrement and MachineStock update both cover item 1.
    prismaMock.$queryRaw.mockImplementation(async (strings: any) => {
      const sql = (strings as string[]).join('?');
      if (sql.includes('SELECT DISTINCT ON')) return [];
      return [{ itemId: 1 }];
    });
    prismaMock.refillLog.createMany.mockResolvedValue({ count: 1 });

    const r = await logBatchRefills(null, 100, [{ itemId: 1, refilled: 4, returned: 0 }]);
    expect(r.success).toBe(true);

    // Dispatchless: ONE set-based bag decrement, guarded per row in SQL.
    const rawSqls = prismaMock.$queryRaw.mock.calls.map((c) => (c[0] as string[]).join('?'));
    const decrementSql = rawSqls.find((s) => s.includes('UPDATE "DriverStock"'));
    expect(decrementSql).toBeDefined();
    expect(decrementSql).toContain('quantity_on_hand >= v.qty');
    expect(decrementSql).toContain('RETURNING');
    // MachineStock incremented set-based too (row exists → no createMany).
    expect(rawSqls.some((s) => s.includes('UPDATE "MachineStock"'))).toBe(true);
    expect(prismaMock.machineStock.createMany).not.toHaveBeenCalled();

    // RefillLog dispatchId NULL, driverId set — one batched INSERT.
    expect(prismaMock.refillLog.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          dispatchId: null,
          driverId: 10,
          machineId: 100,
          itemId: 1,
          quantity_refilled: 4,
        }),
      ],
    });
  });

  it('dispatchless path rejects admin callers (driver-only)', async () => {
    setAdminSession(1);
    const r = await logBatchRefills(null, 100, [{ itemId: 1, refilled: 1, returned: 0 }]);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/driver-only/i);
  });

  it('dispatchless path: bag-returned items create SURPLUS verification rows', async () => {
    setDriverSession(10);
    prismaMock.machine.findUnique.mockResolvedValue(makeMachine());
    prismaMock.driverStock.findMany.mockResolvedValue([
      makeDriverStock({ driverId: 10, itemId: 1, quantity_on_hand: 10 }),
    ]);
    prismaMock.item.findMany.mockResolvedValue([makeItem({ id: 1, cost: 3, price_standard: 5 })]);
    prismaMock.$queryRaw.mockImplementation(async (strings: any) => {
      const sql = (strings as string[]).join('?');
      if (sql.includes('SELECT DISTINCT ON')) return [];
      return [{ itemId: 1 }];
    });
    prismaMock.returnVerification.createMany.mockResolvedValue({ count: 1 });

    await logBatchRefills(null, 100, [
      { itemId: 1, refilled: 0, returned: 0, bag_returned: 3 },
    ]);

    expect(prismaMock.returnVerification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          dispatchId: null,
          driverId: 10,
          itemId: 1,
          quantity: 3,
          reason: 'SURPLUS',
          status: 'PENDING',
        }),
      ],
    });
    // Bag decremented by bag_returned via the set-based guarded UPDATE.
    const rawSqls = prismaMock.$queryRaw.mock.calls.map((c) => (c[0] as string[]).join('?'));
    expect(rawSqls.some((s) => s.includes('UPDATE "DriverStock"'))).toBe(true);
    // No machine interaction → no RefillLog.
    expect(prismaMock.refillLog.createMany).not.toHaveBeenCalled();
  });

  it('dispatchless path: rejects when refill+bag_returned exceeds bag on hand', async () => {
    setDriverSession(10);
    prismaMock.machine.findUnique.mockResolvedValue(makeMachine());
    prismaMock.item.findMany.mockResolvedValue([makeItem({ id: 1 })]);
    prismaMock.$queryRaw.mockResolvedValue([]); // historic-price read
    prismaMock.driverStock.findMany.mockResolvedValue([
      makeDriverStock({ driverId: 10, itemId: 1, quantity_on_hand: 5 }),
    ]);
    const r = await logBatchRefills(null, 100, [
      { itemId: 1, refilled: 4, returned: 0, bag_returned: 2 }, // 6 > 5 on hand
    ]);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/Not enough in driver bag/);
    // Pre-check fails before the transaction — nothing was written.
    expect(prismaMock.refillLog.createMany).not.toHaveBeenCalled();
    expect(prismaMock.returnVerification.createMany).not.toHaveBeenCalled();
  });
});

describe('returnDispatch', () => {
  it('returns error if dispatch not found', async () => {
    setAdminSession(1);
    prismaMock.dispatch.findUnique.mockResolvedValue(null);
    const r = await returnDispatch(500, []);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/Dispatch not found/);
  });

  it('returns error if return qty exceeds remaining maxReturnable', async () => {
    setAdminSession(1);
    // First findUnique = auth lookup
    prismaMock.dispatch.findUnique.mockResolvedValueOnce({ driverId: 10 } as any);
    // Inside tx
    prismaMock.dispatch.findUnique.mockResolvedValueOnce(
      makeDispatch({
        status: 'OPEN',
        DispatchItems: [makeDispatchItem({ id: 1, itemId: 1, quantity_given: 10 })],
      } as any),
    );
    // Already used 5 in route → maxReturnable = 5.
    prismaMock.refillLog.aggregate.mockResolvedValue(
      { _sum: { quantity_refilled: 5, expired_quantity: 0, damaged_quantity: 0 } } as any,
    );
    const r = await returnDispatch(500, [
      { dispatchItemId: 1, quantity_returned: 6, quantity_damaged: 0 },
    ]);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/exceed remaining/);
  });

  it('closes the dispatch and injects unaccounted stock into DriverStock', async () => {
    setAdminSession(1);
    prismaMock.dispatch.findUnique.mockResolvedValueOnce({ driverId: 10 } as any);
    prismaMock.dispatch.findUnique.mockResolvedValueOnce(
      makeDispatch({
        status: 'OPEN',
        warehouseId: 1,
        DispatchItems: [makeDispatchItem({ id: 1, itemId: 1, quantity_given: 10 })],
      } as any),
    );
    prismaMock.refillLog.aggregate.mockResolvedValue(
      { _sum: { quantity_refilled: 3, expired_quantity: 0, damaged_quantity: 0 } } as any,
    );
    prismaMock.dispatchItem.update.mockResolvedValue({ itemId: 1 } as any);
    prismaMock.warehouseStock.findFirst.mockResolvedValue(makeWarehouseStock({ id: 5 }));
    prismaMock.warehouseStock.update.mockResolvedValue({} as any);
    prismaMock.driverStock.upsert.mockResolvedValue({} as any);
    prismaMock.dispatch.update.mockResolvedValue({} as any);

    // 10 given, 3 refilled, return 5 → 2 unaccounted go to DriverStock.
    const r = await returnDispatch(500, [
      { dispatchItemId: 1, quantity_returned: 5, quantity_damaged: 0 },
    ]);
    expect(r.success).toBe(true);

    expect(prismaMock.driverStock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { driverId_itemId: { driverId: 10, itemId: 1 } },
        update: { quantity_on_hand: { increment: 2 } },
        create: { driverId: 10, itemId: 1, quantity_on_hand: 2 },
      }),
    );
    expect(prismaMock.dispatch.update).toHaveBeenCalledWith({
      where: { id: 500 },
      data: { status: 'CLOSED' },
    });
    expect(notifyClients).toHaveBeenCalledWith('return');
  });
});

describe('deleteDriver', () => {
  it('throws when caller is a driver', async () => {
    setDriverSession(10);
    await expect(deleteDriver(7)).rejects.toThrow(/FORBIDDEN/);
  });

  it('rejects when the driver has open dispatches', async () => {
    setAdminSession(1);
    prismaMock.dispatch.count.mockResolvedValueOnce(1); // open-dispatch guard
    const r = await deleteDriver(7);
    expect(r.success).toBe(false);
    expect(prismaMock.driver.delete).not.toHaveBeenCalled();
    expect(prismaMock.driver.update).not.toHaveBeenCalled();
  });

  it('hard-deletes a driver with no history', async () => {
    setAdminSession(1);
    // open-dispatch guard, then the four history counts — all zero.
    prismaMock.dispatch.count.mockResolvedValue(0);
    prismaMock.refillLog.count.mockResolvedValue(0);
    prismaMock.returnVerification.count.mockResolvedValue(0);
    prismaMock.stockAssignment.count.mockResolvedValue(0);
    prismaMock.driver.delete.mockResolvedValue({} as any);

    const r = await deleteDriver(7);
    expect(r.success).toBe(true);
    expect(prismaMock.driver.delete).toHaveBeenCalledWith({ where: { id: 7 } });
    expect(prismaMock.driver.update).not.toHaveBeenCalled();
  });

  it('soft-deletes (deactivates) a driver with refill history', async () => {
    setAdminSession(1);
    prismaMock.dispatch.count.mockResolvedValue(0);
    prismaMock.refillLog.count.mockResolvedValue(3); // has history
    prismaMock.returnVerification.count.mockResolvedValue(0);
    prismaMock.stockAssignment.count.mockResolvedValue(0);
    prismaMock.driver.update.mockResolvedValue({} as any);

    const r = await deleteDriver(7);
    expect(r.success).toBe(true);
    expect(prismaMock.driver.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { isActive: false },
    });
    expect(prismaMock.driver.delete).not.toHaveBeenCalled();
  });

  it('falls back to soft-delete when a hard delete hits an FK constraint', async () => {
    setAdminSession(1);
    prismaMock.dispatch.count.mockResolvedValue(0);
    prismaMock.refillLog.count.mockResolvedValue(0);
    prismaMock.returnVerification.count.mockResolvedValue(0);
    prismaMock.stockAssignment.count.mockResolvedValue(0);
    prismaMock.driver.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('FK', { code: 'P2003', clientVersion: 'test' }),
    );
    prismaMock.driver.update.mockResolvedValue({} as any);

    const r = await deleteDriver(7);
    expect(r.success).toBe(true);
    expect(prismaMock.driver.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { isActive: false },
    });
  });
});

// These two actions shipped without an RBAC guard. Every export in a "use server"
// file is a public RPC endpoint, so the guard is the only thing standing between a
// caller and the database — regression-test it rather than trusting review.
describe('createItem authorization', () => {
  it('throws when no session', async () => {
    clearSession();
    await expect(
      createItem('Pepsi', 'Drinks', 'SKU-1', 5, 5, 5),
    ).rejects.toThrow(/UNAUTHORIZED/);
  });

  it('throws when caller is a driver', async () => {
    setDriverSession(10);
    await expect(
      createItem('Pepsi', 'Drinks', 'SKU-1', 5, 5, 5),
    ).rejects.toThrow(/FORBIDDEN/);
  });

  it('does not touch the database when the guard rejects', async () => {
    setDriverSession(10);
    await expect(
      createItem('Pepsi', 'Drinks', 'SKU-1', 5, 5, 5, 1, 999),
    ).rejects.toThrow(/FORBIDDEN/);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

describe('getMachineInventoryDetails authorization', () => {
  it('throws when no session', async () => {
    clearSession();
    await expect(getMachineInventoryDetails(1)).rejects.toThrow(/UNAUTHORIZED/);
  });

  it('does not query stock when the guard rejects', async () => {
    clearSession();
    await expect(getMachineInventoryDetails(1)).rejects.toThrow(/UNAUTHORIZED/);
    expect(prismaMock.machineStock.findMany).not.toHaveBeenCalled();
  });

  it('drivers may call it (used by the driver portal)', async () => {
    setDriverSession(10);
    prismaMock.machineStock.findMany.mockResolvedValue([]);
    await expect(getMachineInventoryDetails(1)).resolves.toEqual([]);
  });
});

describe('getRefillHints', () => {
  it('throws when no session', async () => {
    clearSession();
    await expect(getRefillHints()).rejects.toThrow(/UNAUTHORIZED/);
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
  });

  it('drivers may call it (it feeds their refill sheet)', async () => {
    setDriverSession(10);
    prismaMock.$queryRaw.mockResolvedValueOnce([
      { machineId: 1, itemId: 7, lastQty: 6, lastRefilledAt: new Date('2026-08-01') },
    ]);
    await expect(getRefillHints()).resolves.toEqual([
      { machineId: 1, itemId: 7, lastQty: 6, lastRefilledAt: new Date('2026-08-01') },
    ]);
  });

  it('fetches every machine in one query, not one query per machine', async () => {
    // The driver is regularly out of signal standing at the machine, so the whole
    // set is pulled once while online and cached in IndexedDB. Per-machine
    // fetching would leave the hints missing exactly when they are needed.
    setDriverSession(10);
    prismaMock.$queryRaw.mockResolvedValueOnce([]);
    await getRefillHints();
    expect(prismaMock.$queryRaw).toHaveBeenCalledTimes(1);
    const sql = prismaMock.$queryRaw.mock.calls[0][0].join('?');
    expect(sql).toMatch(/DISTINCT ON \("machineId", "itemId"\)/);
    expect(sql).not.toMatch(/WHERE "machineId" =/);
  });

  it('only reads history — a hint must never mutate stock or write an audit row', async () => {
    setDriverSession(10);
    // writeAuditLog is a global module mock and isn't reset by resetPrismaMock.
    vi.mocked(writeAuditLog).mockClear();
    prismaMock.$queryRaw.mockResolvedValueOnce([]);
    await getRefillHints();
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(writeAuditLog).not.toHaveBeenCalled();
  });
});

describe('logBatchRefills idempotency', () => {
  // A batch that commits but whose response is lost stays in the driver's offline
  // queue and gets replayed. Without this mapping the replay either errors forever
  // or, worse, commits the refill a second time and inflates revenue.
  it('reports success when the replay hits the (clientRequestId, itemId) unique key', async () => {
    setAdminSession(1);
    prismaMock.dispatch.findUnique.mockResolvedValueOnce({ driverId: 10 } as any);
    prismaMock.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['clientRequestId', 'itemId'] },
      }),
    );

    const r = await logBatchRefills(
      500, 100, [{ itemId: 1, refilled: 5, returned: 0 }], 'req-dupe',
    );
    expect(r.success).toBe(true);
  });

  it('still surfaces unrelated unique-constraint failures as errors', async () => {
    setAdminSession(1);
    prismaMock.dispatch.findUnique.mockResolvedValueOnce({ driverId: 10 } as any);
    prismaMock.$transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: { target: ['machineId', 'itemId'] },
      }),
    );

    const r = await logBatchRefills(
      500, 100, [{ itemId: 1, refilled: 5, returned: 0 }], 'req-x',
    );
    expect(r.success).toBe(false);
  });
});
