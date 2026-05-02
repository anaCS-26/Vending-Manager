import { describe, it, expect, vi } from 'vitest';
import {
  assignToDriver,
  acknowledgeAssignment,
  denyAssignment,
  dismissAssignment,
  submitDriverReturn,
  getDriverBag,
  getDriversWithBagAndPending,
} from '@/actions/driver-stock';
import { prismaMock } from '../__helpers__/prisma-mock';
import {
  setAdminSession,
  setDriverSession,
  clearSession,
} from '../__helpers__/session-mock';
import {
  makeItem,
  makeStockAssignment,
  makeDriverStock,
} from '../__helpers__/fixtures';
import { writeAuditLog } from '@/lib/audit-utils';
import { notifyClients } from '@/lib/notify';
import { revalidatePath } from 'next/cache';

// All side-effect modules are mocked in vitest.setup.ts. We only need to
// control prisma return values + the session, and assert call args.

describe('assignToDriver', () => {
  // requireAdmin() runs OUTSIDE the action's try/catch — auth failures throw
  // rather than returning a result object. Tests assert the throw directly.
  it('throws when no session', async () => {
    clearSession();
    await expect(assignToDriver(10, 1, [{ itemId: 1, quantity: 5 }])).rejects.toThrow(/UNAUTHORIZED/);
  });

  it('throws FORBIDDEN for driver callers (admin-only)', async () => {
    setDriverSession(10);
    await expect(assignToDriver(10, 1, [{ itemId: 1, quantity: 5 }])).rejects.toThrow(/FORBIDDEN/);
  });

  it('rejects empty item lists', async () => {
    setAdminSession(1);
    const r = await assignToDriver(10, 1, []);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/at least one item/);
  });

  it('rejects negative or non-integer quantities', async () => {
    setAdminSession(1);
    const negative = await assignToDriver(10, 1, [{ itemId: 1, quantity: -3 }]);
    expect(negative.success).toBe(false);

    const fractional = await assignToDriver(10, 1, [{ itemId: 1, quantity: 1.5 }]);
    expect(fractional.success).toBe(false);
  });

  it('rejects unknown item IDs', async () => {
    setAdminSession(1);
    prismaMock.item.findMany.mockResolvedValue([]); // db says no items match
    const r = await assignToDriver(10, 1, [{ itemId: 999, quantity: 5 }]);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/invalid/);
  });

  it('fails when warehouse is short on stock', async () => {
    setAdminSession(1);
    prismaMock.item.findMany.mockResolvedValue([makeItem({ id: 1 })]);
    // updateMany returns count: 0 → insufficient stock guard fires.
    prismaMock.warehouseStock.updateMany.mockResolvedValue({ count: 0 });

    const r = await assignToDriver(10, 1, [{ itemId: 1, quantity: 50 }]);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/Insufficient warehouse stock/);
  });

  it('happy path: decrements warehouse, creates StockAssignment, upserts DriverStock, audits, notifies', async () => {
    setAdminSession(1);
    prismaMock.item.findMany.mockResolvedValue([makeItem({ id: 1, cost: 3 })]);
    prismaMock.warehouseStock.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.stockAssignment.create.mockResolvedValue(makeStockAssignment({ id: 42 }));
    prismaMock.driverStock.upsert.mockResolvedValue(makeDriverStock());

    const r = await assignToDriver(10, 1, [{ itemId: 1, quantity: 20, notes: 'pls' }]);
    expect(r.success).toBe(true);
    expect((r as any).data.assignmentIds).toEqual([42]);

    // Warehouse decrement guarded by gte:
    expect(prismaMock.warehouseStock.updateMany).toHaveBeenCalledWith({
      where: { itemId: 1, warehouseId: 1, quantity_on_hand: { gte: 20 } },
      data: { quantity_on_hand: { decrement: 20 } },
    });

    // StockAssignment row snapshots cost_at_assignment from item.cost.
    expect(prismaMock.stockAssignment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          driverId: 10, itemId: 1, warehouseId: 1, quantity: 20,
          cost_at_assignment: 3, status: 'PENDING_ACK', notes: 'pls', assigned_by: 1,
        }),
      }),
    );

    // Optimistic credit on DriverStock.
    expect(prismaMock.driverStock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { driverId_itemId: { driverId: 10, itemId: 1 } },
        update: { quantity_on_hand: { increment: 20 } },
        create: { driverId: 10, itemId: 1, quantity_on_hand: 20 },
      }),
    );

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(), 'ASSIGN_STOCK', 'Driver', 10, null, expect.any(Object), expect.any(String),
    );
    expect(notifyClients).toHaveBeenCalledWith('stock-assignment');
    expect(revalidatePath).toHaveBeenCalledWith('/driver');
    expect(revalidatePath).toHaveBeenCalledWith('/admin/driver-stock');
  });

  it('merges duplicate item lines (same itemId added twice)', async () => {
    setAdminSession(1);
    prismaMock.item.findMany.mockResolvedValue([makeItem({ id: 1 })]);
    prismaMock.warehouseStock.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.stockAssignment.create.mockResolvedValue(makeStockAssignment());
    prismaMock.driverStock.upsert.mockResolvedValue(makeDriverStock());

    await assignToDriver(10, 1, [
      { itemId: 1, quantity: 10 },
      { itemId: 1, quantity: 5 },
    ]);

    // Should make ONE warehouse decrement of 15, not two of 10 + 5.
    expect(prismaMock.warehouseStock.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.warehouseStock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ quantity_on_hand: { gte: 15 } }),
        data: { quantity_on_hand: { decrement: 15 } },
      }),
    );
  });
});

