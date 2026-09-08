import { Users } from "lucide-react";
import Panel from "./Panel";
import { formatMoney, type DriverActivity } from "@/lib/analytics";

/**
 * ============================================================================
 * DRIVER SCORECARD
 *
 * Workload and handling quality per driver. Two things it deliberately does
 * NOT do:
 *
 *  - **It doesn't rank drivers by revenue.** Revenue belongs to the machine —
 *    a driver assigned the hospital route will out-earn one on a quiet
 *    industrial estate no matter how either of them works. The revenue column
 *    is here as context for the workload columns beside it, and the table is
 *    sorted by visits.
 *  - **It doesn't call the write-off rate a performance score.** Some product
 *    lines expire faster than others and some routes are rougher on stock.
 *    It's a number worth asking about, not a verdict — which is why it's a
 *    plain figure rather than a red badge.
 *
 * Below `sm` this becomes stacked cards rather than a squeezed table, the
 * pattern the five wide tables in this app already use.
 * ============================================================================
 */
export default function DriverScorecard({ rows, rangeLabel }: { rows: DriverActivity[]; rangeLabel: string }) {
    return (
        <Panel
            title="Driver activity"
            subtitle={`Workload and handling, ${rangeLabel.toLowerCase()}. Sorted by service visits.`}
            icon={<Users className="w-5 h-5" />}
            accent="text-accent-purple"
            caveat="Revenue is the machine's, not the driver's — routes differ. Read it as context for the workload columns, not as a ranking."
        >
            {rows.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                    No driver recorded a refill in this period.
                </p>
            ) : (
                <>
                    {/* Desktop table */}
                    <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full text-sm min-w-[720px]">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-white/5">
                                    <Th align="left">Driver</Th>
                                    <Th>Visits</Th>
                                    <Th>Machines</Th>
                                    <Th>Lines / visit</Th>
                                    <Th>Units refilled</Th>
                                    <Th>Revenue recorded</Th>
                                    <Th>Written off</Th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                                {rows.map((row) => (
                                    <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.03]">
                                        <td className="py-3 pr-3">
                                            <div className="flex items-center gap-2.5">
                                                <span className="w-7 h-7 rounded-lg bg-accent-purple/10 text-accent-purple flex items-center justify-center text-xs font-bold shrink-0">
                                                    {row.name.charAt(0)}
                                                </span>
                                                <span className="font-medium text-slate-900 dark:text-white truncate">
                                                    {row.name}
                                                </span>
                                            </div>
                                        </td>
                                        <Td>{row.visits}</Td>
                                        <Td>{row.machines}</Td>
                                        <Td>{row.linesPerVisit.toFixed(1)}</Td>
                                        <Td>{row.unitsRefilled}</Td>
                                        <Td>{formatMoney(row.revenue)}</Td>
                                        <Td>
                                            {row.writeOffUnits === 0 ? (
                                                <span className="text-slate-400 dark:text-slate-500">—</span>
                                            ) : (
                                                <>
                                                    {formatMoney(row.writeOffValue)}
                                                    <span className="text-slate-500 dark:text-slate-400 font-normal">
                                                        {" "}
                                                        · {row.writeOffRate.toFixed(1)}%
                                                    </span>
                                                </>
                                            )}
                                        </Td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Phone cards */}
                    <ul className="sm:hidden space-y-3">
                        {rows.map((row) => (
                            <li
                                key={row.id}
                                className="rounded-2xl border border-slate-200 dark:border-white/5 p-4 bg-white/50 dark:bg-white/[0.02]"
                            >
                                <div className="flex items-center gap-2.5 mb-3">
                                    <span className="w-8 h-8 rounded-lg bg-accent-purple/10 text-accent-purple flex items-center justify-center text-sm font-bold shrink-0">
                                        {row.name.charAt(0)}
                                    </span>
                                    <span className="font-semibold text-slate-900 dark:text-white truncate">
                                        {row.name}
                                    </span>
                                </div>
                                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                                    <Stat label="Visits" value={String(row.visits)} />
                                    <Stat label="Machines" value={String(row.machines)} />
                                    <Stat label="Units refilled" value={String(row.unitsRefilled)} />
                                    <Stat label="Lines / visit" value={row.linesPerVisit.toFixed(1)} />
                                    <Stat label="Revenue recorded" value={formatMoney(row.revenue)} />
                                    <Stat
                                        label="Written off"
                                        value={
                                            row.writeOffUnits === 0
                                                ? "—"
                                                : `${formatMoney(row.writeOffValue)} · ${row.writeOffRate.toFixed(1)}%`
                                        }
                                    />
                                </dl>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </Panel>
    );
}

function Th({ children, align = "right" }: { children: React.ReactNode; align?: "left" | "right" }) {
    return (
        <th
            scope="col"
            className={`py-2.5 ${align === "left" ? "text-left pr-3" : "text-right pl-3"} font-mono text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap`}
        >
            {children}
        </th>
    );
}

function Td({ children }: { children: React.ReactNode }) {
    return (
        <td className="py-3 pl-3 text-right tabular-nums font-medium text-slate-900 dark:text-white whitespace-nowrap">
            {children}
        </td>
    );
}

function Stat({ label, value }: { label: string; value: string }) {
    return (
        <div className="min-w-0">
            <dt className="font-mono text-[9px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {label}
            </dt>
            <dd className="tabular-nums font-semibold text-slate-900 dark:text-white truncate">{value}</dd>
        </div>
    );
}
