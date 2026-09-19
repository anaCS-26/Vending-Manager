/**
 * Boxes vs pieces, as pure functions (no React/Prisma) — the `order-entry.ts`
 * / `refill-entry.ts` pattern. Tested in tests/lib/packaging.test.ts.
 *
 * The client's rule: stock arrives in boxes but is counted and dispatched in
 * pieces. So a box exists in exactly one place, the warehouse door, where
 * "10 boxes of 24" is multiplied out to 240 pieces before anything is stored.
 * Every stock table stays in pieces.
 *
 * Why receiving asks for a price per BOX: the supplier invoice prints one,
 * and the old screen asked for a price per piece. Production shows the two
 * being confused — AQUAFINA WATER, a 2 SAR bottle, is costed at 31 SAR because
 * a box price went into the piece field and from there into WAC. Receiving now
 * asks for exactly what the invoice prints and does the division here.
 */

export const PIECE_SIZE_UNITS = ["g", "kg", "ml", "L"] as const;
export type PieceSizeUnit = (typeof PIECE_SIZE_UNITS)[number];

/** Generous ceiling — the largest box in the live catalogue holds 40. */
export const MAX_PIECES_PER_BOX = 1000;
const MAX_PIECE_SIZE = 100_000;

export type Packaging = {
    pieces_per_box: number | null;
    piece_size: number | null;
    piece_size_unit: string | null;
};

export function isPieceSizeUnit(unit: unknown): unit is PieceSizeUnit {
    return typeof unit === "string" && (PIECE_SIZE_UNITS as readonly string[]).includes(unit);
}

/**
 * The box to count in. An item with no box size is received piece by piece,
 * i.e. in boxes of one — so every caller can multiply without a branch.
 */
export function boxSize(piecesPerBox: number | null | undefined): number {
    return typeof piecesPerBox === "number" && Number.isInteger(piecesPerBox) && piecesPerBox > 0 ? piecesPerBox : 1;
}

/** `boxes` full boxes plus `loose` pieces, in pieces. */
export function piecesFromBoxes(boxes: number, piecesPerBox: number | null | undefined, loose = 0): number {
    const b = Number.isFinite(boxes) && boxes > 0 ? Math.floor(boxes) : 0;
    const l = Number.isFinite(loose) && loose > 0 ? Math.floor(loose) : 0;
    return b * boxSize(piecesPerBox) + l;
}

/** Whole boxes in `pieces`, and the pieces left over. */
export function splitIntoBoxes(
    pieces: number,
    piecesPerBox: number | null | undefined,
): { boxes: number; loose: number } {
    if (!Number.isFinite(pieces) || pieces <= 0) return { boxes: 0, loose: 0 };
    const size = boxSize(piecesPerBox);
    const whole = Math.floor(pieces);
    return { boxes: Math.floor(whole / size), loose: whole % size };
}

/** Cost of one piece, from the invoice's price for one box. */
export function costPerPiece(boxPrice: number, piecesPerBox: number | null | undefined): number {
    if (!Number.isFinite(boxPrice) || boxPrice <= 0) return 0;
    return boxPrice / boxSize(piecesPerBox);
}

/**
 * The box price to pre-fill from a known per-piece cost, rounded to the halala
 * because that is what an invoice prints.
 */
export function boxPriceFromPieceCost(pieceCost: number, piecesPerBox: number | null | undefined): number {
    if (!Number.isFinite(pieceCost) || pieceCost <= 0) return 0;
    return Math.round(pieceCost * boxSize(piecesPerBox) * 100) / 100;
}

const trim = (n: number) => String(Math.round(n * 100) / 100);

/** "50 g", "320 ml" — or null when either half is missing. */
export function formatPieceSize(size: number | null | undefined, unit: string | null | undefined): string | null {
    if (typeof size !== "number" || !Number.isFinite(size) || size <= 0 || !unit) return null;
    return `${trim(size)} ${unit}`;
}

/**
 * One line for wherever an item is listed: "Box of 24 × 50 g". Written the way
 * the client already writes it on their own sheets ("24*50GM"), so it reads as
 * theirs. A box of one says nothing about a box, so it is left out.
 */
export function describePackaging(p: Partial<Packaging> | null | undefined): string | null {
    const size = formatPieceSize(p?.piece_size, p?.piece_size_unit);
    const perBox = typeof p?.pieces_per_box === "number" && p.pieces_per_box > 1 ? p.pieces_per_box : null;
    if (perBox && size) return `Box of ${perBox} × ${size}`;
    if (perBox) return `Box of ${perBox}`;
    return size;
}

