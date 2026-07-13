import { describe, it, expect } from 'vitest';
import {
  getWarehouseInventory,
  getItems,
  getMachines,
  dispatchToDriver,
  logBatchRefills,
  returnDispatch,
  deleteDriver,
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
    prismaMock.driverStock.findUnique.mockResolvedValue(null);
    prismaMock.warehouseStock.updateMany.mockResolvedValue({ count: 0 });

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
    prismaMock.driverStock.findUnique.mockResolvedValue(null);
    prismaMock.warehouseStock.updateMany.mockResolvedValue({ count: 1 });

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
    prismaMock.driverStock.findUnique.mockResolvedValue(
      makeDriverStock({ id: 9, quantity_on_hand: 3 }),
    );
    prismaMock.driverStock.update.mockResolvedValue({} as any);
    prismaMock.warehouseStock.updateMany.mockResolvedValue({ count: 1 });

    await dispatchToDriver(10, 1, [{ itemId: 1, quantity: 10 }]);

    expect(prismaMock.driverStock.update).toHaveBeenCalledWith({
      where: { id: 9 },
      data: { quantity_on_hand: { decrement: 3 } },
    });
    expect(prismaMock.warehouseStock.updateMany).toHaveBeenCalledWith({
      where: { itemId: 1, warehouseId: 1, quantity_on_hand: { gte: 7 } },
      data: { quantity_on_hand: { decrement: 7 } },
    });
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
    prismaMock.driverStock.findUnique.mockResolvedValue(
      makeDriverStock({ driverId: 10, itemId: 1, quantity_on_hand: 10 }),
    );
    prismaMock.item.findUnique.mockResolvedValue(makeItem({ price_standard: 5, cost: 3 }));
    prismaMock.refillLog.findFirst.mockResolvedValue(null);
    prismaMock.refillLog.create.mockResolvedValue({} as any);
    prismaMock.driverStock.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.machineStock.upsert.mockResolvedValue({} as any);

    const r = await logBatchRefills(null, 100, [{ itemId: 1, refilled: 4, returned: 0 }]);
    expect(r.success).toBe(true);

    // Dispatchless: bag decremented directly via gte guard.
    expect(prismaMock.driverStock.updateMany).toHaveBeenCalledWith({
      where: { driverId: 10, itemId: 1, quantity_on_hand: { gte: 4 } },
      data: { quantity_on_hand: { decrement: 4 } },
    });
    // RefillLog dispatchId NULL, driverId set.
    expect(prismaMock.refillLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dispatchId: null,
        driverId: 10,
        machineId: 100,
        itemId: 1,
        quantity_refilled: 4,
      }),
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
    prismaMock.driverStock.findUnique.mockResolvedValue(
      makeDriverStock({ driverId: 10, itemId: 1, quantity_on_hand: 10 }),
    );
    prismaMock.item.findUnique.mockResolvedValue(makeItem({ cost: 3, price_standard: 5 }));
    prismaMock.refillLog.findFirst.mockResolvedValue(null);
    prismaMock.driverStock.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.machineStock.upsert.mockResolvedValue({} as any);
    prismaMock.returnVerification.create.mockResolvedValue({} as any);

    await logBatchRefills(null, 100, [
      { itemId: 1, refilled: 0, returned: 0, bag_returned: 3 },
    ]);

    expect(prismaMock.returnVerification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dispatchId: null,
        driverId: 10,
        itemId: 1,
        quantity: 3,
        reason: 'SURPLUS',
        status: 'PENDING',
      }),
    });
    // Bag decremented by bag_returned (no refill in this case).
    expect(prismaMock.driverStock.updateMany).toHaveBeenCalledWith({
      where: { driverId: 10, itemId: 1, quantity_on_hand: { gte: 3 } },
      data: { quantity_on_hand: { decrement: 3 } },
    });
  });

  it('dispatchless path: rejects when refill+bag_returned exceeds bag on hand', async () => {
    setDriverSession(10);
    prismaMock.machine.findUnique.mockResolvedValue(makeMachine());
    prismaMock.driverStock.findUnique.mockResolvedValue(
      makeDriverStock({ driverId: 10, itemId: 1, quantity_on_hand: 5 }),
    );
    const r = await logBatchRefills(null, 100, [
      { itemId: 1, refilled: 4, returned: 0, bag_returned: 2 }, // 6 > 5 on hand
    ]);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/Not enough in driver bag/);
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
