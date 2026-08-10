import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { requestPasswordReset, resetPassword } from '@/actions/password-reset';
import { prismaMock } from '../__helpers__/prisma-mock';
import {
  passwordResetRequestRateLimit,
  passwordResetConfirmRateLimit,
} from '@/lib/rate-limit';
import { sendPasswordResetEmail, isEmailConfigured } from '@/lib/email';
import { writeAuditLog } from '@/lib/audit-utils';

/**
 * These two actions are the app's only unauthenticated mutations, so the tests
 * below are the guard that `auth-utils` would otherwise be. They assert the
 * four invariants documented at the top of src/actions/password-reset.ts.
 */

const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

function fd(entries: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
}

const VALID_PASSWORD = 'correct-horse-battery';

// The global setup resets the Prisma mocks between tests but not the module
// mocks from vitest.setup.ts. Several assertions here read `mock.calls` in
// full (to prove ordering and the absence of a call), so they need a clean
// slate — clear the call log, then restore the default implementations.
beforeEach(() => {
  vi.mocked(sendPasswordResetEmail).mockClear().mockResolvedValue({ ok: true });
  vi.mocked(isEmailConfigured).mockClear().mockReturnValue(true);
  vi.mocked(passwordResetRequestRateLimit.limit).mockClear().mockResolvedValue({ success: true } as any);
  vi.mocked(passwordResetConfirmRateLimit.limit).mockClear().mockResolvedValue({ success: true } as any);
  vi.mocked(writeAuditLog).mockClear();
});

