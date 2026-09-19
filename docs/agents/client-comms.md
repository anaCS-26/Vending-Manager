# Client communication: errors, problem reports, What's New

Read before touching `src/lib/error-codes.ts`, `src/lib/action-error.ts`, `ErrorEvent`, `src/actions/support.ts`, `ReportProblemModal`, `/super/support`, `src/lib/whats-new.ts` or `src/components/whats-new/*`, and **before writing a What's New entry**.

The client's staff speak Arabic and the developer doesn't. Before this work, a backend failure reached the client as a paragraph of English Prisma text, and a new feature didn't reach them at all (Load Template shipped with zero templates and sat unused for weeks). There are three channels, sharing one rule: **nothing is machine-translated at rest and nothing needs an LLM key.** Every string the app authors is written in both languages; free text the client types is stored as typed, with a Google Translate link beside it in the inbox. Full-app Arabic (the parked next-intl branch `feat/i18n-setup`) is a separate, larger decision.

## Bilingual UI: `<Bi en ar />`

`src/components/Bi.tsx` shows Arabic stacked over English, or `inline` for buttons (`Send · إرسال`). It is deliberately not a language switch: the admins read Arabic, the drivers' first language varies, and a toggle would be one more control. Arabic is marked `lang="ar"`, and that is what selects the Arabic font: `[lang="ar"]` in `globals.css` maps to IBM Plex Sans Arabic (`--font-arabic`, loaded with `preload: false` so an English-only screen never fetches it). It **cannot** simply sit in `--font-sans` after Geist: next/font's metric-matched "Geist Fallback" is Arial underneath, Arial has Arabic glyphs, and the browser would never reach Plex. Free text of unknown language gets `dir="auto"`, and gets `lang="ar"` only when it actually contains Arabic.

Arabic in the app was drafted by Claude and has not been checked by a native speaker. Keep new Arabic as plain as the English.

## 1. Error codes

`src/lib/error-codes.ts` (pure + tested) and `src/lib/action-error.ts` (server). **Every server action `catch` ends in `return actionFailure(error, "<actionName>", "<fallback>")`**, never `error.message`.

`classifyError` recognises Prisma errors structurally (`name` + `code`, no `instanceof`, so the message table can ship to the browser): P2028/P2024 → `TIMEOUT`, P2002 → `DUPLICATE`, P2003 → `IN_USE`, P2025 → `NOT_FOUND`, P1xxx/init → `DATABASE_UNREACHABLE`. A bare `Error` is `BUSINESS_RULE` (the app talking to the user); anything else is `UNEXPECTED`.

