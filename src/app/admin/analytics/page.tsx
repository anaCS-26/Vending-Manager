export const revalidate = 60;

import { Activity } from "lucide-react";
import prisma from "@/lib/prisma";
import { computeStockoutForecast } from "@/lib/stockout";
import { startOfRiyadhDay } from "@/lib/utils";
import {
    MS_PER_DAY,
    RANGE_DAYS,
    RANGE_LABELS,
    buildCategoryMix,
    buildDailySeries,
    buildDriverActivity,
    buildLossSeries,
    buildMovers,
    buildPareto,
    buildServiceRhythm,
    formatMoney,
    median,
    movingAverage,
    parseRange,
    pctDelta,
    rollup,
    summarize,
    type RefillRow,
    type ReturnRow,
} from "@/lib/analytics";
import { Money } from "@/components/RiyalSymbol";
import RangeFilter from "@/components/analytics/RangeFilter";
import StatTile from "@/components/analytics/StatTile";
import RevenueTrendChart from "@/components/analytics/RevenueTrendChart";
import ServiceRhythmHeatmap from "@/components/analytics/ServiceRhythmHeatmap";
import CategoryMixBar from "@/components/analytics/CategoryMixBar";
import ProductPareto from "@/components/analytics/ProductPareto";
import MachineQuadrant, { type QuadrantPoint } from "@/components/analytics/MachineQuadrant";
import LossTrendChart from "@/components/analytics/LossTrendChart";
import MoversPanel from "@/components/analytics/MoversPanel";
import AtRiskPanel from "@/components/analytics/AtRiskPanel";
import DriverScorecard from "@/components/analytics/DriverScorecard";

/**
 * ============================================================================
 * ADMIN ANALYTICS
 *
 * Three admin-facing pages read the same ledger and they are deliberately not
 * the same page:
 *
 *   /admin            — today. What is happening right now, who is out, what
 *                       is queued.
 *   /admin/financials — the books. P&L per machine / warehouse / item, with
 *                       fixed costs pro-rated and an Excel export.
 *   /admin/analytics  — this one. What CHANGED, where the money concentrates,
 *                       and which assets are worth the drive. Everything here
 *                       is a comparison: against the previous equal-length
 *                       period, against the fleet median, against each
 *                       machine's own service cadence.
 *
 * Every figure is scoped by one range control at the top, so no two cards can
 * be showing different windows.
 *
 * ONE QUERY, NOT TWENTY. The predecessor pulled every RefillLog ever written
 * three separate ways — including `machine.findMany({ include: { RefillLogs:
 * { include: { item: true } } } })`, which joins the item catalogue onto every
 * refill row in the table and ships the lot to the server component. This
 * fetches the current AND previous windows in a single bounded `findMany` of
 * scalar columns and splits them in memory; names come from four small lookup
 * tables. Everything else is arithmetic in src/lib/analytics.ts, which is pure
 * and unit-tested.
 * ============================================================================
 */
