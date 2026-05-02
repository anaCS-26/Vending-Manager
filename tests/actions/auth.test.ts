import { describe, it, expect, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import { changeDriverPin, authenticate } from '@/actions/auth';
import { prismaMock } from '../__helpers__/prisma-mock';
import { setAdminSession, setDriverSession, clearSession } from '../__helpers__/session-mock';
import { pinChangeRateLimit } from '@/lib/rate-limit';
import { writeAuditLog } from '@/lib/audit-utils';

/**
 * PIN-change tests use real bcrypt — the hash isn't mocked because the cost
 * factor (10) finishes in a few hundred ms per call, well within Vitest budgets.
 */

describe('changeDriverPin', () => {
  const REAL_OLD = '1234';
  const REAL_NEW = '5678';

  async function setupExistingDriver(driverId = 10) {
    const hash = await bcrypt.hash(REAL_OLD, 10);
    prismaMock.driver.findUnique.mockResolvedValue({ id: driverId, pin: hash } as any);
    prismaMock.driver.update.mockResolvedValue({} as any);
  }

  it('rejects unauthenticated callers', async () => {
    clearSession();
    const r = await changeDriverPin(REAL_OLD, REAL_NEW);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/Sign-in required/);
  });

  it('rejects admin callers (drivers only — admin reset goes through a separate flow)', async () => {
    setAdminSession(1);
    const r = await changeDriverPin(REAL_OLD, REAL_NEW);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/Only drivers/);
  });

  it('rejects when rate limit is hit', async () => {
    setDriverSession(10);
    vi.mocked(pinChangeRateLimit.limit).mockResolvedValueOnce({ success: false, remaining: 0 } as any);
    const r = await changeDriverPin(REAL_OLD, REAL_NEW);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/Too many attempts/);
    // The rate-limit key is per-driver.
    expect(pinChangeRateLimit.limit).toHaveBeenCalledWith('driver_10');
  });

  it('rejects PINs too short or too long', async () => {
    setDriverSession(10);
    expect((await changeDriverPin(REAL_OLD, '123')).success).toBe(false);
    expect((await changeDriverPin(REAL_OLD, '1'.repeat(13))).success).toBe(false);
  });

  it('rejects non-digit PINs', async () => {
    setDriverSession(10);
    const r = await changeDriverPin(REAL_OLD, 'abcd');
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/digits only/);
  });

  it('rejects when new PIN equals old PIN', async () => {
    setDriverSession(10);
    const r = await changeDriverPin(REAL_OLD, REAL_OLD);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/differ/);
  });

  it('rejects when current PIN is wrong (bcrypt mismatch)', async () => {
    setDriverSession(10);
    await setupExistingDriver(10);
    const r = await changeDriverPin('9999', REAL_NEW);
    expect(r.success).toBe(false);
    expect((r as any).error).toMatch(/incorrect/);
    // Importantly: did NOT call update.
    expect(prismaMock.driver.update).not.toHaveBeenCalled();
  });

  it('hashes the new PIN with bcrypt and persists', async () => {
    setDriverSession(10);
    await setupExistingDriver(10);

    const r = await changeDriverPin(REAL_OLD, REAL_NEW);
    expect(r.success).toBe(true);

    expect(prismaMock.driver.update).toHaveBeenCalledWith({
      where: { id: 10 },
      data: expect.objectContaining({
        pin: expect.any(String),
      }),
    });

    // Verify the persisted hash actually matches the new PIN (the function
    // didn't, e.g., persist a constant or the old hash).
    const update = vi.mocked(prismaMock.driver.update).mock.calls[0][0] as any;
    const persistedHash = update.data.pin;
    expect(persistedHash).not.toBe(REAL_NEW);                  // must be hashed
    expect(await bcrypt.compare(REAL_NEW, persistedHash)).toBe(true);
  });

  it('audit log is written WITHOUT any PIN values', async () => {
    setDriverSession(10);
    await setupExistingDriver(10);

    await changeDriverPin(REAL_OLD, REAL_NEW);

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      'CHANGE_DRIVER_PIN',
      'Driver',
      10,
      null,                                     // old state — never includes PIN
      null,                                     // new state — never includes PIN
      expect.any(String),                       // message
    );
    // Stronger: every call to writeAuditLog is free of the PIN strings.
    for (const call of vi.mocked(writeAuditLog).mock.calls) {
      const serialized = JSON.stringify(call);
      expect(serialized).not.toContain(REAL_OLD);
      expect(serialized).not.toContain(REAL_NEW);
    }
  });
});

describe('authenticate (login server action)', () => {
  it('returns rate-limit error when too many attempts', async () => {
    const { loginRateLimit } = await import('@/lib/rate-limit');
    vi.mocked(loginRateLimit.limit).mockResolvedValueOnce({ success: false, remaining: 0 } as any);
    const fd = new FormData();
    fd.set('type', 'driver');
    fd.set('phone', '0500000000');
    fd.set('pin', '1234');
    const r = await authenticate(undefined, fd);
    expect(r).toEqual({ error: expect.stringMatching(/Too many login attempts/) });
  });
});