describe('acknowledgeAssignment', () => {
  it('rejects when no session', async () => {
    clearSession();
    const r = await acknowledgeAssignment(1);
    expect(r.success).toBe(false);
  });

  it('rejects admin callers (driver-only)', async () => {
    setAdminSession(1);
    const r = await acknowledgeAssignment(1);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/Only drivers/);
  });

  it('rejects when assignment is not found', async () => {
    setDriverSession(10);
    prismaMock.stockAssignment.findUnique.mockResolvedValue(null);
    const r = await acknowledgeAssignment(99);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/not found/i);
  });

  it("rejects when the assignment belongs to another driver", async () => {
    setDriverSession(10);
    prismaMock.stockAssignment.findUnique.mockResolvedValue(
      makeStockAssignment({ driverId: 11 }),
    );
    const r = await acknowledgeAssignment(1);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/Not your assignment/);
  });

  it('rejects when already ack/disputed', async () => {
    setDriverSession(10);
    prismaMock.stockAssignment.findUnique.mockResolvedValue(
      makeStockAssignment({ driverId: 10, status: 'ACKNOWLEDGED' }),
    );
    const r = await acknowledgeAssignment(1);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/already acknowledged/);
  });

  it('happy path: flips status, snapshots qty, audits, notifies', async () => {
    setDriverSession(10);
    const assignment = makeStockAssignment({ driverId: 10, quantity: 20, status: 'PENDING_ACK' });
    prismaMock.stockAssignment.findUnique.mockResolvedValue(assignment);
    prismaMock.stockAssignment.update.mockResolvedValue({ ...assignment, status: 'ACKNOWLEDGED' });

    const r = await acknowledgeAssignment(assignment.id);
    expect(r.success).toBe(true);

    expect(prismaMock.stockAssignment.update).toHaveBeenCalledWith({
      where: { id: assignment.id },
      data: expect.objectContaining({
        status: 'ACKNOWLEDGED',
        acknowledged_qty: 20,
        acknowledged_at: expect.any(Date),
      }),
    });
    expect(notifyClients).toHaveBeenCalledWith('assignment-ack');
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      'ACK_ASSIGNMENT',
      'StockAssignment',
      assignment.id,
      { status: 'PENDING_ACK' },
      expect.objectContaining({ status: 'ACKNOWLEDGED' }),
      null,
    );
  });
});

