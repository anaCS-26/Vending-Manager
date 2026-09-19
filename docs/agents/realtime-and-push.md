# Realtime and push notifications

Read before touching `src/lib/notify.ts`, `RealtimeRefresher`, `src/lib/push.ts`, `src/lib/pushStore.ts`, `src/actions/push.ts`, `src/app/sw.ts`, `usePushNotifications`, `src/lib/stock-alerts.ts` or the cron route.

**Realtime and push are complements, not alternatives.** `notifyClients()` refreshes a browser that already has the app open; push reaches a phone with the app closed. Mutations that matter to someone who isn't looking do both.

## Realtime

`notifyClients()` in `src/lib/notify.ts` bumps a single-row `SystemMeta`. Browsers subscribe over the Supabase Realtime WebSocket and call `router.refresh()` on change. It is mounted **once at the root** via `<RealtimeRefresher />` in `src/app/layout.tsx`. Do NOT call `useRealtimeRefresh()` in pages, because that opens a second WebSocket.

Setup gotcha for each environment: `SystemMeta` must be in the `supabase_realtime` publication AND `anon` must have `SELECT` on it (RLS disabled, or an explicit `SELECT TO anon USING (true)` policy). Without the second part the WebSocket connects but no events arrive. It fails silently. `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` are baked in at build time, so changing them in Vercel needs a redeploy.

## Push notifications

Web Push (VAPID) sends three notifications: **stock assigned → that driver**, **delivery disputed → all admins**, **machine about to run dry → all admins**. Plus end-of-day returns (low urgency, to the driver) and problem reports (super-admins only, `sendPushToSuperAdmins`).

- **Registry.** `src/lib/pushStore.ts` (persistence) + `src/lib/push.ts` (VAPID + transport), stored in the `PushSubscription` table. An earlier prototype kept subscriptions in a process-global `Map`, which is empty on most cold Vercel lambdas and so could never have worked. `PushSubscription.endpoint` is the natural key: the browser returns the same URL for the same registration, so `saveSubscription` upserts on it and re-subscribing is idempotent. The owner is `driverId` XOR `adminId`.
- **Sends are `await`ed, deliberately,** unlike `notifyClients()`. That one writes to Postgres over a pool that flushes itself. A push is an outbound HTTPS request, and Vercel freezes the lambda the moment the action's response is sent, so a fire-and-forget push is delivered only if the runtime happens not to have frozen yet. Each send fans out in parallel (N devices = one round trip), is capped at `SEND_TIMEOUT_MS` (4s), and **can never throw into the caller**: a dead push service must not fail an assignment whose stock has already moved.
- **Pruning.** A 404/410 from the push service means the subscription is permanently gone, so the row is deleted immediately. Anything else (429/5xx/network) is retryable: `failureCount` increments and the row is dropped only after 5 consecutive failures. This keeps the table from filling with endpoints that slow down every future send.
- **Actions.** `src/actions/push.ts`. The owner is **always** derived from the session by `resolvePushOwner()` and is **never a parameter**. Guard: `requireDriver()`. Endpoints are validated as https URLs and capped at 10 devices per owner. `PUSH_SUBSCRIBE` is audited **only on genuine creation**, because the client re-syncs on every mount.
- **Service worker.** `src/app/sw.ts`. Serwist's `addEventListeners()` wires up install/activate/fetch/message only; the `push`, `notificationclick` and `pushsubscriptionchange` handlers are ours. The `push` handler **always** shows a notification, even for an empty payload, because Chrome revokes push permission from origins that receive a push without displaying one. `notificationclick` reuses an open tab rather than opening a second window (drivers run this as a single-window PWA and would lose an in-progress refill sheet).
- **Client.** `usePushNotifications()` + `<PushNotificationToggle audience="driver" | "admin" />`, mounted in `/driver/settings` and `AdminSettingsModal`. It **re-syncs the subscription to the server on every mount**. That isn't redundant: a browser can rotate a subscription while the app is closed, and a service worker can't call a server action to save the new endpoint (known gap, documented in `sw.ts`). The stale endpoint 410s and is pruned; the fresh one lands on the next open. Each non-actionable state has its own copy (`needs-install` / `unsupported` / `not-configured` / `blocked`), because showing "off" with a dead toggle would hide three different problems that have three different fixes.
- **iOS needs the PWA installed.** Safari only grants push to a home-screen install (16.4+), so a driver can grant permission in a browser tab and still receive nothing. `usePushNotifications` detects this and returns `needs-install` with Add-to-Home-Screen instructions.
- **Dev caveat.** `next.config.ts` disables the service worker in development, so push can't be tested with `npm run dev` (the hook honestly reports `unsupported`). Use `npm run build && npm start`.
- **The whole feature depends on `/sw.js` existing**, which in turn depends on the build running Webpack (see [build-and-deploy.md](build-and-deploy.md)). In production, `no-service-worker` means the worker 404'd, not that the user needs to reload. `curl -I https://staff.peekandpick.com/sw.js` settles it in one request and is the first thing to check for any "push doesn't work" report.

### Stock alerts (the scheduled one)

`src/lib/stock-alerts.ts`, triggered by `src/app/api/cron/stock-alerts/route.ts` (`vercel.json`, `0 3 * * *` UTC = **06:00 Riyadh**, as the fleet starts). "About to run dry" is the Stockout Radar's `critical` band: projected empty before that machine's **own** measured visit cadence, not a fixed unit threshold. The computation lives in **`src/lib/stockout.ts`** so the cron runs whether or not the AI Lab is enabled, and so the notification and `/super/lab` can never disagree about what "at risk" means.

De-duplication is the part everything depends on, and it lives in `PushDedupe`. The at-risk condition persists every morning until someone refills the machine, so a naive daily job would send the same alert for a week and train ops to ignore it. A repeat warning requires either a service visit since the last one (`MachineStock.last_refilled_at > sentAt`, because a machine that is critical again after a visit is genuinely new information) or 7 days of silence. Dedupe rows are written **only after a successful send**, so a push outage means a repeated warning tomorrow rather than none. One digest push per run, never one per machine.

The same cron also prunes `ErrorEvent` rows older than 90 days. It is the only scheduled tick; a second cron would need a third REST route.

`src/proxy.ts`'s matcher excludes `api`, so the cron route is publicly routable and **guards itself**: a constant-time bearer check against `CRON_SECRET`. It refuses to run (503) when that var is unset rather than defaulting to open, because an unauthenticated endpoint that sends notifications to every admin device is a spam vector.

### Env

`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (mailto:/https:, falls back to `APP_URL`), `CRON_SECRET`. Generate the keys with `npx web-push generate-vapid-keys`. There is deliberately **no `NEXT_PUBLIC_` copy of the public key**: the browser reads it at runtime via `getPushRegistrationStatus()`, because a `NEXT_PUBLIC_` var is inlined at build time and rotating it in Vercel would silently do nothing until a redeploy. Without the keys the feature falls back to a server-side log and the UI says "not set up". **Rotating VAPID keys invalidates every existing row**, so truncate `PushSubscription` and let devices re-subscribe.
