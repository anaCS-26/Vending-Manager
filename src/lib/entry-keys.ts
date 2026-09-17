import type { KeyboardEvent } from "react";

/**
 * Spreadsheet-style keys for the long admin grids: Enter / ↓ move to the next
 * field, Shift+Enter / ↑ to the previous one.
 *
 * Every one of those grids — PO receiving, the two recounts, the template
 * editor — is keyed from a sheet of paper, one number per row. Tab works but
 * visits every button on the way; on a 60-line recount that is three presses
 * per row instead of one. Opt in per screen: put `data-entry-group` on the
 * container and `data-entry` on the inputs that belong to the run, and only
 * those are visited. Leave rarely-edited fields (the three sell prices at
 * receiving) unmarked so Enter skips them; Tab still reaches them.
 *
 * Order is DOM order, so it follows whatever sort the screen is showing.
 * The target's contents are selected so typing replaces the old number — done
 * here, on an explicit keypress, and never from `onFocus` (mobile re-fires
 * focus between keystrokes; see NumericInput in CLAUDE.md).
 */
export function moveEntryFocus(current: HTMLInputElement, step: 1 | -1): boolean {
    const group = current.closest("[data-entry-group]");
    if (!group) return false;
    const fields = Array.from(group.querySelectorAll<HTMLInputElement>("input[data-entry]:not(:disabled)"));
    const next = fields[fields.indexOf(current) + step];
    if (!next) return false;
    next.focus();
    next.select();
    return true;
}

/** `onKeyDown` for a `data-entry` input. `enter: false` leaves Enter to the caller. */
export function entryKeyNav(e: KeyboardEvent<HTMLInputElement>, { enter = true }: { enter?: boolean } = {}): void {
    if (e.nativeEvent.isComposing) return;
    let step: 1 | -1 | null = null;
    if (e.key === "ArrowDown") step = 1;
    else if (e.key === "ArrowUp") step = -1;
    else if (e.key === "Enter" && enter) step = e.shiftKey ? -1 : 1;
    if (step === null) return;
    e.preventDefault();
    moveEntryFocus(e.currentTarget, step);
}
