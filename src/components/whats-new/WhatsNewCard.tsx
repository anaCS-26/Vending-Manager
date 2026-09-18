import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Bi } from "@/components/Bi";
import { formatSaudiDate } from "@/lib/utils";
import type { WhatsNewEntry } from "@/lib/whats-new";

/**
 * One release note. Shared by the auto-prompt and the permanent list page so
 * the two can't drift. No "use client" — it is plain markup.
 *
 * The clip comes FIRST and the text second: for a gesture ("press Enter, the
 * cursor jumps") the clip is the explanation and needs no translation; the
 * sentences under it are the fallback, not the headline.
 */
export function WhatsNewCard({
    entry,
    onNavigate,
    showDate = true,
}: {
    entry: WhatsNewEntry;
    /** Lets the prompt close itself when the user follows the link. */
    onNavigate?: () => void;
    showDate?: boolean;
}) {
    return (
        <article className="space-y-4">
            {entry.media?.type === "video" && (
                // Muted + playsInline is what lets iOS autoplay it in place
                // instead of hijacking the screen with the fullscreen player.
                <video
                    src={entry.media.src}
                    poster={entry.media.poster}
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    aria-label={`${entry.media.alt.ar} — ${entry.media.alt.en}`}
                    className="w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-black/40"
                />
            )}
            {entry.media?.type === "image" && (
                // Static asset in /public with unknown intrinsic size per entry.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={entry.media.src}
                    alt={`${entry.media.alt.ar} — ${entry.media.alt.en}`}
                    loading="lazy"
                    className="w-full rounded-2xl border border-slate-200 dark:border-white/10"
                />
            )}

            <div className="space-y-3">
                {showDate && (
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                        {formatSaudiDate(`${entry.date}T12:00:00+03:00`, { year: "numeric", month: "short", day: "numeric" })}
                    </p>
                )}
                <h3 className="font-display text-xl font-extrabold text-slate-900 dark:text-white leading-snug">
                    <Bi en={entry.title.en} ar={entry.title.ar} />
                </h3>
                <p className="text-[15px] text-slate-600 dark:text-slate-300">
                    <Bi en={entry.body.en} ar={entry.body.ar} />
                </p>
                {entry.href && (
                    <Link
                        href={entry.href}
                        onClick={onNavigate}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-accent-blue/30 bg-accent-blue/10 px-4 text-sm font-bold text-accent-blue hover:bg-accent-blue/20"
                    >
                        <Bi inline en="Try it" ar="جرّبه" />
                        <ArrowUpRight className="h-4 w-4" />
                    </Link>
                )}
            </div>
        </article>
    );
}
