export const dynamic = "force-dynamic";

import Link from "next/link";
import { ExternalLink, Languages, LifeBuoy, Search } from "lucide-react";
import prisma from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth-utils";
import { normalizeReferenceCode } from "@/lib/error-codes";
import { WHATS_NEW } from "@/lib/whats-new";
import { formatSaudiDate, formatSaudiTime } from "@/lib/utils";
import { ResolveReportButton } from "@/components/super/ResolveReportButton";

/**
 * Support Inbox — the developer's end of the three client-communication
 * channels: problem reports coming in, error codes to look up, and whether the
 * release notes going out were actually seen.
 *
 * Read-only apart from resolve/reopen. Every query is bounded (`take`), per the
 * "never ship an unbounded findMany" rule; this is an inbox, not an archive.
 */

/** "What did they hit just before filing?" window. */
const CONTEXT_WINDOW_MS = 30 * 60 * 1000;

function when(date: Date): string {
    return `${formatSaudiDate(date, { month: "short", day: "numeric" })} · ${formatSaudiTime(date)}`;
}

/** No LLM, no key, no cost: hands the note to Google Translate in a new tab. */
function translateUrl(text: string): string {
    return `https://translate.google.com/?sl=auto&tl=en&op=translate&text=${encodeURIComponent(text.slice(0, 1500))}`;
}

const HAS_ARABIC = /[\u0600-\u06FF]/;

