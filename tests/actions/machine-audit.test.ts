import { describe, it, expect } from 'vitest';
import { reconcileMachineAudit, editDriverBagStock, editDispatchReturn } from '@/actions/inventory';
import { prismaMock } from '../__helpers__/prisma-mock';
import { setAdminSession, setDriverSession } from '../__helpers__/session-mock';

/**
 * The three remaining admin correction tools that used to run a per-item loop
 * inside their transaction. Each one now batches its reference reads before the
 * transaction and writes constant set-based statements, for the same reason
 * completePurchaseOrder does: through the Supavisor pooler a sequential query
 * per line exhausts Prisma's interactive-transaction window and surfaces as
 * P2028 "Transaction not found" (see tests/actions/orders.test.ts).
 *
 * reconcileMachineAudit also carries the domain rule that separates it from the
 * warehouse recount: a machine shortage IS a sale, so it books revenue + COGS.
 */

const rawSql = (i: number) =>
    (prismaMock.$executeRaw.mock.calls[i][0] as unknown as string[]).join('?');

const rawValues = (i: number) =>
    prismaMock.$executeRaw.mock.calls[i]
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

describe('reconcileMachineAudit', () => {
    const wireAudit = (opts: {
        stock: Array<{ itemId: number; estimated_stock: number }>;
        tier?: string;
        items?: Array<{ id: number; price_standard: number; price_hospital: number; price_hotel: number; cost: number }>;
    }) => {
        prismaMock.machineStock.findMany.mockResolvedValue(
            opts.stock.map((s) => ({ ...s, machineId: 5, item: { id: s.itemId, name: `Item ${s.itemId}` } })) as any,
        );
        prismaMock.machine.findUnique.mockResolvedValue({ id: 5, name: 'Lobby 1', tier: opts.tier ?? 'STANDARD' } as any);
        prismaMock.item.findMany.mockResolvedValue(
            (opts.items ?? opts.stock.map((s) => ({
                id: s.itemId, price_standard: 4, price_hospital: 6, price_hotel: 8, cost: 1.5,
            }))) as any,
        );
        prismaMock.refillLog.createMany.mockResolvedValue({ count: 1 } as any);
        prismaMock.systemAuditLog.create.mockResolvedValue({} as any);
        prismaMock.$executeRaw.mockResolvedValue(1 as any);
    };

    it('rejects non-admin callers', async () => {
        setDriverSession(10);
        await expect(reconcileMachineAudit(5, [{ itemId: 1, physicalCount: 3 }]))
            .rejects.toThrow(/FORBIDDEN/);
    });

    it('shortage IS a sale: books a dispatch-less RefillLog with revenue and COGS', async () => {
        setAdminSession(1);
        wireAudit({ stock: [{ itemId: 1, estimated_stock: 10 }] });

        const res = await reconcileMachineAudit(5, [{ itemId: 1, physicalCount: 4 }]);
        expect(res.success).toBe(true);

        // 10 expected - 4 found = 6 vended.
        expect(prismaMock.refillLog.createMany).toHaveBeenCalledWith({
            data: [expect.objectContaining({
                dispatchId: null,
                machineId: 5,
                itemId: 1,
                quantity_refilled: 0,
                items_sold_since_last_refill: 6,
                price_at_refill: 4,
                cost_at_refill: 1.5,
            })],
        });

        const upsert = stmtWith('INSERT INTO "MachineStock"');
        expect(rawSql(upsert)).toContain('SET estimated_stock = EXCLUDED.estimated_stock');
        expect(rawValues(upsert)).toEqual([5, 1, 4]); // machineId, itemId, physical count
        expect(prismaMock.systemAuditLog.create).toHaveBeenCalled();
    });

    it('uses the machine tier price when booking the shortage', async () => {
        setAdminSession(1);
        wireAudit({ stock: [{ itemId: 1, estimated_stock: 10 }], tier: 'HOSPITAL' });

        await reconcileMachineAudit(5, [{ itemId: 1, physicalCount: 8 }]);

        expect(prismaMock.refillLog.createMany).toHaveBeenCalledWith({
            data: [expect.objectContaining({ items_sold_since_last_refill: 2, price_at_refill: 6 })],
        });
    });

    it('surplus corrects the count without booking a sale', async () => {
        setAdminSession(1);
        wireAudit({ stock: [{ itemId: 1, estimated_stock: 3 }] });

        const res = await reconcileMachineAudit(5, [{ itemId: 1, physicalCount: 9 }]);
        expect(res.success).toBe(true);

        expect(prismaMock.refillLog.createMany).not.toHaveBeenCalled();
        expect(rawValues(stmtWith('INSERT INTO "MachineStock"'))).toEqual([5, 1, 9]);
    });

    it('writes nothing when every slot already matches', async () => {
        setAdminSession(1);
        wireAudit({ stock: [{ itemId: 1, estimated_stock: 7 }] });

        const res = await reconcileMachineAudit(5, [{ itemId: 1, physicalCount: 7 }]);
        expect(res.success).toBe(true);
        expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
        expect(prismaMock.systemAuditLog.create).not.toHaveBeenCalled();
    });

    it('rejects a fractional physical count before touching the database', async () => {
        setAdminSession(1);
        wireAudit({ stock: [{ itemId: 1, estimated_stock: 7 }] });

        const res = await reconcileMachineAudit(5, [{ itemId: 1, physicalCount: 2.5 }]);
        expect(res.success).toBe(false);
        expect((res as any).error).toMatch(/whole number/);
        expect(prismaMock.machineStock.findMany).not.toHaveBeenCalled();
    });

    it('issues a constant number of statements regardless of slot count', async () => {
        setAdminSession(1);
        const n = 40;
        wireAudit({ stock: Array.from({ length: n }, (_, i) => ({ itemId: i + 1, estimated_stock: 10 })) });

        const res = await reconcileMachineAudit(5,
            Array.from({ length: n }, (_, i) => ({ itemId: i + 1, physicalCount: 2 })));
        expect(res.success).toBe(true);

        // One MachineStock upsert + one batched RefillLog insert. Never 40 of either.
        expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
        expect(prismaMock.refillLog.createMany).toHaveBeenCalledTimes(1);
        expect(prismaMock.refillLog.createMany.mock.calls[0][0].data).toHaveLength(n);
        expect(prismaMock.refillLog.create).not.toHaveBeenCalled();
        expect(prismaMock.machineStock.upsert).not.toHaveBeenCalled();
        expect(prismaMock.item.findUnique).not.toHaveBeenCalled();
        expect(prismaMock.$transaction).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({ timeout: 15_000 }),
        );
    });
});

