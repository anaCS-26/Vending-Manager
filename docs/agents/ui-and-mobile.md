# UI, typography, modals, mobile, keyboard entry

Read before building or restyling any screen. Also read the skill `.agents/skills/vms-neo-design`.

## Design system

The Neo-Design System uses glassmorphism and slate. Use the project tokens (`accent-blue|green|pink|orange|purple`, `neo-bg`), never raw palette classes (`bg-blue-500`, `emerald-500`, even when it's the same hex). Reuse the modal/dropdown/card primitives in `src/components/`. Dark mode is primary (`next-themes`); always provide light variants.

## Typography

There are three roles (`src/app/layout.tsx` + the `@theme` block in `globals.css`). About 90% of what the app renders is small text and numbers a driver acts on, so the face used for tables must stay quiet.

- **Display: Bricolage Grotesque** (`font-display`, token `--font-display`). A base-layer rule applies it to `h1, h2` only, plus `KpiCard`'s value. It **caps at weight 800**: never use `font-black` (900), or the browser synthesises a smeared fake bold; use `font-extrabold`. It's loaded with `axes: ["opsz"]`, and the optical-size axis is the whole reason this face is safe at small sizes, so don't drop it. `h3` is deliberately excluded (small card headings); opt in below `h2` with `font-display`.
- **Body: Geist** (`font-sans`) for every table and control.
- **Data: JetBrains Mono** (`font-mono`). The wide-tracked uppercase micro-labels are a deliberate signature; keep them.

`body` sets `font-variant-numeric: tabular-nums`, so numeric columns already line up digit for digit. Don't reach for `font-mono` just to align numbers.

Arabic text is marked `lang="ar"`, which selects IBM Plex Sans Arabic via `[lang="ar"]` in `globals.css` (see [client-comms.md](client-comms.md)).

## Numbers, dates, money

- **`<NumericInput>`** (`src/components/NumericInput.tsx`) for every typed number field, with the `decimal` prop for prices/costs and an optional `max`. It keeps the raw string internally, so a cleared box stays empty (no sticky "0") and partial decimals ("0.5") survive re-renders, while `onChange` hands the parent a plain number (0 when empty). Never hand-roll `type="number"` or `parseInt(e.target.value) || 0`. Avoid `onFocus={e.target.select()}`, because mobile re-fires focus between keystrokes. `<select>` dropdowns are exempt.
- **Timestamps:** `formatSaudiDate`/`formatSaudiTime` from `src/lib/utils.ts`, never `toLocaleString()`. **Day/year boundaries:** `startOfRiyadhDay()`/`endOfRiyadhDay()`/`startOfRiyadhYear()`, never `setHours(0,0,0,0)` or `new Date(y, 0, 1)`. Rolling-window math (`now - 7*24*60*60*1000`) doesn't depend on timezone and is fine.
- **The Saudi Riyal sign (U+20C1)** is a 2025 Unicode addition with no glyph on most Android builds and older iOS. `RiyalSymbol` / `Money` in `src/components/RiyalSymbol.tsx` keep the real character and fall back to `SAR` only where the device can't draw it, detected once per page load by comparing its width to U+FFFF. Server render and first paint emit the character, so hydration matches. **`formatCurrency` in `src/lib/utils.ts` still emits the bare character across ~66 call sites** with no fallback (it returns a `string` the Excel export depends on). The fix that covers them without touching any is an `@font-face` with `unicode-range: U+20C1`, which needs a font file that has the glyph.

## Modals

Every modal calls `useModalBehavior()` (`src/hooks/useModalBehavior.ts`) for Escape, focus trap, focus restore, `role="dialog" aria-modal`, and ref-counted body scroll lock. It then spreads `{...dialogProps}` and `ref={panelRef}` onto its **existing** panel div. This is a hook rather than a `<Modal>` wrapper on purpose: the panels have deliberately different chrome, and one wrapper would flatten it. Pass `closeOnEscape: false` for anything holding typed data (calibration, cost correction and template modals all do), so a stray Escape can't throw away a 40-line recount. Point `labelledBy` at the visible heading's id.

`ConfirmModal` takes an optional `isPending`. Supply it and the dialog stays open with a spinner and disabled buttons until the caller closes it. **Passing it makes the dialog controlled: the caller must then close it.** Omit it and you get fire-and-close.

**Stacking:** data-entry modals sit at `z-[9999]`; `ConfirmModal` sits at `z-[10000]` and must stay above them. The three modals that nest it (`WarehouseAuditModal`, `MachineAuditModal`, `CostCorrectionModal`) render it as a **sibling** under the same `createPortal` wrapper, and that wrapper is a static `<div>`, so it forms no stacking context and the two `position:fixed` layers compete directly. At its original `z-[999]` the confirm step painted *behind* the parent's opaque panel, so "Apply Calibration" silently did nothing, and calibration was unusable for weeks. jsdom does not paint, so a flow test that merely finds the confirm button passes either way. `tests/components/WarehouseAuditModal.test.tsx` checks the `z-[N]` ordering numerically instead. Any new modal that nests `ConfirmModal` must stay below `z-[10000]`.

## Route states

`loading.tsx` + `error.tsx` exist for `/`, `/admin`, `/driver`, `/super`, plus a root `global-error.tsx`. Skeletons come from `src/components/Skeleton.tsx` (RSC, no `"use client"`, so they paint before hydration). Error bodies come from `src/components/ErrorState.tsx`, which shows a reference code and **never `error.message` in production**, beacons the failure via `reportClientError`, and offers "Report this problem" with the code attached.

## Mobile

Drivers are **only** ever on a phone, and admins check the dashboard from one. Two breakpoints handle all of the responsive layout: `sm` (640px) separates phone from tablet chrome, and `lg` (1024px) separates the mobile shell from the desktop sidebar.

- **Navigation below `lg` is `src/components/MobileNav.tsx`**: a fixed bottom tab bar (4 destinations + More) plus a More bottom sheet. `Sidebar` and `SuperSidebar` are `hidden lg:flex`. Both read **`src/lib/nav-config.ts`, the single source of truth**: add a route there and it appears in the sidebar, the More sheet and the active-route matcher (`isNavItemActive`) at once. `MobileNav` imports the config itself (entries carry lucide components, which can't cross the RSC boundary); layouts pass only plain data. Any page under `/admin` or `/super` must keep `pb-nav` on its main region, or its last row hides under the bar.
- **Safe areas:** `viewportFit: "cover"` is set, so anything at a screen edge must add the inset back. Utilities in `globals.css`: `pb-safe` / `pt-safe` (additive via `--safe-extra`), `mb-safe`, and `pb-nav`. They do nothing on devices without a notch, so apply them unconditionally.
- **`dvh`, not `vh`**, for anything full-height on a phone.
- **Short viewports are a desktop problem too, so never size a panel to the viewport without a minimum height.** The client's laptop (1366×768 at 125% scaling) has a ~1093×500 viewport. `DriverStockManager`'s allocation panel was a fixed `h-[calc(100vh-8rem)]`, so its item list got one row or none. Now, when stacked (below `xl`) the panel is content-height and the list caps at `max(60dvh, 20rem)`; side by side it fills the viewport but has a `min-h`. `globals.css` defines a **`tall:` variant** (`min-height: 50rem`); the panel is only `sticky` under `xl:tall:`.
- **Don't nest a scroll container inside a page that already scrolls.** `DriverRefillUI` did, and that broke `position: sticky`, pull-to-refresh and address-bar collapse all at once.
- **`position: absolute` is not a sticky footer.** The driver's Submit bar is `fixed sm:absolute`.
- **Tap targets are 44px** on anything touched repeatedly. `globals.css` sets `touch-action: manipulation` on controls and `font-size: max(16px, 1em)` on inputs below `sm` (iOS zooms into any focused field under 16px).
- **Leaflet traps scrolling on touch.** `MapVisual` starts locked on coarse pointers and has a "Tap to interact" overlay (`TouchGate` reaches the map instance, since `MapContainer` reads its interaction props only at creation).
- **Wide tables get a card layout below `sm`** via `DataCard` + `MobileSortSelect` (`src/components/DataCard.tsx`): `sm:hidden` cards next to a `hidden sm:block` table. Examples: `WarehouseInventoryTable`, `MachineInventoryTable`, `SortableFinancialTable`, `UnifiedHistoryManager`, `OrderManagerUI`'s history. **Sorting lives in the `<th>`s, so hiding the table hides the feature**: pass the same `handleSort` to `MobileSortSelect`. Derive per-row computation in a shared helper (`deriveEventFacts` in `UnifiedHistoryManager`, `deriveWarehouseRow`/`deriveMachineRow` in the stock tables) so the two views can't disagree. It is deliberately not a generic `<ResponsiveTable>`.
- **Above `sm`, a table should fit its panel, not scroll sideways.** The two stock tables (`WarehouseInventoryTable`, `MachineInventoryTable`) are the pattern, with the shared pieces in `src/components/StockTableBits.tsx`: the table is `w-full` with no `min-w`; every column except Item is `w-px whitespace-nowrap` (shrinks to content) and Item takes the rest with `max-w-0` + `truncate`, so a row is always two lines. Secondary columns hide by the **panel's** width with container queries (`@container` on the wrapper, `hidden @2xl:table-cell` on the column), never by viewport, so the rules hold with the sidebar open or collapsed. Fold rarely-non-zero data into an existing cell as a sub-line ("+24 owed by supplier" under the stock count) instead of giving it a column, and don't print seed defaults like "Uncategorized". Headers are `<SortableTh>` (a real `<button>` with `aria-sort`). `overflow-x-auto` stays on the wrapper only as a safety net.
- **Driver connection/sync state is `OfflineIndicator`**, mounted once in `src/app/driver/layout.tsx`.
- **PWA icons are referenced (in `manifest.json` and `layout.tsx`) but the artwork is missing** (`/icons/icon-{192,512}.png`, `icon-maskable-512.png`, `apple-touch-icon.png`). `public/icons/README.md` has the spec.

## Keyboard entry for long lists

The admin types long lists from paper, so entry screens are built on two ideas: **start from the right number** and **never need the mouse between rows**.

`src/lib/entry-keys.ts` gives spreadsheet-style keys to every long grid. Put `data-entry-group` on the container and `data-entry` on the inputs in the sequence; `entryKeyNav` makes Enter/↓ go to the next input and Shift+Enter/↑ go back, selecting its contents. Order is DOM order. It's wired into PO receiving, both calibration modals, `TemplateEditorModal` and the driver-stock grid. Rules:

- **Leave rarely edited fields unmarked** (at receiving only quantity and cost are in the sequence; Tab still reaches the rest).
- **Select on the keypress, never from `onFocus`.**
- Pass `{ enter: false }` when Enter means something else on that screen (the PO draft, where it returns to search).
- Don't add it to a list that re-sorts or filters on the typed value, because the focused row would move under the cursor.

`DriverStockManager`: Enter in the search box jumps to the top match's quantity. "Clear" empties the staged grid with an **Undo toast instead of a confirm dialog**.

## Client-facing simplicity

The client (the vending company owner) is not technical. On `/admin` and `/driver`: fewer panels and controls; whole sentences over labelled counters ("2 machines will run out soon", not `AT RISK · 2`); a direction plus the previous figure instead of a percentage ("↑ up from 16 last week"); plain period words ("Past week", not "7D"). Before adding a panel to a landing page, check whether a sidebar page already covers that subject. `/super` is exempt.
