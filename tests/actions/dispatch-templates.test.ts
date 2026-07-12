import { describe, it, expect } from 'vitest';
import {
  getDispatchTemplates,
  createDispatchTemplate,
  updateDispatchTemplate,
  deleteDispatchTemplate,
} from '@/actions/dispatch-templates';
import { prismaMock } from '../__helpers__/prisma-mock';
import {
  setAdminSession,
  setDriverSession,
  clearSession,
} from '../__helpers__/session-mock';
import { makeItem, makeDispatchTemplate } from '../__helpers__/fixtures';
import { writeAuditLog } from '@/lib/audit-utils';
import { notifyClients } from '@/lib/notify';

// All side-effect modules are mocked in vitest.setup.ts. requireAdmin() runs
// OUTSIDE each action's try/catch, so auth failures throw rather than
// returning a result object.

describe('getDispatchTemplates', () => {
  it('throws FORBIDDEN for driver callers (admin-only)', async () => {
    setDriverSession(10);
    await expect(getDispatchTemplates()).rejects.toThrow(/FORBIDDEN/);
  });

  it('fetches templates with item lines ordered by name', async () => {
    setAdminSession(1);
    prismaMock.dispatchTemplate.findMany.mockResolvedValue([makeDispatchTemplate()]);

    const result = await getDispatchTemplates();

    expect(result).toHaveLength(1);
    expect(prismaMock.dispatchTemplate.findMany).toHaveBeenCalledWith({
      include: { Items: { include: { item: true } } },
      orderBy: { name: 'asc' },
    });
  });
});

describe('createDispatchTemplate', () => {
  it('throws when no session', async () => {
    clearSession();
    await expect(createDispatchTemplate('A', [{ itemId: 1, quantity: 5 }])).rejects.toThrow(/UNAUTHORIZED/);
  });

  it('throws FORBIDDEN for driver callers', async () => {
    setDriverSession(10);
    await expect(createDispatchTemplate('A', [{ itemId: 1, quantity: 5 }])).rejects.toThrow(/FORBIDDEN/);
  });

  it('rejects an empty or whitespace-only name', async () => {
    setAdminSession(1);
    const r = await createDispatchTemplate('   ', [{ itemId: 1, quantity: 5 }]);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/name is required/i);
  });

  it('rejects empty item lists and all-zero quantities', async () => {
    setAdminSession(1);
    const empty = await createDispatchTemplate('Route A', []);
    expect(empty.success).toBe(false);

    const allZero = await createDispatchTemplate('Route A', [{ itemId: 1, quantity: 0 }]);
    expect(allZero.success).toBe(false);
    expect((allZero as any).error).toMatch(/at least one quantity/);
  });

  it('rejects negative and fractional quantities', async () => {
    setAdminSession(1);
    const negative = await createDispatchTemplate('Route A', [{ itemId: 1, quantity: -3 }]);
    expect(negative.success).toBe(false);

    const fractional = await createDispatchTemplate('Route A', [{ itemId: 1, quantity: 1.5 }]);
    expect(fractional.success).toBe(false);
  });

  it('rejects unknown item IDs', async () => {
    setAdminSession(1);
    prismaMock.item.findMany.mockResolvedValue([]);
    const r = await createDispatchTemplate('Route A', [{ itemId: 999, quantity: 5 }]);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/invalid/);
  });

  it('trims the name and merges duplicate itemIds by summing', async () => {
    setAdminSession(1);
    prismaMock.item.findMany.mockResolvedValue([makeItem({ id: 1 })]);
    prismaMock.dispatchTemplate.create.mockResolvedValue(
      makeDispatchTemplate({ name: 'Route A', Items: [{ id: 1, templateId: 700, itemId: 1, quantity: 8, item: makeItem() }] })
    );

    const r = await createDispatchTemplate('  Route A  ', [
      { itemId: 1, quantity: 5 },
      { itemId: 1, quantity: 3 },
    ]);

    expect(r.success).toBe(true);
    expect(prismaMock.dispatchTemplate.create).toHaveBeenCalledWith({
      data: { name: 'Route A', Items: { create: [{ itemId: 1, quantity: 8 }] } },
      include: { Items: { include: { item: true } } },
    });
  });

  it('writes an audit row and notifies clients on success', async () => {
    setAdminSession(1);
    prismaMock.item.findMany.mockResolvedValue([makeItem({ id: 1 })]);
    prismaMock.dispatchTemplate.create.mockResolvedValue(makeDispatchTemplate());

    const r = await createDispatchTemplate('Morning Route A', [{ itemId: 1, quantity: 30 }]);

    expect(r.success).toBe(true);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      'CREATE_DISPATCH_TEMPLATE',
      'DispatchTemplate',
      700,
      null,
      { name: 'Morning Route A', items: [{ itemId: 1, quantity: 30 }] }
    );
    expect(notifyClients).toHaveBeenCalledWith('dispatch-template');
  });
});