describe('denyAssignment', () => {
  it('rejects admin callers', async () => {
    setAdminSession(1);
    const r = await denyAssignment(1);
    expect(r.success).toBe(false);
  });

  it("rejects another driver's assignment", async () => {
    setDriverSession(10);
    prismaMock.stockAssignment.findUnique.mockResolvedValue(
      makeStockAssignment({ driverId: 11 }),
    );
    const r = await denyAssignment(1);
    expect(r.success).toBe(false);
  });

  it('rejects when stock has already been spent (updateMany returns count 0)', async () => {
    setDriverSession(10);
    prismaMock.stockAssignment.findUnique.mockResolvedValue(
      makeStockAssignment({ driverId: 10, quantity: 20, itemId: 1 }),
    );
    prismaMock.driverStock.updateMany.mockResolvedValue({ count: 0 }); // gte guard fired
    const r = await denyAssignment(1);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/already been consumed/);
  });

  it('happy path: reverses optimistic credit + returns to warehouse + flips to DISPUTED', async () => {
    setDriverSession(10);
    const assignment = makeStockAssignment({
      driverId: 10, itemId: 1, warehouseId: 1, quantity: 20, status: 'PENDING_ACK',
    });
    prismaMock.stockAssignment.findUnique.mockResolvedValue(assignment);
    prismaMock.driverStock.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.warehouseStock.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.stockAssignment.update.mockResolvedValue({ ...assignment, status: 'DISPUTED' });

    const r = await denyAssignment(assignment.id, 'I never got these');
    expect(r.success).toBe(true);

    // Driver bag decremented, but only if they still have the qty (gte guard).
    expect(prismaMock.driverStock.updateMany).toHaveBeenCalledWith({
      where: { driverId: 10, itemId: 1, quantity_on_hand: { gte: 20 } },
      data: { quantity_on_hand: { decrement: 20 } },
    });
    // Warehouse re-credited.
    expect(prismaMock.warehouseStock.updateMany).toHaveBeenCalledWith({
      where: { warehouseId: 1, itemId: 1 },
      data: { quantity_on_hand: { increment: 20 } },
    });
    // Assignment row flipped to DISPUTED, with notes preserved.
    expect(prismaMock.stockAssignment.update).toHaveBeenCalledWith({
      where: { id: assignment.id },
      data: expect.objectContaining({
        status: 'DISPUTED',
        acknowledged_qty: 0,
        notes: 'I never got these',
      }),
    });
    expect(notifyClients).toHaveBeenCalledWith('assignment-dispute');
  });
});

describe('dismissAssignment', () => {
  it('throws for driver callers (admin-only)', async () => {
    setDriverSession(10);
    await expect(dismissAssignment(1)).rejects.toThrow(/FORBIDDEN/);
  });

  it('happy path: deletes the row + audits', async () => {
    setAdminSession(1);
    const assignment = makeStockAssignment({ status: 'DISPUTED' });
    prismaMock.stockAssignment.findUnique.mockResolvedValue(assignment);
    prismaMock.stockAssignment.delete.mockResolvedValue(assignment);

    const r = await dismissAssignment(assignment.id);
    expect(r.success).toBe(true);
    expect(prismaMock.stockAssignment.delete).toHaveBeenCalledWith({ where: { id: assignment.id } });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      'DISMISS_ASSIGNMENT',
      'StockAssignment',
      assignment.id,
      expect.any(Object),
      expect.any(Object),
      expect.any(String),
    );
  });
});

