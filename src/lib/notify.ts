import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

/**
 * ============================================================================
 * LIGHTWEIGHT REAL-TIME REFRESH SYSTEM
 * Synchronizes client-side UI with server-side mutations using version polling.
 * Replaces complex SSE logic with efficient version-check polling to trigger 
 * Next.js router.refresh() only when data integrity has changed.
 * ============================================================================
 */

const SIGNAL_DIR = join(process.cwd(), ".sse");
const VERSION_FILE = join(SIGNAL_DIR, "version");

/** 
 * Bootstraps the signal directory for version orchestration. 
 */
function ensureDir() {
    if (!existsSync(SIGNAL_DIR)) {
        mkdirSync(SIGNAL_DIR, { recursive: true });
    }
}

/** 
 * Reads the latest system data version from the filesystem or returns 0 as fallback. 
 */
function getVersion(): number {
    try {
        if (existsSync(VERSION_FILE)) {
            return parseInt(readFileSync(VERSION_FILE, "utf-8").trim(), 10) || 0;
        }
    } catch { /* ignore */ }
    return 0;
}

/** 
 * Signals a data mutation by incrementing the system version count. 
 * Clients polling /api/version will detect this change and trigger an UI refresh. 
 */
export function notifyClients(_eventType: string): void {
    try {
        ensureDir();
        const current = getVersion();
        writeFileSync(VERSION_FILE, String(current + 1), "utf-8");
    } catch {
        // Soft failure: Clients will miss the atomic trigger but sync on next scheduled poll.
    }
}

/** Retrieves the current data version for client-side comparison and polling. */
export function getDataVersion(): number {
    return getVersion();
}
