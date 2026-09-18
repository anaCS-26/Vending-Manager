"use client";

import { useEffect } from "react";
import { reportClientError } from "@/actions/support";

/** Per page load. A render loop can throw hundreds of times a second. */
const MAX_REPORTS = 3;

/** Browser noise that is never this app's bug. */
const IGNORED = [/ResizeObserver loop/i, /^Script error\.?$/i, /Load failed/i, /NetworkError/i, /Failed to fetch/i];

/**
 * Sends uncaught browser errors to the ErrorEvent table, so a crash on a
 * driver's phone is known about before (or without) anyone describing it.
 * Mounted once in the root layout; renders nothing.
 *
 * Three guards against making things worse:
 * - capped at MAX_REPORTS and de-duplicated by message;
 * - a re-entrancy flag, because the beacon is itself a network call whose
 *   rejection would raise `unhandledrejection` and report itself forever;
 * - network failures are ignored outright — an offline driver is the normal
 *   case here, not an error, and the beacon could not be delivered anyway.
 *
 * On the public routes (/login …) the action's guard rejects and the rejection
 * is swallowed: nothing unauthenticated is ever written.
 */
export function ClientErrorReporter() {
    useEffect(() => {
        let sent = 0;
        let sending = false;
        const seen = new Set<string>();

        const report = (message: string, stack?: string) => {
            if (sending || sent >= MAX_REPORTS || !message || seen.has(message)) return;
            if (IGNORED.some((re) => re.test(message))) return;
            if (!navigator.onLine) return;
            seen.add(message);
            sent += 1;
            sending = true;
            reportClientError({ source: "client", message, stack, path: window.location.pathname })
                .catch(() => undefined)
                .finally(() => {
                    sending = false;
                });
        };

        const onError = (e: ErrorEvent) => report(e.message, e.error instanceof Error ? e.error.stack : undefined);
        const onRejection = (e: PromiseRejectionEvent) => {
            const reason: unknown = e.reason;
            if (reason instanceof Error) report(reason.message, reason.stack);
            else if (typeof reason === "string") report(reason);
        };

        window.addEventListener("error", onError);
        window.addEventListener("unhandledrejection", onRejection);
        return () => {
            window.removeEventListener("error", onError);
            window.removeEventListener("unhandledrejection", onRejection);
        };
    }, []);

    return null;
}
