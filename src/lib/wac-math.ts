/**
 * Weighted Average Cost (WAC) primitive. Pulled out of orders.ts so it can be
 * unit-tested without spinning up Prisma. Input quantities are summed across
 * Warehouse + Machine + Driver stock by the caller; this function only does
 * the blended-cost math.
 *
 * Convention preserved from the original inline calculation in
 * completePurchaseOrder():
 *   - When the new total quantity is zero (no prior stock AND no incoming),
 *     fall back to incomingCost rather than dividing by zero.
 *   - All math is in JS Number space; callers should round when persisting
 *     to the DB if they care about display precision.
 */
export function computeWeightedCost(
  prevQty: number,
  prevCost: number,
  incomingQty: number,
  incomingCost: number,
): number {
  const totalQty = prevQty + incomingQty;
  if (totalQty <= 0) return incomingCost;
  const previousValue = prevQty * prevCost;
  const incomingValue = incomingQty * incomingCost;
  return (previousValue + incomingValue) / totalQty;
}
