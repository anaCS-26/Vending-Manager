import { describe, it, expect } from 'vitest';
import { calibrateWarehouseStock, correctItemCost } from '@/actions/inventory';
import { prismaMock } from '../__helpers__/prisma-mock';
import { setAdminSession, setSuperAdminSession, setDriverSession } from '../__helpers__/session-mock';

/**
 * Common happy-path wiring for a single-item warehouse recount. Returns nothing;
 * each test sets the current quantity / cost it needs.
 */
function wireRecount({ current, cost }: { current: number; cost: number }) {
    prismaMock.warehouse.findUnique.mockResolvedValue({ id: 1, name: 'Main Warehouse' });
    prismaMock.warehouseStock.findUnique.mockResolvedValue({ id: 99, warehouseId: 1, itemId: 7, quantity_on_hand: current });
    prismaMock.item.findUnique.mockResolvedValue({ id: 7, name: 'PEPSI CAN', cost });
    prismaMock.warehouseStock.upsert.mockResolvedValue({});
    prismaMock.item.update.mockResolvedValue({});
    prismaMock.inventoryAdjustment.create.mockResolvedValue({});
    prismaMock.systemAuditLog.create.mockResolvedValue({});
}

describe('calibrateWarehouseStock', () => {
    it('rejects non-admin callers', async () => {
        setDriverSession(10);
        await expect(calibrateWarehouseStock(1, [{ itemId: 7, physicalCount: 5 }]))
            .rejects.toThrow(/FORBIDDEN/);
    });

    it('shortage (physical < system): corrects qty, leaves WAC untouched, books no sale', async () => {
        setAdminSession(1);
        wireRecount({ current: 10, cost: 1.52 });

        const res = await calibrateWarehouseStock(1, [{ itemId: 7, physicalCount: 7 }]);

        expect(res.success).toBe(true);
        // Absolute set to the physical count.
        expect(prismaMock.warehouseStock.upsert).toHaveBeenCalledWith(
            expect.objectContaining({ update: { quantity_on_hand: 7 } })
        );
        // WAC must not move on a shortage.
        expect(prismaMock.item.update).not.toHaveBeenCalled();
        // Ledger delta is negative.
        expect(prismaMock.inventoryAdjustment.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ quantity: -3 }) })
        );
        // Warehouse stock leaving is NOT a sale.
        expect(prismaMock.refillLog.create).not.toHaveBeenCalled();
        expect(prismaMock.systemAuditLog.create).toHaveBeenCalled();
    });

    it('surplus without a found-cost: adds qty at current WAC (no WAC change)', async () => {
        setAdminSession(1);
        wireRecount({ current: 10, cost: 1.52 });

        const res = await calibrateWarehouseStock(1, [{ itemId: 7, physicalCount: 15 }]);

        expect(res.success).toBe(true);
        expect(prismaMock.warehouseStock.upsert).toHaveBeenCalledWith(
            expect.objectContaining({ update: { quantity_on_hand: 15 } })
        );
        expect(prismaMock.item.update).not.toHaveBeenCalled();
        expect(prismaMock.inventoryAdjustment.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ quantity: 5 }) })
        );
        expect(prismaMock.refillLog.create).not.toHaveBeenCalled();
    });

    it('surplus with a different found-cost: re-blends WAC like a PO receipt', async () => {
        setAdminSession(1);
        wireRecount({ current: 10, cost: 1.52 });
        // Aggregates sum stock across W + M + D (here: 10 in warehouse only).
        prismaMock.warehouseStock.aggregate.mockResolvedValue({ _sum: { quantity_on_hand: 10 } });
        prismaMock.machineStock.aggregate.mockResolvedValue({ _sum: { estimated_stock: 0 } });
        prismaMock.driverStock.aggregate.mockResolvedValue({ _sum: { quantity_on_hand: 0 } });

        const res = await calibrateWarehouseStock(1, [{ itemId: 7, physicalCount: 15, foundUnitCost: 2.0 }]);

        expect(res.success).toBe(true);
        // (10*1.52 + 5*2.00) / 15 = 1.68
        expect(prismaMock.item.update).toHaveBeenCalledTimes(1);
        const cost = prismaMock.item.update.mock.calls[0][0].data.cost;
        expect(cost).toBeCloseTo(1.68, 5);
    });

    it('no-op when the count already matches', async () => {
        setAdminSession(1);
        wireRecount({ current: 10, cost: 1.52 });
        const res = await calibrateWarehouseStock(1, [{ itemId: 7, physicalCount: 10 }]);
        expect(res.success).toBe(false); // "No changes to apply"
        expect(prismaMock.warehouseStock.upsert).not.toHaveBeenCalled();
    });
});

describe('correctItemCost', () => {
    it('requires super admin (plain admin is rejected)', async () => {
        setAdminSession(1);
        await expect(correctItemCost(7, 0.78, 'fix case price')).rejects.toThrow(/Super Admin/i);
    });

    it('SETS the cost exactly and never rewrites refill history', async () => {
        setSuperAdminSession(1);
        prismaMock.item.findUnique.mockResolvedValue({ id: 7, name: 'AQUAFINA WATER', cost: 31 });
        prismaMock.item.update.mockResolvedValue({});
        prismaMock.systemAuditLog.create.mockResolvedValue({});

        const res = await correctItemCost(7, 0.78, 'case price 31 entered per-unit');

        expect(res.success).toBe(true);
        expect(prismaMock.item.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { cost: 0.78 } });
        expect(prismaMock.refillLog.update).not.toHaveBeenCalled();
        expect(prismaMock.refillLog.updateMany).not.toHaveBeenCalled();
        expect(prismaMock.systemAuditLog.create).toHaveBeenCalled();
    });

    it('rejects an empty reason note', async () => {
        setSuperAdminSession(1);
        prismaMock.item.findUnique.mockResolvedValue({ id: 7, name: 'X', cost: 5 });
        const res = await correctItemCost(7, 1, '   ');
        expect(res.success).toBe(false);
    });

    it('rejects a no-op cost', async () => {
        setSuperAdminSession(1);
        prismaMock.item.findUnique.mockResolvedValue({ id: 7, name: 'X', cost: 5 });
        const res = await correctItemCost(7, 5, 'same');
        expect(res.success).toBe(false);
    });
});
