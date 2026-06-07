import { ShieldAlert } from "lucide-react";
import { formatRelativeAge, formatSaudiDate } from "@/lib/utils";
import type { SensitiveEvent } from "@/actions/super-insights";

/** Feed of high-blast-radius admin actions (cost corrections, deletions, recounts). */
export default function SensitiveFeed({ events, limit }: { events: SensitiveEvent[]; limit?: number }) {
    const rows = limit ? events.slice(0, limit) : events;

    if (rows.length === 0) {
        return (
            <div className="text-center py-10 text-sm text-slate-500 dark:text-slate-400">
                No sensitive actions recorded.
            </div>
        );
    }

    return (
        <ul className="space-y-2">
            {rows.map((e) => (
                <li key={e.id} className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-slate-50 dark:bg-white/[0.03]">
                    <div className="w-8 h-8 rounded-xl bg-accent-pink/10 text-accent-pink flex items-center justify-center shrink-0 mt-0.5">
                        <ShieldAlert className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-accent-pink bg-accent-pink/10 px-2 py-0.5 rounded-full">
                                {e.actionType.replace(/_/g, " ")}
                            </span>
                            <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{e.actorName}</span>
                            <span className="text-[11px] text-slate-400 dark:text-slate-500">{e.actorRole}</span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 truncate">
                            {e.message || `${e.entityType}${e.entityId != null ? ` #${e.entityId}` : ""}`}
                        </p>
                    </div>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap shrink-0" title={formatSaudiDate(e.timestamp)}>
                        {formatRelativeAge(e.timestamp)}
                    </span>
                </li>
            ))}
        </ul>
    );
}
