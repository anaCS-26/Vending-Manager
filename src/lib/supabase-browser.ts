"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client.
 *
 * Used exclusively for the Realtime subscription in `useRealtimeRefresh`.
 * Database reads/writes still go through Prisma on the server — this
 * client never touches the actual data tables.
 *
 * The anon key is public-by-design (visible in the client bundle); RLS
 * on the Supabase side is what protects sensitive tables. The
 * `SystemMeta` table this client subscribes to contains only an opaque
 * version counter, so it has no privacy concerns even if read.
 */

let cached: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
    if (cached) return cached;

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
        throw new Error(
            "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in environment."
        );
    }

    cached = createClient(url, anonKey, {
        auth: { persistSession: false }, // we use NextAuth, not Supabase auth
        realtime: {
            params: { eventsPerSecond: 5 }, // generous cap; one row, one channel
        },
    });

    return cached;
}
