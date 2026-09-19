# CLAUDE.md

NexGen Vending Management System for a Saudi vending operator. Stock flows **Supplier → Warehouse → Driver bag → Machine**. Next.js 16 (App Router, React 19) + Prisma/Postgres (Supabase) + NextAuth v5 on Vercel (production: `staff.peekandpick.com`). Roles `super_admin | admin | driver`. The client is non-technical, his staff read Arabic, and drivers use the app only on phones.

This file holds what applies to every task. Area detail lives in [`docs/agents/`](docs/agents/): **read the matching doc before changing that area** ([map below](#where-to-read-before-changing-something)).

---

## Workflow (every task)

### 1. Work in your own worktree

Other agents work on this repo in parallel, and a branch belongs to a directory, not to an agent. If you're already in a linked worktree (`git rev-parse --git-dir` ≠ `git rev-parse --git-common-dir`), work there. Otherwise create one **beside** the repo, never inside it:

```powershell
$topic = '<short-topic>'; $branch = "feat/$topic"          # or fix/ docs/ chore/
$repo = 'C:\Users\asadn\Desktop\Projects\vending'; $wt = "$repo-$topic"
git -C $repo fetch origin
git -C $repo worktree add --no-track -b $branch $wt origin/main
Copy-Item "$repo\.env" $wt                                  # gitignored, so not in the checkout
Set-Location $wt; npm ci; npx prisma generate               # skip both for docs-only work
```

- The main checkout (`vending/`) stays on `main` and belongs to the user. Don't edit, switch, stash or clean there.
- Never share `node_modules` between worktrees. `scripts/` and seed CSVs are gitignored; copy them in only if you need them.
- Commit on your branch in small, scoped commits. **Don't merge, push `main`, or delete branches yourself.** The user runs the scripts from step 6.

Details and pitfalls: [local-dev.md](docs/agents/local-dev.md#worktrees).

### 2. Local database: start Docker if it's down

The local DB is Docker Desktop's `supabase_*_vending` containers (Postgres `127.0.0.1:54322`, API `:54321`). If Prisma can't reach `127.0.0.1:54322`, or `docker` can't connect to its engine, start it yourself. Don't ask the user, and don't run `supabase start`:

```powershell
docker info *> $null
if ($LASTEXITCODE) {
  Start-Process "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
  $i = 0; do { Start-Sleep 5; docker info *> $null } until (-not $LASTEXITCODE -or ++$i -ge 36)   # engine up, ≤ 3 min
}
docker start supabase_db_vending supabase_kong_vending supabase_realtime_vending *> $null      # no-op if running
$i = 0; do { Start-Sleep 2; docker exec supabase_db_vending pg_isready -U postgres *> $null } until (-not $LASTEXITCODE -or ++$i -ge 30)
```

- **Every worktree shares this database.** Additive schema pushes are fine. Anything that drops/renames a column, adds a required column without a default, or wipes tables (`db:reset:dev`, `prisma/seed-sandbox.ts`) goes in **your own database**: [recipe](docs/agents/local-dev.md#shared-database).
- A DB restart kills a running dev server's Prisma pool, so restart the server.
- Logins: `admin@nexgen.com` / `DemoAdmin2026!` (super-admin); driver `5550100` / PIN `1234` (from `prisma/seed-sandbox.ts`).
- Dev server: `npx next dev -p <free port>` (not `npm run dev -- -p`: PowerShell strips the `--`) in the background; stop it when you're done. Dev-server traps (stale Turbopack, stale service worker, build/dev `.next` clash): [local-dev.md](docs/agents/local-dev.md#dev-server).

### 3. Verify

- `npx prisma generate` → `npx tsc --noEmit` → `npm run lint` → `npx vitest run`. This is the CI trio; all must pass.
- `npm run build` when a change could break the build (never over a `.next/` that a dev server is using).
- UI changes: look at them in a browser at phone width (390px) and desktop (1366×768). If you couldn't, say so.

### 4. What's New: tell the client, and mark what's outdated

**When:** any change a client admin or driver would notice (a new screen, button or flow, a changed way of doing something, or a fix to something they hit). **Skip it** for refactors, invisible performance work, tests/docs/tooling, and `/super/*` (the developer's own console). If unsure, add one: a feature nobody is told about doesn't exist for them.

**How:** add an entry at the **top** of `WHATS_NEW` in `src/lib/whats-new.ts`, in the same branch as the feature.

- **Short and plain.** Title ≤ 8 words saying what they can now do. Body 1–3 sentences (≤ ~50 words): where to find it (menu and button names exactly as they appear on screen), what to do, and what happens. No internals, no jargon, no percentages. Write the Arabic too (`ar`), just as simple.
- **Media is your call.** Use a short silent mp4 clip for a gesture or sequence, a cropped screenshot when the hard part is *finding* the button, and nothing when a sentence is enough (most of the time). Recipe: [client-comms.md](docs/agents/client-comms.md#media-you-decide).
- **Overlaps:** first read the existing entries. If your change alters, replaces or repeats what an older entry tells people, set `supersededBy: "<your new id>"` on **the old entry**. It then shows as "Outdated — see …" on the What's New page and is never shown in the pop-up again. Never delete an entry or change its `id`.

Full field rules: [client-comms.md](docs/agents/client-comms.md#writing-an-entry).

### 5. Keep the docs true

When your change alters how something works, update this file or the matching `docs/agents/` doc **in the same branch**. Rewrite the affected paragraph in place so it describes the system as it is now. Delete sentences your change made false, instead of adding "Update:" notes beside them. If you replace an older mechanism, say so where the old one was documented. Record gaps you knowingly leave open under [Known gaps](#known-gaps).

### 6. Hand off

Before reporting: `git fetch origin; git rebase origin/main`. Resolve conflicts yourself (two branches that both added a What's New entry at the top always conflict: keep both, newest first). Re-run step 3, commit everything (`git status` shows nothing untracked), and stop your dev server. Then **end your final message with these four parts**:

1. **What changed on the website.** For each screen: what someone can now do and where, in plain words. Name the What's New entry you added (or say why none), plus any entry you marked outdated. Call out anything that **affects production on merge**: schema changes (the build runs `prisma db push --accept-data-loss`), new env vars, and seeds to run.
2. **How to test it.** Numbered steps the user can follow: start the app from the worktree (`cd <worktree>; npm run dev`), the login to use, the URL, what to click, and what they should see. Include a phone-width check if it's a phone screen.
3. **Merge script** (PowerShell 7; fill in `<branch>`):

   ```powershell
   # Merge <branch> into main and deploy (Vercel builds every push to main)
   $repo = 'C:\Users\asadn\Desktop\Projects\vending'; $branch = '<branch>'
   git -C $repo switch main &&
     git -C $repo pull --ff-only &&
     git -C $repo merge --no-ff $branch -m "Merge branch '$branch'"
   if ($LASTEXITCODE) { git -C $repo merge --abort 2>$null; "Stopped - nothing was pushed. Paste the error above to the agent." } else { git -C $repo push origin main }
   ```

4. **Cleanup script** (run after the merge; it refuses to touch a branch that isn't in `main` yet):

   ```powershell
   # Remove the <topic> worktree and its branch (close any terminal or dev server using that folder first)
   $repo = 'C:\Users\asadn\Desktop\Projects\vending'; $branch = '<branch>'; $wt = '<worktree path>'
   git -C $repo merge-base --is-ancestor $branch main
   if ($LASTEXITCODE) { "Not merged into main yet - nothing was removed." } else { git -C $repo worktree remove $wt && git -C $repo branch -d $branch }
   ```

   If you created a separate database, append `docker exec supabase_db_vending psql -U postgres -c "DROP DATABASE vending_<topic>"`.

---

## Commands

- `npm run dev` / `build` (`prisma generate && next build --webpack`) / `lint` / `test` (Vitest watch; `npx vitest run [file]` for one shot; see [TESTING.md](TESTING.md)).
- **CI** (`.github/workflows/ci.yml`) runs `tsc` + `eslint` + `vitest` on every push to `main`. It is the only check before production. Don't touch `.npmrc`, the CI npm workarounds, `package-lock.json` or `vercel.json` without reading [build-and-deploy.md](docs/agents/build-and-deploy.md).
- **Schema:** edit `prisma/schema.prisma` → `npx prisma db push` → `npx prisma generate`. There is no migrations folder. The production build runs `db push --accept-data-loss` and then `prisma/rls.sql`, so **merging a schema change migrates production**. **A new table gets a line in `prisma/rls.sql` in the same commit.**
- **Seeds:** `npm run db:seed:dev` and variants. `:prod` variants write to production: run one only when the user asks.

## Rules that apply everywhere

### Server actions are the backend

- All mutations live in `src/actions/*`, by domain. There are exactly two REST routes: `api/auth/[...nextauth]` and `api/cron/stock-alerts` (Vercel Cron can only make HTTP calls). Don't add more.
- **Every export of a `"use server"` file is a public endpoint.** Middleware (`src/proxy.ts`) doesn't cover them, so **the first line of every action is a guard** from `src/lib/auth-utils.ts`: `requireAdmin()`, `requireSuperAdmin()`, `requireDriver()` (= any signed-in user), or `requireAdminOrDriverOwner(driverId)`. Each new action gets a test asserting `rejects.toThrow(/FORBIDDEN|UNAUTHORIZED/)`. Only `src/actions/password-reset.ts` is unauthenticated, on purpose.
- **Who the user is comes from the session, never from a parameter.**
- Multi-write changes run in one Prisma transaction. Inventory mutations write `RefillLog`/`InventoryAdjustment` rows that **snapshot price/cost at write time** (never re-derive them from live `Item`). Admin state changes call `writeAuditLog()` (`src/lib/audit-utils.ts`). Then call `notifyClients(tag)` + `revalidatePath()`.
- **Every `catch` ends `return actionFailure(error, "<actionName>", "<fallback>")`** (`src/lib/action-error.ts`), never `error.message`. `throw new Error("…")` is how an action rejects input, and that message reaches the user verbatim.
- **A transaction over many items uses a constant number of set-based statements** (`UPDATE … FROM (VALUES …)`, `INSERT … ON CONFLICT`, `createMany`). Do the reference reads before the transaction, use a 15s timeout, and merge duplicate lines first. Never loop queries inside `$transaction`: each costs ~100ms through production's pooler and the transaction dies (P2028), and `Promise.all` doesn't help. Add a statement-count test. [Details](docs/agents/driver-stock.md#batched-transactions).

### Data

- Soft delete: every list of active things filters `where: { isActive: true }` (drivers, machines, items, warehouses).
- Ledger rows are never edited or deleted: `RefillLog`, `InventoryAdjustment`, `Dispatch`/`DispatchItem`. Post a correcting entry instead. Fix stock or cost with calibration, never a fake PO (it corrupts WAC).
- `ReturnVerification.status = "APPROVED"` means **loss** (booked as shrinkage); `"RESTOCKED"` means back on the shelf.
- `Driver.pin` is omitted at the Prisma client (`src/lib/prisma.ts`). Only `src/auth.ts` and `changeDriverPin` may opt back in.
- `Admin.role` is `ADMIN`/`SUPER_ADMIN` in the DB and lowercase in the session.
- Anything that lists history for the client returns `PaginatedResult<T>` (pattern: `getRefillLogsPaginated` in `src/actions/history.ts`; UI: the shared `src/components/Pagination.tsx`, not a new one). Never ship an unbounded `findMany()`.
- Offline refills are idempotent via `RefillLog.clientRequestId`. Reuse the key on retry; never make a new one.
- Shared types live in `src/types/index.ts` (`Prisma.<Model>GetPayload` aliases); avoid `any`. A schema change ships with its actions, types and UI in one branch.
- Image uploads use `@vercel/blob` `put()` inside actions (the `writeFile`/`mkdir` imports in `inventory.ts` are legacy).

### UI

- Use Neo-Design tokens (`accent-blue|green|pink|orange|purple`, `neo-bg`), never raw palette classes (`bg-blue-500`, `emerald-*`). Dark mode is primary; always add light variants. Reuse primitives from `src/components/`.
- Every typed number goes through `<NumericInput>` (`decimal` for money). Never hand-roll `type="number"`, and never select text `onFocus`.
- Dates use `formatSaudiDate`/`formatSaudiTime`; day/year boundaries use `startOfRiyadhDay()`/`endOfRiyadhDay()`/`startOfRiyadhYear()` (`src/lib/utils.ts`). Never `toLocaleString()` or `setHours(0,0,0,0)`.
- Modals call `useModalBehavior()` and spread `dialogProps` + `panelRef` onto their own panel. Modals holding typed data pass `closeOnEscape: false`. Data-entry modals sit at `z-[9999]` and `ConfirmModal` at `z-[10000]`; keep that order.
- Phones first: 44px tap targets, `dvh` not `vh`, no scroll box inside a scrolling page, `pb-nav` on `/admin` and `/super` main regions, and a `DataCard` layout below `sm` for wide tables. New routes go in `src/lib/nav-config.ts` (it feeds both the sidebar and the mobile nav).
- `/admin` and `/driver` are for a non-technical operator: few controls, whole sentences, no jargon, no percentages on small numbers. `/super` is the developer's console.
- Bilingual text uses `<Bi en ar />`. Fonts: Bricolage for `h1`/`h2` (max `font-extrabold`, never `font-black`), Geist for body, JetBrains Mono for data.
- `<RealtimeRefresher />` is mounted once at the root; never call `useRealtimeRefresh()` in a page.

## Where to read before changing something

| If you're touching… | Read |
|---|---|
| Worktree setup, Docker/DB, dev server, browser checks, logins | [local-dev.md](docs/agents/local-dev.md) |
| CI, `vercel.json`, npm/lockfile, schema push, RLS, seed scripts | [build-and-deploy.md](docs/agents/build-and-deploy.md) |
| Guards, login, password reset, sessions, `Driver.pin` | [auth-and-security.md](docs/agents/auth-and-security.md) + skill `vms-security-rbac` |
| `notifyClients`, push, service worker, the stock-alert cron | [realtime-and-push.md](docs/agents/realtime-and-push.md) |
| Items, purchase orders, receiving in boxes, WAC, warehouse/machine calibration | [inventory-and-orders.md](docs/agents/inventory-and-orders.md) + skill `vms-accounting-wac` |
| Driver bag, assignments, disputes, returns, dispatch templates, batched transactions | [driver-stock.md](docs/agents/driver-stock.md) + skill `vms-audit-trail` |
| The driver refill sheet (`DriverRefillUI`, `refill-entry.ts`) | [driver-refill.md](docs/agents/driver-refill.md) |
| `/admin/analytics`, `/admin/financials`, P&L, `/super/*`, AI Lab | [analytics-and-super.md](docs/agents/analytics-and-super.md) |
| Styling, fonts, modals, mobile layout, keyboard entry grids | [ui-and-mobile.md](docs/agents/ui-and-mobile.md) + skill `vms-neo-design` |
| Error codes, Report a problem, What's New, Arabic text | [client-comms.md](docs/agents/client-comms.md) |
| Tests and mocks | [TESTING.md](TESTING.md) |

Skills are in `.agents/skills/*/SKILL.md` (plus `supabase-postgres-best-practices` for SQL).

## Known gaps

Deliberately left open. Don't "discover" these as new bugs, and remove a line when you close one.

- RLS is off on `PushSubscription`, `PushDedupe`, `DispatchTemplate` and `DispatchTemplateItem`. Four lines in `prisma/rls.sql` would close it. ([build-and-deploy](docs/agents/build-and-deploy.md#row-level-security))
- JWT sessions (30-day) survive a password reset. ([auth](docs/agents/auth-and-security.md#admin-password-reset))
- `approveReturn` restocks into `warehouse.findFirst()`, which is unordered and has no `isActive` filter. Wrong once there are two warehouses.
- Restocked returns from before `RESTOCKED` existed are still `APPROVED` and inflate historical shrinkage.
- The legacy dispatch path (`logBatchRefills` dispatch branch, `returnDispatch`) still loops inside the transaction. It's dormant; rewrite it before re-linking `/admin/dispatches`.
- `formatCurrency` emits the Riyal sign (U+20C1) with no fallback; PWA icon artwork is missing. ([ui](docs/agents/ui-and-mobile.md))
- A service worker can't save a rotated push subscription; it's re-synced on the next app open.
