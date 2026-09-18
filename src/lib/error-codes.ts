/**
 * ============================================================================
 * ERROR CLASSIFICATION + REFERENCE CODES
 *
 * The client speaks Arabic, the developer English, and neither can describe a
 * backend failure to the other. So a failure is never described: the user is
 * shown a short plain sentence in both languages plus a code (`E-7K3Q9`), and
 * the code is a lookup into the `ErrorEvent` table where the real message and
 * stack live (see src/lib/action-error.ts, /super/support).
 *
 * Pure functions only — no Prisma, no React, no ambient state — so the rules
 * are unit-tested in tests/lib/error-codes.test.ts (the forecast.ts pattern).
 * Prisma errors are recognised structurally (`name` + `code`) rather than with
 * `instanceof`, which keeps the Prisma runtime out of this module and out of
 * any client bundle that imports the message table.
 * ============================================================================
 */

export type ErrorKind =
    | "BUSINESS_RULE"
    | "TIMEOUT"
    | "DUPLICATE"
    | "IN_USE"
    | "NOT_FOUND"
    | "DATABASE_UNREACHABLE"
    | "UNEXPECTED";

export type Bilingual = { en: string; ar: string };

export type ErrorClassification = {
    kind: ErrorKind;
    /**
     * True when the message was written by this app for the user ("Not enough
     * stock for LAYS"). Those pass through verbatim with no code: the admin can
     * fix them unaided, and a reference number on a validation message makes a
     * typo look like a system fault.
     */
    expected: boolean;
    prismaCode: string | null;
};

/**
 * What the user reads for each unexpected kind. Deliberately free of any
 * promise about what was or wasn't saved — only TIMEOUT (a rolled-back
 * transaction) could honestly make one, and a sentence that is true for one
 * kind and false for the next is worse than none.
 */
export const ERROR_COPY: Record<Exclude<ErrorKind, "BUSINESS_RULE">, Bilingual> = {
    TIMEOUT: {
        en: "This took too long and was stopped. Please try again.",
        ar: "استغرقت العملية وقتاً طويلاً وتم إيقافها. يرجى المحاولة مرة أخرى.",
    },
    DUPLICATE: {
        en: "This already exists.",
        ar: "هذا موجود مسبقاً.",
    },
    IN_USE: {
        en: "This can't be removed because other records still use it.",
        ar: "لا يمكن الحذف لأن سجلات أخرى ما زالت مرتبطة به.",
    },
    NOT_FOUND: {
        en: "This record no longer exists. Refresh the page and try again.",
        ar: "هذا السجل لم يعد موجوداً. حدّث الصفحة وحاول مرة أخرى.",
    },
    DATABASE_UNREACHABLE: {
        en: "Can't reach the server right now. Please try again in a minute.",
        ar: "تعذّر الاتصال بالخادم حالياً. يرجى المحاولة بعد دقيقة.",
    },
    UNEXPECTED: {
        en: "Something went wrong on our side. Please try again.",
        ar: "حدث خطأ من جهتنا. يرجى المحاولة مرة أخرى.",
    },
};

const PRISMA_KINDS: Record<string, ErrorKind> = {
    P2028: "TIMEOUT", // interactive transaction expired — the pooler-latency failure
    P2024: "TIMEOUT", // timed out waiting for a pooled connection
    P2002: "DUPLICATE",
    P2003: "IN_USE",
    P2025: "NOT_FOUND",
    P1001: "DATABASE_UNREACHABLE",
    P1002: "DATABASE_UNREACHABLE",
    P1008: "DATABASE_UNREACHABLE",
    P1017: "DATABASE_UNREACHABLE",
};

export function classifyError(error: unknown): ErrorClassification {
    if (!(error instanceof Error)) {
        return { kind: "UNEXPECTED", expected: false, prismaCode: null };
    }

    if (error.name.startsWith("PrismaClient")) {
        const raw = (error as { code?: unknown }).code;
        const prismaCode = typeof raw === "string" ? raw : null;
        if (error.name === "PrismaClientInitializationError") {
            return { kind: "DATABASE_UNREACHABLE", expected: false, prismaCode };
        }
        return {
            kind: (prismaCode && PRISMA_KINDS[prismaCode]) || "UNEXPECTED",
            expected: false,
            prismaCode,
        };
    }

    // A bare `Error` is how every action in this codebase rejects input
    // (`throw new Error("Insufficient stock…")`). TypeError, RangeError and
    // friends are bugs, not messages.
    if (error.name === "Error") {
        return { kind: "BUSINESS_RULE", expected: true, prismaCode: null };
    }

    return { kind: "UNEXPECTED", expected: false, prismaCode: null };
}

/**
 * No 0/O, 1/I/L or U: the code is read aloud over WhatsApp voice notes and
 * retyped from screenshots, so every character has to survive both.
 */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 5;

/** `E-` for error events, `R-` for problem reports. */
export function makeReferenceCode(
    prefix: "E" | "R",
    randomBytes: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n)),
): string {
    const bytes = randomBytes(CODE_LENGTH);
    let out = "";
    for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    return `${prefix}-${out}`;
}

/** Accepts what a user might type back: any case, with or without the dash. */
export function normalizeReferenceCode(input: string): string | null {
    const cleaned = input.trim().toUpperCase().replace(/\s+/g, "");
    const match = /^([ER])-?([0-9A-Z]{5})$/.exec(cleaned);
    return match ? `${match[1]}-${match[2]}` : null;
}

/**
 * The string an action returns in `error`. One line per language so a toast,
 * which is a single text node, keeps each sentence in its own direction (the
 * Toaster sets `white-space: pre-line` + `unicode-bidi: plaintext`).
 *
 * The code is embedded in the text rather than left to the caller to render:
 * ~100 call sites do `toast.error(result.error)`, and a code that only appears
 * where someone remembered to print it is not one the client can screenshot.
 */
export function formatUserError(
    error: unknown,
    classification: ErrorClassification,
    code: string,
    fallback: string,
): string {
    if (classification.kind === "BUSINESS_RULE") {
        return error instanceof Error && error.message ? error.message : fallback;
    }
    const copy = ERROR_COPY[classification.kind];
    return `${copy.en}\n${copy.ar}\nRef ${code}`;
}