describe('requestPasswordReset', () => {
  it('returns the same response for a known and an unknown email (no enumeration)', async () => {
    prismaMock.admin.findUnique.mockResolvedValueOnce({
      id: 1, email: 'real@vending.com', password: 'hash', role: 'ADMIN',
    } as any);
    prismaMock.admin.update.mockResolvedValue({} as any);
    const hit = await requestPasswordReset(undefined, fd({ email: 'real@vending.com' }));

    prismaMock.admin.findUnique.mockResolvedValueOnce(null);
    const miss = await requestPasswordReset(undefined, fd({ email: 'nobody@vending.com' }));

    expect(hit).toEqual(miss);
    expect(hit?.ok).toBe(true);
  });

  it('does no DB work for an unknown email beyond the lookup', async () => {
    prismaMock.admin.findUnique.mockResolvedValueOnce(null);
    await requestPasswordReset(undefined, fd({ email: 'nobody@vending.com' }));
    expect(prismaMock.admin.update).not.toHaveBeenCalled();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('stores the SHA-256 of the token, never the token itself', async () => {
    prismaMock.admin.findUnique.mockResolvedValueOnce({
      id: 7, email: 'a@b.com', password: 'hash', role: 'ADMIN',
    } as any);
    prismaMock.admin.update.mockResolvedValue({} as any);

    await requestPasswordReset(undefined, fd({ email: 'a@b.com' }));

    const emailedToken = vi.mocked(sendPasswordResetEmail).mock.calls.at(-1)![1];
    const stored = vi.mocked(prismaMock.admin.update).mock.calls.at(-1)![0].data;

    expect(stored.resetToken).toBe(sha256(emailedToken));
    expect(stored.resetToken).not.toBe(emailedToken);
    // 32 random bytes, base64url encoded.
    expect(emailedToken.length).toBeGreaterThanOrEqual(43);
  });

  it('sets a 30-minute expiry', async () => {
    prismaMock.admin.findUnique.mockResolvedValueOnce({
      id: 7, email: 'a@b.com', password: 'hash', role: 'ADMIN',
    } as any);
    prismaMock.admin.update.mockResolvedValue({} as any);

    const before = Date.now();
    await requestPasswordReset(undefined, fd({ email: 'a@b.com' }));
    const expiry: Date = vi.mocked(prismaMock.admin.update).mock.calls.at(-1)![0].data.resetTokenExpiry;

    expect(expiry.getTime() - before).toBeGreaterThan(29 * 60 * 1000);
    expect(expiry.getTime() - before).toBeLessThanOrEqual(30 * 60 * 1000 + 5000);
  });

  it('normalises the email to lower case before lookup', async () => {
    prismaMock.admin.findUnique.mockResolvedValueOnce(null);
    await requestPasswordReset(undefined, fd({ email: '  Admin@Vending.COM ' }));
    expect(prismaMock.admin.findUnique).toHaveBeenCalledWith({ where: { email: 'admin@vending.com' } });
  });

  it('rejects a malformed email without touching the DB', async () => {
    const r = await requestPasswordReset(undefined, fd({ email: 'not-an-email' }));
    expect(r?.ok).toBe(false);
    expect(prismaMock.admin.findUnique).not.toHaveBeenCalled();
  });

  it('rate limits per IP before any DB work', async () => {
    vi.mocked(passwordResetRequestRateLimit.limit).mockResolvedValueOnce({ success: false } as any);
    const r = await requestPasswordReset(undefined, fd({ email: 'a@b.com' }));
    expect(r?.ok).toBe(false);
    expect(prismaMock.admin.findUnique).not.toHaveBeenCalled();
  });

  it('rate limits per email address as well as per IP', async () => {
    vi.mocked(passwordResetRequestRateLimit.limit)
      .mockResolvedValueOnce({ success: true } as any)   // ip
      .mockResolvedValueOnce({ success: false } as any); // email

    const r = await requestPasswordReset(undefined, fd({ email: 'a@b.com' }));
    expect(r?.ok).toBe(false);
    expect(vi.mocked(passwordResetRequestRateLimit.limit).mock.calls.map((c) => c[0]))
      .toEqual(['ip_127.0.0.1', 'email_a@b.com']);
  });

  it('still reports generic success when the transport fails (no enumeration via errors)', async () => {
    prismaMock.admin.findUnique.mockResolvedValueOnce({
      id: 7, email: 'a@b.com', password: 'hash', role: 'ADMIN',
    } as any);
    prismaMock.admin.update.mockResolvedValue({} as any);
    vi.mocked(sendPasswordResetEmail).mockResolvedValueOnce({ ok: false, error: 'domain not verified' });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const r = await requestPasswordReset(undefined, fd({ email: 'a@b.com' }));
    expect(r?.ok).toBe(true);
  });

  it('audits the request against the admin', async () => {
    prismaMock.admin.findUnique.mockResolvedValueOnce({
      id: 7, email: 'a@b.com', password: 'hash', role: 'SUPER_ADMIN',
    } as any);
    prismaMock.admin.update.mockResolvedValue({} as any);

    await requestPasswordReset(undefined, fd({ email: 'a@b.com' }));

    const call = vi.mocked(writeAuditLog).mock.calls.at(-1)!;
    expect(call[1]).toBe('REQUEST_PASSWORD_RESET');
    expect(call[3]).toBe(7);
    expect(call[0].user).toEqual({ id: '7', role: 'super_admin' });
  });
});

describe('resetPassword', () => {
  const RAW_TOKEN = 'a'.repeat(43);

  function liveAdmin(overrides: Record<string, unknown> = {}) {
    return {
      id: 7,
      email: 'a@b.com',
      role: 'ADMIN',
      password: '$2a$10$notarealhashnotarealhashnotarealhashnotarealhashno',
      resetToken: sha256(RAW_TOKEN),
      resetTokenExpiry: new Date(Date.now() + 10 * 60 * 1000),
      ...overrides,
    } as any;
  }

  it('looks the token up by hash, never by raw value', async () => {
    prismaMock.admin.findUnique.mockResolvedValueOnce(liveAdmin());
    prismaMock.admin.update.mockResolvedValue({} as any);

    await resetPassword(undefined, fd({
      token: RAW_TOKEN, password: VALID_PASSWORD, confirmPassword: VALID_PASSWORD,
    }));

    expect(prismaMock.admin.findUnique).toHaveBeenCalledWith({
      where: { resetToken: sha256(RAW_TOKEN) },
    });
  });

  it('hashes the new password and clears the token in the same write', async () => {
    prismaMock.admin.findUnique.mockResolvedValueOnce(liveAdmin());
    prismaMock.admin.update.mockResolvedValue({} as any);

    const r = await resetPassword(undefined, fd({
      token: RAW_TOKEN, password: VALID_PASSWORD, confirmPassword: VALID_PASSWORD,
    }));

    expect(r?.ok).toBe(true);
    const data = vi.mocked(prismaMock.admin.update).mock.calls.at(-1)![0].data;
    expect(data.resetToken).toBeNull();
    expect(data.resetTokenExpiry).toBeNull();
    expect(data.password).not.toBe(VALID_PASSWORD);
    expect(await bcrypt.compare(VALID_PASSWORD, data.password)).toBe(true);
  });

  it('rejects an expired token with the same message as an unknown one', async () => {
    prismaMock.admin.findUnique.mockResolvedValueOnce(
      liveAdmin({ resetTokenExpiry: new Date(Date.now() - 1000) })
    );
    const expired = await resetPassword(undefined, fd({
      token: RAW_TOKEN, password: VALID_PASSWORD, confirmPassword: VALID_PASSWORD,
    }));

    prismaMock.admin.findUnique.mockResolvedValueOnce(null);
    const unknown = await resetPassword(undefined, fd({
      token: 'z'.repeat(43), password: VALID_PASSWORD, confirmPassword: VALID_PASSWORD,
    }));

    expect(expired).toEqual(unknown);
    expect(expired?.ok).toBe(false);
    expect(prismaMock.admin.update).not.toHaveBeenCalled();
  });

  it('rejects a token with no expiry recorded', async () => {
    prismaMock.admin.findUnique.mockResolvedValueOnce(liveAdmin({ resetTokenExpiry: null }));
    const r = await resetPassword(undefined, fd({
      token: RAW_TOKEN, password: VALID_PASSWORD, confirmPassword: VALID_PASSWORD,
    }));
    expect(r?.ok).toBe(false);
    expect(prismaMock.admin.update).not.toHaveBeenCalled();
  });

  it('rejects a missing token before any DB work', async () => {
    const r = await resetPassword(undefined, fd({
      token: '', password: VALID_PASSWORD, confirmPassword: VALID_PASSWORD,
    }));
    expect(r?.ok).toBe(false);
    expect(prismaMock.admin.findUnique).not.toHaveBeenCalled();
  });

  it('enforces the minimum length', async () => {
    const r = await resetPassword(undefined, fd({
      token: RAW_TOKEN, password: 'short', confirmPassword: 'short',
    }));
    expect(r?.ok).toBe(false);
    expect((r as any).error).toMatch(/at least 10/);
    expect(prismaMock.admin.findUnique).not.toHaveBeenCalled();
  });

  it('rejects passwords over bcrypt\'s 72-byte truncation limit', async () => {
    const long = 'x'.repeat(73);
    const r = await resetPassword(undefined, fd({
      token: RAW_TOKEN, password: long, confirmPassword: long,
    }));
    expect(r?.ok).toBe(false);
    expect((r as any).error).toMatch(/72 bytes/);
  });

  it('rejects mismatched confirmation', async () => {
    const r = await resetPassword(undefined, fd({
      token: RAW_TOKEN, password: VALID_PASSWORD, confirmPassword: VALID_PASSWORD + '!',
    }));
    expect(r?.ok).toBe(false);
    expect((r as any).error).toMatch(/do not match/);
  });

  it('rejects reuse of the current password', async () => {
    const current = await bcrypt.hash(VALID_PASSWORD, 10);
    prismaMock.admin.findUnique.mockResolvedValueOnce(liveAdmin({ password: current }));

    const r = await resetPassword(undefined, fd({
      token: RAW_TOKEN, password: VALID_PASSWORD, confirmPassword: VALID_PASSWORD,
    }));

    expect(r?.ok).toBe(false);
    expect((r as any).error).toMatch(/different from your current/);
    expect(prismaMock.admin.update).not.toHaveBeenCalled();
  });

  it('rate limits redemption per IP before any DB work', async () => {
    vi.mocked(passwordResetConfirmRateLimit.limit).mockResolvedValueOnce({ success: false } as any);
    const r = await resetPassword(undefined, fd({
      token: RAW_TOKEN, password: VALID_PASSWORD, confirmPassword: VALID_PASSWORD,
    }));
    expect(r?.ok).toBe(false);
    expect(prismaMock.admin.findUnique).not.toHaveBeenCalled();
  });

  it('audits the completion without recording the token or password', async () => {
    prismaMock.admin.findUnique.mockResolvedValueOnce(liveAdmin());
    prismaMock.admin.update.mockResolvedValue({} as any);

    await resetPassword(undefined, fd({
      token: RAW_TOKEN, password: VALID_PASSWORD, confirmPassword: VALID_PASSWORD,
    }));

    const call = vi.mocked(writeAuditLog).mock.calls.at(-1)!;
    expect(call[1]).toBe('RESET_PASSWORD');
    expect(call[3]).toBe(7);
    expect(JSON.stringify(call)).not.toContain(RAW_TOKEN);
    expect(JSON.stringify(call)).not.toContain(VALID_PASSWORD);
  });
});

describe('email configuration', () => {
  it('is checked before the account lookup so the error leaks nothing', async () => {
    const prev = process.env.NODE_ENV;
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(isEmailConfigured).mockReturnValueOnce(false);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const r = await requestPasswordReset(undefined, fd({ email: 'a@b.com' }));

    expect(r?.ok).toBe(false);
    expect(prismaMock.admin.findUnique).not.toHaveBeenCalled();
    vi.stubEnv('NODE_ENV', prev as string);
  });
});
