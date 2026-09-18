import { WhatsNewList } from "@/components/whats-new/WhatsNewList";
import { entriesFor } from "@/lib/whats-new";

export default function AdminWhatsNewPage() {
    return (
        <div className="mx-auto max-w-2xl">
            <WhatsNewList entries={entriesFor("admin")} />
        </div>
    );
}
