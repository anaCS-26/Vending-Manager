import { ChevronDown, History, Sparkles } from "lucide-react";
import { Bi } from "@/components/Bi";
import { WhatsNewCard } from "@/components/whats-new/WhatsNewCard";
import { formatSaudiDate } from "@/lib/utils";
import { pageSections, replacementFor, type WhatsNewEntry } from "@/lib/whats-new";

/**
 * The permanent list behind /admin/whats-new and /driver/whats-new, laid out
 * so it stays worth opening as it grows (see `pageSections`):
 *
 *   1. The latest release, open — the only thing most visits are for.
 *   2. Everything older, one title per row under its month, opening on tap.
 *      A native <details>, so it needs no client JS and works with a keyboard.
 *   3. Outdated notes behind a single link at the bottom.
 *
 * It used to render every note ever written fully open, outdated ones
 * included, each in two languages: a page that long is a page nobody reads.
 */
export function WhatsNewList({ entries }: { entries: WhatsNewEntry[] }) {
    const { latest, earlier, outdated } = pageSections(entries);

    return (
        <div className="space-y-8">
            <div>
                <h1 className="flex items-center gap-3 text-2xl md:text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                    <Sparkles className="h-7 w-7 shrink-0 text-accent-blue" />
                    <Bi en="What's new" ar="ما الجديد" />
                </h1>
                <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                    <Bi
                        en="The newest change is open below. Tap an older title to read it."
                        ar="أحدث تغيير مفتوح في الأسفل. اضغط على أي عنوان أقدم لقراءته."
                    />
                </p>
            </div>

            {latest.length > 0 && (
                <section className="space-y-3" aria-label="Latest">
                    <SectionLabel en="Latest" ar="الأحدث" />
                    {latest.map((entry) => (
                        <div key={entry.id} id={entry.id} className="glass-panel rounded-3xl p-5 sm:p-6 scroll-mt-6">
                            <WhatsNewCard entry={entry} />
                        </div>
                    ))}
                </section>
            )}

            {earlier.map((group) => (
                <section key={group.month} className="space-y-3" aria-label={monthLabel(group.month).en}>
                    <SectionLabel {...monthLabel(group.month)} />
                    <div className="glass-panel rounded-3xl overflow-hidden divide-y divide-slate-200 dark:divide-white/5">
                        {group.entries.map((entry) => (
                            <details key={entry.id} id={entry.id} className="group scroll-mt-6">
                                <summary className="flex min-h-[56px] cursor-pointer list-none items-center gap-3 px-5 py-3 hover:bg-slate-50 dark:hover:bg-white/[0.03] [&::-webkit-details-marker]:hidden">
                                    <span className="min-w-0 flex-1 font-bold text-slate-900 dark:text-white">
                                        <Bi en={entry.title.en} ar={entry.title.ar} />
                                    </span>
                                    <ChevronDown className="h-5 w-5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
                                </summary>
                                <div className="px-5 pb-5 pt-1">
                                    <WhatsNewCard entry={entry} showTitle={false} />
                                </div>
                            </details>
                        ))}
                    </div>
                </section>
            ))}

            {outdated.length > 0 && (
                <details className="group">
                    <summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center gap-2 rounded-xl px-2 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 [&::-webkit-details-marker]:hidden">
                        <History className="h-4 w-4 shrink-0" />
                        <Bi
                            inline
                            en={`Older notes that have since changed (${outdated.length})`}
                            ar={`ملاحظات قديمة تغيّرت بعدها (${outdated.length})`}
                        />
                        <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="mt-4 space-y-4">
                        {outdated.map((entry) => (
                            <div key={entry.id} id={entry.id} className="glass-panel rounded-3xl p-5 sm:p-6 scroll-mt-6 opacity-70">
                                <WhatsNewCard entry={entry} replacement={replacementFor(entry, entries)} />
                            </div>
                        ))}
                    </div>
                </details>
            )}
        </div>
    );
}

function SectionLabel({ en, ar }: { en: string; ar: string }) {
    return (
        <h2 className="px-1 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
            <Bi inline en={en} ar={ar} />
        </h2>
    );
}

/** "September 2026 · سبتمبر ٢٠٢٦" for a "YYYY-MM" key. Gregorian in both — the app's dates are. */
function monthLabel(month: string): { en: string; ar: string } {
    const mid = `${month}-15T12:00:00+03:00`;
    return {
        en: formatSaudiDate(mid, { month: "long", year: "numeric" }),
        ar: new Date(mid).toLocaleDateString("ar", { month: "long", year: "numeric", calendar: "gregory", timeZone: "Asia/Riyadh" }),
    };
}