export default async function SuperSupportPage({
    searchParams,
}: {
    searchParams: Promise<{ code?: string }>;
}) {
    await requireSuperAdmin();
    const { code: rawCode } = await searchParams;
    const query = rawCode?.trim() ?? "";
    // E-/R- codes are normalised (case, missing dash); anything else is taken
    // as an error-boundary digest and matched exactly.
    const lookupCode = query ? normalizeReferenceCode(query) ?? query.slice(0, 64) : null;

    const [openReports, resolvedReports, recentErrors, lookedUpEvents, lookedUpReport, admins, drivers, receipts] =
        await Promise.all([
            prisma.problemReport.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "desc" }, take: 50 }),
            prisma.problemReport.findMany({ where: { status: "RESOLVED" }, orderBy: { resolvedAt: "desc" }, take: 10 }),
            prisma.errorEvent.findMany({ where: { expected: false }, orderBy: { createdAt: "desc" }, take: 30 }),
            lookupCode
                ? prisma.errorEvent.findMany({ where: { code: lookupCode }, orderBy: { createdAt: "desc" }, take: 5 })
                : Promise.resolve([]),
            lookupCode ? prisma.problemReport.findUnique({ where: { code: lookupCode } }) : Promise.resolve(null),
            prisma.admin.findMany({ select: { id: true, name: true, email: true, role: true } }),
            prisma.driver.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
            prisma.announcementSeen.findMany({ select: { entryId: true, adminId: true, driverId: true } }),
        ]);

    // What each open report's author ran into in the half hour before filing.
    const contextByReport = new Map<number, typeof recentErrors>();
    await Promise.all(
        openReports
            .filter((r) => r.actorId !== null)
            .map(async (r) => {
                const events = await prisma.errorEvent.findMany({
                    where: {
                        actorId: r.actorId,
                        actorRole: r.actorRole,
                        createdAt: { gte: new Date(r.createdAt.getTime() - CONTEXT_WINDOW_MS), lte: r.createdAt },
                    },
                    orderBy: { createdAt: "desc" },
                    take: 5,
                });
                contextByReport.set(r.id, events);
            }),
    );

    const adminName = new Map(admins.map((a) => [a.id, a.name || a.email]));
    const driverName = new Map(drivers.map((d) => [d.id, d.name]));
    const actorLabel = (role: string | null, id: number | null) => {
        if (id === null) return "Unknown";
        const name = role === "driver" ? driverName.get(id) : adminName.get(id);
        return `${name ?? `#${id}`} (${role ?? "?"})`;
    };

    // The client's staff only — the super-admin is the one writing the notes.
    const clientAdmins = admins.filter((a) => a.role !== "SUPER_ADMIN");

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
                    <LifeBuoy className="w-7 h-7 text-accent-blue" /> Support Inbox
                </h1>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                    Problem reports from staff, error-code lookup, and who has seen each release note.
                </p>
            </div>

            {/* ---- Code lookup ---- */}
            <section className="glass-panel rounded-3xl p-5 sm:p-6 space-y-4">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Look up a code</h2>
                <form method="get" className="flex gap-2">
                    <input
                        name="code"
                        defaultValue={query}
                        placeholder="E-7K3Q9, R-4MP2X or an error digest"
                        className="flex-1 min-w-0 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] px-4 min-h-[44px] font-mono text-sm text-slate-900 dark:text-white"
                    />
                    <button className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-accent-blue px-4 text-sm font-bold text-white">
                        <Search className="h-4 w-4" /> Find
                    </button>
                </form>

                {lookupCode && lookedUpEvents.length === 0 && !lookedUpReport && (
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                        Nothing recorded under <span className="font-mono">{lookupCode}</span>. Error events are kept for 90 days.
                    </p>
                )}
                {lookedUpReport && (
                    <p className="text-sm text-slate-700 dark:text-slate-200">
                        <span className="font-mono font-bold">{lookedUpReport.code}</span> is a problem report from{" "}
                        {actorLabel(lookedUpReport.actorRole, lookedUpReport.actorId)} — {lookedUpReport.status.toLowerCase()},{" "}
                        {when(lookedUpReport.createdAt)}.
                    </p>
                )}
                {lookedUpEvents.map((e) => (
                    <div key={e.id} className="rounded-2xl border border-slate-200 dark:border-white/10 p-4 space-y-2 text-sm">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="font-mono font-bold text-slate-900 dark:text-white">{e.code}</span>
                            <span className="rounded-md bg-accent-pink/10 px-2 py-0.5 text-xs font-bold text-accent-pink">{e.kind}</span>
                            {e.prismaCode && <span className="font-mono text-xs text-slate-500">{e.prismaCode}</span>}
                            <span className="text-slate-500 dark:text-slate-400">{when(e.createdAt)}</span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-400">
                            {e.action ?? e.source} · {actorLabel(e.actorRole, e.actorId)}
                            {e.path ? ` · ${e.path}` : ""}
                        </p>
                        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-100 dark:bg-black/40 p-3 text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">
                            {e.message}
                            {e.stack ? `\n\n${e.stack}` : ""}
                        </pre>
                        {e.userAgent && <p className="text-[11px] text-slate-400 break-words">{e.userAgent}</p>}
                    </div>
                ))}
            </section>

            {/* ---- Open reports ---- */}
            <section className="space-y-4">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                    Open reports <span className="text-slate-400 font-normal">({openReports.length})</span>
                </h2>
                {openReports.length === 0 && (
                    <p className="glass-panel rounded-3xl p-6 text-sm text-slate-600 dark:text-slate-400">Nothing open.</p>
                )}
                {openReports.map((r) => {
                    const device = (r.device ?? {}) as Record<string, string | number | boolean>;
                    const context = contextByReport.get(r.id) ?? [];
                    return (
                        <article key={r.id} className="glass-panel rounded-3xl p-5 sm:p-6 space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="font-mono text-sm font-bold text-slate-900 dark:text-white">{r.code}</p>
                                    <p className="text-sm text-slate-600 dark:text-slate-400">
                                        {r.actorName ?? actorLabel(r.actorRole, r.actorId)} ({r.actorRole}) · {when(r.createdAt)}
                                        {r.path ? ` · ${r.path}` : ""}
                                    </p>
                                </div>
                                <ResolveReportButton id={r.id} resolved={false} />
                            </div>

                            {r.note && (
                                <div className="space-y-2">
                                    <p dir="auto" lang={HAS_ARABIC.test(r.note) ? "ar" : undefined} className="whitespace-pre-wrap rounded-2xl bg-slate-100 dark:bg-white/[0.04] p-4 text-[15px] leading-relaxed text-slate-900 dark:text-white">
                                        {r.note}
                                    </p>
                                    {HAS_ARABIC.test(r.note) && (
                                        <a
                                            href={translateUrl(r.note)}
                                            target="_blank"
                                            rel="noreferrer noopener"
                                            className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-accent-blue"
                                        >
                                            <Languages className="h-4 w-4" /> Translate to English
                                        </a>
                                    )}
                                </div>
                            )}

                            <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
                                {r.screenshotUrl && (
                                    <a href={r.screenshotUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-semibold text-accent-blue">
                                        <ExternalLink className="h-3.5 w-3.5" /> Screenshot
                                    </a>
                                )}
                                {r.errorCode && (
                                    <Link href={`/super/support?code=${encodeURIComponent(r.errorCode)}`} className="font-mono font-semibold text-accent-blue">
                                        {r.errorCode}
                                    </Link>
                                )}
                                {device.viewport !== undefined && <span>{String(device.viewport)} @{String(device.dpr ?? "?")}x</span>}
                                {device.standalone !== undefined && <span>{device.standalone ? "Installed app" : "Browser tab"}</span>}
                                {device.language !== undefined && <span>{String(device.language)}</span>}
                                {device.theme !== undefined && <span>{String(device.theme)} theme</span>}
                            </div>
                            {r.userAgent && <p className="text-[11px] text-slate-400 break-words">{r.userAgent}</p>}

                            {context.length > 0 && (
                                <div className="space-y-1.5 border-t border-slate-200 dark:border-white/10 pt-3">
                                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                                        Errors they hit in the 30 min before
                                    </p>
                                    {context.map((e) => (
                                        <p key={e.id} className="text-sm text-slate-700 dark:text-slate-300">
                                            <Link href={`/super/support?code=${encodeURIComponent(e.code)}`} className="font-mono font-semibold text-accent-blue">
                                                {e.code}
                                            </Link>{" "}
                                            {e.action ?? e.source} — {e.message.slice(0, 140)}
                                        </p>
                                    ))}
                                </div>
                            )}
                        </article>
                    );
                })}
            </section>

            {/* ---- Unexpected errors ---- */}
            <section className="glass-panel rounded-3xl p-5 sm:p-6 space-y-3">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Latest unexpected errors</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                    Failures the app did not cause on purpose. Rejected input (“not enough stock”) is recorded but not listed here.
                </p>
                {recentErrors.length === 0 && <p className="text-sm text-slate-600 dark:text-slate-400">None recorded.</p>}
                <ul className="divide-y divide-slate-200 dark:divide-white/10">
                    {recentErrors.map((e) => (
                        <li key={e.id} className="py-2.5 text-sm">
                            <Link href={`/super/support?code=${encodeURIComponent(e.code)}`} className="font-mono font-semibold text-accent-blue">
                                {e.code}
                            </Link>{" "}
                            <span className="text-slate-500 dark:text-slate-400">
                                {when(e.createdAt)} · {e.kind} · {e.action ?? e.source} · {actorLabel(e.actorRole, e.actorId)}
                            </span>
                            <p className="truncate text-slate-700 dark:text-slate-300">{e.message}</p>
                        </li>
                    ))}
                </ul>
            </section>

            {/* ---- What's New receipts ---- */}
            <section className="glass-panel rounded-3xl p-5 sm:p-6 space-y-4">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Who has seen each release note</h2>
                <ul className="space-y-4">
                    {WHATS_NEW.map((entry) => {
                        const seenAdmins = new Set(receipts.filter((r) => r.entryId === entry.id && r.adminId !== null).map((r) => r.adminId));
                        const seenDrivers = new Set(receipts.filter((r) => r.entryId === entry.id && r.driverId !== null).map((r) => r.driverId));
                        const missing = [
                            ...(entry.audience.includes("admin") ? clientAdmins.filter((a) => !seenAdmins.has(a.id)).map((a) => a.name || a.email) : []),
                            ...(entry.audience.includes("driver") ? drivers.filter((d) => !seenDrivers.has(d.id)).map((d) => d.name) : []),
                        ];
                        return (
                            <li key={entry.id} className="text-sm">
                                <p className="font-semibold text-slate-900 dark:text-white">{entry.title.en}</p>
                                <p className="text-slate-600 dark:text-slate-400">
                                    {missing.length === 0 ? "Everyone has seen it." : `Not seen yet: ${missing.join(", ")}`}
                                </p>
                            </li>
                        );
                    })}
                </ul>
            </section>

            {resolvedReports.length > 0 && (
                <section className="glass-panel rounded-3xl p-5 sm:p-6 space-y-3">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Recently resolved</h2>
                    <ul className="divide-y divide-slate-200 dark:divide-white/10">
                        {resolvedReports.map((r) => (
                            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                                <div className="min-w-0">
                                    <span className="font-mono font-semibold text-slate-900 dark:text-white">{r.code}</span>{" "}
                                    <span className="text-slate-500 dark:text-slate-400">
                                        {r.actorName ?? "Unknown"} · {when(r.createdAt)}
                                    </span>
                                    {r.note && <p dir="auto" className="truncate text-slate-700 dark:text-slate-300">{r.note}</p>}
                                </div>
                                <ResolveReportButton id={r.id} resolved />
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}