- Business messages pass through verbatim with **no** code, because a reference number on "not enough stock" makes a typo look like an outage. So `throw new Error("…")` is still how an action rejects input.
- Everything else becomes `English\nArabic\nRef E-7K3Q9` (the Toaster sets `white-space: pre-line` + `unicode-bidi: plaintext`), and the raw message + stack go to **`ErrorEvent`** under that code.
- Codes use a 30-character alphabet with no 0/O/1/I/L/U, because they are read aloud over WhatsApp.
- `recordErrorEvent` is awaited (Vercel freezes the lambda once the response is sent), capped at 2s, and can never throw, since it runs inside a `catch`. Every failure is recorded, with `expected: true` for business rejections, so a report can be read alongside what that person hit in the previous half hour. Retention is 90 days, pruned by the stock-alerts cron.
- The code is already inside `result.error`, so the ~100 `toast.error(result.error)` call sites show it without any extra work. (`ActionResult`'s failure branch also has an optional `code`, but UI never needs to render it.)
- `<ClientErrorReporter />` (root layout) sends `window.onerror`/`unhandledrejection` to the same table: max 3 per page load, de-duplicated, guarded against re-entry, network errors ignored (an offline driver is normal). On public routes the guard rejects it and nothing is written.

## 2. Report a problem

`src/actions/support.ts` + `ReportProblemModal`. It can be opened from the admin sidebar footer, the More sheet, `/driver/settings` → Help, and the error screen. The reporter supplies only what nobody else knows: a note (any language, `dir="auto"`) and an optional screenshot (compressed in the browser to ≤1MB/1600px, uploaded to Blob under `problem-reports/<code>` **with** `addRandomSuffix`, since the URL is public and an admin screenshot shows stock and money). The form attaches the context itself (path, viewport, DPR, installed-vs-tab, online, language, theme, timezone). The server adds identity **from the session, never from the form**. A failed upload still keeps the report.

Limits: 5 reports per 10 min per user; note ≤2000 chars; 5MB image cap; at least one of note, screenshot or attached code. Delivery: one push to **super-admin devices only** (`sendPushToSuperAdmins`; the client's admins must not see each other's complaints) plus an email to `SUPPORT_EMAIL` via Resend if that is set. Both are awaited, and neither can fail the submission. The reporter gets an `R-` code to quote.

`/super/support` is the inbox: open reports with their author's recent errors, a code lookup (`E-`, `R-`, or a boundary digest), the latest unexpected errors, and "who hasn't seen it yet" for each current What's New note. Resolve/reopen is `requireSuperAdmin` + audited. Every query is `take`-bounded.

**Env:** `SUPPORT_EMAIL` (optional; reports always reach the inbox and push regardless).

## 3. What's New

Release notes are **data in the repo**: `WHATS_NEW` in `src/lib/whats-new.ts`, newest first. `tests/lib/whats-new.test.ts` enforces the shape: unique ids, both languages, newest-first dates, media files exist, links inside the audience's zone, and valid `supersededBy` targets.

How it reaches people: `WhatsNewPrompt` is mounted by the admin and driver layouts, which compute the unseen set on the server (`getUnseenWhatsNew`, one indexed read of **`AnnouncementSeen`**, never throws), so a note dismissed on one device doesn't flash on another. It shows at most `PROMPT_LIMIT` (3) cards, but **dismissing marks every unseen entry as seen**: on first rollout the whole back-catalogue is unseen, and a prompt that comes back three more times is one people learn to close unread. The full list lives at `/admin/whats-new` and `/driver/whats-new` (drivers reach it from Settings → Help). `markAnnouncementsSeen` filters ids against the repo list for the caller's own audience. Super-admins read the admin set. The receipts exist so the developer can see on `/super/support` whether the client has actually been shown a feature before assuming they know about it.

### Writing an entry

Add an entry to the **top** of `WHATS_NEW` in the same branch as the feature.

| Field | Rule |
|---|---|
| `id` | `YYYY-MM-<slug>`. **Permanent**: it is the `AnnouncementSeen` key. Never rename or delete an entry. |
| `date` | The day it ships (today). |
| `audience` | `["admin"]`, `["driver"]` or both. Only people who will use it. `/super` changes get no entry. |
| `title` | What they can now do, in ≤ 8 words. "Return a driver's leftover stock to the warehouse." |
| `body` | 1–3 short sentences, ≤ ~50 words: **where** (menu and button names exactly as they appear on screen, in quotes), **what to do**, **what happens**. Nothing about how it works internally, no percentages, no jargon. |
| `ar` | Write both `title.ar` and `body.ar`. Keep the English on-screen label in parentheses after the Arabic name where the UI is English, e.g. «مخزون السائق» (Driver Stock). |
| `href` | The page to try it on. It must be inside the audience's zone (`/admin…` → admin only, `/driver…` → driver only). |
| `media` | Optional; see below. |
| `supersededBy` | Set on an **older** entry, never on your new one; see below. |

Good: *"At the end of the day, open Driver Stock → Current Stock and press “Return Items to Warehouse”. Type only what came back; anything you leave empty stays with the driver."*
Too much: explaining WAC, listing every field on the form, or describing edge cases the reader will never hit.

### Media: you decide

- **Video**: when the feature is a gesture or a sequence that a sentence can't show quickly ("press Enter, the cursor jumps to the next box"). 5–15 s, silent, looping, cropped to just the part that changes.
- **Screenshot**: when the hard part is *finding* the thing (a new button in a crowded screen).
- **Nothing**: when one sentence covers it, which is most of the time.

Files go in `public/whats-new/<slug>.{mp4,jpg,png}`. Videos must be **mp4/H.264** (iOS Safari won't play webm), ideally ≤ 100 KB, with a `.jpg` poster. The reference example is `public/whats-new/enter-key.mp4` (706×290, 12 s, 20 fps, 55 KB), recorded with Playwright against the driver-stock grid. `next.config.ts` excludes `whats-new/**` from the service-worker precache, so size costs only the people who open the note. Record against the local app at the width the audience uses (phone width for drivers), with realistic data, and nothing private in frame. Recipe (Playwright setup in [local-dev.md](local-dev.md#checking-ui-in-a-browser)):

```js
// record.mjs: run with node from the scratch dir
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: 'rec', size: { width: 1280, height: 800 } } });
// … log in, perform the gesture slowly (page.keyboard.type(text, { delay: 120 })) …
await ctx.close(); // the .webm is written on close
```

```powershell
# crop=W:H:X:Y to the region that matters; scale down; strip audio
ffmpeg -y -i rec\<file>.webm -vf "crop=706:290:40:180,fps=20" -c:v libx264 -pix_fmt yuv420p -crf 30 -an -movflags +faststart public\whats-new\<slug>.mp4
ffmpeg -y -ss 1 -i public\whats-new\<slug>.mp4 -frames:v 1 -q:v 5 public\whats-new\<slug>.jpg
```

Screenshots: `page.screenshot({ path, clip: { x, y, width, height } })`, cropped to the relevant area.

### Overlaps: mark the old note outdated

Before adding an entry, read the existing ones for the same audience. If your change **alters, replaces or repeats** what an older entry tells people (a button moved, a default changed, a flow was redone, or the same feature was already announced by a parallel branch):

1. Add your new entry, written so it stands on its own.
2. Set `supersededBy: "<your new id>"` on the older entry, with a one-line comment saying why. If other entries already point at that older one, repoint them to yours (no chains; the test rejects them).
3. Leave the old entry's `id` and text alone.

The old card then stays on the What's New page, dimmed, with an orange "Outdated — this has changed. See “…”" link to the new card. It is never shown in the pop-up again, and `/super/support` stops counting who hasn't seen it. If the overlapping entry is still unmerged on your own branch, just edit it instead.
