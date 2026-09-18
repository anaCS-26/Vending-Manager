import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { actionFailure, pruneErrorEvents, ERROR_EVENT_RETENTION_DAYS } from '@/lib/action-error';
import { prismaMock } from '../__helpers__/prisma-mock';
import { setAdminSession, clearSession } from '../__helpers__/session-mock';
import { updateItem } from '@/actions/inventory';

function prismaTimeout(): Error {
  const e = new Error('Transaction API error: Transaction not found. "Item_sku_key"');
  e.name = 'PrismaClientKnownRequestError';
  (e as Error & { code: string }).code = 'P2028';
  return e;
}

let errorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  prismaMock.errorEvent.create.mockResolvedValue({ id: 1 });
});
afterEach(() => errorSpy.mockRestore());

describe('actionFailure', () => {
  it('business errors reach the user verbatim with no code, but are still recorded', async () => {
    setAdminSession(3);
    const r = await actionFailure(new Error('Insufficient stock for LAYS'), 'assignToDriver', 'Failed');
    expect(r.success).toBe(false);
    expect(r.error).toBe('Insufficient stock for LAYS');
    expect(prismaMock.errorEvent.create.mock.calls[0][0].data).toMatchObject({
      code: r.code,
      action: 'assignToDriver',
      kind: 'BUSINESS_RULE',
      expected: true,
      actorId: 3,
      actorRole: 'admin',
    });
    // Expected rejections are not console noise.
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('unexpected errors: the user sees two languages + the code; the raw text goes to the table only', async () => {
    setAdminSession(3);
    const r = await actionFailure(prismaTimeout(), 'completePurchaseOrder', 'Failed to complete purchase order');
    expect(r.error).toContain(`Ref ${r.code}`);
    expect(r.error).toMatch(/[؀-ۿ]/);
    expect(r.error).not.toContain('Item_sku_key');
    const data = prismaMock.errorEvent.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ code: r.code, kind: 'TIMEOUT', prismaCode: 'P2028', expected: false });
    expect(data.message).toContain('Item_sku_key');
    expect(data.stack).toBeTruthy();
  });

  it('can never throw into the caller — not when the table is down, not without a session', async () => {
    clearSession();
    prismaMock.errorEvent.create.mockRejectedValue(new Error('db down'));
    const r = await actionFailure(new TypeError('x'), 'anything', 'Failed');
    expect(r.success).toBe(false);
    expect(r.code).toMatch(/^E-/);
  });

  it('truncates what it stores', async () => {
    setAdminSession(1);
    await actionFailure(new Error('m'.repeat(10_000)), 'a', 'f');
    expect(prismaMock.errorEvent.create.mock.calls[0][0].data.message).toHaveLength(2000);
  });
});

describe('actions are wired to it', () => {
  it('a Prisma failure inside a real action no longer reaches the client as Prisma text', async () => {
    setAdminSession(1);
    prismaMock.item.findUnique.mockRejectedValue(prismaTimeout());
    prismaMock.item.update.mockRejectedValue(prismaTimeout());
    prismaMock.item.findFirst.mockRejectedValue(prismaTimeout());
    const r = await updateItem(1, 'LAYS', 'Chips', '001', 3, 4, 5);
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error).not.toContain('Transaction not found');
      expect(r.error).toMatch(/Ref E-/);
    }
  });
});

describe('pruneErrorEvents', () => {
  it('deletes only rows older than the retention window', async () => {
    prismaMock.errorEvent.deleteMany.mockResolvedValue({ count: 7 });
    const now = new Date('2026-09-17T00:00:00Z');
    expect(await pruneErrorEvents(now)).toBe(7);
    const cutoff = prismaMock.errorEvent.deleteMany.mock.calls[0][0].where.createdAt.lt as Date;
    expect((now.getTime() - cutoff.getTime()) / 86_400_000).toBe(ERROR_EVENT_RETENTION_DAYS);
  });
});