describe('editDriverBagStock', () => {
    const wireBag = (rows: Array<{ itemId: number; quantity_on_hand: number }>) => {
        prismaMock.driverStock.findMany.mockResolvedValue(rows as any);
        prismaMock.item.findMany.mockResolvedValue(
            rows.map((r) => ({ id: r.itemId, price_standard: 5 })) as any,
        );
        prismaMock.driver.findUnique.mockResolvedValue({ name: 'Ahmed' } as any);
        prismaMock.inventoryAdjustment.createMany.mockResolvedValue({ count: rows.length } as any);
        prismaMock.$executeRaw.mockResolvedValue(1 as any);
    };

    it('rejects non-admin callers', async () => {
        setDriverSession(10);
        await expect(editDriverBagStock(10, [{ itemId: 1, new_quantity: 2 }]))
            .rejects.toThrow(/FORBIDDEN/);
    });

    it('sets the absolute quantity and logs the delta against the driver', async () => {
        setAdminSession(1);
        wireBag([{ itemId: 1, quantity_on_hand: 9 }]);

        const res = await editDriverBagStock(10, [{ itemId: 1, new_quantity: 4 }]);
        expect(res.success).toBe(true);

        const upd = stmtWith('UPDATE "DriverStock"');
        expect(rawSql(upd)).toContain('SET quantity_on_hand = v.qty');
        expect(rawValues(upd)).toEqual([1, 4, 10]); // (itemId, newQty) then driverId

        expect(prismaMock.inventoryAdjustment.createMany).toHaveBeenCalledWith({
            data: [expect.objectContaining({
                itemId: 1, quantity: -5, locationName: 'Driver: Ahmed', priceAtAdjustment: 5,
            })],
        });
    });

    it('refuses to invent stock for an item the driver never received', async () => {
        setAdminSession(1);
        wireBag([]);

        const res = await editDriverBagStock(10, [{ itemId: 1, new_quantity: 3 }]);
        expect(res.success).toBe(false);
        expect((res as any).error).toMatch(/nonexistent driver stock/);
        expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
    });

    it('issues a constant number of statements regardless of edit count', async () => {
        setAdminSession(1);
        const n = 30;
        wireBag(Array.from({ length: n }, (_, i) => ({ itemId: i + 1, quantity_on_hand: 9 })));

        const res = await editDriverBagStock(10,
            Array.from({ length: n }, (_, i) => ({ itemId: i + 1, new_quantity: 4 })));
        expect(res.success).toBe(true);

        expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
        expect(prismaMock.inventoryAdjustment.createMany).toHaveBeenCalledTimes(1);
        expect(prismaMock.inventoryAdjustment.create).not.toHaveBeenCalled();
        expect(prismaMock.driverStock.findUnique).not.toHaveBeenCalled();
        // The driver row is read once for the ledger label, not once per edit.
        expect(prismaMock.driver.findUnique).toHaveBeenCalledTimes(1);
    });
});

