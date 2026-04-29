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
                    event: "UPDATE",
                    schema: "public",
                    table: "SystemMeta",
                    filter: "key=eq.realtime_version",
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