export default async function AnalyticsPage(props: { searchParams: Promise<{ range?: string }> }) {
    const searchParams = await props.searchParams;
    const range = parseRange(searchParams.range);
    const rangeDays = RANGE_DAYS[range];
    const rangeLabel = RANGE_LABELS[range];

    // Riyadh calendar days, so the window lines up exactly with the daily
    // columns rather than cutting the oldest day in half.
    const todayStart = startOfRiyadhDay();
    const now = Date.now();
    const windowStart = new Date(todayStart.getTime() - (rangeDays - 1) * MS_PER_DAY);
    const previousStart = new Date(windowStart.getTime() - rangeDays * MS_PER_DAY);

    const [refills, returns, machines, items, drivers, forecast] = await Promise.all([
        prisma.refillLog.findMany({
            where: { refilled_at: { gte: previousStart } },
            select: {
                machineId: true,
                itemId: true,
                driverId: true,
                refilled_at: true,
                quantity_refilled: true,
                items_sold_since_last_refill: true,
                sales_revenue: true,
                price_at_refill: true,
                cost_at_refill: true,
            },
        }),
        prisma.returnVerification.findMany({
            where: { reported_at: { gte: previousStart }, reason: { in: ["DAMAGED", "EXPIRED"] } },
            select: {
                itemId: true,
                driverId: true,
                quantity: true,
                reason: true,
                reported_at: true,
                item: { select: { cost: true } },
            },
        }),
        prisma.machine.findMany({ select: { id: true, location_name: true, district: true } }),
        prisma.item.findMany({ select: { id: true, name: true, category: true } }),
        prisma.driver.findMany({ select: { id: true, name: true } }),
        // The same computation the 06:00 stock-alert cron pushes, so the page
        // and the notification can never disagree about what "at risk" means.
        computeStockoutForecast(),
    ]);

    const inWindow = (at: Date) => at >= windowStart;
    const currentRefills: RefillRow[] = refills.filter((r) => inWindow(r.refilled_at));
    const previousRefills: RefillRow[] = refills.filter((r) => !inWindow(r.refilled_at));
    const currentReturns: ReturnRow[] = returns.filter((r) => inWindow(r.reported_at));
    const previousReturns: ReturnRow[] = returns.filter((r) => !inWindow(r.reported_at));

    const machineNames = new Map(machines.map((m) => [m.id, m]));
    const itemNames = new Map(items.map((i) => [i.id, i.name]));
    const itemCategories = new Map(items.map((i) => [i.id, i.category]));
    const driverNames = new Map(drivers.map((d) => [d.id, d.name]));

    // --- Headline totals -----------------------------------------------------
    const totals = summarize(currentRefills, currentReturns);
    const previousTotals = summarize(previousRefills, previousReturns);

    // --- Daily series --------------------------------------------------------
    const daily = buildDailySeries(currentRefills, now, rangeDays);
    const ma = movingAverage(
        daily.map((d) => d.revenue),
        7,
    );
    const trendPoints = daily.map((d, i) => ({ ...d, ma: ma[i] }));

    // --- Roll-ups ------------------------------------------------------------
    const machineTotals = rollup(currentRefills, "machineId");
    const itemTotals = rollup(currentRefills, "itemId");
    const previousItemTotals = rollup(previousRefills, "itemId");

    const earners = [...machineTotals.values()].filter((m) => m.revenue > 0);
    const medianRevenue = median(earners.map((m) => m.revenue));
    const medianMargin = median(earners.map((m) => m.marginPct));
    const quadrant: QuadrantPoint[] = earners.map((m) => {
        const machine = machineNames.get(m.id);
        return {
            id: m.id,
            name: machine?.location_name ?? `Machine ${m.id}`,
            district: machine?.district ?? "—",
            revenue: m.revenue,
            marginPct: m.marginPct,
            units: m.units,
            visits: m.visits,
            revenuePerVisit: m.visits > 0 ? m.revenue / m.visits : 0,
            underperforming: m.revenue < medianRevenue && m.marginPct < medianMargin,
        };
    });

    const pareto = buildPareto(
        [...itemTotals.values()].map((i) => ({ name: itemNames.get(i.id) ?? `#${i.id}`, revenue: i.revenue })),
        12,
    );
    const categoryMix = buildCategoryMix(currentRefills, itemCategories, 4);
    const movers = buildMovers(itemTotals, previousItemTotals, itemNames, 6);

    // Daily bins for a week's worth of returns, weekly beyond that — returns
    // are verified in batches, so a 90-day daily series is mostly zeros.
    const lossBucketDays = rangeDays <= 7 ? 1 : 7;
    const lossBuckets = buildLossSeries(currentReturns, now, rangeDays, lossBucketDays);

    const driverActivity = buildDriverActivity(currentRefills, currentReturns, driverNames);

    const atRisk = forecast.filter((f) => f.riskLevel !== "ok").slice(0, 6);

    const previousLabel = `previous ${rangeDays} days`;
    const deltaCaption = `vs ${previousLabel}`;

    return (
        // No bottom padding here: the admin layout's <main> already carries
        // `pb-nav`, which clears the mobile tab bar plus the home indicator.
        // Adding `pb-20` on top of it (as this page used to) just parks 80px of
        // dead space under the last card on every phone.
        <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                        Analytics
                    </h1>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                        What changed, where the money concentrates, and which machines earn their keep.
                    </p>
                </div>
                <div className="hidden md:flex w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 items-center justify-center shrink-0">
                    <Activity className="w-6 h-6 text-slate-600 dark:text-slate-400" />
                </div>
            </div>

            {/* The page's one filter row — scopes every figure below it. */}
            <RangeFilter active={range} />

            {/* Headline figures. One hero, four supporting tiles. */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <StatTile
                    hero
                    label={`Revenue · ${rangeLabel.toLowerCase()}`}
                    value={<Money amount={totals.revenue} decimals={0} />}
                    footnote={`${totals.units.toLocaleString("en-US")} units sold across ${totals.machinesServed} machines`}
                    delta={pctDelta(totals.revenue, previousTotals.revenue)}
                    deltaCaption={deltaCaption}
                    trend={daily.map((d) => d.revenue)}
                />

                <div className="lg:col-span-2 grid grid-cols-2 gap-4">
                    <StatTile
                        label="Gross profit"
                        value={<Money amount={totals.grossProfit} decimals={0} />}
                        footnote={`${totals.marginPct.toFixed(1)}% margin`}
                        delta={pctDelta(totals.grossProfit, previousTotals.grossProfit)}
                        deltaCaption={deltaCaption}
                        trend={daily.map((d) => d.grossProfit)}
                    />
                    <StatTile
                        label="Service visits"
                        value={totals.visits.toLocaleString("en-US")}
                        footnote={
                            // Short enough to survive a 2-up tile on a 360px phone
                            // without the ellipsis eating the unit.
                            totals.visits > 0 ? (
                                <>
                                    <Money amount={totals.revenue / totals.visits} /> per visit
                                </>
                            ) : (
                                "No visits recorded"
                            )
                        }
                        delta={pctDelta(totals.visits, previousTotals.visits)}
                        deltaCaption={deltaCaption}
                        trend={daily.map((d) => d.visits)}
                    />
                    <StatTile
                        label="Units sold"
                        value={totals.units.toLocaleString("en-US")}
                        footnote={`${(totals.units / rangeDays).toFixed(1)} a day on average`}
                        delta={pctDelta(totals.units, previousTotals.units)}
                        deltaCaption={deltaCaption}
                        trend={daily.map((d) => d.units)}
                    />
                    <StatTile
                        label="Written off"
                        value={<Money amount={totals.shrinkageValue} decimals={0} />}
                        footnote={`${totals.shrinkageUnits} units damaged or expired`}
                        delta={pctDelta(totals.shrinkageValue, previousTotals.shrinkageValue)}
                        deltaCaption={deltaCaption}
                        lowerIsBetter
                    />
                </div>
            </div>

            <RevenueTrendChart data={trendPoints} rangeLabel={rangeLabel} />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <ServiceRhythmHeatmap cells={buildServiceRhythm(currentRefills)} rangeLabel={rangeLabel} />
                <CategoryMixBar slices={categoryMix} rangeLabel={rangeLabel} />
            </div>

            <ProductPareto
                slices={pareto.slices}
                itemsTo80={pareto.itemsTo80}
                totalItems={[...itemTotals.values()].filter((i) => i.revenue > 0).length}
                rangeLabel={rangeLabel}
            />

            <MachineQuadrant
                points={quadrant}
                medianRevenue={medianRevenue}
                medianMargin={medianMargin}
                rangeLabel={rangeLabel}
            />

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <MoversPanel
                    risers={movers.risers}
                    fallers={movers.fallers}
                    rangeLabel={rangeLabel}
                    previousLabel={previousLabel}
                />
                <div className="space-y-6">
                    <LossTrendChart
                        buckets={lossBuckets}
                        bucketDays={lossBucketDays}
                        totalValue={totals.shrinkageValue}
                        rangeLabel={rangeLabel}
                    />
                    <AtRiskPanel rows={atRisk} />
                </div>
            </div>

            <DriverScorecard rows={driverActivity} rangeLabel={rangeLabel} />
        </div>
    );
}
