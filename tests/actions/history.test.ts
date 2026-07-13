import { describe, it, expect } from 'vitest';
import { getRefillLogsPaginated } from '@/actions/history';
import { prismaMock } from '../__helpers__/prisma-mock';
import { setAdminSession, setDriverSession } from '../__helpers__/session-mock';

describe('getRefillLogsPaginated', () => {
  it('throws for driver callers', async () => {
    setDriverSession(10);
    await expect(getRefillLogsPaginated()).rejects.toThrow(/FORBIDDEN/);
  });

  it('returns the canonical PaginatedResult shape on empty data', async () => {
    setAdminSession(1);
    prismaMock.refillLog.findMany.mockResolvedValue([]);
    prismaMock.refillLog.count.mockResolvedValue(0);
    prismaMock.returnVerification.findMany.mockResolvedValue([]);
    prismaMock.returnVerification.count.mockResolvedValue(0);

    const result = await getRefillLogsPaginated();
    expect(result).toEqual({
      data: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
  });

  it('clamps page to >= 1', async () => {
    setAdminSession(1);
    prismaMock.refillLog.findMany.mockResolvedValue([]);
    prismaMock.refillLog.count.mockResolvedValue(0);
    prismaMock.returnVerification.findMany.mockResolvedValue([]);
    prismaMock.returnVerification.count.mockResolvedValue(0);

    const result = await getRefillLogsPaginated({ page: -5 });
    expect(result.page).toBe(1);
  });

  it('matches both denormalized driverId and legacy dispatch.driverId when driverId is given', async () => {
    setAdminSession(1);
    prismaMock.refillLog.findMany.mockResolvedValue([]);
    prismaMock.refillLog.count.mockResolvedValue(0);
    prismaMock.returnVerification.findMany.mockResolvedValue([]);
    prismaMock.returnVerification.count.mockResolvedValue(0);

    await getRefillLogsPaginated({ driverId: 10 });

    // Dispatchless refills write driverId directly (dispatchId: null); legacy
    // refills carry it via the dispatch relation. The filter ORs both.
    const refillCall = (prismaMock.refillLog.findMany as any).mock.calls[0][0];
    expect(refillCall.where.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          OR: expect.arrayContaining([
            { driverId: 10 },
            { dispatch: { driverId: 10 } },
          ]),
        }),
      ]),
    );
    // Returns carry the denormalized driverId directly.
    expect(prismaMock.returnVerification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ driverId: 10 }) }),
    );
  });

  it('extends dateTo to end-of-day (23:59:59.999)', async () => {
    setAdminSession(1);
    prismaMock.refillLog.findMany.mockResolvedValue([]);
    prismaMock.refillLog.count.mockResolvedValue(0);
    prismaMock.returnVerification.findMany.mockResolvedValue([]);
    prismaMock.returnVerification.count.mockResolvedValue(0);

    await getRefillLogsPaginated({ dateFrom: '2026-05-01', dateTo: '2026-05-02' });

    const refillCall = (prismaMock.refillLog.findMany as any).mock.calls[0][0];
    const lte = refillCall.where.refilled_at.lte as Date;
    // The action calls setHours(23, 59, 59, 999) which operates in local time.
    // Tests run in Asia/Riyadh (set in vitest.config.ts).
    expect(lte.getHours()).toBe(23);
    expect(lte.getMinutes()).toBe(59);
    expect(lte.getSeconds()).toBe(59);
    expect(lte.getMilliseconds()).toBe(999);
  });

  it('case-insensitive search across machine/item/driver names', async () => {
    setAdminSession(1);
    prismaMock.refillLog.findMany.mockResolvedValue([]);
    prismaMock.refillLog.count.mockResolvedValue(0);
    prismaMock.returnVerification.findMany.mockResolvedValue([]);
    prismaMock.returnVerification.count.mockResolvedValue(0);

    await getRefillLogsPaginated({ searchQuery: 'cola' });

    // The search OR lives inside where.AND (driverId/search clauses are AND-combined).
    const refillCall = (prismaMock.refillLog.findMany as any).mock.calls[0][0];
    const searchClause = refillCall.where.AND.find((c: any) => Array.isArray(c.OR));
    expect(searchClause.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ machine: { location_name: { contains: 'cola', mode: 'insensitive' } } }),
        expect.objectContaining({ item: { name: { contains: 'cola', mode: 'insensitive' } } }),
        expect.objectContaining({ driver: { name: { contains: 'cola', mode: 'insensitive' } } }),
        expect.objectContaining({ dispatch: { driver: { name: { contains: 'cola', mode: 'insensitive' } } } }),
      ]),
    );
  });

  it('paginates: page 2 of size 5 over 12 refill rows returns rows 5-9', async () => {
    setAdminSession(1);
    const refilledRows = Array.from({ length: 12 }, (_, i) => ({
      id: i + 1,
      driverId: 10, itemId: 1, machineId: 100,
      refilled_at: new Date(2026, 4, 12 - i),  // descending dates
      quantity_refilled: 1, items_sold_since_last_refill: 0,
      sales_revenue: 0, price_at_refill: 0, cost_at_refill: 0,
      damaged_quantity: 0, expired_quantity: 0,
    }));
    prismaMock.refillLog.findMany.mockResolvedValue(refilledRows.slice(0, 10) as any); // takeCount = 10
    prismaMock.refillLog.count.mockResolvedValue(12);
    prismaMock.returnVerification.findMany.mockResolvedValue([]);
    prismaMock.returnVerification.count.mockResolvedValue(0);

    const result = await getRefillLogsPaginated({ page: 2, pageSize: 5 });
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(5);
    expect(result.total).toBe(12);
    expect(result.totalPages).toBe(3);
    expect(result.data).toHaveLength(5);
    expect((result.data[0] as any).id).toBe(refilledRows[5].id);
  });

  it('mixes SURPLUS returns into the feed sorted by date desc', async () => {
    setAdminSession(1);
    const refill = {
      id: 1, driverId: 10, itemId: 1, machineId: 100,
      refilled_at: new Date('2026-05-01T10:00:00Z'),
      quantity_refilled: 5, items_sold_since_last_refill: 0,
      sales_revenue: 0, price_at_refill: 0, cost_at_refill: 0,
      damaged_quantity: 0, expired_quantity: 0,
    };
    const surplus = {
      id: 2, driverId: 10, itemId: 1, dispatchId: null,
      reason: 'SURPLUS', status: 'PENDING', quantity: 3,
      reported_at: new Date('2026-05-02T10:00:00Z'),
      item: { id: 1 }, driver: { id: 10 }, dispatch: null,
    };
    prismaMock.refillLog.findMany.mockResolvedValue([refill] as any);
    prismaMock.refillLog.count.mockResolvedValue(1);
    prismaMock.returnVerification.findMany.mockResolvedValue([surplus] as any);
    prismaMock.returnVerification.count.mockResolvedValue(1);

    const result = await getRefillLogsPaginated({ pageSize: 10 });
    expect(result.total).toBe(2);
    // Newer (surplus on May 2) sorts before older (refill on May 1).
    expect((result.data[0] as any).id).toBe('return_2');
    expect((result.data[1] as any).id).toBe(1);
  });
});
