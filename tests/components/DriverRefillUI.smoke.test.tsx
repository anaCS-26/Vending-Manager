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
  getItems: vi.fn(async () => []),
  getMachineInventoryDetails: vi.fn(async () => []),
  getRefillHints: vi.fn(async () => []),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

describe('DriverRefillUI (smoke)', () => {
  // 15s, not the 5s default. This import pulls in framer-motion, zustand+idb,
  // browser-image-compression and the whole lucide barrel, and transforming that
  // graph lands at ~5.0-5.1s under the parallel full-suite run while taking
  // ~1.2s in isolation — so it failed on timeout perhaps one run in three, on
  // main as well as here. A flaky red is worse than a slow green.
  it('module loads without throwing', { timeout: 15_000 }, async () => {
    const mod = await import('@/components/DriverRefillUI');
    expect(mod).toBeTruthy();
    // Default or named export — accept either; just don't crash.
    expect(typeof mod === 'object').toBe(true);
  });
});
