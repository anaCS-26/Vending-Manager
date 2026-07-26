"use client";

import { useEffect, useRef } from "react";

/**
 * Keyboard and focus behaviour for modals.
 *
 * Deliberately a hook rather than a <Modal> wrapper: the modals in this app have
 * genuinely different chrome (sizes, z-indices, framer-motion variants, and the
 * warehouse/machine audit pair that is kept visually in sync on purpose — see
 * CLAUDE.md). Wrapping them all in one component would flatten those differences
 * and turn an accessibility fix into a visual rewrite. This adds the behaviour
 * to existing markup instead:
 *
 *   const { panelRef, dialogProps } = useModalBehavior({ isOpen, onClose });
 *   ...
 *   <div ref={panelRef} {...dialogProps} className="(unchanged)">
 *
 * Provides: Escape to close, a Tab focus trap, focus restore to whatever was
 * focused before opening, `role="dialog" aria-modal="true"`, and body scroll
 * lock (ref-counted, so stacked modals don't unlock each other early).
 */

const FOCUSABLE = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
].join(",");

/** Module-level so N stacked modals unlock the body only when the last closes. */
let scrollLockCount = 0;

/**
 * Deliberately not `offsetParent !== null`: that returns null for any
 * position:fixed element — which is exactly what a modal panel is — and is
 * always null under jsdom, so it silently disables the trap in tests too.
 * getComputedStyle is accurate in both.
 */
function isVisible(el: HTMLElement): boolean {
    if (el.hidden) return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
}

type Options = {
    isOpen: boolean;
    onClose: () => void;
    /** Set false for modals holding typed data you don't want Esc to discard. */
    closeOnEscape?: boolean;
    /** Accessible name. Prefer `labelledBy` pointing at the visible heading. */
    labelledBy?: string;
    label?: string;
};

export function useModalBehavior({
    isOpen,
    onClose,
    closeOnEscape = true,
    labelledBy,
    label,
}: Options) {
    const panelRef = useRef<HTMLDivElement | null>(null);
    // Held in a ref so the escape/trap effect doesn't need onClose in its deps
    // (callers almost always pass an inline arrow, which changes every render).
    // Assigned in an effect, not during render: writing a ref while rendering is
    // unsafe under concurrent React, where a render can be discarded or replayed.
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    });

    // --- Escape + focus trap ---
    useEffect(() => {
        if (!isOpen) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && closeOnEscape) {
                e.stopPropagation();
                onCloseRef.current();
                return;
            }
            if (e.key !== "Tab") return;

            const panel = panelRef.current;
            if (!panel) return;

            const focusable = Array.from(
                panel.querySelectorAll<HTMLElement>(FOCUSABLE),
            ).filter(isVisible);
            if (focusable.length === 0) {
                // Nothing focusable inside — keep focus on the panel rather than
                // letting Tab walk into the page behind the backdrop.
                e.preventDefault();
                panel.focus();
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const active = document.activeElement as HTMLElement | null;

            if (e.shiftKey && (active === first || !panel.contains(active))) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && active === last) {
                e.preventDefault();
                first.focus();
            }
        };

        document.addEventListener("keydown", onKeyDown, true);
        return () => document.removeEventListener("keydown", onKeyDown, true);
    }, [isOpen, closeOnEscape]);

    // --- Initial focus + restore on close ---
    useEffect(() => {
        if (!isOpen) return;

        const previouslyFocused = document.activeElement as HTMLElement | null;

        // Defer a frame: with framer-motion the panel may not be mounted yet.
        const raf = requestAnimationFrame(() => {
            const panel = panelRef.current;
            if (!panel) return;
            const first = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).find(isVisible);
            (first ?? panel).focus();
        });

        return () => {
            cancelAnimationFrame(raf);
            // Only restore if focus is still somewhere in the (closing) modal or
            // nowhere useful — never yank it from wherever the user moved on to.
            const active = document.activeElement;
            const stillInModal = panelRef.current?.contains(active) ?? false;
            if ((stillInModal || active === document.body) && previouslyFocused?.isConnected) {
                previouslyFocused.focus();
            }
        };
    }, [isOpen]);

    // --- Body scroll lock ---
    useEffect(() => {
        if (!isOpen) return;

        if (scrollLockCount === 0) {
            document.body.dataset.prevOverflow = document.body.style.overflow;
            document.body.style.overflow = "hidden";
        }
        scrollLockCount += 1;

        return () => {
            scrollLockCount = Math.max(0, scrollLockCount - 1);
            if (scrollLockCount === 0) {
                document.body.style.overflow = document.body.dataset.prevOverflow ?? "";
                delete document.body.dataset.prevOverflow;
            }
        };
    }, [isOpen]);

    return {
        panelRef,
        dialogProps: {
            role: "dialog" as const,
            "aria-modal": true as const,
            ...(labelledBy ? { "aria-labelledby": labelledBy } : {}),
            ...(label ? { "aria-label": label } : {}),
            // Lets the panel itself hold focus when it contains nothing focusable.
            tabIndex: -1,
        },
    };
}