/** "41 boxes + 16 pcs" — a piece count as boxes. Null when the item has no box. */
export function describeInBoxes(pieces: number, piecesPerBox: number | null | undefined): string | null {
    const size = boxSize(piecesPerBox);
    if (size <= 1) return null;
    const { boxes, loose } = splitIntoBoxes(pieces, size);
    const parts: string[] = [];
    if (boxes > 0) parts.push(`${boxes} ${boxes === 1 ? "box" : "boxes"}`);
    if (loose > 0) parts.push(`${loose} ${loose === 1 ? "pc" : "pcs"}`);
    return parts.length > 0 ? parts.join(" + ") : "0 boxes";
}

/**
 * How a received PO line was counted — "10 boxes of 24 + 3 pcs" — or null for
 * lines received before box counting existed, and for boxes of one.
 */
export function describeReceivedLine(line: {
    quantityReceived: number;
    boxesReceived: number | null;
    piecesPerBox: number | null;
}): string | null {
    if (line.boxesReceived === null || line.piecesPerBox === null || line.piecesPerBox <= 1) return null;
    const loose = line.quantityReceived - line.boxesReceived * line.piecesPerBox;
    const boxes = `${line.boxesReceived} ${line.boxesReceived === 1 ? "box" : "boxes"} of ${line.piecesPerBox}`;
    return loose > 0 ? `${boxes} + ${loose} ${loose === 1 ? "pc" : "pcs"}` : boxes;
}

export type PackagingInput = {
    pieces_per_box?: number | null;
    piece_size?: number | null;
    piece_size_unit?: string | null;
};

/**
 * Normalises what an admin typed into the item form. A cleared number box
 * arrives as 0 (NumericInput hands back 0 for empty), and 0 means "not set" —
 * stored as null, never as a box of nothing.
 */
export function parsePackaging(
    input: PackagingInput,
): { ok: true; value: Packaging } | { ok: false; error: string } {
    let pieces_per_box: number | null = null;
    const perBox = input.pieces_per_box ?? null;
    if (perBox !== null && perBox !== 0) {
        if (!Number.isInteger(perBox) || perBox < 1 || perBox > MAX_PIECES_PER_BOX) {
            return { ok: false, error: `Pieces per box must be a whole number from 1 to ${MAX_PIECES_PER_BOX}.` };
        }
        pieces_per_box = perBox;
    }

    let piece_size: number | null = null;
    let piece_size_unit: PieceSizeUnit | null = null;
    const size = input.piece_size ?? null;
    if (size !== null && size !== 0) {
        if (typeof size !== "number" || !Number.isFinite(size) || size < 0 || size > MAX_PIECE_SIZE) {
            return { ok: false, error: "The size of one piece must be a positive number." };
        }
        if (!isPieceSizeUnit(input.piece_size_unit)) {
            return { ok: false, error: `Choose ${PIECE_SIZE_UNITS.join(", ")} for the size of one piece.` };
        }
        piece_size = Math.round(size * 100) / 100;
        piece_size_unit = input.piece_size_unit;
    }

    return { ok: true, value: { pieces_per_box, piece_size, piece_size_unit } };
}

/**
 * Checks a received line's box breakdown against its piece total, for the
 * server. Both fields or neither; the boxes may not account for more pieces
 * than were received (whatever they don't account for is loose pieces).
 * Returns the problem, or null.
 */
export function checkReceivedBoxes(line: {
    quantityReceived: number;
    boxesReceived?: number | null;
    piecesPerBox?: number | null;
}): string | null {
    const boxes = line.boxesReceived ?? null;
    const perBox = line.piecesPerBox ?? null;
    if (boxes === null && perBox === null) return null;
    if (boxes === null || perBox === null) return "A received line needs both its box count and its box size.";
    if (!Number.isInteger(perBox) || perBox < 1 || perBox > MAX_PIECES_PER_BOX) {
        return `Pieces per box must be a whole number from 1 to ${MAX_PIECES_PER_BOX}.`;
    }
    if (!Number.isInteger(boxes) || boxes < 0) return "Boxes received must be a whole number of 0 or more.";
    if (boxes * perBox > line.quantityReceived) return "The boxes add up to more pieces than were received.";
    return null;
}
