"use client";

import { useTransition } from "react";
import { Check, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { setProblemReportResolved } from "@/actions/support";

export function ResolveReportButton({ id, resolved }: { id: number; resolved: boolean }) {
    const [isPending, startTransition] = useTransition();

    return (
        <button
            type="button"
            disabled={isPending}
            onClick={() =>
                startTransition(async () => {
                    const result = await setProblemReportResolved(id, !resolved);
                    if (!result.success) toast.error(result.error);
                })
            }
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 dark:border-white/10 px-4 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-50"
        >
            {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
            ) : resolved ? (
                <RotateCcw className="h-4 w-4" />
            ) : (
                <Check className="h-4 w-4" />
            )}
            {resolved ? "Reopen" : "Mark resolved"}
        </button>
    );
}
