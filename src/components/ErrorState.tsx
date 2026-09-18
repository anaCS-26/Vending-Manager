"use client";

import { AlertTriangle, MessageSquareWarning, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { reportClientError } from "@/actions/support";
import { Bi } from "@/components/Bi";
import { ReportProblemModal } from "@/components/support/ReportProblemModal";

type Props = {
    error: Error & { digest?: string };
    reset: () => void;
    /** Where "go back" should point for this zone. */
    homeHref: string;
    homeLabel: string;
    title?: string;
    description?: string;
};

/**
 * Shared body for the route-level error boundaries.
 *
 * Deliberately does NOT render `error.message` in production. Server actions in
 * this codebase surface raw Prisma errors (constraint names, column names) and
 * an error boundary is the last place that should be echoed back to a driver or
 * a client's admin. A reference code is shown instead. Full text still shows in
 * development.
 *
 * The code on screen is always one that resolves at /super/support: on mount
 * the failure is recorded as an ErrorEvent under the Next `digest` when there is
 * one (server-render failures — the same id Vercel logs against), or under a
 * freshly minted `E-` code when there isn't (errors thrown in the browser have
 * no digest, and used to show no reference at all). "Report this problem" then
 * opens the report form with that code already attached.
 *
 * Copy is Arabic + English: this is the screen someone is most likely to
 * photograph and send, and the least likely to be able to describe.
 */
export function ErrorState({ error, reset, homeHref, homeLabel, title, description }: Props) {
    const pathname = usePathname();
    const [code, setCode] = useState<string | null>(error.digest ?? null);
    // Unknown until the beacon answers: the root boundary also serves signed-out
    // visitors, who can't file a report, so the button must not be offered blind.
    const [canReport, setCanReport] = useState(false);
    const [reportOpen, setReportOpen] = useState(false);

    useEffect(() => {
        console.error("[error-boundary]", error);
        let cancelled = false;
        reportClientError({
            source: "boundary",
            message: error.message,
            stack: error.stack,
            digest: error.digest,
            path: pathname ?? undefined,
        })
            .then((result) => {
                if (cancelled) return;
                setCanReport(true);
                if (result.success) setCode(result.data.code);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [error, pathname]);

    return (
        <div className="flex min-h-[60vh] items-center justify-center p-4">
            <div className="glass-panel w-full max-w-md rounded-3xl p-8 text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-accent-pink/20 bg-accent-pink/10 text-accent-pink">
                    <AlertTriangle className="h-8 w-8" />
                </div>

                <h1 className="mb-2 text-xl font-bold text-slate-900 dark:text-white">
                    {title ?? <Bi en="Something went wrong" ar="حدث خطأ ما" />}
                </h1>
                <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
                    {description ?? (
                        <Bi
                            en="This page failed to load. It's usually temporary — try again."
                            ar="تعذّر تحميل هذه الصفحة. غالباً ما يكون ذلك مؤقتاً — حاول مرة أخرى."
                        />
                    )}
                </p>

                {process.env.NODE_ENV === "development" && (
                    <pre className="mb-6 max-h-40 overflow-auto rounded-xl bg-slate-100 p-3 text-left text-[11px] leading-relaxed text-slate-700 dark:bg-black/40 dark:text-slate-300">
                        {error.message}
                    </pre>
                )}

                <div className="flex gap-3">
                    <button
                        onClick={reset}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent-blue px-4 py-3 font-bold text-white transition-colors hover:bg-accent-blue/90"
                    >
                        <RotateCcw className="h-4 w-4 shrink-0" />
                        <Bi inline en="Try again" ar="حاول مجدداً" />
                    </button>
                    <Link
                        href={homeHref}
                        className="flex-1 rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 font-medium text-slate-900 transition-colors hover:bg-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                    >
                        {homeLabel}
                    </Link>
                </div>

                {canReport && (
                    <button
                        type="button"
                        onClick={() => setReportOpen(true)}
                        className="mt-3 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
                    >
                        <MessageSquareWarning className="h-4 w-4 shrink-0" />
                        <Bi inline en="Report this problem" ar="الإبلاغ عن هذه المشكلة" />
                    </button>
                )}

                {code && (
                    <p className="mt-5 font-mono text-[11px] text-slate-400 dark:text-slate-500 select-all">
                        Reference: {code}
                    </p>
                )}
            </div>

            <ReportProblemModal isOpen={reportOpen} onClose={() => setReportOpen(false)} errorCode={code} />
        </div>
    );
}
