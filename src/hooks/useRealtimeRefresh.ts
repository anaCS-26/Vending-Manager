"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { getVersion } from "@/actions/inventory";

/**
 * Smart polling hook that replaces the old 5-second blind refresh.
 *
 * How it works:
 * 1. Polls getVersion() Server Action every 3 seconds (response is ~15 bytes)
 * 2. Only calls router.refresh() when the version has actually changed
 * 3. This means: no wasted full-page re-renders when nothing changed
 *
 * This is more efficient than the original setInterval(router.refresh, 5000)
 * because router.refresh() triggers a full server re-render of every
 * server component on the page. Our approach only does that when data
 * has actually been mutated.
 */
export function useRealtimeRefresh() {
    const router = useRouter();
    const lastVersionRef = useRef<number | null>(null);

    useEffect(() => {
        let active = true;

        const poll = async () => {
            while (active) {
                if (navigator.onLine) {
                    try {
                        const v = await getVersion();
                        if (lastVersionRef.current !== null && v !== lastVersionRef.current) {
                            router.refresh();
                        }
                        lastVersionRef.current = v;
                    } catch {
                        // Network error — skip this cycle
                    }
                }
                // Wait 3 seconds before next check
                await new Promise((resolve) => setTimeout(resolve, 3000));
            }
        };

        poll();

        return () => {
            active = false;
        };
    }, [router]);
}
