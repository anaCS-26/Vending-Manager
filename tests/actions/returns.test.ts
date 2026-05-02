import { describe, it, expect } from 'vitest';
import {
  getPendingReturns,
  approveReturn,
  rejectReturn,
} from '@/actions/returns';
import { prismaMock } from '../__helpers__/prisma-mock';
import { setAdminSession, setDriverSession } from '../__helpers__/session-mock';
import {
  makeItem,
  makeWarehouse,
  makeReturnVerification,
  makeDispatch,
} from '../__helpers__/fixtures';
import { writeAuditLog } from '@/lib/audit-utils';
import { notifyClients } from '@/lib/notify';

describe('getPendingReturns', () => {
  it('throws for driver callers', async () => {
    setDriverSession(10);
    await expect(getPendingReturns()).rejects.toThrow(/FORBIDDEN/);
  });

  it('only fetches PENDING rows, includes both legacy + dispatchless relations', async () => {
    setAdminSession(1);
    prismaMock.returnVerification.findMany.mockResolvedValue([]);
    await getPendingReturns();
    expect(prismaMock.returnVerification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'PENDING' },
        include: expect.objectContaining({
          driver: true,
          dispatch: { include: { driver: true } },
        }),
      }),
    );
  });
});

describe('approveReturn', () => {
  it('rejects when row is not PENDING', async () => {
    setAdminSession(1);
    prismaMock.returnVerification.findUnique.mockResolvedValue(
      makeReturnVerification({ status: 'APPROVED' }) as any,
    );
    const r = await approveReturn(1, 'RESTOCK');
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/not pending/);
  });

  it('RESTOCK path: increments WarehouseStock and writes a positive InventoryAdjustment', async () => {
    setAdminSession(1);
    prismaMock.returnVerification.findUnique.mockResolvedValue(
      makeReturnVerification({ id: 1, itemId: 1, quantity: 5, item: makeItem() }) as any,
    );
    prismaMock.returnVerification.update.mockResolvedValue({} as any);
    prismaMock.warehouse.findFirst.mockResolvedValue(makeWarehouse());
    prismaMock.warehouseStock.upsert.mockResolvedValue({} as any);
    prismaMock.inventoryAdjustment.create.mockResolvedValue({} as any);

    const r = await approveReturn(1, 'RESTOCK', 'looks ok');
    expect(r.success).toBe(true);

    expect(prismaMock.returnVerification.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({ status: 'APPROVED', notes: 'looks ok', verified_at: expect.any(Date) }),
    });
    expect(prismaMock.warehouseStock.upsert).toHaveBeenCalledWith({
      where: { warehouseId_itemId: { warehouseId: 1, itemId: 1 } },
      update: { quantity_on_hand: { increment: 5 } },
      create: { warehouseId: 1, itemId: 1, quantity_on_hand: 5 },
    });
    expect(prismaMock.inventoryAdjustment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        itemId: 1,
        quantity: 5,                    // POSITIVE (restock)
        priceAtAdjustment: 5,           // makeItem().price_standard
      }),
    });
    expect(notifyClients).toHaveBeenCalledWith('returns');
  });

  it('LOSS path: writes a NEGATIVE InventoryAdjustment (write-off) and does NOT touch warehouse', async () => {
    setAdminSession(1);
    prismaMock.returnVerification.findUnique.mockResolvedValue(
      makeReturnVerification({ id: 1, itemId: 1, quantity: 5, reason: 'DAMAGED', item: makeItem() }) as any,
    );
    prismaMock.returnVerification.update.mockResolvedValue({} as any);
    prismaMock.inventoryAdjustment.create.mockResolvedValue({} as any);

    const r = await approveReturn(1, 'LOSS', 'water damage');
    expect(r.success).toBe(true);

    // LOSS branch must NOT call upsert
    expect(prismaMock.warehouseStock.upsert).not.toHaveBeenCalled();
    expect(prismaMock.inventoryAdjustment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        itemId: 1,
        quantity: -5,                    // NEGATIVE (write-off)
        reason: expect.stringContaining('Written-off'),
      }),
    });
  });

  it('RESTOCK fails with no warehouse available', async () => {
    setAdminSession(1);
    prismaMock.returnVerification.findUnique.mockResolvedValue(
      makeReturnVerification({ item: makeItem() }) as any,
    );
    prismaMock.returnVerification.update.mockResolvedValue({} as any);
    prismaMock.warehouse.findFirst.mockResolvedValue(null);
    const r = await approveReturn(1, 'RESTOCK');
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/No warehouse/);
  });
});

describe('rejectReturn', () => {
  it('rejects when row is not PENDING', async () => {
    setAdminSession(1);
    prismaMock.returnVerification.findUnique.mockResolvedValue(
      makeReturnVerification({ status: 'REJECTED' }) as any,
    );
    const r = await rejectReturn(1);
    expect(r.success).toBe(false);
  });

  it('credits the driver back when row had driverId set (dispatchless)', async () => {
    setAdminSession(1);
    prismaMock.returnVerification.findUnique.mockResolvedValue(
      makeReturnVerification({
        driverId: 10, dispatchId: null, dispatch: null, itemId: 1, quantity: 4,
      }) as any,
    );
    prismaMock.returnVerification.update.mockResolvedValue({} as any);
    prismaMock.driverStock.upsert.mockResolvedValue({} as any);

    const r = await rejectReturn(1);
    expect(r.success).toBe(true);

    expect(prismaMock.driverStock.upsert).toHaveBeenCalledWith({
      where: { driverId_itemId: { driverId: 10, itemId: 1 } },
      update: { quantity_on_hand: { increment: 4 } },
      create: { driverId: 10, itemId: 1, quantity_on_hand: 4 },
    });
  });

  it('falls back to dispatch.driverId when driverId is null (legacy row)', async () => {
    setAdminSession(1);
    prismaMock.returnVerification.findUnique.mockResolvedValue(
      makeReturnVerification({
        driverId: null, dispatchId: 500,
        dispatch: makeDispatch({ driverId: 99 }), itemId: 1, quantity: 2,
      }) as any,
    );
    prismaMock.returnVerification.update.mockResolvedValue({} as any);
    prismaMock.driverStock.upsert.mockResolvedValue({} as any);

    await rejectReturn(1);

    expect(prismaMock.driverStock.upsert).toHaveBeenCalledWith({
      where: { driverId_itemId: { driverId: 99, itemId: 1 } },
      update: { quantity_on_hand: { increment: 2 } },
      create: { driverId: 99, itemId: 1, quantity_on_hand: 2 },
    });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(), 'REJECT_RETURN', 'ReturnVerification', 1, null, null,
    );
  });

  it('does not touch DriverStock when neither driverId nor dispatch.driverId resolves', async () => {
    setAdminSession(1);
    prismaMock.returnVerification.findUnique.mockResolvedValue(
      makeReturnVerification({ driverId: null, dispatchId: null, dispatch: null }) as any,
    );
    prismaMock.returnVerification.update.mockResolvedValue({} as any);

    const r = await rejectReturn(1);
    expect(r.success).toBe(true);
    expect(prismaMock.driverStock.upsert).not.toHaveBeenCalled();
  });
});
