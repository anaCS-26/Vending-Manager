import prisma from "@/lib/prisma";
import { sendPushToAdmins } from "@/lib/push";
import { computeStockoutForecast, groupKey } from "@/lib/stockout";
import type { StockoutForecast } from "@/types";

/**
 * ============================================================================
 * SCHEDULED STOCK-OUT ALERTS
 *
 * "Ops gets a notification when a machine is about to run dry." Unlike the
 * assignment and dispute alerts, this one has no triggering event to hang off —
 * a machine runs low by nothing happening — so it is driven by a cron
 * (src/app/api/cron/stock-alerts/route.ts).
 *
 * "About to run dry" is the Stockout Radar's `critical` band: projected to
 * empty before the machine's own next visit is due. That is deliberately not a
 * fixed unit threshold. A slot selling 2/day on a weekly route is in trouble at
 * 10 units; one selling 0.2/day is fine at 3. The rule already lives in
 * src/lib/stockout.ts and is what /super/lab shows, so the notification and the
 * dashboard can never disagree about what "at risk" means.
 *
 * DE-DUPLICATION is the load-bearing part. The at-risk condition persists every
 * morning until someone actually refills the machine, so a naive daily job
 * sends the same alert for a week and trains ops to ignore it. PushDedupe
 * records when each machine-item was last warned about, and a repeat warning
 * requires either a service visit since then (the machine was refilled and is
 * *already* at risk again — genuinely new information) or ESCALATION_DAYS of
 * silence.
 * ============================================================================
 */

/** Re-warn about an un-serviced machine-item only this often. */
const ESCALATION_DAYS = 7;

/** Machines named in the notification body before it collapses to a count. */
const NAMED_IN_BODY = 3;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type StockAlertRunResult = {
    /** Machine-items in the `critical` band right now. */
    critical: number;
    /** Of those, the ones not suppressed by de-duplication. */
    alerted: number;
    /** Devices the notification reached. */
    devicesNotified: number;
    /** Set when the run ended early; the route surfaces it for observability. */
    skipped?: "no-critical" | "all-deduped" | "no-subscriptions" | "not-configured";
};

const dedupeKeyFor = (row: StockoutForecast) => `stockout:${groupKey(row.machineId, row.itemId)}`;

/**
 * Decides which of the currently-critical rows are worth notifying about.
 *
 * Exported for testing: the suppression rule is the difference between a useful
 * alert and one that gets swiped away unread, and it's pure decision logic over
 * three timestamps.
 */
export function selectAlertable(
    critical: StockoutForecast[],
    lastSentByKey: Map<string, Date>,
    lastRefillByKey: Map<string, Date>,
    now: Date
): StockoutForecast[] {
    const escalationCutoff = new Date(now.getTime() - ESCALATION_DAYS * MS_PER_DAY);

    return critical.filter((row) => {
        const key = dedupeKeyFor(row);
        const sentAt = lastSentByKey.get(key);
        if (!sentAt) return true; // never warned about this one

        // Serviced since we last warned, and back in the critical band already:
        // that's a new fact (the refill wasn't big enough, or demand jumped),
        // not a repeat of the old one.
        const refilledAt = lastRefillByKey.get(key);
        if (refilledAt && refilledAt > sentAt) return true;

        // Otherwise stay quiet until the situation is old enough to re-raise.
        return sentAt < escalationCutoff;
    });
}

/** Builds the notification copy. One push per run, never one per machine. */
export function composeStockAlert(rows: StockoutForecast[]): { title: string; body: string } {
    const machines = [...new Set(rows.map((r) => r.machineName))];

    const title =
        machines.length === 1
            ? `${machines[0]} is running low`
            : `${machines.length} machines are running low`;

    if (rows.length === 1) {
        const r = rows[0];
        return { title, body: `${r.itemName} — about ${formatDays(r.daysUntilEmpty)} of stock left.` };
    }

    // Rows arrive soonest-empty first, so the head of the list is the most urgent.
    const named = machines.slice(0, NAMED_IN_BODY).join(", ");
    const rest = machines.length - Math.min(machines.length, NAMED_IN_BODY);
    const where = rest > 0 ? `${named} +${rest} more` : named;
    const soonest = rows[0];

    return {
        title,
        body: `${rows.length} items projected to run dry before the next visit — soonest: ${soonest.itemName} at ${soonest.machineName} (${formatDays(soonest.daysUntilEmpty)}). ${where}.`,
    };
}

function formatDays(days: number | null): string {
    if (days == null) return "unknown time";
    if (days < 1) return "under a day";
    if (days < 2) return "1 day";
    return `${Math.round(days)} days`;
}

/**
 * One scheduled run: forecast → suppress → notify → record.
 *
 * Recording happens only after a successful send. If the push service is down
 * we would rather warn twice tomorrow than never warn at all, so a failed run
 * leaves the dedupe ledger untouched.
 */
export async function runStockAlerts(): Promise<StockAlertRunResult> {
    const forecast = await computeStockoutForecast();
    const critical = forecast.filter((r) => r.riskLevel === "critical");
    if (critical.length === 0) {
        return { critical: 0, alerted: 0, devicesNotified: 0, skipped: "no-critical" };
    }

    const keys = critical.map(dedupeKeyFor);
    const [dedupeRows, stockRows] = await Promise.all([
        prisma.pushDedupe.findMany({
            where: { key: { in: keys } },
            select: { key: true, sentAt: true },
        }),
        // last_refilled_at answers "was this machine-item serviced since we last
        // complained about it?" — scoped to the at-risk pairs only.
        prisma.machineStock.findMany({
            where: {
                machineId: { in: [...new Set(critical.map((r) => r.machineId))] },
                itemId: { in: [...new Set(critical.map((r) => r.itemId))] },
            },
            select: { machineId: true, itemId: true, last_refilled_at: true },
        }),
    ]);

    const lastSentByKey = new Map(dedupeRows.map((r) => [r.key, r.sentAt]));
    const lastRefillByKey = new Map(
        stockRows.map((s) => [`stockout:${groupKey(s.machineId, s.itemId)}`, s.last_refilled_at])
    );

    const alertable = selectAlertable(critical, lastSentByKey, lastRefillByKey, new Date());
    if (alertable.length === 0) {
        return { critical: critical.length, alerted: 0, devicesNotified: 0, skipped: "all-deduped" };
    }

    const { title, body } = composeStockAlert(alertable);
    const result = await sendPushToAdmins(
        {
            title,
            body,
            // The page where ops can actually act on this.
            url: "/admin/machine-stock",
            // One rolling "stock is low" notification, replaced each run rather
            // than accumulating one per morning.
            tag: "stockout",
        },
        { urgency: "normal" }
    );

    if (result.skipped) {
        return {
            critical: critical.length,
            alerted: 0,
            devicesNotified: 0,
            skipped: result.skipped,
        };
    }

    if (result.sent > 0) {
        const now = new Date();
        // upsert per key: the set is small (≤30 rows, capped by the radar) and
        // createMany+skipDuplicates would leave stale sentAt values in place,
        // which is exactly the timestamp the suppression rule depends on.
        await Promise.all(
            alertable.map((row) =>
                prisma.pushDedupe.upsert({
                    where: { key: dedupeKeyFor(row) },
                    create: { key: dedupeKeyFor(row), sentAt: now },
                    update: { sentAt: now },
                })
            )
        );
    }

    return {
        critical: critical.length,
        alerted: alertable.length,
        devicesNotified: result.sent,
    };
}
