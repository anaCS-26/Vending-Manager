import { describe, it, expect } from 'vitest';
import {
  requireAdmin,
  requireSuperAdmin,
  requireDriver,
  requireAdminOrDriverOwner,
} from '@/lib/auth-utils';
import {
  setAdminSession,
  setDriverSession,
  setSuperAdminSession,
  setSession,
  clearSession,
} from '../__helpers__/session-mock';

/**
 * These tests exercise the REAL auth-utils functions; only `@/proxy.auth()`
 * is mocked (via vitest.setup.ts). Each test arranges a session via the
 * session-mock helpers, then asserts the guard returns or throws as expected.
 *
 * Covers the contract each guard documents:
 * - missing session   → "UNAUTHORIZED: ..."
 * - wrong role        → "FORBIDDEN: ..."
 * - permitted role    → returns the session
 */

describe('requireAdmin', () => {
  it('throws UNAUTHORIZED when no session', async () => {
    clearSession();
    await expect(requireAdmin()).rejects.toThrow(/UNAUTHORIZED/);
  });

  it('throws FORBIDDEN when role=driver', async () => {
    setDriverSession(10);
    await expect(requireAdmin()).rejects.toThrow(/FORBIDDEN.*Administrative/);
  });

  it('returns session when role=admin', async () => {
    setAdminSession(1);
    await expect(requireAdmin()).resolves.toMatchObject({ user: { role: 'admin' } });
  });

  it('returns session when role=super_admin', async () => {
    setSuperAdminSession(1);
    await expect(requireAdmin()).resolves.toMatchObject({ user: { role: 'super_admin' } });
  });

  it('throws UNAUTHORIZED when session has no user', async () => {
    setSession({ user: undefined as any });
    await expect(requireAdmin()).rejects.toThrow(/UNAUTHORIZED/);
  });
});

describe('requireSuperAdmin', () => {
  it('throws UNAUTHORIZED when no session', async () => {
    clearSession();
    await expect(requireSuperAdmin()).rejects.toThrow(/UNAUTHORIZED/);
  });

  it('throws FORBIDDEN when role=admin (not super)', async () => {
    setAdminSession(1);
    await expect(requireSuperAdmin()).rejects.toThrow(/FORBIDDEN.*Super Admin/);
  });

  it('throws FORBIDDEN when role=driver', async () => {
    setDriverSession(10);
    await expect(requireSuperAdmin()).rejects.toThrow(/FORBIDDEN/);
  });

  it('returns session when role=super_admin', async () => {
    setSuperAdminSession(1);
    await expect(requireSuperAdmin()).resolves.toMatchObject({ user: { role: 'super_admin' } });
  });
});

describe('requireDriver', () => {
  it('throws UNAUTHORIZED when no session', async () => {
    clearSession();
    await expect(requireDriver()).rejects.toThrow(/UNAUTHORIZED/);
  });

  it('returns session when role=driver', async () => {
    setDriverSession(10);
    await expect(requireDriver()).resolves.toMatchObject({ user: { role: 'driver' } });
  });

  it('returns session when role=admin (admin shadowing)', async () => {
    setAdminSession(1);
    await expect(requireDriver()).resolves.toMatchObject({ user: { role: 'admin' } });
  });

  it('returns session when role=super_admin', async () => {
    setSuperAdminSession(1);
    await expect(requireDriver()).resolves.toMatchObject({ user: { role: 'super_admin' } });
  });

  it('throws FORBIDDEN for an unknown role', async () => {
    setSession({ user: { id: '99', role: 'guest' as any } });
    await expect(requireDriver()).rejects.toThrow(/FORBIDDEN.*Driver/);
  });
});

describe('requireAdminOrDriverOwner', () => {
  it('throws UNAUTHORIZED when no session', async () => {
    clearSession();
    await expect(requireAdminOrDriverOwner(10)).rejects.toThrow(/UNAUTHORIZED/);
  });

  it('admin bypasses the ownership check', async () => {
    setAdminSession(1);
    await expect(requireAdminOrDriverOwner(99)).resolves.toMatchObject({ user: { role: 'admin' } });
  });

  it('super_admin bypasses the ownership check', async () => {
    setSuperAdminSession(1);
    await expect(requireAdminOrDriverOwner(99)).resolves.toMatchObject({ user: { role: 'super_admin' } });
  });

  it('driver may operate on their own row', async () => {
    setDriverSession(10);
    await expect(requireAdminOrDriverOwner(10)).resolves.toMatchObject({ user: { role: 'driver' } });
  });

  it('driver cannot operate on another driver’s row', async () => {
    setDriverSession(10);
    await expect(requireAdminOrDriverOwner(11)).rejects.toThrow(/FORBIDDEN.*record owner/);
  });

  it('throws FORBIDDEN for any unrecognized role', async () => {
    setSession({ user: { id: '7', role: 'guest' as any } });
    await expect(requireAdminOrDriverOwner(10)).rejects.toThrow(/FORBIDDEN/);
  });
});
