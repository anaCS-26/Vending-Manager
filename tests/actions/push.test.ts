import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getPushRegistrationStatus,
  savePushSubscription,
  deletePushSubscription,
  sendTestPush,
} from '@/actions/push';
import { prismaMock } from '../__helpers__/prisma-mock';
import {
  setAdminSession,
  setDriverSession,
  setSuperAdminSession,
  clearSession,
} from '../__helpers__/session-mock';
import { writeAuditLog } from '@/lib/audit-utils';
import { isPushConfigured, sendToSubscriptions } from '@/lib/push';
import { pushTestRateLimit } from '@/lib/rate-limit';

const VALID_SUB = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
  keys: { p256dh: 'BPublicKeyBytes', auth: 'AuthSecret' },
};

// vitest.setup.ts's beforeEach resets the Prisma and session mocks but not the
// module-level ones it declares. Several assertions here are `not.toHaveBeenCalled`,
// which only means anything against a clean slate.
beforeEach(() => {
  vi.mocked(writeAuditLog).mockClear();
  vi.mocked(sendToSubscriptions).mockClear();
  vi.mocked(isPushConfigured).mockReturnValue(true);
});

/**
 * Every export in a "use server" file is a publicly routable RPC endpoint, so
 * the guard is the only authorization layer. This block is the per-action
 * assertion the project requires of any new action.
 */
describe('push actions — RBAC', () => {
  it('every action rejects an unauthenticated caller', async () => {
    clearSession();
    await expect(getPushRegistrationStatus()).rejects.toThrow(/FORBIDDEN|UNAUTHORIZED/);
    await expect(savePushSubscription(VALID_SUB)).rejects.toThrow(/FORBIDDEN|UNAUTHORIZED/);
    await expect(deletePushSubscription(VALID_SUB.endpoint)).rejects.toThrow(/FORBIDDEN|UNAUTHORIZED/);
    await expect(sendTestPush()).rejects.toThrow(/FORBIDDEN|UNAUTHORIZED/);
  });

  it('admits drivers, admins and super-admins alike (everyone manages their own devices)', async () => {
    prismaMock.pushSubscription.count.mockResolvedValue(0);

    for (const setSession of [setDriverSession, setAdminSession, setSuperAdminSession]) {
      setSession(7 as never);
      await expect(getPushRegistrationStatus()).resolves.toMatchObject({ configured: true });
    }
  });
});

describe('savePushSubscription — ownership', () => {
  it('derives the owner from the session; a driver row is never attributed to an admin', async () => {
    setDriverSession(42);
    prismaMock.pushSubscription.count.mockResolvedValue(0);
    prismaMock.pushSubscription.findUnique.mockResolvedValue(null);
    prismaMock.pushSubscription.upsert.mockResolvedValue({ id: 1 });

    const r = await savePushSubscription(VALID_SUB);
    expect(r.success).toBe(true);

    const args = prismaMock.pushSubscription.upsert.mock.calls[0][0];
    expect(args.create).toMatchObject({ driverId: 42, adminId: null });
    expect(args.where).toEqual({ endpoint: VALID_SUB.endpoint });
  });

  it('attributes an admin session to adminId', async () => {
    setAdminSession(3);
    prismaMock.pushSubscription.count.mockResolvedValue(0);
    prismaMock.pushSubscription.findUnique.mockResolvedValue(null);
    prismaMock.pushSubscription.upsert.mockResolvedValue({ id: 1 });

    await savePushSubscription(VALID_SUB);
    const args = prismaMock.pushSubscription.upsert.mock.calls[0][0];
    expect(args.create).toMatchObject({ adminId: 3, driverId: null });
  });

  it('re-registering the same endpoint upserts rather than duplicating', async () => {
    setDriverSession(42);
    prismaMock.pushSubscription.count.mockResolvedValue(1);
    prismaMock.pushSubscription.findUnique.mockResolvedValue({ id: 9 });
    prismaMock.pushSubscription.findMany.mockResolvedValue([
      { id: 9, endpoint: VALID_SUB.endpoint, p256dh: 'x', auth: 'y' },
    ]);
    prismaMock.pushSubscription.upsert.mockResolvedValue({ id: 9 });

    const r = await savePushSubscription(VALID_SUB);
    expect(r.success).toBe(true);
    expect(prismaMock.pushSubscription.create).not.toHaveBeenCalled();
  });
});

describe('savePushSubscription — input validation', () => {
  it.each([
    ['non-https endpoint', { ...VALID_SUB, endpoint: 'http://evil.test/x' }, /https/],
    ['malformed endpoint', { ...VALID_SUB, endpoint: 'not-a-url' }, /Malformed/],
    ['missing p256dh', { ...VALID_SUB, keys: { p256dh: '', auth: 'a' } }, /Incomplete/],
    ['missing auth', { ...VALID_SUB, keys: { p256dh: 'p', auth: '' } }, /Incomplete/],
  ])('rejects %s', async (_label, sub, pattern) => {
    setDriverSession(42);
    const r = await savePushSubscription(sub as never);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(pattern);
    expect(prismaMock.pushSubscription.upsert).not.toHaveBeenCalled();
  });

  it('rejects implausibly long fields before they reach the DB', async () => {
    setDriverSession(42);
    const r = await savePushSubscription({
      ...VALID_SUB,
      endpoint: `https://push.test/${'x'.repeat(2100)}`,
    });
    expect(r.success).toBe(false);
    expect(prismaMock.pushSubscription.upsert).not.toHaveBeenCalled();
  });
});

