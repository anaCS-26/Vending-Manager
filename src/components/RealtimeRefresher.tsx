"use client";

import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";

/**
 * Mounts the realtime polling hook once per page tree. Renders nothing.
 * Place inside a server-component layout so every page underneath gets
 * auto-refresh on data mutations from a single shared poll.
 */
export function RealtimeRefresher() {
    useRealtimeRefresh();
    return null;
}
