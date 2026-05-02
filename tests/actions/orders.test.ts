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
  });

  it('blends WAC across Warehouse + Machine + Driver stock and updates Item.cost', async () => {
    setAdminSession(1);
    prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({
      id: 700, status: 'PENDING', warehouseId: 1,
      Items: [{ id: 99, itemId: 1, quantityRequested: 100 }],
    } as any);
    prismaMock.purchaseOrderItem.update.mockResolvedValue({} as any);
    // 100 in warehouse, 50 in machines, 30 in driver bag → 180 total prior at $5
    prismaMock.warehouseStock.aggregate.mockResolvedValue({ _sum: { quantity_on_hand: 100 } } as any);
    prismaMock.machineStock.aggregate.mockResolvedValue({ _sum: { estimated_stock: 50 } } as any);
    prismaMock.driverStock.aggregate.mockResolvedValue({ _sum: { quantity_on_hand: 30 } } as any);
    prismaMock.item.findUnique.mockResolvedValue({ cost: 5 } as any);
    prismaMock.warehouseStock.findUnique.mockResolvedValue({ id: 1, pending_deficit: 0 } as any);
    prismaMock.warehouseStock.update.mockResolvedValue({} as any);
    prismaMock.item.update.mockResolvedValue({} as any);
    prismaMock.purchaseOrder.update.mockResolvedValue({} as any);

    // Receiving 100 @ $7. Expected WAC = (180×5 + 100×7) / 280 = 1600/280 ≈ 5.7142857...
    const r = await completePurchaseOrder(700, [
      { purchaseOrderItemId: 99, quantityReceived: 100, costPerUnit: 7,
        price_standard: 8, price_hospital: 10, price_hotel: 13 },
    ]);
    expect(r.success).toBe(true);

    expect(prismaMock.item.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: expect.objectContaining({
        cost: expect.closeTo(5.7142857, 4),
        last_purchase_cost: 7,
        price_standard: 8,
        price_hospital: 10,
        price_hotel: 13,
      }),
    });

    // Status flip
    expect(prismaMock.purchaseOrder.update).toHaveBeenCalledWith({
      where: { id: 700 },
      data: expect.objectContaining({ status: 'COMPLETED', completedAt: expect.any(Date) }),
    });
    expect(notifyClients).toHaveBeenCalledWith('purchase-order');
  });

  it('records pending_deficit when supplier shorted the order', async () => {
    setAdminSession(1);
    prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({
      id: 700, status: 'PENDING', warehouseId: 1,
      Items: [{ id: 99, itemId: 1, quantityRequested: 100 }],
    } as any);
    prismaMock.purchaseOrderItem.update.mockResolvedValue({} as any);
    prismaMock.warehouseStock.aggregate.mockResolvedValue({ _sum: { quantity_on_hand: 0 } } as any);
    prismaMock.machineStock.aggregate.mockResolvedValue({ _sum: { estimated_stock: 0 } } as any);
    prismaMock.driverStock.aggregate.mockResolvedValue({ _sum: { quantity_on_hand: 0 } } as any);
    prismaMock.item.findUnique.mockResolvedValue({ cost: 0 } as any);
    prismaMock.warehouseStock.findUnique.mockResolvedValue({ id: 1, pending_deficit: 0 } as any);
    prismaMock.warehouseStock.update.mockResolvedValue({} as any);
    prismaMock.item.update.mockResolvedValue({} as any);
    prismaMock.purchaseOrder.update.mockResolvedValue({} as any);

    // Requested 100, only 70 received → 30 pending deficit.
    await completePurchaseOrder(700, [
      { purchaseOrderItemId: 99, quantityReceived: 70, costPerUnit: 6,
        price_standard: 8, price_hospital: 10, price_hotel: 12 },
    ]);

    expect(prismaMock.warehouseStock.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: {
        quantity_on_hand: { increment: 70 },
        pending_deficit: 30,
      },
    });
  });

  it('clears pending_deficit when overage covers prior shortage', async () => {
    setAdminSession(1);
    prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({
      id: 700, status: 'PENDING', warehouseId: 1,
      Items: [{ id: 99, itemId: 1, quantityRequested: 50 }],
    } as any);
    prismaMock.purchaseOrderItem.update.mockResolvedValue({} as any);
    prismaMock.warehouseStock.aggregate.mockResolvedValue({ _sum: { quantity_on_hand: 0 } } as any);
    prismaMock.machineStock.aggregate.mockResolvedValue({ _sum: { estimated_stock: 0 } } as any);
    prismaMock.driverStock.aggregate.mockResolvedValue({ _sum: { quantity_on_hand: 0 } } as any);
    prismaMock.item.findUnique.mockResolvedValue({ cost: 5 } as any);
    // Existing deficit of 20 from a prior shortage.
    prismaMock.warehouseStock.findUnique.mockResolvedValue({ id: 1, pending_deficit: 20 } as any);
    prismaMock.warehouseStock.update.mockResolvedValue({} as any);
    prismaMock.item.update.mockResolvedValue({} as any);
    prismaMock.purchaseOrder.update.mockResolvedValue({} as any);

    // Requested 50, received 80 → deficitChange = -30. New deficit = max(0, 20 + (-30)) = 0.
    await completePurchaseOrder(700, [
      { purchaseOrderItemId: 99, quantityReceived: 80, costPerUnit: 5,
        price_standard: 7, price_hospital: 9, price_hotel: 11 },
    ]);

    expect(prismaMock.warehouseStock.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { quantity_on_hand: { increment: 80 }, pending_deficit: 0 },
    });
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