describe('updateDispatchTemplate', () => {
  it('throws FORBIDDEN for driver callers', async () => {
    setDriverSession(10);
    await expect(updateDispatchTemplate(700, 'A', [{ itemId: 1, quantity: 5 }])).rejects.toThrow(/FORBIDDEN/);
  });

  it('returns an error when the template does not exist', async () => {
    setAdminSession(1);
    prismaMock.dispatchTemplate.findUnique.mockResolvedValue(null);
    const r = await updateDispatchTemplate(999, 'A', [{ itemId: 1, quantity: 5 }]);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/not found/i);
  });

  it('replaces item lines wholesale inside a transaction and audits old state', async () => {
    setAdminSession(1);
    const oldTemplate = makeDispatchTemplate({
      name: 'Old Name',
      Items: [{ id: 1, templateId: 700, itemId: 1, quantity: 30 }],
    });
    prismaMock.dispatchTemplate.findUnique.mockResolvedValue(oldTemplate);
    prismaMock.item.findMany.mockResolvedValue([makeItem({ id: 2 })]);
    prismaMock.dispatchTemplate.update.mockResolvedValue(
      makeDispatchTemplate({ name: 'New Name', Items: [{ id: 2, templateId: 700, itemId: 2, quantity: 12, item: makeItem({ id: 2 }) }] })
    );

    const r = await updateDispatchTemplate(700, 'New Name', [{ itemId: 2, quantity: 12 }]);

    expect(r.success).toBe(true);
    expect(prismaMock.$transaction).toHaveBeenCalled();
    expect(prismaMock.dispatchTemplateItem.deleteMany).toHaveBeenCalledWith({ where: { templateId: 700 } });
    expect(prismaMock.dispatchTemplate.update).toHaveBeenCalledWith({
      where: { id: 700 },
      data: { name: 'New Name', Items: { create: [{ itemId: 2, quantity: 12 }] } },
      include: { Items: { include: { item: true } } },
    });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      'UPDATE_DISPATCH_TEMPLATE',
      'DispatchTemplate',
      700,
      { name: 'Old Name', items: [{ itemId: 1, quantity: 30 }] },
      { name: 'New Name', items: [{ itemId: 2, quantity: 12 }] }
    );
    expect(notifyClients).toHaveBeenCalledWith('dispatch-template');
  });
});

describe('deleteDispatchTemplate', () => {
  it('throws FORBIDDEN for driver callers', async () => {
    setDriverSession(10);
    await expect(deleteDispatchTemplate(700)).rejects.toThrow(/FORBIDDEN/);
  });

  it('returns an error when the template does not exist', async () => {
    setAdminSession(1);
    prismaMock.dispatchTemplate.findUnique.mockResolvedValue(null);
    const r = await deleteDispatchTemplate(999);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/not found/i);
  });

  it('hard-deletes and audits the removed state', async () => {
    setAdminSession(1);
    prismaMock.dispatchTemplate.findUnique.mockResolvedValue(
      makeDispatchTemplate({ Items: [{ id: 1, templateId: 700, itemId: 1, quantity: 30 }] })
    );
    prismaMock.dispatchTemplate.delete.mockResolvedValue({});

    const r = await deleteDispatchTemplate(700);

    expect(r.success).toBe(true);
    expect(prismaMock.dispatchTemplate.delete).toHaveBeenCalledWith({ where: { id: 700 } });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      'DELETE_DISPATCH_TEMPLATE',
      'DispatchTemplate',
      700,
      { name: 'Morning Route A', items: [{ itemId: 1, quantity: 30 }] },
      null
    );
    expect(notifyClients).toHaveBeenCalledWith('dispatch-template');
  });
});
