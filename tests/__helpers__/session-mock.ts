/**
 * Session holder for the mocked @/proxy and @/auth modules. The mock factories
 * read `sessionRef.current` lazily, so tests can mutate the session right up
 * to the moment the action runs.
 */

export type Role = 'driver' | 'admin' | 'super_admin';

export type MockSession = {
  user: { id: string; role: Role; name?: string; email?: string };
} | null;

export const sessionRef: { current: MockSession } = { current: null };

export function setSession(session: MockSession): void {
  sessionRef.current = session;
}

export function setDriverSession(driverId: number, name = 'Test Driver'): void {
  sessionRef.current = { user: { id: String(driverId), role: 'driver', name } };
}

export function setAdminSession(adminId = 1, name = 'Test Admin'): void {
  sessionRef.current = { user: { id: String(adminId), role: 'admin', name } };
}

export function setSuperAdminSession(adminId = 1, name = 'Root'): void {
  sessionRef.current = { user: { id: String(adminId), role: 'super_admin', name } };
}

export function clearSession(): void {
  sessionRef.current = null;
}

export function resetSession(): void {
  sessionRef.current = null;
}
