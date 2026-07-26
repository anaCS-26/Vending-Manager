"use client";

import { ErrorState } from "@/components/ErrorState";

/**
 * The driver-facing boundary. Copy is written for someone standing at a machine
 * with bad signal, not for a developer — a dead screen with no way forward is a
 * support call.
 */
export default function DriverError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-neo-bg">
            <ErrorState
                error={error}
                reset={reset}
                homeHref="/driver"
                homeLabel="Reload portal"
                title="Couldn't load your route"
                description="This is usually a weak signal. Anything you already submitted is saved. Move somewhere with better reception and try again."
            />
        </div>
    );
}
