"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CloudUpload, WifiOff } from "lucide-react";
import { useDriverStore } from "@/stores/useDriverStore";

/**
 * Connection and sync state for the whole driver portal.
 *
 * This used to exist only as a pill inside `DriverRefillUI`'s header, so a
 * driver who left the refill screen — or who opened the app on /driver/settings
 * — had no way to tell whether their last count was on the server or still
 * sitting in IndexedDB. Queued work that is invisible is queued work a driver
 * assumes was saved.
 *
 * Deliberately in normal flow — not `sticky` and not `fixed`. `DriverRefillUI`'s
 * machine selector is already `sticky top-0`, so a second pinned bar would land
 * on top of it and hide half the control the driver needs *while offline*, which
 * is the one moment this banner exists for. Persistent visibility isn't needed
 * anyway: the Submit button reads "Save Offline" the whole time the connection
 * is down, so the refill screen states it where it matters. This carries the
 * state on arrival and on every other driver route.
 *
 * Renders nothing at all when online with an empty queue.
 */
export function OfflineIndicator() {
    const offlineLogs = useDriverStore((s) => s.offlineLogs);
    const [isOffline, setIsOffline] = useState(false);

    // The store rehydrates from IndexedDB asynchronously and `navigator` doesn't
    // exist on the server, so both inputs are client-only. Render nothing until
    // mounted rather than risk a hydration mismatch on the driver's first paint.
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        setIsOffline(!navigator.onLine);

        const goOnline = () => setIsOffline(false);
        const goOffline = () => setIsOffline(true);
        window.addEventListener("online", goOnline);
        window.addEventListener("offline", goOffline);
        return () => {
            window.removeEventListener("online", goOnline);
            window.removeEventListener("offline", goOffline);
        };
    }, []);

    const pending = offlineLogs.length;
    const visible = mounted && (isOffline || pending > 0);

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="relative z-30 overflow-hidden"
                    role="status"
                    aria-live="polite"
                >
                    <div
                        className={`flex items-center justify-center gap-2 px-4 py-2 text-[11px] font-bold text-white pt-safe ${
                            isOffline ? "bg-amber-500" : "bg-accent-blue"
                        }`}
                        style={{ ["--safe-extra" as string]: "0.5rem" }}
                    >
                        {isOffline ? (
                            <>
                                <WifiOff className="w-3.5 h-3.5 shrink-0" />
                                <span>Offline — saving to this device</span>
                            </>
                        ) : (
                            <>
                                <CloudUpload className="w-3.5 h-3.5 shrink-0" />
                                {/* Only the refill screen drains the queue, so say so
                                    rather than implying it will clear on its own. */}
                                <span>Waiting to sync — open Refill to upload</span>
                            </>
                        )}
                        {pending > 0 && (
                            <span className="bg-black/20 px-2 py-0.5 rounded-full shrink-0">
                                {pending} pending
                            </span>
                        )}
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
