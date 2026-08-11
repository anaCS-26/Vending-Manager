import { OfflineIndicator } from "@/components/OfflineIndicator";

/**
 * Exists solely to hang the connection/sync banner above every driver route.
 * The driver portal has no persistent nav of its own — each screen is its own
 * full-bleed card — so this is the one shared piece of chrome.
 */
export default function DriverLayout({ children }: { children: React.ReactNode }) {
    return (
        <>
            <OfflineIndicator />
            {children}
        </>
    );
}
