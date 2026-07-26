"use client";

import { ErrorState } from "@/components/ErrorState";

export default function AdminError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return <ErrorState error={error} reset={reset} homeHref="/admin" homeLabel="Dashboard" />;
}
