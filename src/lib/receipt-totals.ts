/**
 * Purchase-order receipt totals. Pulled into a pure function (same pattern as
 * wac-math.ts) so the numbers the receiver matches against the supplier's
 * paper invoice can be unit-tested without rendering the UI.
 *
 * Saudi supplier tax invoices list pre-VAT unit prices, a pre-VAT "Total
 * Amount", a 15% VAT line, and a VAT-inclusive "Grand Total". The receiving
 * screen captures pre-VAT unit costs (they feed WAC), so subtotal here lines
 * up with the invoice's Total Amount and grandTotal with its Grand Total.
 *
 * Suppliers round VAT per line item, so their grand total can drift from
 * `subtotal * 1.15` by a few halalas — callers should treat that as a match.
 */

export const SAUDI_VAT_RATE = 0.15;

export type ReceiptLine = {
    quantity: number;
    unitCost: number;
};

export type ReceiptTotals = {
    lineCount: number;
    totalUnits: number;
    /** Pre-VAT value — the invoice's "Total Amount" line. */
    subtotal: number;
    vat: number;
    /** VAT-inclusive value — the invoice's "Grand Total" line. */
    grandTotal: number;
};

export function computeReceiptTotals(
    lines: ReceiptLine[],
    vatRate: number = SAUDI_VAT_RATE,
): ReceiptTotals {
    let totalUnits = 0;
    let subtotal = 0;
    for (const line of lines) {
        totalUnits += line.quantity;
        subtotal += line.quantity * line.unitCost;
    }
    const vat = subtotal * vatRate;
    return {
        lineCount: lines.length,
        totalUnits,
        subtotal,
        vat,
        grandTotal: subtotal + vat,
    };
}
