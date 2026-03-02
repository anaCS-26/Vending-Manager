// Smart version-based change detection.
//
// Instead of SSE (which is unreliable in Next.js Turbopack dev mode),
// we use a simple version counter. Server actions increment the counter
// on mutation. Clients poll /api/version every 3s and only call
// router.refresh() if the version changed — much more efficient than
// the original blind 5s router.refresh() polling.

import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const SIGNAL_DIR = join(process.cwd(), ".sse");
const VERSION_FILE = join(SIGNAL_DIR, "version");

function ensureDir() {
    if (!existsSync(SIGNAL_DIR)) {
        mkdirSync(SIGNAL_DIR, { recursive: true });
    }
}

function getVersion(): number {
    try {
        if (existsSync(VERSION_FILE)) {
            return parseInt(readFileSync(VERSION_FILE, "utf-8").trim(), 10) || 0;
        }
    } catch { /* ignore */ }
    return 0;
}

/**
 * Call from server actions after any data mutation.
 * Increments a version counter that clients poll against.
 */
export function notifyClients(_eventType: string): void {
    try {
        ensureDir();
        const current = getVersion();
        writeFileSync(VERSION_FILE, String(current + 1), "utf-8");
    } catch {
        // Non-critical — client will still work with next refresh
    }
}

/**
 * Returns the current data version number.
 */
export function getDataVersion(): number {
    return getVersion();
}
