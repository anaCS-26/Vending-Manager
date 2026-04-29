"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

/**
 * Push-based realtime refresh.
 *
 * Subscribes to UPDATE events on the single `SystemMeta` row whose
 * `key = 'realtime_version'`. The server bumps that row's `version`
 * column every time a mutation calls `notifyClients()`. When Supabase
 * pushes the change down the WebSocket, we call `router.refresh()` so
 * server components re-render with fresh data.
 *
 * Replaces the previous Upstash + 3-second polling loop. Latency is
 * now ~50ms instead of up to 3s, and there's zero background traffic
 * when nothing is changing.
 *
 * Hidden tabs still receive pushes (small) but the React tree behind
 * them won't re-render visibly until they're brought back into view —
 * Next.js handles that under the hood.
 */
export function useRealtimeRefresh() {
    const router = useRouter();

    useEffect(() => {
        const supabase = getSupabaseBrowserClient();

        const channel = supabase
            .channel("vms:realtime-version")
            .on(
                "postgres_changes",
                {
                    // No filter — SystemMeta is intended to hold a single
                    // version row, so any change on it is the one we care
                    // about. Filtered UPDATE subscriptions in Supabase
                    // Realtime require REPLICA IDENTITY FULL on the table,
                    // which we'd rather not add for one extra column.
                    event: "*",
                    schema: "public",
                    table: "SystemMeta",
                },
                () => {
                    router.refresh();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [router]);
}
