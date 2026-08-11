import { describe, it, expect } from 'vitest';
import { calibrateWarehouseStock, correctItemCost } from '@/actions/inventory';
import { prismaMock } from '../__helpers__/prisma-mock';
import { setAdminSession, setSuperAdminSession, setDriverSession } from '../__helpers__/session-mock';

/**
 * The recount is set-based, so its stock and cost writes are raw SQL rather than
 * Prisma model calls. These pull the statement text (bind holes as `?`) and the
 * flattened bound values out of a `$executeRaw` call.
 */
const rawSql = (callIndex: number) =>
    (prismaMock.$executeRaw.mock.calls[callIndex][0] as unknown as string[]).join('?');

const rawValues = (callIndex: number) =>
    prismaMock.$executeRaw.mock.calls[callIndex]
        .slice(1)
        .flatMap((v: any) => (v && Array.isArray(v.values) ? v.values : [v]));

const stmtIndex = (fragment: string) =>
    prismaMock.$executeRaw.mock.calls.findIndex((c) =>
        (c[0] as unknown as string[]).join('?').includes(fragment),
    );

const stmtWith = (fragment: string) => {
    const i = stmtIndex(fragment);
    expect(i, `no raw statement containing ${fragment}`).toBeGreaterThanOrEqual(0);
    return i;
};

/**
 * Common happy-path wiring for a single-item warehouse recount. Returns nothing;
 * each test sets the current quantity / cost it needs.
 */
