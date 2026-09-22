"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sparkles, X } from "lucide-react";
import { Bi } from "@/components/Bi";
import { WhatsNewCard } from "@/components/whats-new/WhatsNewCard";
import { hintFor, type WhatsNewEntry } from "@/lib/whats-new";

const DISMISSED_KEY = "vms:whats-new-hints-closed";

function readDismissed(): string[] {
    try {
        const raw = window.localStorage.getItem(DISMISSED_KEY);
        const ids = raw ? (JSON.parse(raw) as unknown) : [];
        return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
    } catch {
        return [];
    }
}

/**
 * "New on this page": one line at the top of the screen a recent note is
 * about, with "Show me" to read it in place and ✕ to close it for good on this
 * device. The pop-up after a deploy catches people when they aren't doing the
 * task; this catches them when they are, which is when a note is worth reading.
 *
 * `entries` is the admin set, pre-filtered by the layout to notes recent enough
 * to hint (so the whole back-catalogue isn't shipped to every page). The choice
 * of note is `hintFor`. Closing is local, not `AnnouncementSeen`: the strip is
 * a reminder, and the receipts already record the prompt that announced it.
 * Nothing renders until mount — it depends on localStorage and the clock.
 */
export function WhatsNewHint({ entries }: { entries: WhatsNewEntry[] }) {
    const pathname = usePathname();
    const [dismissed, setDismissed] = useState<string[] | null>(null);
    const [open, setOpen] = useState(false);

    useEffect(() => setDismissed(readDismissed()), []);
    // A different page is a different hint; start it closed.
    useEffect(() => setOpen(false), [pathname]);

    if (dismissed === null) return null;
    const entry = hintFor(pathname, entries, dismissed, new Date());
    if (!entry) return null;

    const close = () => {
        const next = [...dismissed, entry.id];
        setDismissed(next);
        try {
            window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
        } catch {
            // Private mode: it just comes back next visit.
        }
    };

    return (
        <aside
            aria-label="New on this page"
            className="mb-4 rounded-2xl border border-accent-blue/30 bg-accent-blue/10 dark:bg-accent-blue/[0.08]"
        >
            <div className="flex items-start gap-3 py-2 pl-4 pr-2">
                <Sparkles className="mt-2.5 h-5 w-5 shrink-0 text-accent-blue" />
                <div className="min-w-0 flex-1 pt-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-accent-blue">
                        <Bi inline en="New on this page" ar="جديد في هذه الصفحة" />
                    </p>
                    <p className="mt-0.5 text-sm font-bold text-slate-900 dark:text-white">
                        <Bi inline en={entry.title.en} ar={entry.title.ar} />
                    </p>
                    <button
                        type="button"
                        onClick={() => setOpen((o) => !o)}
                        aria-expanded={open}
                        className="-ml-2 min-h-11 rounded-xl px-2 text-sm font-bold text-accent-blue hover:bg-accent-blue/10"
                    >
                        {open ? <Bi inline en="Hide" ar="إخفاء" /> : <Bi inline en="Show me" ar="اعرض" />}
                    </button>
                </div>
                <button
                    type="button"
                    onClick={close}
                    aria-label="Close — don't show this again"
                    title="Don't show this again"
                    className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-accent-blue/10 dark:text-slate-400"
                >
                    <X className="h-5 w-5" />
                </button>
            </div>
            {open && (
                <div className="max-w-2xl px-4 pb-4">
                    <WhatsNewCard entry={entry} showTitle={false} showDate={false} showLink={false} />
                </div>
            )}
        </aside>
    );
}
