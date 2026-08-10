import { describe, it, expect } from 'vitest';
import { selectAlertable, composeStockAlert } from '@/lib/stock-alerts';
import type { StockoutForecast } from '@/types';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-10T03:00:00Z');

function row(overrides: Partial<StockoutForecast> = {}): StockoutForecast {
  return {
    machineId: 1,
    machineName: 'Al Faisaliah Tower',
    district: 'Olaya',
    itemId: 5,
    itemName: 'Aquafina 600ml',
    currentStock: 4,
    estDailyDemand: 3.2,
    daysUntilEmpty: 1.2,
    visitCadenceDays: 7,
    currentAssignQty: 24,
    recommendedAssignQty: 30,
    riskLevel: 'critical',
    confidence: 'high',
    observations: 8,
    ...overrides,
  };
}

const keyOf = (r: StockoutForecast) => `stockout:${r.machineId}-${r.itemId}`;

/**
 * The suppression rule is what separates a useful morning alert from one ops
 * learns to swipe away: the at-risk condition persists every day until someone
 * refills the machine, so "still critical" is not on its own new information.
 */
describe('selectAlertable', () => {
  it('alerts on a machine-item nobody has been warned about', () => {
    const r = row();
    expect(selectAlertable([r], new Map(), new Map(), NOW)).toEqual([r]);
  });

  it('stays silent when we already warned and nothing has changed', () => {
    const r = row();
    const sent = new Map([[keyOf(r), new Date(NOW.getTime() - 2 * DAY)]]);
    const refilled = new Map([[keyOf(r), new Date(NOW.getTime() - 9 * DAY)]]);

    expect(selectAlertable([r], sent, refilled, NOW)).toEqual([]);
  });

  it('re-alerts when the machine was serviced since the warning and is critical again', () => {
    const r = row();
    const sent = new Map([[keyOf(r), new Date(NOW.getTime() - 5 * DAY)]]);
    // Refilled two days ago — already back in the critical band, which is a
    // genuinely new fact (the refill was too small, or demand jumped).
    const refilled = new Map([[keyOf(r), new Date(NOW.getTime() - 2 * DAY)]]);

    expect(selectAlertable([r], sent, refilled, NOW)).toEqual([r]);
  });

  it('escalates after a week of being ignored', () => {
    const r = row();
    const sent = new Map([[keyOf(r), new Date(NOW.getTime() - 8 * DAY)]]);
    const refilled = new Map([[keyOf(r), new Date(NOW.getTime() - 30 * DAY)]]);

    expect(selectAlertable([r], sent, refilled, NOW)).toEqual([r]);
  });

  it('does not escalate one day early', () => {
    const r = row();
    const sent = new Map([[keyOf(r), new Date(NOW.getTime() - 6 * DAY)]]);
    const refilled = new Map([[keyOf(r), new Date(NOW.getTime() - 30 * DAY)]]);

    expect(selectAlertable([r], sent, refilled, NOW)).toEqual([]);
  });

  it('suppresses per machine-item, not per machine', () => {
    const warned = row({ itemId: 5 });
    const fresh = row({ itemId: 6, itemName: 'Pepsi Can' });
    const sent = new Map([[keyOf(warned), new Date(NOW.getTime() - 1 * DAY)]]);

    expect(selectAlertable([warned, fresh], sent, new Map(), NOW)).toEqual([fresh]);
  });

  it('treats a missing refill timestamp as "not serviced" rather than re-alerting', () => {
    const r = row();
    const sent = new Map([[keyOf(r), new Date(NOW.getTime() - 1 * DAY)]]);

    expect(selectAlertable([r], sent, new Map(), NOW)).toEqual([]);
  });
});

describe('composeStockAlert', () => {
  it('names the machine and item when only one thing is at risk', () => {
    const { title, body } = composeStockAlert([row()]);
    expect(title).toBe('Al Faisaliah Tower is running low');
    expect(body).toContain('Aquafina 600ml');
    expect(body).toContain('1 day');
  });

  it('rounds a sub-day estimate to plain language rather than "0 days"', () => {
    const { body } = composeStockAlert([row({ daysUntilEmpty: 0.4 })]);
    expect(body).toContain('under a day');
    expect(body).not.toContain('0 days');
  });

  it('counts machines, not rows, in the title', () => {
    // Two items at risk in the SAME machine is one machine running low.
    const { title } = composeStockAlert([row({ itemId: 5 }), row({ itemId: 6 })]);
    expect(title).toBe('Al Faisaliah Tower is running low');
  });

  it('leads with the most urgent row and collapses the tail to a count', () => {
    const rows = [
      row({ machineId: 1, machineName: 'A', daysUntilEmpty: 0.5, itemName: 'Water' }),
      row({ machineId: 2, machineName: 'B' }),
      row({ machineId: 3, machineName: 'C' }),
      row({ machineId: 4, machineName: 'D' }),
    ];
    const { title, body } = composeStockAlert(rows);

    expect(title).toBe('4 machines are running low');
    expect(body).toContain('soonest: Water at A');
    expect(body).toContain('A, B, C +1 more');
  });

  it('handles an unmeasurable ETA without printing "null"', () => {
    const { body } = composeStockAlert([row({ daysUntilEmpty: null })]);
    expect(body).not.toContain('null');
    expect(body).toContain('unknown time');
  });
});
