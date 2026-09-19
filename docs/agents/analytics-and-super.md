# Admin analytics, super-admin console, AI Lab

Read before touching `/admin/analytics`, `src/lib/analytics.ts`, `src/components/analytics/*`, `/admin/financials`, `src/lib/pnl.ts`, anything under `/super`, `src/actions/super-insights.ts`, `src/actions/ai-lab.ts`, `src/lib/forecast.ts` or `src/lib/stockout.ts`. For any chart, also load the `dataviz` skill if available.

## The three admin pages

The split is deliberate: `/admin` is *today* (what's happening now, who's out, what's queued); `/admin/financials` is *the books* (P&L per machine/warehouse/item, fixed costs pro-rated, Excel export); `/admin/analytics` is *what changed* (against the previous equal-length period, against the fleet median, against each machine's own service cadence). Don't add a P&L table to analytics or a trend chart to financials.

P&L math is shared in `src/lib/pnl.ts` (`computePnLTotals`/`refillRevenueAndCogs`), used by both `/admin/financials` and `getExecutiveKpis`. It reads `RefillLog` snapshots, never live `Item`.

## `/admin/analytics`

All arithmetic is pure functions in **`src/lib/analytics.ts`** (no Prisma/React/ambient `Date`), unit-tested in `tests/lib/analytics.test.ts`. The page only queries and composes; the components only render.

**One bounded query, not twenty.** The page issues one `findMany` of scalar columns covering the current **and** previous windows and splits them in memory; names come from four small lookup tables. (The predecessor pulled every `RefillLog` ever written three times, with the item catalogue joined onto every row.) `computeStockoutForecast()` is called directly so the at-risk queue and the 06:00 stock-alert push can never disagree.

Rules the components encode:

- **One filter row, above everything.** `RangeFilter` (7/30/90 days) is a set of `<Link>`s driving `searchParams`, so every figure re-renders on the server against the same slice. No per-card controls.
- **`collapseVisits()` is the unit of service.** One physical stop writes ~7.6 `RefillLog` rows, so counting rows overstates visits ~8x. Same machine + same driver + no gap > `VISIT_GAP_MS` (30 min) = one visit. It's greedy over sorted rows, not a fixed time bucket, because a bucket boundary landing mid-refill would split one visit in two.
- **`buildDailySeries` zero-fills.** A day with no refills is a real zero.
- **The Pareto is plotted in share-space**: per-item share (columns) + cumulative share (line), both percentages on **one** axis. **Never add a second y-axis to anything on this page.**
- **`pctDelta` returns `null`, not 100%,** when the previous window had no basis. The UI prints "No basis to compare" / "new".
- **Movers are ranked by absolute riyals, never percentage.**
- **The heatmap shows service visits, not sales.** There is no POS feed; the only timestamp is when the driver pressed submit.
- **The quadrant's medians are computed across the machines *plotted*,** so about a quarter of the fleet always lands bottom-left. Fixed rent/operating costs are **not** in that margin (Financials owns those).

### Chart colour

It lives in **`src/components/analytics/palette.ts`**. The colours are validated, not picked by eye: every set clears the lightness band, chroma floor, CVD separation (ΔE ≥ 8) and normal-vision separation (ΔE ≥ 15) against the surface it's drawn on. Three things not to "simplify":

1. **The dark column is a separately chosen set, not an inverted one.** Raw `accent-orange` (#f97316) and `accent-green` (#10b981) sit outside the lightness band a dark surface needs; dark mode uses `#ea580c` / `#059669`.
2. **Slots are assigned in fixed order and never cycled.** A 6th series folds into the grey `deemphasis`; it does not get a generated hue.
3. **Orange↔rose fails the normal-vision floor (ΔE 12.7)**; `LossTrendChart` uses slots 1+2.

Every chart is wrapped in `ChartCard`, which **requires** a `table` prop. There is no path that ships a chart without a table view: two categorical slots are below 3:1 contrast on the light surface, and a tooltip is useless on a phone. Lists that are already text (`AtRiskPanel`, `DriverScorecard`) use `Panel`. `CategoryMixBar` replaced a donut (top 4 + grey "Other"). `TabbedContainer` is unused.

### Mobile

- **No bottom padding on the page**: the admin layout's `<main>` already has `pb-nav`.
- **`ChartFrame` (in `ChartCard.tsx`)**: a minimum width below `sm`, released by `min-w-0` from `sm` up, so a wide plot scrolls **horizontally** instead of collapsing. **Horizontal only**: never wrap a chart in a vertical scroll box.
- **The table view drops its `max-h` below `sm`** and grows with the page.
- **44px tap targets** on the range filter and the chart/table toggle. The heatmap's 24px cells are the deliberate exception (each value is reachable through the table view and each cell's `aria-label`).
- The heatmap **keeps its scrollbar**, and its tooltip **flips below the cell for Sunday/Monday** (`overflow-x: auto` forces `overflow-y` to `auto`, so a tooltip drawn above the top row would be clipped).

## Super-admin console

The `/super/*` zone (super-admin only via `src/proxy.ts`) is the developer's own oversight console, so the "keep it simple for the client" rule doesn't apply here. Navigation is in `src/lib/nav-config.ts`: Overview, Oversight, Audit Trail, Integrity, System Health, Support Inbox ([client-comms.md](client-comms.md)), Admin Accounts. Read-only insight actions live in `src/actions/super-insights.ts`, all `requireSuperAdmin`, with **no mutations and no audit rows**:

- `getSystemHealth()`: DB ping + latency, realtime heartbeat (last `SystemMeta` bump, key `realtime_version`), env-presence flags, exact row counts.
- `getExecutiveKpis(range)`: P&L totals + active counts + warehouse inventory value + 14-day revenue trend.
- `getIntegrityAlerts()`: categorised anomalies (suspect costs `cost > price_standard`, pricing gaps, supplier deficits, stale machines, aging queues), each with a link to the admin page that fixes it.
- `getOversightSummary()`: actor leaderboard + action-type distribution + sensitive-action feed (`SENSITIVE_ACTIONS`) over `SystemAuditLog`.

`KpiCard` is shared (`src/components/KpiCard.tsx`); super-only components live in `src/components/super/`. Audit viewer: `getAuditLogsPaginated` in `history.ts`.

## AI Lab (experimental)

`/super/lab`, gated behind `NEXT_PUBLIC_ENABLE_AI_LAB` (off by default; set at build time, so restart + hard-refresh after flipping it). Two **read-only, advisory** pure-statistics features (no LLM, no writes, no audit rows) in `src/actions/ai-lab.ts` (`requireSuperAdmin`):

- `getStockoutForecast()` = `requireSuperAdmin()` + `computeStockoutForecast()` from `src/lib/stockout.ts`. Each closed refill interval is one observation of daily sales rate (`items_sold_since_last_refill ÷ interval days`). It EWMA-weights recency, estimates days until empty against `MachineStock.estimated_stock`, and recommends an assign qty = lead-time demand + safety stock (`z·σ·√leadDays`), where lead time is the machine-item's own measured visit cadence.
- `getSilentFailureAlerts()`: anomalies against each machine's **own** baseline (demand collapse/spike z-score, cadence-relative overdue service, abnormal damage/expiry).

The statistics are pure functions in `src/lib/forecast.ts` (tested in `tests/lib/forecast.test.ts`). Caveat shown in the UI: demand is refilled-minus-returns (not POS telemetry) and stock is estimated. Types `StockoutForecast`/`SilentFailureAlert` are in `src/types/index.ts`; the boards are `StockoutRadar`/`SilentFailureBoard` in `src/components/super/`.
