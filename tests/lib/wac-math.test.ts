import { describe, it, expect } from 'vitest';
import { computeWeightedCost } from '@/lib/wac-math';

/**
 * WAC tests. This is the financial heart of the app — every regression here
 * means inventory valuation in production drifts. Edge cases matter more
 * than the happy path.
 */
describe('computeWeightedCost', () => {
  it('returns the simple cost when there is no prior stock', () => {
    expect(computeWeightedCost(0, 0, 100, 5)).toBe(5);
    expect(computeWeightedCost(0, 999, 100, 5)).toBe(5); // prior cost ignored when prior qty is 0
  });

  it('keeps cost flat when prior and incoming costs match', () => {
    expect(computeWeightedCost(100, 5, 100, 5)).toBe(5);
    expect(computeWeightedCost(50, 3, 50, 3)).toBe(3);
  });

  it('blends costs proportionally to quantities', () => {
    // 100 @ $5 + 100 @ $10 = $1500 / 200 = $7.50
    expect(computeWeightedCost(100, 5, 100, 10)).toBe(7.5);
    // 300 @ $4 + 100 @ $8 = $2000 / 400 = $5.00
    expect(computeWeightedCost(300, 4, 100, 8)).toBe(5);
    // 1 @ $9 + 9 @ $1 = $18 / 10 = $1.80
    expect(computeWeightedCost(1, 9, 9, 1)).toBe(1.8);
  });

  it('falls back to incomingCost when total qty is zero (divide-by-zero guard)', () => {
    expect(computeWeightedCost(0, 0, 0, 5)).toBe(5);
    expect(computeWeightedCost(0, 100, 0, 7)).toBe(7);
  });

  it('treats negative total qty as the divide-by-zero case (defensive)', () => {
    expect(computeWeightedCost(-5, 4, 0, 9)).toBe(9);
  });

  it('handles tiny floating-point inputs without NaN', () => {
    const result = computeWeightedCost(3, 0.1, 3, 0.2);
    expect(result).toBeCloseTo(0.15, 10);
    expect(Number.isFinite(result)).toBe(true);
  });

  it('does not lose precision on large quantities', () => {
    // 1,000,000 @ $2.50 + 500,000 @ $3.50 = $4.25M / 1.5M = $2.833...
    const result = computeWeightedCost(1_000_000, 2.5, 500_000, 3.5);
    expect(result).toBeCloseTo(2.8333333, 6);
  });

  it('is stable when only one side has stock', () => {
    expect(computeWeightedCost(100, 5, 0, 0)).toBe(5);
    expect(computeWeightedCost(100, 5, 0, 999)).toBe(5);
  });
});
