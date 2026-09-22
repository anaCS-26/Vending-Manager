/**
 * Cartons, packets and pieces, as pure functions (no React/Prisma) — the
 * `order-entry.ts` / `refill-entry.ts` pattern. Tested in tests/lib/packaging.test.ts.
 *
 * The client's rule: stock arrives in cartons but is counted and dispatched in
 * pieces. So a carton exists in exactly one place, the warehouse door (ordering
 * and receiving), where "5 cartons" is multiplied out to pieces before anything
 * is stored. Every stock table stays in pieces.
 *
 * Up to three levels, the way the client writes them ("8*20*5GM"):
 *
 *   carton  →  packet  →  piece
 *     8 packets of 20 pieces = 160 pieces a carton    (SIPP GREEN)
 *     40 pieces, no packets  =  40 pieces a carton    (AQUAFINA WATER)
 *
 * `Item.pieces_per_box` is the innermost unit (the packet, or the carton when
 * there are no packets) and `Item.packets_per_carton` the level above it. The
 * second level was added after the client reported that "1 carton × 8 packets
 * × 20 pieces" came out as "1 carton × packet + piece": the app used to model
 * one level, and for 26 items that level was his packet, not his carton.
 *
 * Packets are a SIZE only — they define how big a carton is. Quantities are
 * always counted as cartons + loose pieces, never as loose packets: the admin
 * reads little English, and a "packets" count beside a "packets per carton"
 * size was two meanings of one word on one line.
 *
 * Why receiving asks for a price per CARTON: the supplier invoice prints one,
 * and the old screen asked for a price per piece. Production shows the two
 * being confused — AQUAFINA WATER, a 2 SAR bottle, is costed at 31 SAR because
 * a carton price went into the piece field and from there into WAC. Receiving
 * now asks for exactly what the invoice prints and does the division here.
 */

export const PIECE_SIZE_UNITS = ["g", "kg", "ml", "L"] as const;
export type PieceSizeUnit = (typeof PIECE_SIZE_UNITS)[number];

/** Generous ceiling — the largest packet in the live catalogue holds 45. */
export const MAX_PIECES_PER_BOX = 1000;
/** Generous ceiling — the most packets in a live carton is 32 (BISKREM). */
export const MAX_PACKETS_PER_CARTON = 200;
const MAX_PIECE_SIZE = 100_000;

export type Packaging = {
    pieces_per_box: number | null;
    packets_per_carton: number | null;
    piece_size: number | null;
    piece_size_unit: string | null;
};

export function isPieceSizeUnit(unit: unknown): unit is PieceSizeUnit {
    return typeof unit === "string" && (PIECE_SIZE_UNITS as readonly string[]).includes(unit);
}

/**
 * A pack size to multiply by. Anything that isn't a positive whole number is a
 * pack of one — so every caller can multiply without a branch.
 */
export function boxSize(piecesPerBox: number | null | undefined): number {
    return typeof piecesPerBox === "number" && Number.isInteger(piecesPerBox) && piecesPerBox > 0 ? piecesPerBox : 1;
}

/**
 * The two pack sizes of an item (or of one delivery), normalised: a missing
 * level is a level of one. Packets are ignored without a packet size, since a
 * "carton of 8 packets of nothing" means nothing.
 */
export type Levels = { perPacket: number; packetsPerCarton: number };

export function levelsOf(p: { pieces_per_box?: number | null; packets_per_carton?: number | null } | null | undefined): Levels {
    const perPacket = boxSize(p?.pieces_per_box);
    if (perPacket <= 1) return { perPacket: 1, packetsPerCarton: 1 };
    return { perPacket, packetsPerCarton: boxSize(p?.packets_per_carton) };
}

/** Pieces in one carton. 1 when the item comes loose. */
export const cartonSize = (l: Levels) => l.perPacket * l.packetsPerCarton;
export const hasCarton = (l: Levels) => cartonSize(l) > 1;
export const hasPackets = (l: Levels) => l.packetsPerCarton > 1;

/** How a quantity was counted at the door: whole cartons plus loose pieces. */
export type Count = { cartons: number; pieces: number };

const whole = (n: number | undefined) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/**
 * Cartons + loose pieces, in pieces. Cartons only count when the item has one
 * — a loose item shows no carton field — matching the fields the screen shows.
 */
export function piecesFromCount(c: Partial<Count>, l: Levels): number {
    return (hasCarton(l) ? whole(c.cartons) * cartonSize(l) : 0) + whole(c.pieces);
}

/** Whole cartons, then what's left as loose pieces. */
export function splitCount(pieces: number, l: Levels): Count {
    const all = whole(pieces);
    const cartons = hasCarton(l) ? Math.floor(all / cartonSize(l)) : 0;
    return { cartons, pieces: all - cartons * cartonSize(l) };
}

/**
 * How a delivery count is stored on its PO line (see PurchaseOrderItem):
 * full packs of the innermost unit (the packets inside the cartons, or the
 * cartons themselves), plus — when there are packets — the cartons they came
 * in. A loose item records nothing.
 */
