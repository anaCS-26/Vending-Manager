"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

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
 * a client's admin. The `digest` is shown instead — it's the stable id Vercel
 * logs against, so it's what support actually needs. Full text still shows in
 * development.
 */
export function ErrorState({
    error,
    reset,
    homeHref,
    homeLabel,
    title = "Something went wrong",
    description = "This page failed to load. It's usually temporary — try again.",
}: Props) {
    useEffect(() => {
        // No error tracker is wired up yet (see the backlog), so at minimum get
        // it into the Vercel function logs rather than losing it entirely.
        console.error("[error-boundary]", error);
    }, [error]);

    return (
        <div className="flex min-h-[60vh] items-center justify-center p-4">
            <div className="glass-panel w-full max-w-md rounded-3xl p-8 text-center">
                <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-accent-pink/20 bg-accent-pink/10 text-accent-pink">
                    <AlertTriangle className="h-8 w-8" />
                </div>

                <h1 className="mb-2 text-xl font-bold text-slate-900 dark:text-white">{title}</h1>
                <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">{description}</p>

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
                        <RotateCcw className="h-4 w-4" />
                        Try again
                    </button>
                    <Link
                        href={homeHref}
                        className="flex-1 rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 font-medium text-slate-900 transition-colors hover:bg-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                    >
                        {homeLabel}
                    </Link>
                </div>

                {error.digest && (
                    <p className="mt-5 font-mono text-[11px] text-slate-400 dark:text-slate-500">
                        Reference: {error.digest}
                    </p>
                )}
            </div>
        </div>
    );
}
