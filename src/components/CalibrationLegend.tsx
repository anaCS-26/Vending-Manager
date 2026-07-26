import { Info, TrendingDown, TrendingUp } from "lucide-react";

type Outcome = {
    /** Matches the badge wording on the rows below, e.g. "Shortage" / "Missing". */
    label: string;
    /** One line on what it does to the books. */
    effect: string;
};

type Props = {
    shortage: Outcome;
    surplus: Outcome;
    /** Optional single caveat line. Keep it to one short sentence. */
    note?: string;
};

/**
 * The two possible outcomes of a recount, shown side by side above the count rows.
 *
 * Shared by WarehouseAuditModal and MachineAuditModal so the pair stays visually
 * in sync (see CLAUDE.md), but every string is passed in — never hardcoded here.
 * The semantics genuinely differ: a warehouse shortage is a neutral correction,
 * whereas a machine shortage IS a sale (product leaves a machine by being vended).
 * Collapsing the two into one shared sentence would misstate the books.
 *
 * Replaces a ~45-word prose paragraph that stated the same rules inline. The rules
 * are a two-branch decision, so they read far faster as two labelled branches whose
 * headings match the badges that appear on the rows once a count diverges.
 */
export function CalibrationLegend({ shortage, surplus, note }: Props) {
    return (
        <div className="px-6 pt-4">
            <div className="grid gap-2 sm:grid-cols-2">
                <div className="flex items-start gap-2.5 rounded-xl border border-accent-pink/20 bg-accent-pink/5 px-3.5 py-2.5">
                    <TrendingDown className="w-4 h-4 text-accent-pink shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="min-w-0">
                        <p className="text-xs font-bold text-accent-pink leading-tight">{shortage.label}</p>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug mt-0.5">{shortage.effect}</p>
                    </div>
                </div>

                <div className="flex items-start gap-2.5 rounded-xl border border-accent-green/20 bg-accent-green/5 px-3.5 py-2.5">
                    <TrendingUp className="w-4 h-4 text-accent-green shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="min-w-0">
                        <p className="text-xs font-bold text-accent-green leading-tight">{surplus.label}</p>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug mt-0.5">{surplus.effect}</p>
                    </div>
                </div>
            </div>

            {note && (
                <p className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                    <Info className="w-3 h-3 shrink-0" aria-hidden="true" />
                    {note}
                </p>
            )}
        </div>
    );
}
