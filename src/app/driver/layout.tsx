import { auth } from "@/auth";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { WhatsNewPrompt } from "@/components/whats-new/WhatsNewPrompt";
import { getUnseenWhatsNew } from "@/lib/whats-new-server";

/**
 * Hangs the connection/sync banner above every driver route, and shows unseen
 * release notes once. The driver portal has no persistent nav of its own — each
 * screen is its own full-bleed card — so this is the one shared piece of chrome.
 *
 * Only real drivers are prompted here. An admin shadowing the portal is an
 * "admin" audience and has already been shown their notes by the admin layout;
 * prompting them again with the driver set would also write nothing useful to
 * AnnouncementSeen.
 */
export default async function DriverLayout({ children }: { children: React.ReactNode }) {
    const session = await auth();
    const isDriver = (session?.user as { role?: string } | undefined)?.role === "driver";
    const unseen = isDriver ? await getUnseenWhatsNew(session) : [];

    return (
        <>
            <OfflineIndicator />
            {children}
            <WhatsNewPrompt entries={unseen} />
        </>
    );
}
