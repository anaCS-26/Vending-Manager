/**
 * ============================================================================
 * SHARED P&L MATH
 * Single source of truth for the revenue / COGS / shrinkage / expenses /
 * net-profit formula. Used by the admin Financials page and the super-admin
 * Executive KPIs so the formula lives in exactly one place.
 *
 * Costs and prices are read from the RefillLog *snapshot* (price_at_refill /
 * cost_at_refill) and NEVER re-derived from the live Item — historical money
 * must reflect what was true at the time of sale. See vms-accounting-wac.
 * ============================================================================
 */

export type PnLRefillLog = {
    items_sold_since_last_refill: number | null;
    sales_revenue: number | null;
    price_at_refill?: number | null;
    cost_at_refill?: number | null;
    item: { price_standard: number | null; cost: number | null };
};

export type PnLShrinkageReturn = { quantity: number; item: { cost: number | null } };
export type PnLDamagedDispatchItem = { quantity_damaged: number | null; item: { cost: number | null } };
export type PnLExpenseEntity = { operating_cost: number | null; rental_cost: number | null };

export type PnLTotals = {
    revenue: number;
    cogs: number;
    shrinkage: number;
    expenses: number;
    netProfit: number;
};

/**
 * Revenue + COGS from a set of refill logs. Prefers the captured `sales_revenue`
 * and the per-refill price/cost snapshots, falling back to live Item values only
 * when a snapshot is missing (legacy rows).
 */
export function refillRevenueAndCogs(logs: PnLRefillLog[]): { revenue: number; cogs: number } {
    let revenue = 0;
    let cogs = 0;
    for (const log of logs) {
        const sold = log.items_sold_since_last_refill || 0;
        const price = log.price_at_refill ?? log.item.price_standard ?? 0;
        const cost = log.cost_at_refill ?? log.item.cost ?? 0;
        revenue += log.sales_revenue || sold * price;
        cogs += sold * cost;
    }
    return { revenue, cogs };
}

/** Fixed operating + rental cost across entities, pro-rated by the period multiplier. */
export function proRatedExpenses(entities: PnLExpenseEntity[], expenseMultiplier: number): number {
    return entities.reduce(
        (acc, e) => acc + ((e.operating_cost || 0) + (e.rental_cost || 0)) * expenseMultiplier,
        0,
    );
}

/** Full P&L roll-up. Inputs are pre-fetched arrays so the caller controls the date window. */
export function computePnLTotals(inputs: {
    refillLogs: PnLRefillLog[];
    approvedReturns: PnLShrinkageReturn[];
    damagedDispatchItems: PnLDamagedDispatchItem[];
    machines: PnLExpenseEntity[];
    warehouses: PnLExpenseEntity[];
    expenseMultiplier: number;
}): PnLTotals {
    const { revenue, cogs } = refillRevenueAndCogs(inputs.refillLogs);

    const shrinkageFromRoutes = inputs.approvedReturns.reduce(
        (sum, rv) => sum + rv.quantity * (rv.item.cost || 0),
        0,
    );
    const shrinkageFromReturns = inputs.damagedDispatchItems.reduce(
        (sum, di) => sum + (di.quantity_damaged || 0) * (di.item.cost || 0),
        0,
    );
    const shrinkage = shrinkageFromRoutes + shrinkageFromReturns;

    const expenses =
        proRatedExpenses(inputs.machines, inputs.expenseMultiplier) +
        proRatedExpenses(inputs.warehouses, inputs.expenseMultiplier);

    return { revenue, cogs, shrinkage, expenses, netProfit: revenue - cogs - shrinkage - expenses };
}

/**
 * Maps a range token to its start Date + expense pro-rating multiplier, matching
 * the admin Financials page. `expenseMultiplier` normalises a ~30.44-day month of
 * fixed cost to the length of the window. `all`/`ytd` require an anchor (earliest
 * log / year start) the caller computes, so they're passed in.
 */
export function rangeMultiplier(rangeDays: number): number {
    // 30.44 = average days per month; fixed monthly costs are pro-rated to the window.
    return rangeDays / 30.44;
}