export function recordCount(c: Partial<Count>, l: Levels): {
    boxesReceived: number | null;
    piecesPerBox: number | null;
    cartonsReceived: number | null;
    packetsPerCarton: number | null;
} {
    if (!hasCarton(l)) return { boxesReceived: null, piecesPerBox: null, cartonsReceived: null, packetsPerCarton: null };
    const cartons = whole(c.cartons);
    if (!hasPackets(l)) return { boxesReceived: cartons, piecesPerBox: l.perPacket, cartonsReceived: null, packetsPerCarton: null };
    return {
        boxesReceived: cartons * l.packetsPerCarton,
        piecesPerBox: l.perPacket,
        cartonsReceived: cartons,
        packetsPerCarton: l.packetsPerCarton,
    };
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** "21 cartons + 24 pcs" — a piece count in cartons. Null for a loose item. */
export function describeCount(pieces: number, l: Levels): string | null {
    if (!hasCarton(l)) return null;
    const { cartons, pieces: loose } = splitCount(pieces, l);
    const parts: string[] = [];
    if (cartons > 0) parts.push(plural(cartons, "carton", "cartons"));
    if (loose > 0) parts.push(plural(loose, "pc", "pcs"));
    return parts.length > 0 ? parts.join(" + ") : "0 cartons";
}

/** Cost of one piece, from the invoice's price for one pack of `piecesInPack`. */
export function costPerPiece(packPrice: number, piecesInPack: number | null | undefined): number {
    if (!Number.isFinite(packPrice) || packPrice <= 0) return 0;
    return packPrice / boxSize(piecesInPack);
}

/**
 * The pack price to pre-fill from a known per-piece cost, rounded to the
 * halala because that is what an invoice prints.
 */
export function boxPriceFromPieceCost(pieceCost: number, piecesInPack: number | null | undefined): number {
    if (!Number.isFinite(pieceCost) || pieceCost <= 0) return 0;
    return Math.round(pieceCost * boxSize(piecesInPack) * 100) / 100;
}

const trim = (n: number) => String(Math.round(n * 100) / 100);

/** "50 g", "320 ml" — or null when either half is missing. */
export function formatPieceSize(size: number | null | undefined, unit: string | null | undefined): string | null {
    if (typeof size !== "number" || !Number.isFinite(size) || size <= 0 || !unit) return null;
    return `${trim(size)} ${unit}`;
}

/**
 * One line for wherever an item is listed: "Carton of 8 packets × 20 × 5 g",
 * "Carton of 24 × 50 g". Written in the order the client writes his own pack
 * codes ("8*20*5GM"), so it reads as his. A loose item shows only its size.
 */
export function describePackaging(p: Partial<Packaging> | null | undefined): string | null {
    const size = formatPieceSize(p?.piece_size, p?.piece_size_unit);
    const l = levelsOf(p);
    const tail = size ? ` × ${size}` : "";
    if (hasPackets(l)) return `Carton of ${l.packetsPerCarton} packets × ${l.perPacket}${tail}`;
    if (hasCarton(l)) return `Carton of ${l.perPacket}${tail}`;
    return size;
}

/** "1 carton = 8 packets × 20 = 160 pcs" — the multiplication, spelled out. */
export function describeCartonSum(l: Levels): string | null {
    if (hasPackets(l)) return `1 carton = ${l.packetsPerCarton} packets × ${l.perPacket} = ${cartonSize(l).toLocaleString("en-US")} pcs`;
    if (hasCarton(l)) return `1 carton = ${l.perPacket} pcs`;
    return null;
}

/**
 * How a received PO line was counted — "2 cartons of 8 × 20 + 5 pcs" — or null
 * for lines received before counting existed, and for loose items. (A line
 * never records loose packets today, but the server accepts them, so a stored
 * one still reads correctly.)
 */
export function describeReceivedLine(line: {
    quantityReceived: number;
    boxesReceived: number | null;
    piecesPerBox: number | null;
    cartonsReceived?: number | null;
    packetsPerCarton?: number | null;
}): string | null {
    const { quantityReceived, boxesReceived: boxes, piecesPerBox: perBox } = line;
    if (boxes === null || perBox === null || perBox <= 1) return null;
    const loosePieces = quantityReceived - boxes * perBox;
    const ppc = line.packetsPerCarton ?? null;
    const cartons = line.cartonsReceived ?? null;
    const parts: string[] = [];
    if (ppc !== null && ppc > 1 && cartons !== null) {
        const loosePackets = boxes - cartons * ppc;
        if (cartons > 0 || (loosePackets <= 0 && loosePieces <= 0)) parts.push(`${plural(cartons, "carton", "cartons")} of ${ppc} × ${perBox}`);
        if (loosePackets > 0) parts.push(plural(loosePackets, "packet", "packets"));
    } else {
        parts.push(`${plural(boxes, "carton", "cartons")} of ${perBox}`);
    }
    if (loosePieces > 0) parts.push(plural(loosePieces, "pc", "pcs"));
    return parts.join(" + ");
}

/**
 * Packets per carton, read from the client's pack code when it can be read
 * without guessing: exactly two plain counts plus a size, one of the counts
 * being the packet already saved. `8*20*5GM` with packets of 20 → 8;
 * `25G*14*6` (size first) with packets of 14 → 6. `30*240ML`, `45X1` and
 * `12*30/40G` hold no packet level → null.
 */
export function packetsPerCartonFromPackCode(code: string | null | undefined, piecesPerBox: number | null | undefined): number | null {
    if (!code || typeof piecesPerBox !== "number" || piecesPerBox <= 1) return null;
    const tokens = code.split(/[*xX×]/).map((t) => t.trim()).filter(Boolean);
    const counts = tokens.filter((t) => /^\d+$/.test(t)).map(Number);
    const sizes = tokens.filter((t) => !/^\d+$/.test(t));
    if (counts.length !== 2 || sizes.length !== 1) return null;
    const [a, b] = counts;
    const other = a === piecesPerBox ? b : b === piecesPerBox ? a : null;
    return other !== null && other > 1 && other <= MAX_PACKETS_PER_CARTON ? other : null;
}

export type PackagingInput = {
    pieces_per_box?: number | null;
    packets_per_carton?: number | null;
    piece_size?: number | null;
    piece_size_unit?: string | null;
};

/**
 * Normalises what an admin typed into the item form. A cleared number box
 * arrives as 0 (NumericInput hands back 0 for empty), and 0 means "not set" —
 * stored as null, never as a pack of nothing. A carton of one packet is no
 * packet level at all, so it is stored as null too.
 */
export function parsePackaging(
    input: PackagingInput,
): { ok: true; value: Packaging } | { ok: false; error: string } {
    let pieces_per_box: number | null = null;
    const perBox = input.pieces_per_box ?? null;
    if (perBox !== null && perBox !== 0) {
        if (!Number.isInteger(perBox) || perBox < 1 || perBox > MAX_PIECES_PER_BOX) {
            return { ok: false, error: `Pieces must be a whole number from 1 to ${MAX_PIECES_PER_BOX}.` };
        }
        pieces_per_box = perBox;
    }

    let packets_per_carton: number | null = null;
    const packets = input.packets_per_carton ?? null;
    if (packets !== null && packets !== 0) {
        if (!Number.isInteger(packets) || packets < 1 || packets > MAX_PACKETS_PER_CARTON) {
            return { ok: false, error: `Packets per carton must be a whole number from 1 to ${MAX_PACKETS_PER_CARTON}.` };
        }
        if (packets > 1) {
            if (pieces_per_box === null || pieces_per_box < 2) {
                return { ok: false, error: "Type how many pieces are in one packet before the packets in a carton." };
            }
            packets_per_carton = packets;
        }
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

    return { ok: true, value: { pieces_per_box, packets_per_carton, piece_size, piece_size_unit } };
}

/**
 * Checks a received line's breakdown against its piece total, for the server.
 * Each pair comes both-or-neither; the packs may not account for more than was
 * received (whatever they don't account for is loose). Returns the problem, or null.
 */
export function checkReceivedBoxes(line: {
    quantityReceived: number;
    boxesReceived?: number | null;
    piecesPerBox?: number | null;
    cartonsReceived?: number | null;
    packetsPerCarton?: number | null;
}): string | null {
    const boxes = line.boxesReceived ?? null;
    const perBox = line.piecesPerBox ?? null;
    const cartons = line.cartonsReceived ?? null;
    const ppc = line.packetsPerCarton ?? null;

    if (boxes === null && perBox === null) {
        return cartons === null && ppc === null ? null : "Cartons need the packets they were counted in.";
    }
    if (boxes === null || perBox === null) return "A received line needs both its pack count and its pack size.";
    if (!Number.isInteger(perBox) || perBox < 1 || perBox > MAX_PIECES_PER_BOX) {
        return `Pieces per pack must be a whole number from 1 to ${MAX_PIECES_PER_BOX}.`;
    }
    if (!Number.isInteger(boxes) || boxes < 0) return "The number of packs received must be a whole number of 0 or more.";
    if (boxes * perBox > line.quantityReceived) return "The packs add up to more pieces than were received.";

    if (cartons === null && ppc === null) return null;
    if (cartons === null || ppc === null) return "A received line needs both its carton count and its packets per carton.";
    if (!Number.isInteger(ppc) || ppc < 1 || ppc > MAX_PACKETS_PER_CARTON) {
        return `Packets per carton must be a whole number from 1 to ${MAX_PACKETS_PER_CARTON}.`;
    }
    if (!Number.isInteger(cartons) || cartons < 0) return "Cartons received must be a whole number of 0 or more.";
    if (cartons * ppc > boxes) return "The cartons add up to more packets than were received.";
    return null;
}