describe('editDispatchReturn', () => {
    const wireDispatch = (items: Array<{ id: number; itemId: number; quantity_given: number; quantity_returned: number }>) => {
        prismaMock.dispatch.findUnique.mockResolvedValue({
            id: 77, driverId: 10, warehouseId: 1, DispatchItems: items,
        } as any);
        prismaMock.refillLog.groupBy.mockResolvedValue([] as any);
        prismaMock.$executeRaw.mockResolvedValue(1 as any);
    };

    it('rejects non-admin callers', async () => {
        setDriverSession(10);
        await expect(editDispatchReturn(77, [{ dispatchItemId: 1, new_quantity_returned: 2 }]))
            .rejects.toThrow(/FORBIDDEN/);
    });

    it('moves the delta back to the warehouse and out of the driver bag', async () => {
        setAdminSession(1);
        wireDispatch([{ id: 1, itemId: 4, quantity_given: 20, quantity_returned: 5 }]);

        const res = await editDispatchReturn(77, [{ dispatchItemId: 1, new_quantity_returned: 8 }]);
        expect(res.success).toBe(true);

        expect(rawValues(stmtWith('UPDATE "DispatchItem"'))).toEqual([1, 8]);
        // Returned 3 more than recorded → warehouse gains 3.
        expect(rawValues(stmtWith('UPDATE "WarehouseStock"'))).toEqual([4, 3, 1]);
        // …and the bag, which was credited too much, loses the same 3.
        const bag = stmtWith('UPDATE "DriverStock"');
        expect(rawSql(bag)).toContain('quantity_on_hand - v.delta');
        expect(rawValues(bag)).toEqual([4, 3, 10]);
    });

    it('refuses an edit that exceeds what is left on the dispatch', async () => {
        setAdminSession(1);
        wireDispatch([{ id: 1, itemId: 4, quantity_given: 20, quantity_returned: 5 }]);
        // 18 of the 20 were already consumed on the route.
        prismaMock.refillLog.groupBy.mockResolvedValue([
            { itemId: 4, _sum: { quantity_refilled: 18, expired_quantity: 0, damaged_quantity: 0 } },
        ] as any);

        const res = await editDispatchReturn(77, [{ dispatchItemId: 1, new_quantity_returned: 6 }]);
        expect(res.success).toBe(false);
        expect((res as any).error).toMatch(/exceeds remaining dispatch stock/);
        expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
    });

    it('leaves both stock ledgers alone when the dispatch has no warehouse', async () => {
        setAdminSession(1);
        wireDispatch([{ id: 1, itemId: 4, quantity_given: 20, quantity_returned: 5 }]);
        prismaMock.dispatch.findUnique.mockResolvedValue({
            id: 77, driverId: 10, warehouseId: null, DispatchItems: [
                { id: 1, itemId: 4, quantity_given: 20, quantity_returned: 5 },
            ],
        } as any);

        const res = await editDispatchReturn(77, [{ dispatchItemId: 1, new_quantity_returned: 8 }]);
        expect(res.success).toBe(true);

        // The recorded return is still corrected...
        expect(rawValues(stmtWith('UPDATE "DispatchItem"'))).toEqual([1, 8]);
        // ...but neither stock side moves. Preserved from the original loop,
        // whose `continue` on a null warehouseId skipped the bag update too.
        expect(stmtIndex('UPDATE "WarehouseStock"')).toBe(-1);
        expect(stmtIndex('UPDATE "DriverStock"')).toBe(-1);
    });

    it('rejects a line belonging to a different dispatch', async () => {
        setAdminSession(1);
        wireDispatch([{ id: 1, itemId: 4, quantity_given: 20, quantity_returned: 5 }]);

        const res = await editDispatchReturn(77, [{ dispatchItemId: 999, new_quantity_returned: 1 }]);
        expect(res.success).toBe(false);
        expect((res as any).error).toMatch(/not found on dispatch/);
    });

    it('issues a constant number of statements regardless of edit count', async () => {
        setAdminSession(1);
        const n = 25;
        wireDispatch(Array.from({ length: n }, (_, i) => ({
            id: i + 1, itemId: i + 1, quantity_given: 20, quantity_returned: 5,
        })));

        const res = await editDispatchReturn(77,
            Array.from({ length: n }, (_, i) => ({ dispatchItemId: i + 1, new_quantity_returned: 8 })));
        expect(res.success).toBe(true);

        // DispatchItem, WarehouseStock, DriverStock — three, not 3 per line.
        expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(3);
        expect(prismaMock.refillLog.groupBy).toHaveBeenCalledTimes(1);
        expect(prismaMock.refillLog.aggregate).not.toHaveBeenCalled();
        expect(prismaMock.dispatchItem.findUnique).not.toHaveBeenCalled();
        expect(prismaMock.$transaction).toHaveBeenCalledWith(
            expect.any(Function),
            expect.objectContaining({ timeout: 15_000 }),
        );
    });
});
