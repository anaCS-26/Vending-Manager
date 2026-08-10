import '@testing-library/jest-dom';
import { vi, beforeEach } from 'vitest';
import { prismaMock, resetPrismaMock } from './tests/__helpers__/prisma-mock';
import { sessionRef, resetSession } from './tests/__helpers__/session-mock';

// ----------------------------------------------------------------------------
// Global module mocks. These run for every test in every file. Individual
// tests can still override per-call behavior by calling `vi.mocked(fn).mockX(...)`.
//
// vi.mock is hoisted to the top of this file by Vitest, but factory functions
// run lazily (on first import of the mocked module), so the closures over
// `sessionRef` / `prismaMock` resolve correctly by the time they fire.
// ----------------------------------------------------------------------------

vi.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: prismaMock,
}));

vi.mock('@/proxy', () => ({
  auth: vi.fn(async () => sessionRef.current),
}));

vi.mock('@/auth', () => ({
  auth: vi.fn(async () => sessionRef.current),
  signIn: vi.fn(async () => undefined),
}));

// next-auth pulls in next/server transitively; src/actions/auth.ts imports
// AuthError from it. Mock a minimal class so the action under test can still
// `instanceof` against it.
vi.mock('next-auth', () => {
  class AuthError extends Error {
    type: string;
    constructor(type: string = 'CredentialsSignin') {
      super(type);
      this.type = type;
    }
  }
  return { AuthError };
});

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => ({
    get: (key: string) => (key.toLowerCase() === 'x-forwarded-for' ? '127.0.0.1' : null),
  })),
  cookies: vi.fn(async () => ({ get: () => undefined, getAll: () => [] })),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@vercel/blob', () => ({
  put: vi.fn(async (filename: string) => ({ url: `mock://blob/${filename}` })),
}));

vi.mock('@/lib/rate-limit', () => ({
  loginRateLimit: { limit: vi.fn(async () => ({ success: true, remaining: 999 })) },
  pinChangeRateLimit: { limit: vi.fn(async () => ({ success: true, remaining: 999 })) },
  passwordResetRequestRateLimit: { limit: vi.fn(async () => ({ success: true, remaining: 999 })) },
  passwordResetConfirmRateLimit: { limit: vi.fn(async () => ({ success: true, remaining: 999 })) },
  pushTestRateLimit: { limit: vi.fn(async () => ({ success: true, remaining: 999 })) },
}));

// Web Push transport. Mocked globally for the same reason as @/lib/email: it
// reaches the network, and the actions that trigger it (assignToDriver,
// denyAssignment) are tested for their inventory behavior, not their delivery.
// tests/lib/push.test.ts pulls the real module in via vi.importActual.
vi.mock('@/lib/push', () => ({
  isPushConfigured: vi.fn(() => true),
  getVapidPublicKeyOrNull: vi.fn(() => 'test-vapid-public-key'),
  sendToSubscriptions: vi.fn(async () => ({ sent: 1, failed: 0, pruned: 0 })),
  sendPushToDriver: vi.fn(async () => ({ sent: 1, failed: 0, pruned: 0 })),
  sendPushToAdmins: vi.fn(async () => ({ sent: 1, failed: 0, pruned: 0 })),
}));

// Transactional email. Tests assert on the token handed to the transport —
// that is the only place the raw (unhashed) token is ever observable.
vi.mock('@/lib/email', () => ({
  isEmailConfigured: vi.fn(() => true),
  sendPasswordResetEmail: vi.fn(async () => ({ ok: true })),
  getAppOrigin: vi.fn(() => 'http://localhost:3000'),
}));

vi.mock('@/lib/notify', () => ({
  notifyClients: vi.fn(),
}));

vi.mock('@/lib/audit-utils', () => ({
  writeAuditLog: vi.fn(async () => undefined),
}));

// In-memory IndexedDB backing for the offline driver store.
const idbStore: Record<string, any> = {};
vi.mock('idb-keyval', () => ({
  get: vi.fn((key: string) => Promise.resolve(idbStore[key])),
  set: vi.fn((key: string, value: any) => {
    idbStore[key] = value;
    return Promise.resolve();
  }),
  del: vi.fn((key: string) => {
    delete idbStore[key];
    return Promise.resolve();
  }),
  clear: vi.fn(() => {
    for (const key of Object.keys(idbStore)) delete idbStore[key];
    return Promise.resolve();
  }),
}));

beforeEach(() => {
  resetPrismaMock();
  resetSession();
  for (const key of Object.keys(idbStore)) delete idbStore[key];
});
