"use client";

import { ErrorState } from "@/components/ErrorState";

/** Catch-all for routes outside /admin, /driver and /super (e.g. /login). */
export default function RootError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-neo-bg">
            <ErrorState error={error} reset={reset} homeHref="/login" homeLabel="Sign in" />
        </div>
    );
}
