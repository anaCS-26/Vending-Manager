import { vi } from 'vitest';

/**
 * Shared Prisma client mock. Exposes every Prisma method that the actions in
 * src/actions/* actually call. New methods can be appended as tests need them.
 *
 * `$transaction` runs the callback with the same mock as `tx`, so transactional
 * code paths are exercised without a real DB. Tests that need to fail mid-tx
 * can throw inside a per-call mock implementation.
 */
function makeModelMock() {
  return {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    aggregate: vi.fn(),
  };
}

export const prismaMock = {
  driver: makeModelMock(),
  driverStock: makeModelMock(),
  item: makeModelMock(),
  warehouse: makeModelMock(),
  warehouseStock: makeModelMock(),
  machine: makeModelMock(),
  machineStock: makeModelMock(),
  dispatch: makeModelMock(),
  dispatchItem: makeModelMock(),
  refillLog: makeModelMock(),
  returnVerification: makeModelMock(),
  stockAssignment: makeModelMock(),
  inventoryAdjustment: makeModelMock(),
  purchaseOrder: makeModelMock(),
  purchaseOrderItem: makeModelMock(),
  purchaseInvoice: makeModelMock(),
  purchaseInvoiceItem: makeModelMock(),
  supplier: makeModelMock(),
  systemMeta: makeModelMock(),
  systemAuditLog: makeModelMock(),
  // The transactional callback receives the same mock as `tx`. Real Prisma
  // would isolate writes; tests that want to assert per-tx behavior can
  // override this implementation per-test.
  $transaction: vi.fn(async (fn: any, _opts?: any) => {
    if (typeof fn === 'function') return fn(prismaMock);
    if (Array.isArray(fn)) return Promise.all(fn);
    return fn;
  }),
};

/** Resets every model method between tests but preserves the shape. */
export function resetPrismaMock() {
  for (const key of Object.keys(prismaMock)) {
    const value = (prismaMock as any)[key];
    if (key === '$transaction') {
      value.mockReset();
      value.mockImplementation(async (fn: any, _opts?: any) => {
        if (typeof fn === 'function') return fn(prismaMock);
        if (Array.isArray(fn)) return Promise.all(fn);
        return fn;
      });
      continue;
    }
    if (value && typeof value === 'object') {
      for (const method of Object.keys(value)) {
        const m = value[method];
        if (typeof m?.mockReset === 'function') m.mockReset();
      }
    }
  }
}
