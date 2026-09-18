import { Sparkles } from "lucide-react";
import { Bi } from "@/components/Bi";
import { WhatsNewCard } from "@/components/whats-new/WhatsNewCard";
import type { WhatsNewEntry } from "@/lib/whats-new";

/** The permanent, scrollable list behind /admin/whats-new and /driver/whats-new. */
export function WhatsNewList({ entries }: { entries: WhatsNewEntry[] }) {
    return (
        <div className="space-y-6">
            <div>
                <h1 className="flex items-center gap-3 text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                    <Sparkles className="h-7 w-7 shrink-0 text-accent-blue" />
                    <Bi en="What's new" ar="ما الجديد" />
                </h1>
            </div>
            <div className="space-y-4">
                {entries.map((entry) => (
                    <div key={entry.id} className="glass-panel rounded-3xl p-5 sm:p-6">
                        <WhatsNewCard entry={entry} />
                    </div>
                ))}
            </div>
        </div>
    );
}
