import { describe, it, expect, vi } from 'vitest';

/**
 * Smoke test only. The full DriverRefillUI is ~780 lines with stateful UI,
 * dynamic offline detection, optimistic updates, image compression, and a
 * sync loop. End-to-end coverage of those interactions is better suited to
 * Playwright; here we verify the module imports cleanly under jsdom (catches
 * accidental server-only imports, broken default exports, etc.).
 */

vi.mock('@/actions/inventory', () => ({
  logBatchRefills: vi.fn(async () => ({ success: true, data: undefined })),
  uploadItemImage: vi.fn(async () => ({ success: true, data: 'mock://blob/x' })),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

describe('DriverRefillUI (smoke)', () => {
  it('module loads without throwing', async () => {
    const mod = await import('@/components/DriverRefillUI');
    expect(mod).toBeTruthy();
    // Default or named export — accept either; just don't crash.
    expect(typeof mod === 'object').toBe(true);
  });
});