function wireRecount({ current, cost }: { current: number; cost: number }) {
    prismaMock.warehouse.findUnique.mockResolvedValue({ id: 1, name: 'Main Warehouse' });
    prismaMock.warehouseStock.findMany.mockResolvedValue([{ itemId: 7, quantity_on_hand: current }]);
    prismaMock.item.findMany.mockResolvedValue([{ id: 7, cost }]);
    prismaMock.inventoryAdjustment.createMany.mockResolvedValue({ count: 1 });
    prismaMock.systemAuditLog.create.mockResolvedValue({});
    prismaMock.$executeRaw.mockResolvedValue(1);
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
        const upsert = stmtWith('INSERT INTO "WarehouseStock"');
        expect(rawSql(upsert)).toContain('SET quantity_on_hand = EXCLUDED.quantity_on_hand');
        expect(rawValues(upsert)).toEqual([1, 7, 7]); // warehouseId, itemId, new count
        // WAC must not move on a shortage — no Item statement at all.
        expect(stmtIndex('UPDATE "Item"')).toBe(-1);
        // Ledger delta is negative.
        expect(prismaMock.inventoryAdjustment.createMany).toHaveBeenCalledWith(
            expect.objectContaining({ data: [expect.objectContaining({ quantity: -3 })] })
        );
        // Warehouse stock leaving is NOT a sale.
        expect(prismaMock.refillLog.create).not.toHaveBeenCalled();
        expect(prismaMock.refillLog.createMany).not.toHaveBeenCalled();
        expect(prismaMock.systemAuditLog.create).toHaveBeenCalled();
    });

    it('surplus without a found-cost: adds qty at current WAC (no WAC change)', async () => {
        setAdminSession(1);
        wireRecount({ current: 10, cost: 1.52 });

        const res = await calibrateWarehouseStock(1, [{ itemId: 7, physicalCount: 15 }]);

        expect(res.success).toBe(true);
        expect(rawValues(stmtWith('INSERT INTO "WarehouseStock"'))).toEqual([1, 7, 15]);
        expect(stmtIndex('UPDATE "Item"')).toBe(-1);
        expect(prismaMock.inventoryAdjustment.createMany).toHaveBeenCalledWith(
            expect.objectContaining({ data: [expect.objectContaining({ quantity: 5 })] })
        );
        expect(prismaMock.refillLog.createMany).not.toHaveBeenCalled();
        // No re-blend means the W+M+D totals were never fetched.
        expect(prismaMock.warehouseStock.groupBy).not.toHaveBeenCalled();
    });

    it('surplus with a different found-cost: re-blends WAC like a PO receipt', async () => {
        setAdminSession(1);
        wireRecount({ current: 10, cost: 1.52 });
        // Grouped sums span W + M + D (here: 10 in warehouse only).
        prismaMock.warehouseStock.groupBy.mockResolvedValue([{ itemId: 7, _sum: { quantity_on_hand: 10 } }]);
        prismaMock.machineStock.groupBy.mockResolvedValue([{ itemId: 7, _sum: { estimated_stock: 0 } }]);
        prismaMock.driverStock.groupBy.mockResolvedValue([{ itemId: 7, _sum: { quantity_on_hand: 0 } }]);

        const res = await calibrateWarehouseStock(1, [{ itemId: 7, physicalCount: 15, foundUnitCost: 2.0 }]);

        expect(res.success).toBe(true);
        // (10*1.52 + 5*2.00) / 15 = 1.68
        const [itemId, cost] = rawValues(stmtWith('UPDATE "Item"'));
        expect(itemId).toBe(7);
        expect(cost).toBeCloseTo(1.68, 5);
        // The found cost, not the old WAC, is the ledger's cost basis.
        expect(prismaMock.inventoryAdjustment.createMany).toHaveBeenCalledWith(
            expect.objectContaining({ data: [expect.objectContaining({ quantity: 5, priceAtAdjustment: 2.0 })] })
        );
    });

    it('no-op when the count already matches', async () => {
        setAdminSession(1);
        wireRecount({ current: 10, cost: 1.52 });
        const res = await calibrateWarehouseStock(1, [{ itemId: 7, physicalCount: 10 }]);
        expect(res.success).toBe(false); // "No changes to apply"
        expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
    });

    it('rejects a fractional physical count before touching the database', async () => {
        setAdminSession(1);
        wireRecount({ current: 10, cost: 1.52 });
        const res = await calibrateWarehouseStock(1, [{ itemId: 7, physicalCount: 7.5 }]);
        expect(res.success).toBe(false);
        expect((res as any).error).toMatch(/whole number/);
        expect(prismaMock.warehouse.findUnique).not.toHaveBeenCalled();
    });

    /**
     * The regression this rewrite exists for: the old loop ran 4-8 sequential
     * queries per line inside the transaction, so at the pooler's ~70-100ms per
     * round trip a full-warehouse recount blew Prisma's window and returned
     * P2028 "Transaction not found".
     */
    it('issues a constant number of statements regardless of item count', async () => {
        setAdminSession(1);
        const count = 40;
        prismaMock.warehouse.findUnique.mockResolvedValue({ id: 1, name: 'Main Warehouse' });
        prismaMock.warehouseStock.findMany.mockResolvedValue(
            Array.from({ length: count }, (_, n) => ({ itemId: n + 1, quantity_on_hand: 10 })),
        );
        prismaMock.item.findMany.mockResolvedValue(
            Array.from({ length: count }, (_, n) => ({ id: n + 1, cost: 2 })),
        );
        prismaMock.inventoryAdjustment.createMany.mockResolvedValue({ count });
        prismaMock.systemAuditLog.create.mockResolvedValue({});
        prismaMock.$executeRaw.mockResolvedValue(count);

        const res = await calibrateWarehouseStock(
            1,
            Array.from({ length: count }, (_, n) => ({ itemId: n + 1, physicalCount: 8 })),
        );
        expect(res.success).toBe(true);

        // One WarehouseStock upsert. No Item statement (shortages don't move WAC).
        expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
        expect(prismaMock.inventoryAdjustment.createMany).toHaveBeenCalledTimes(1);
        expect(prismaMock.inventoryAdjustment.create).not.toHaveBeenCalled();
        expect(prismaMock.warehouseStock.upsert).not.toHaveBeenCalled();
        expect(prismaMock.warehouseStock.aggregate).not.toHaveBeenCalled();
        expect(prismaMock.item.findUnique).not.toHaveBeenCalled();
        expect(prismaMock.$transaction).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({ timeout: 15_000 }),
        );
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
