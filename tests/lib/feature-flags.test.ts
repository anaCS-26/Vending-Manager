import { describe, it, expect } from 'vitest';
import { USE_DISPATCHLESS } from '@/lib/feature-flags';

/**
 * USE_DISPATCHLESS is a build-time constant in this codebase (not env-driven
 * at runtime). The single test below is a guard: if someone flips it without
 * ripping out the legacy dispatch path, this fails and forces a conversation.
 */
describe('feature flags', () => {
  it('USE_DISPATCHLESS is true (Phase B dual-run is active)', () => {
    expect(USE_DISPATCHLESS).toBe(true);
  });
});
