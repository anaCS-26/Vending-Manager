"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, X } from "lucide-react";
import { markAnnouncementsSeen } from "@/actions/support";
import { useModalBehavior } from "@/hooks/useModalBehavior";
import { Bi } from "@/components/Bi";
import { WhatsNewCard } from "@/components/whats-new/WhatsNewCard";
import { PROMPT_LIMIT, type WhatsNewEntry } from "@/lib/whats-new";

/**
 * Shows unseen release notes once, the first time a user opens the app after a
 * deploy. Mounted by the admin and driver layouts, which compute `entries`
 * on the server from `AnnouncementSeen` — so there is no flash of a prompt the
 * user already dismissed on another device.
 *
 * Two deliberate behaviours:
 * - At most PROMPT_LIMIT cards are shown, but dismissing marks EVERY unseen
 *   entry as seen. On first rollout the whole back-catalogue is "unseen", and
 *   a prompt that comes back three more times is a prompt people learn to close
 *   unread. The rest stay on the What's New page.
 * - Any way out (Got it, ✕, backdrop, Escape, following "Try it") counts as
 *   seen. "Seen" means "was shown", not "was read" — nothing can measure that.
 */
export function WhatsNewPrompt({ entries }: { entries: WhatsNewEntry[] }) {
    const titleId = useId();
    const [open, setOpen] = useState(entries.length > 0);
    const [index, setIndex] = useState(0);
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const shown = entries.slice(0, PROMPT_LIMIT);

    const dismiss = () => {
        setOpen(false);
        // Fire and forget from the browser's side: a failure just means the
        // prompt reappears next time, which is the safe direction to fail in.
        markAnnouncementsSeen(entries.map((e) => e.id)).catch(() => undefined);
    };

    const { panelRef, dialogProps } = useModalBehavior({ isOpen: open, onClose: dismiss, labelledBy: titleId });

    if (!mounted || !open || shown.length === 0) return null;

    const isLast = index >= shown.length - 1;

    return createPortal(
        <div className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center sm:p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={dismiss} />
            <div
                ref={panelRef}
                {...dialogProps}
                className="relative w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto overscroll-contain bg-white dark:bg-neo-bg border border-slate-200 dark:border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 sm:p-6 pb-safe"
                style={{ ["--safe-extra" as string]: "1.25rem" }}
            >
                <div className="flex items-center justify-between gap-3 mb-5">
                    <p id={titleId} className="flex items-center gap-2 text-sm font-bold text-accent-blue">
                        <Sparkles className="w-4 h-4" />
                        <Bi inline en="What's new" ar="ما الجديد" />
                    </p>
                    <button
                        type="button"
                        onClick={dismiss}
                        aria-label="Close"
                        className="w-11 h-11 rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* key: remount so a video restarts from 0 on each card. */}
                <WhatsNewCard key={shown[index].id} entry={shown[index]} onNavigate={dismiss} showDate={false} />

                <div className="mt-6 flex items-center gap-3">
                    {shown.length > 1 && (
                        <div className="flex items-center gap-1.5" aria-label={`${index + 1} / ${shown.length}`}>
                            {shown.map((e, i) => (
                                <span
                                    key={e.id}
                                    className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-accent-blue" : "w-1.5 bg-slate-300 dark:bg-white/20"}`}
                                />
                            ))}
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={isLast ? dismiss : () => setIndex((i) => i + 1)}
                        className="ml-auto min-h-[48px] min-w-[8rem] rounded-xl bg-accent-blue px-6 font-bold text-white hover:bg-accent-blue/90"
                    >
                        {isLast ? <Bi inline en="Got it" ar="تم" /> : <Bi inline en="Next" ar="التالي" />}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
