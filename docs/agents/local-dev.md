# Local development

Read the first time you set up a worktree, start the database or dev server, or check UI in a browser. The short versions are in CLAUDE.md; this is the detail and the troubleshooting.

Machine: Windows 11, PowerShell 7 (Git Bash also available). Repo: `C:\Users\asadn\Desktop\Projects\vending` (the **main checkout**, always on `main`).

## Worktrees

Several agents work on this repo at the same time. A branch is a property of a *directory*, not of an agent: `git checkout -b` in a shared folder moves HEAD for everyone using it. This happened once, and two agents' uncommitted edits ended up tangled across five shared files. So every task gets its own worktree.

- **Location: beside the repo** (`C:\Users\asadn\Desktop\Projects\vending-<topic>`), **not inside it.** ESLint's flat config doesn't ignore dot-folders, so a worktree under `.claude/worktrees/` gets linted by `npm run lint` in the main checkout, `.next/` build output included. If the harness already put you in a worktree (anywhere), use it.
- **Branch from `origin/main` with `--no-track`**, so the branch doesn't show up as "ahead of origin/main" or try to push there.
- **Own `node_modules` per worktree, via `npm ci`** (installs exactly the lockfile, never rewrites it; ~2 min). Never junction or symlink `node_modules` between worktrees: `prisma generate` writes `node_modules/.prisma/client` from *that* worktree's schema, so a shared install means whoever generates last overwrites the other's client.
- **Gitignored files you may need to copy in:** `.env` (always), `scripts/` and `prisma/seed-data-templates/*.csv` (only for seed/maintenance scripts; they hold client data and never ship).
- Never run `git checkout`, `git stash`, `git restore .` or `git clean` in a directory another agent might be writing to, including the main checkout.
- **Removing a worktree: use `rmdir /s /q`, not `git worktree remove`.** A fresh worktree has no read-only folders, but after a working session some of its folders (and its `.git\worktrees\<name>` bookkeeping folder) carry the Windows read-only flag. Git on Windows can't delete a read-only folder: `git worktree remove` fails with "Permission denied" and, in a terminal, asks "Should I try again? (y/n)" for each one. Reproduced 2026-09-19. What sets the flag is unconfirmed; T3's Codex sandbox service is the likely source, since it also puts deny rules for its sandbox user on `.git` and `.agents` (those rules don't apply to the normal user). The handoff cleanup command in CLAUDE.md deletes both folders with `rmdir /s /q` (tested with read-only folders).
- `git worktree list` shows every active worktree. The branch names tell you what else is in progress, which helps you spot overlaps (such as two branches announcing the same feature in What's New).

## Local database (Docker)

The local stack is Docker Desktop's `supabase_*_vending` containers, created once by the Supabase CLI. There is no `supabase/config.toml` in the repo (`supabase/` is gitignored), so **don't run `supabase start`/`init`**; the containers are the stack.

| Container | Port | Used for |
|---|---|---|
| `supabase_db_vending` | 54322 | Postgres, used by Prisma (`DATABASE_URL`/`DIRECT_URL`, database `postgres`) |
| `supabase_kong_vending` | 54321 | API gateway (`NEXT_PUBLIC_SUPABASE_URL`) in front of Realtime |
| `supabase_realtime_vending` | — | Realtime refresh over WebSocket |
| `supabase_studio_vending` | 54323 | Studio web UI for browsing tables: http://127.0.0.1:54323 |

The containers have `restart: unless-stopped`, so they come back when Docker Desktop starts. `supabase_vector_vending` restart-looping and `supabase_edge_runtime_vending` staying exited are normal; the app uses neither.

**Signs Docker isn't running:** Prisma `Can't reach database server at 127.0.0.1:54322`, `PrismaClientInitializationError` on login, or `docker` saying it can't connect to the engine / "the system cannot find the file specified" (`dockerDesktopLinuxEngine` pipe). Fix it yourself with the snippet in CLAUDE.md (start Docker Desktop, wait for the engine, `docker start` the containers, wait for `pg_isready`). The first start after boot takes 30–90 s. If the containers don't exist at all, stop and tell the user; don't recreate the stack.

- After the DB restarts, a running dev server's Prisma pool is dead. Restart the dev server.
- From Git Bash, `docker exec … psql -f /tmp/x.sql` needs `MSYS_NO_PATHCONV=1`, or Git Bash rewrites the path to a Windows one. PowerShell has no such problem.
- Ad-hoc SQL: `docker exec supabase_db_vending psql -U postgres -c "<sql>"`.

### Shared database

**All worktrees share this one database.** What's safe:

- Reading, and creating rows through the app while testing.
- Additive `prisma db push` (new table, new optional column, new column with a default). Other worktrees' Prisma clients ignore columns they don't know about.

What breaks other agents (so don't do it on the shared DB):

- Dropping or renaming a column/table, or adding a required column without a default (the other branches' inserts start failing).
- `npm run db:reset:dev`, `npx tsx prisma/seed-sandbox.ts`, or anything else that wipes tables.

For those, give your worktree its own database in the same Postgres (tested recipe):

```powershell
docker exec supabase_db_vending psql -U postgres -c "CREATE DATABASE vending_<topic>"
# In THIS worktree's .env, change the database name at the end of DATABASE_URL and DIRECT_URL
# from /postgres to /vending_<topic>. Then:
npx prisma db push
npx tsx prisma/seed-sandbox.ts        # wipes + seeds this database only; refuses non-local URLs
# When the branch is done (add this line to the cleanup script you hand the user):
docker exec supabase_db_vending psql -U postgres -c "DROP DATABASE vending_<topic>"
```

Realtime refresh won't fire against a separate database (Supabase Realtime watches `postgres`), but everything else works.

**Logins:** the sandbox seed (`prisma/seed-sandbox.ts`) creates super-admin `admin@nexgen.com` / `DemoAdmin2026!`, admin `staff@nexgen.com` / `DemoStaff2026!`, and driver phone `5550100` / PIN `1234`. The shared DB currently accepts the super-admin login; `staff@` has failed there before.

## Dev server

- `npx next dev -p <port>` (in PowerShell, `npm run dev -- -p` loses the `--` and npm eats the `-p`): pick a port other agents aren't using (3000 is usually taken; check with `Get-NetTCPConnection -LocalPort 3001 -State Listen`). Run it in the background, and **stop it when you're done**. It's heavy on this laptop (first compile 10–30 s), and running several at once has frozen it before.
- To stop it, kill only the node processes whose command line contains *your* worktree path. The same machine runs other dev servers, including other worktrees and a `personal-website`.
- While it runs it locks `node_modules/.prisma/**/query_engine-windows.dll.node`, so `prisma generate` fails with `EPERM`. Stop the server first.
- **Never let `npm run build` and `npm run dev` share a `.next/`.** `build` is webpack and `dev` is Turbopack. Mixing their output breaks hydration: the page renders, but clicks silently do nothing. Delete `.next` between them.
- **Turbopack can silently stop recompiling.** The file is correct on disk, but the browser keeps getting the old module, with no error. Before re-debugging a fix that "didn't take", check the browser actually has it: fetch the loaded `script[src]` chunks and search them for a distinctive string from your change. If the old code is still there, restart the dev server; don't touch the code.
- **A service worker left over from `npm run build && npm start` serves stale chunks in dev**, even after deleting `.next`. The sign is a hydration error where the *Client* side shows your previous markup. Fix it from the page: unregister every `navigator.serviceWorker` registration, delete every `caches` key, and reload.
- The service worker and push only work under `npm run build && npm start` (`next.config.ts` disables the worker in dev).

## Checking UI in a browser

- Check at **phone width (390×844 and 360px)** for anything drivers use or admins might open on a phone, and at **desktop (1366×768)**. The client's laptop is 1366×768 at 125% scaling, so the usable viewport is ~1093×500 and short heights matter.
- Try the T3 preview tools (`preview_open`, `preview_snapshot`, `preview_recording_start` …) first. On this machine they have so far returned "No preview automation host is available", and when they do, use Playwright from a scratch folder outside the repo:

  ```powershell
  New-Item -ItemType Directory -Force $env:TEMP\pwcheck | Out-Null; Set-Location $env:TEMP\pwcheck
  $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'; npm init -y *> $null; npm i playwright@1.61
  ```

  `playwright@1.61` matches the Chromium build already cached on this machine (`chromium-1228`), so nothing gets downloaded.
- Recording a What's New clip: see [client-comms.md](client-comms.md#media-you-decide). `ffmpeg` is installed.
- If you couldn't look at a UI change in a browser, say so in the handoff instead of implying it was checked.

## Type-check and build notes

- `npx tsc --noEmit` needs `npx prisma generate` first. Errors under `.next/types` or `.next/dev/types` come from a stale Next cache, not your code. `tsconfig` is incremental, so delete `tsconfig.tsbuildinfo` if a result looks stale.
- `tsc` passing doesn't prove the build passes; a build-breaking type error has slipped through that way before. Run `npm run build` (in a worktree with no dev server running) when a change could affect it.
- npm on this machine: the user-level `~/.npmrc` also sets `legacy-peer-deps=true`. When reproducing a CI npm failure, neutralise it (point `HOME`/`USERPROFILE` at an empty dir). See [build-and-deploy.md](build-and-deploy.md).
