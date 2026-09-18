import prisma from "@/lib/prisma";
import { audienceForRole, unseenEntries, type WhatsNewEntry } from "@/lib/whats-new";

/**
 * Unseen release notes for whoever this session belongs to. Called from the
 * admin and driver layouts (Server Components) — one indexed lookup per full
 * page load; layouts persist across client navigations, so not per click.
 *
 * Never throws: a release note is not worth a broken dashboard. If the table is
 * unreachable (or not pushed yet) the user simply isn't prompted this time.
 */
export async function getUnseenWhatsNew(session: { user?: unknown } | null): Promise<WhatsNewEntry[]> {
    try {
        const user = session?.user as { id?: string; role?: string } | undefined;
        const audience = audienceForRole(user?.role);
        const id = parseInt(user?.id ?? "", 10);
        if (!audience || !Number.isFinite(id)) return [];

        const rows = await prisma.announcementSeen.findMany({
            where: user?.role === "driver" ? { driverId: id } : { adminId: id },
            select: { entryId: true },
        });
        return unseenEntries(audience, rows.map((r) => r.entryId));
    } catch (err) {
        console.error("[whats-new] could not load seen receipts:", err);
        return [];
    }
}
