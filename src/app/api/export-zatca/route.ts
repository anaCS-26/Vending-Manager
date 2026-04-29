import { NextResponse } from "next/server";

/**
 * ZATCA VAT export — feature is not yet implemented.
 *
 * The previous prototype computed totals from a non-existent `Item.price`
 * column and was reachable without authentication, so it has been
 * disabled at the route level until the real ZATCA requirements are
 * scoped. The corresponding admin UI button is also disabled.
 *
 * To re-enable: implement the export, add `await requireAdmin()` at the
 * top of GET, and re-enable the button in `src/app/admin/financials/page.tsx`.
 */
export async function GET() {
    return NextResponse.json(
        { error: "ZATCA export is not yet available." },
        { status: 503 }
    );
}
