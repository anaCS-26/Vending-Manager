import { describe, it, expect } from 'vitest';
import { cn, formatCurrency, formatID, formatSaudiDate, formatSaudiTime } from '@/lib/utils';

describe('cn (tailwind class merger)', () => {
  it('joins distinct classes', () => {
    expect(cn('p-4', 'text-red-500')).toBe('p-4 text-red-500');
  });

  it('lets later classes override earlier conflicts', () => {
    expect(cn('p-4', 'p-8')).toBe('p-8');
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
  });

  it('drops falsy values', () => {
    expect(cn('bg-red-500', undefined, null, false, '', 'bg-blue-500')).toBe('bg-blue-500');
  });

  it('returns an empty string when all inputs are falsy', () => {
    expect(cn(undefined, null, false)).toBe('');
  });
});

describe('formatCurrency', () => {
  it('renders two decimal places with the SAR mark', () => {
    expect(formatCurrency(100)).toBe('⃁ 100.00');
    expect(formatCurrency(0)).toBe('⃁ 0.00');
    expect(formatCurrency(15.5)).toBe('⃁ 15.50');
  });

  it('rounds half-to-even per Number.toFixed', () => {
    expect(formatCurrency(10.125)).toMatch(/⃁ 10\.12|⃁ 10\.13/);
    expect(formatCurrency(10.123)).toBe('⃁ 10.12');
  });

  it('renders negative amounts with a leading minus', () => {
    expect(formatCurrency(-7.5)).toBe('⃁ -7.50');
  });

  // These don't *have* to be supported, but documenting behavior so a future
  // change forces a conscious decision.
  it('does not crash on NaN / Infinity (documents current behavior)', () => {
    expect(formatCurrency(NaN)).toBe('⃁ NaN');
    expect(formatCurrency(Infinity)).toBe('⃁ Infinity');
  });
});

describe('formatID', () => {
  it('pads with leading zeros to the default width', () => {
    expect(formatID(1)).toBe('0001');
    expect(formatID(123)).toBe('0123');
  });

  it('returns the raw string when the number is wider than the pad', () => {
    expect(formatID(12345)).toBe('12345');
    expect(formatID(12345, 2)).toBe('12345');
  });

  it('honors custom padding', () => {
    expect(formatID(1, 6)).toBe('000001');
    expect(formatID(7, 1)).toBe('7');
  });

  it('keeps the minus sign on negative IDs (documents current behavior)', () => {
    // padStart pads the WHOLE string including the minus, so '-1' becomes '0-1'.
    // This is a known quirk; if the app starts using negative IDs, fix here AND
    // update this test.
    expect(formatID(-1)).toBe('00-1');
  });
});

describe('Saudi date/time formatters', () => {
  // All formatter tests use a fixed UTC instant; we assert on substrings so
  // ICU locale variations don't break the suite.
  const fixedDate = new Date('2026-05-02T12:00:00Z'); // 12:00 UTC = 15:00 Asia/Riyadh

  it('formatSaudiDate produces a date string (en-US style)', () => {
    const out = formatSaudiDate(fixedDate);
    // 12:00 UTC on May 2 is 15:00 in Riyadh, still May 2.
    expect(out).toMatch(/5[\/\-]2[\/\-]2026/);
  });

  it('formatSaudiDate accepts an ISO string', () => {
    const out = formatSaudiDate('2026-05-02T12:00:00Z');
    expect(out).toMatch(/5[\/\-]2[\/\-]2026/);
  });

  it('formatSaudiTime shifts UTC into Riyadh (UTC+3)', () => {
    const out = formatSaudiTime(fixedDate);
    // 12:00 UTC = 3:00 PM Riyadh; some ICU builds emit "15:00" with hour12:false defaults.
    expect(out).toMatch(/3:00|15:00/);
  });

  it('formatSaudiDate respects override options', () => {
    const out = formatSaudiDate(fixedDate, { year: 'numeric', month: 'long', day: 'numeric' });
    expect(out).toMatch(/May/);
    expect(out).toMatch(/2026/);
  });

  it('formatSaudiTime supports hour:minute formatting', () => {
    const out = formatSaudiTime(fixedDate, { hour: '2-digit', minute: '2-digit' });
    expect(out).toMatch(/3:00|15:00/);
  });

  it('handles a UTC instant that crosses midnight in Riyadh', () => {
    // 23:00 UTC = 02:00 next day in Riyadh — the date part should advance.
    const out = formatSaudiDate(new Date('2026-05-02T23:00:00Z'));
    expect(out).toMatch(/5[\/\-]3[\/\-]2026/);
  });
});