describe('submitDriverReturn', () => {
  it('rejects admin callers (driver-only)', async () => {
    setAdminSession(1);
    const r = await submitDriverReturn([{ itemId: 1, quantity: 1, reason: 'SURPLUS' }]);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/Driver-only/);
  });

  it('rejects empty return list', async () => {
    setDriverSession(10);
    const r = await submitDriverReturn([]);
    expect(r.success).toBe(false);
  });

  it('rejects invalid reason', async () => {
    setDriverSession(10);
    const r = await submitDriverReturn([{ itemId: 1, quantity: 1, reason: 'STOLEN' as any }]);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/Invalid return reason/);
  });

  it('rejects qty=0', async () => {
    setDriverSession(10);
    const r = await submitDriverReturn([{ itemId: 1, quantity: 0, reason: 'SURPLUS' }]);
    expect(r.success).toBe(false);
  });

  it('rejects when bag does not have enough on hand', async () => {
    setDriverSession(10);
    prismaMock.driverStock.findMany.mockResolvedValue([
      makeDriverStock({ itemId: 1, quantity_on_hand: 3 }),
    ]);
    const r = await submitDriverReturn([{ itemId: 1, quantity: 5, reason: 'SURPLUS' }]);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/Cannot return 5/);
  });

  it('aggregates multiple lines per item before bag-balance check', async () => {
    setDriverSession(10);
    // 6 on hand, two lines totalling 7 → reject.
    prismaMock.driverStock.findMany.mockResolvedValue([
      makeDriverStock({ itemId: 1, quantity_on_hand: 6 }),
    ]);
    const r = await submitDriverReturn([
      { itemId: 1, quantity: 4, reason: 'DAMAGED' },
      { itemId: 1, quantity: 3, reason: 'EXPIRED' },
    ]);
    expect(r.success).toBe(false);
  });

  it('happy path: creates one ReturnVerification per line and decrements bag once per item', async () => {
    setDriverSession(10);
    prismaMock.driverStock.findMany.mockResolvedValue([
      makeDriverStock({ itemId: 1, quantity_on_hand: 10 }),
    ]);
    prismaMock.returnVerification.create.mockResolvedValueOnce({ id: 100 } as any);
    prismaMock.returnVerification.create.mockResolvedValueOnce({ id: 101 } as any);
    prismaMock.driverStock.updateMany.mockResolvedValue({ count: 1 });

    const r = await submitDriverReturn([
      { itemId: 1, quantity: 4, reason: 'DAMAGED' },
      { itemId: 1, quantity: 3, reason: 'EXPIRED' },
    ]);
    expect(r.success).toBe(true);
    expect((r as any).data.returnIds).toEqual([100, 101]);

    // Two ReturnVerification rows created — one per reason.
    expect(prismaMock.returnVerification.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.returnVerification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dispatchId: null,
        driverId: 10,
        itemId: 1,
        quantity: 4,
        reason: 'DAMAGED',
        status: 'PENDING',
      }),
    });
    expect(prismaMock.returnVerification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        reason: 'EXPIRED',
        quantity: 3,
      }),
    });

    // ONE bag decrement for the aggregate (4 + 3 = 7), guarded by gte.
    expect(prismaMock.driverStock.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.driverStock.updateMany).toHaveBeenCalledWith({
      where: { driverId: 10, itemId: 1, quantity_on_hand: { gte: 7 } },
      data: { quantity_on_hand: { decrement: 7 } },
    });

    expect(notifyClients).toHaveBeenCalledWith('return');
  });

  it('throws if a concurrent update beats the decrement (count: 0 from updateMany)', async () => {
    setDriverSession(10);
    prismaMock.driverStock.findMany.mockResolvedValue([
      makeDriverStock({ itemId: 1, quantity_on_hand: 10 }),
    ]);
    prismaMock.returnVerification.create.mockResolvedValue({ id: 1 } as any);
    prismaMock.driverStock.updateMany.mockResolvedValue({ count: 0 });

    const r = await submitDriverReturn([{ itemId: 1, quantity: 5, reason: 'SURPLUS' }]);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/Insufficient stock|concurrent update/);
  });
});

describe('getDriverBag', () => {
  it('returns empty when caller is not a driver (admin shadowing)', async () => {
    setAdminSession(1);
    const result = await getDriverBag();
    expect(result).toEqual({ driverId: null, bag: [], pendingAssignments: [] });
  });

  it('returns bag + pending assignments for the calling driver', async () => {
    setDriverSession(10);
    const bagRow = makeDriverStock({ id: 1, driverId: 10, itemId: 1, quantity_on_hand: 5 });
    const pending = makeStockAssignment({ status: 'PENDING_ACK' });
    prismaMock.driverStock.findMany.mockResolvedValue([bagRow]);
    prismaMock.stockAssignment.findMany.mockResolvedValue([pending]);

    const result = await getDriverBag();
    expect(result.driverId).toBe(10);
    expect(result.bag).toEqual([bagRow]);
    expect(result.pendingAssignments).toEqual([pending]);

    // Bag query MUST filter to gt 0 (don't show empty rows).
    expect(prismaMock.driverStock.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { driverId: 10, quantity_on_hand: { gt: 0 } },
      }),
    );
    // Pending assignments only — not ack'd or disputed.
    expect(prismaMock.stockAssignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { driverId: 10, status: 'PENDING_ACK' },
      }),
    );
  });
});

describe('getDriversWithBagAndPending', () => {
  it('rejects driver callers', async () => {
    setDriverSession(10);
    await expect(getDriversWithBagAndPending()).rejects.toThrow(/FORBIDDEN/);
  });

  it('returns active drivers with their bag + assignments + recent refills', async () => {
    setAdminSession(1);
    prismaMock.driver.findMany.mockResolvedValue([{ id: 10, name: 'Ali' }] as any);
    const result = await getDriversWithBagAndPending();
    expect(result).toHaveLength(1);
    // PIN MUST be omitted from the payload.
    expect(prismaMock.driver.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
        omit: { pin: true },
        include: expect.objectContaining({
          DriverStock: expect.any(Object),
          StockAssignments: expect.any(Object),
          RefillLogs: expect.any(Object),
        }),
      }),
    );
  });
});
