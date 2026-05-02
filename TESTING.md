# Testing

Unit and component tests run on **Vitest**. Tests live under `tests/`, mirroring `src/`. There is no real database or network — Prisma, NextAuth, Upstash, Vercel Blob, and `next/cache` are all globally mocked in `vitest.setup.ts`.

## Run

```bash
npm run test                                    # watch mode
npm run test -- --run                           # one shot, all suites
npm run test:coverage                           # generate coverage report
npm run test -- tests/actions/driver-stock.test.ts   # single file
```

## Layout

```
tests/
├── __helpers__/             ← shared mocks + fixtures
│   ├── prisma-mock.ts       ← typed Prisma client mock (resets per test)
│   ├── session-mock.ts      ← setAdminSession / setDriverSession / clearSession
│   └── fixtures.ts          ← makeItem, makeDriver, makeStockAssignment, …
├── lib/                     ← Layer 1: pure utilities
│   ├── utils.test.ts
│   ├── auth-utils.test.ts   ← exercises the real guards via mocked auth()
│   ├── feature-flags.test.ts
│   └── wac-math.test.ts     ← financial primitive — divide-by-zero, precision
├── stores/                  ← Layer 4: Zustand + offline queue
│   ├── useDriverStore.test.ts   ← persist round-trip via mocked idb-keyval
│   └── offlineSync.test.ts      ← partial-failure recovery
├── actions/                 ← Layer 2: server actions (mocked Prisma)
│   ├── driver-stock.test.ts ← Phase B dispatchless flow (highest risk)
│   ├── inventory.test.ts    ← legacy dispatch + price tier lock-in
│   ├── orders.test.ts       ← PO completion + WAC recompute integration
│   ├── returns.test.ts      ← approve (RESTOCK / LOSS) + reject re-credit
│   ├── auth.test.ts         ← PIN change: rate limit, bcrypt, audit safety
│   └── history.test.ts      ← pagination math + filter shape
└── components/              ← Layer 3: driver-portal UI (jsdom + RTL)
    ├── AssignmentAckBanner.test.tsx
    ├── DriverReturnSheet.test.tsx
    ├── DriverSettingsForm.test.tsx
    └── DriverRefillUI.smoke.test.tsx   ← module-load smoke only; full UI flow → Playwright
```

## Pattern: testing a server action

```ts
import { setAdminSession, setDriverSession } from '../__helpers__/session-mock';
import { prismaMock } from '../__helpers__/prisma-mock';

it('happy path', async () => {
  setAdminSession(1);                           // ← drives requireAdmin()
  prismaMock.warehouseStock.updateMany.mockResolvedValue({ count: 1 });
  // …more arranges

  const r = await assignToDriver(10, 1, [{ itemId: 1, quantity: 5 }]);

  expect(r.success).toBe(true);
  expect(prismaMock.warehouseStock.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: expect.objectContaining({ quantity_on_hand: { gte: 5 } }) }),
  );
});
```

Auth-failures throw (because `requireAdmin()` is outside the try/catch in many actions); use `await expect(action()).rejects.toThrow(/FORBIDDEN/)` instead of checking `r.success`.

## Trade-off: mocked Prisma

We mock Prisma rather than spinning up a test DB. Speed wins; SQL/transaction-level bugs are not caught. To partially mitigate, every action test asserts the **exact `where` / `data` shape** passed to Prisma — so a query regression still fails. Add a real-DB integration layer later if reconciliation drift is observed in production.

## Intentionally NOT tested

- NextAuth internals (mocked at the boundary — see `vi.mock('@/auth')`).
- `@vercel/blob` upload internals (mocked).
- Supabase Realtime subscription (no behavior to test on the server side; the client hook is too thin to mount).
- `DriverRefillUI` full mount — too large/churning. Smoke-tested for module load; promote to Playwright for full flows.

## Adding a new test

1. Place it under `tests/<area>/<file>.test.ts(x)`.
2. If your action depends on a Prisma model not yet in `tests/__helpers__/prisma-mock.ts`, add it to `makeModelMock()` (one line).
3. Set the session via the helpers — never reach into the mock directly.
4. Assert on Prisma call args, not just `success: true`. The whole point is to catch query regressions.