describe('savePushSubscription — device cap', () => {
  it('refuses a NEW device once the owner is at the limit', async () => {
    setDriverSession(42);
    prismaMock.pushSubscription.count.mockResolvedValue(10);
    prismaMock.pushSubscription.findMany.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => ({
        id: i,
        endpoint: `https://push.test/${i}`,
        p256dh: 'p',
        auth: 'a',
      })),
    );

    const r = await savePushSubscription(VALID_SUB);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/Device limit/);
  });

  it('still refreshes an EXISTING device at the limit (it consumes no new slot)', async () => {
    setDriverSession(42);
    prismaMock.pushSubscription.count.mockResolvedValue(10);
    prismaMock.pushSubscription.findMany.mockResolvedValue([
      { id: 1, endpoint: VALID_SUB.endpoint, p256dh: 'p', auth: 'a' },
    ]);
    prismaMock.pushSubscription.findUnique.mockResolvedValue({ id: 1 });
    prismaMock.pushSubscription.upsert.mockResolvedValue({ id: 1 });

    const r = await savePushSubscription(VALID_SUB);
    expect(r.success).toBe(true);
  });
});

describe('savePushSubscription — audit noise', () => {
  it('audits a genuinely new device', async () => {
    setDriverSession(42);
    prismaMock.pushSubscription.count.mockResolvedValue(0);
    prismaMock.pushSubscription.findUnique.mockResolvedValue(null);
    prismaMock.pushSubscription.upsert.mockResolvedValue({ id: 1 });

    await savePushSubscription(VALID_SUB);
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      'PUSH_SUBSCRIBE',
      'Driver',
      42,
      null,
      expect.anything(),
      expect.any(String),
    );
  });

  it('does NOT audit the re-sync that runs on every app mount', async () => {
    setDriverSession(42);
    prismaMock.pushSubscription.count.mockResolvedValue(1);
    prismaMock.pushSubscription.findUnique.mockResolvedValue({ id: 9 });
    prismaMock.pushSubscription.upsert.mockResolvedValue({ id: 9 });

    await savePushSubscription(VALID_SUB);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });
});

describe('deletePushSubscription', () => {
  it('scopes the delete to the caller, so one driver cannot unregister another', async () => {
    setDriverSession(42);
    prismaMock.pushSubscription.deleteMany.mockResolvedValue({ count: 1 });
    prismaMock.pushSubscription.count.mockResolvedValue(0);

    await deletePushSubscription(VALID_SUB.endpoint);

    expect(prismaMock.pushSubscription.deleteMany).toHaveBeenCalledWith({
      where: { endpoint: VALID_SUB.endpoint, driverId: 42 },
    });
  });

  it('stays silent in the audit log when nothing was actually removed', async () => {
    setDriverSession(42);
    prismaMock.pushSubscription.deleteMany.mockResolvedValue({ count: 0 });
    prismaMock.pushSubscription.count.mockResolvedValue(0);

    const r = await deletePushSubscription(VALID_SUB.endpoint);
    expect(r.success).toBe(true);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });
});

describe('sendTestPush', () => {
  it('is rate limited per user', async () => {
    setDriverSession(42);
    vi.mocked(pushTestRateLimit.limit).mockResolvedValueOnce({ success: false } as never);

    const r = await sendTestPush();
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/Too many/);
    expect(sendToSubscriptions).not.toHaveBeenCalled();
  });

  it('explains the missing-server-config case rather than silently doing nothing', async () => {
    setDriverSession(42);
    vi.mocked(isPushConfigured).mockReturnValueOnce(false);

    const r = await sendTestPush();
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/not configured/);
  });

  it('reports "no devices" distinctly from a delivery failure', async () => {
    setDriverSession(42);
    prismaMock.pushSubscription.findMany.mockResolvedValue([]);

    const r = await sendTestPush();
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/No devices registered/);
  });

  it('fails when the push service rejected every device', async () => {
    setDriverSession(42);
    prismaMock.pushSubscription.findMany.mockResolvedValue([
      { id: 1, endpoint: VALID_SUB.endpoint, p256dh: 'p', auth: 'a' },
    ]);
    vi.mocked(sendToSubscriptions).mockResolvedValueOnce({ sent: 0, failed: 1, pruned: 1 });

    const r = await sendTestPush();
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/rejected every device/);
  });

  it('succeeds and reports the device count on delivery', async () => {
    setDriverSession(42);
    prismaMock.pushSubscription.findMany.mockResolvedValue([
      { id: 1, endpoint: VALID_SUB.endpoint, p256dh: 'p', auth: 'a' },
    ]);
    vi.mocked(sendToSubscriptions).mockResolvedValueOnce({ sent: 1, failed: 0, pruned: 0 });

    const r = await sendTestPush();
    expect(r).toEqual({ success: true, data: { sent: 1 } });
  });
});
