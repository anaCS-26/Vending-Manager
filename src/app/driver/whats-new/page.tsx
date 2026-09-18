import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { WhatsNewList } from "@/components/whats-new/WhatsNewList";
import { entriesFor } from "@/lib/whats-new";

export default function DriverWhatsNewPage() {
    return (
        <div className="min-h-[100dvh] bg-slate-50 dark:bg-neo-bg text-slate-900 dark:text-white px-4 pt-safe pb-safe" style={{ ["--safe-extra" as string]: "1.5rem" }}>
            <div className="mx-auto max-w-md">
                <Link
                    href="/driver/settings"
                    className="mb-4 inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-400"
                >
                    <ArrowLeft className="h-5 w-5" /> Back
                </Link>
                <WhatsNewList entries={entriesFor("driver")} />
            </div>
        </div>
    );
}
