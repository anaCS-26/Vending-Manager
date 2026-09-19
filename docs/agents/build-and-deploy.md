# Build, CI, deploy, schema

Read before touching `.github/workflows/ci.yml`, `vercel.json`, `.npmrc`, `package.json` scripts, `package-lock.json`, `prisma/schema.prisma` or `prisma/rls.sql`.

## CI

`.github/workflows/ci.yml` runs `tsc --noEmit` + `eslint` + `vitest run` on push to `main` and every PR. All three run with `if: !cancelled()`, so one run reports every failure. Lint fails on **errors only** (the 2 remaining `<img>` warnings need a `next/image` migration). Keep it green; it is the only thing between a commit and a production deploy.

- `prisma generate` must precede `tsc`: `src/types/index.ts` is built on `Prisma.<Model>GetPayload<...>` and nothing generates the client on install. Tests need no DB (`vitest.setup.ts` mocks `@/lib/prisma`).
- Two npm workarounds live in the workflow. Both come from the lockfile being generated on Windows:
  - **`.npmrc` (`legacy-peer-deps=true`) is committed on purpose.** This dependency set doesn't resolve under strict peer rules, and while that setting sat only in the maintainer's `~/.npmrc` the lockfile was valid on exactly one machine. Don't delete it without regenerating the lockfile.
  - The job runs `npm install` rather than `npm ci`, plus an explicit install of `@rolldown/binding-linux-x64-gnu`, because npm records only the current platform's optional binaries (npm/cli#4828) and vitest 4 needs that binding on Linux.
  - **Generating `package-lock.json` once on Linux (WSL/Docker) retires both hacks.** Never regenerate the lockfile by deleting it: a from-scratch install bumps ~31 direct deps. Use `npm install --package-lock-only` and diff direct-dep versions before committing.
- **`main` branch protection requires a PR but has `enforce_admins: false`**, so the owner's direct pushes bypass it with a "Bypassed rule violations" warning. The rule currently constrains nobody.

## The production build command

It is pinned in `vercel.json` (`vercel.json` overrides the Vercel dashboard):

```
npx prisma db push --accept-data-loss && npx prisma db execute --file prisma/rls.sql --schema prisma/schema.prisma && npm run build
```

It is pinned because it used to be set *only* in the dashboard, where it overrode `package.json#build` without showing up anywhere in the repo. The repo said `next build --webpack` while production ran plain `next build`. Next 16 then defaulted to Turbopack, `@serwist/next` (webpack-only) emitted no worker, and `/sw.js` 404'd in production for the entire life of the push feature. The build stayed green, with nothing but a warning in the log.

All three parts matter, and `tests/pwa-build.test.ts` pins each one:

1. **`--webpack` or there is no service worker.**
2. **`db push` or schema changes never reach production.** Drop it and the build still goes green, but the first action that touches a new column fails at runtime.
3. **`prisma/rls.sql` between them.** `db push` creates every new table with Row Level Security off, and that file is the list of tables to lock (idempotent `ENABLE`, no policies; Prisma doesn't model RLS, so a later push never reverts it). **A branch that adds a table adds it to `rls.sql` in the same commit.**

If you change the build, change it in `vercel.json`, not in the dashboard.

## Schema changes

Edit `prisma/schema.prisma` → `npx prisma db push` → `npx prisma generate`. There is **no migrations folder**; this repo uses `db push`. Production runs that push *as part of the build*, so **a deploy is also a migration**. `--accept-data-loss` means a dropped column is dropped in production on merge. Say so in the handoff whenever a branch changes the schema.

The local database is shared by every worktree. See [local-dev.md](local-dev.md#shared-database) before pushing a destructive change locally.

## Row Level Security

The anon key is `NEXT_PUBLIC_` and ships in the client bundle. Any table without RLS can be read and written by anyone over the Supabase REST API.

**Known gap:** RLS is disabled on `PushSubscription`, `PushDedupe`, `DispatchTemplate` and `DispatchTemplateItem` (`db push` created them without it; the older tables were enabled by hand). Anyone can read every driver's push endpoint plus its `p256dh`/`auth` keys, which is enough to push arbitrary notifications to staff phones, or delete the rows. Nothing in the app reads these four over the Supabase client (only Prisma, which connects as owner and bypasses RLS), so `ENABLE ROW LEVEL SECURITY` with **no** policies is the fix and breaks nothing. **Adding those four lines to `prisma/rls.sql` closes it on the next deploy.** This was deliberately deferred. `ErrorEvent`, `ProblemReport` and `AnnouncementSeen` are already in the file.

`SystemMeta` is the exception: it needs an explicit `anon` SELECT for Realtime (see [realtime-and-push.md](realtime-and-push.md)).

## Seeding

`npm run db:seed:dev` and variants (see `package.json`). `db:reset:dev` is destructive. The `:prod` variants write to production: run one only when the user asks for it.

`scripts/` and `prisma/seed-data-templates/*.csv` are **gitignored on purpose** (public repo, client data). The seed scripts exist only on the maintainer's machine; the `package.json` scripts reference them anyway. A new worktree doesn't have them, so copy them in if you need them.

The newer seed scripts (`seed-dispatch-template.ts`, `seed-item-packaging.ts`) share one contract:

- **Match by exact `Item.name`** after case/whitespace normalisation, against **active** items only. Never match by SKU: the client's sheet codes disagree with the catalogue (`STIX RED SALT` is `0117` on the sheet and `0118` in the DB). Never match fuzzily either: under token overlap `GODIVA RED` scores as high against `CODE RED` as against `GODIVA RED DOUBLE CHOCOLATE`, so fuzzy matching ships the wrong product.
- **Abort before writing if any row fails to resolve.**
- **`--env=prod` refuses to run without `PROD_DATABASE_URL`.** The older `scripts/seed-*.ts` fall back to `.env`'s `DATABASE_URL`, which points at the local stack, so a `:prod` run of one of those reports success while touching nothing in production.
