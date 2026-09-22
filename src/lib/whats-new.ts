import type { Bilingual } from "@/lib/error-codes";

/**
 * ============================================================================
 * WHAT'S NEW
 *
 * Release notes the client can actually read. The client's staff speak Arabic,
 * the developer English, and a feature nobody was told about is a feature that
 * doesn't exist — the Load Template button shipped with zero templates and sat
 * unused for weeks. So telling people is part of shipping:
 *
 *   1. Add ONE entry to the TOP of WHATS_NEW in the PR that ships the feature —
 *      one card per change the client notices, not one per screen it touches.
 *      Three cards for one change is how a reader learns to skip the page;
 *      detail that only matters on one screen belongs on that screen.
 *   2. Give it a short silent clip when the feature is a gesture ("press Enter,
 *      the cursor jumps") — a clip needs no translation. Drop the file in
 *      public/whats-new/ (mp4/H.264 — iOS Safari won't play webm).
 *   3. Write `en`, draft `ar`, and let the client correct the Arabic once.
 *   4. If the change alters something an older entry describes, set that
 *      entry's `supersededBy` to the new id. Never delete or rewrite it.
 *
 * Three places show a note:
 *   - WhatsNewPrompt: the first time each user opens the app after a deploy,
 *     the unseen entries as a card stack. Dismissals are recorded server-side
 *     (`AnnouncementSeen`) so /super/support can show who has seen what.
 *   - WhatsNewHint (admin): a one-line "New on this page" strip on the screen
 *     an entry's `href` points at, for HINT_DAYS after it ships, until closed
 *     on that device. People learn a feature while doing the task, not in a
 *     reading session — so `href` should be the page where the change is.
 *   - /admin/whats-new and /driver/whats-new: the latest release open, older
 *     notes one title per row by month, outdated notes behind one link
 *     (`pageSections`).
 *
 * Rules for the copy, because the reader is a non-technical operator:
 * say what they can now DO, never how it works. "Big invoices no longer fail
 * when you press Receive" — not "the transaction is set-based now".
 *
 * Pure data + pure functions; tested in tests/lib/whats-new.test.ts.
 * ============================================================================
 */

export type Audience = "admin" | "driver";

export type WhatsNewMedia = {
    type: "video" | "image";
    /** Path under /public, e.g. "/whats-new/enter-key.mp4". */
    src: string;
    /** Still frame shown before a video loads (and if it never does). */
    poster?: string;
    alt: Bilingual;
};

export type WhatsNewEntry = {
    /** Stable forever — it is the key in AnnouncementSeen. Never rename one. */
    id: string;
    /** YYYY-MM-DD the feature reached production. */
    date: string;
    audience: Audience[];
    title: Bilingual;
    body: Bilingual;
    media?: WhatsNewMedia;
    /** Where to go and try it. */
    href?: string;
    /**
     * Set on an OLDER entry once a newer one changes what it describes — the id
     * of that newer entry. The old card stays on the list page (ids are
     * forever), labelled outdated and pointing at the newer note, and is never
     * put in the prompt: a note that teaches the old way is worse than none.
     * Point at the newest entry; when that one is superseded in turn, repoint.
     */
    supersededBy?: string;
};

/** Newest first. */
export const WHATS_NEW: WhatsNewEntry[] = [
    {
        id: "2026-09-order-in-cartons",
        date: "2026-09-22",
        audience: ["admin"],
        title: {
            en: "Orders and deliveries now count in cartons",
            ar: "الطلبات والاستلام صارت بالكرتون",
        },
        body: {
            en: "In Manage Orders, type how many cartons you want; the app works out the pieces (1 carton = 8 packets × 20 = 160). When the delivery comes, press Start Receipt and just check the cartons and the price of one carton. “Copy order” turns an order into a WhatsApp message.",
            ar: "في «إدارة الطلبات» (Manage Orders) اكتب عدد الكراتين التي تريدها، والتطبيق يحسب الحبّات بنفسه (كرتون واحد = 8 باكيت × 20 = 160 حبة). عند وصول البضاعة، اضغط «بدء الاستلام» (Start Receipt) وراجع فقط عدد الكراتين وسعر الكرتون الواحد. زر «Copy order» يحوّل الطلبية إلى رسالة واتساب.",
        },
        media: {
            type: "image",
            src: "/whats-new/receive-cartons.jpg",
            alt: {
                en: "A delivery line: 5 cartons = 800 pieces, with 1 carton = 8 packets × 20 = 160 pieces written underneath, then the price of one carton.",
                ar: "سطر استلام: 5 كراتين = 800 حبة، ومكتوب تحته: كرتون واحد = 8 باكيت × 20 = 160 حبة، ثم سعر الكرتون الواحد.",
            },
        },
        href: "/admin/orders",
    },
    {
        id: "2026-09-stock-tables-fit-screen",
        date: "2026-09-19",
        audience: ["admin"],
        title: {
            en: "Stock tables now fit your screen",
            ar: "جداول المخزون صارت تناسب شاشتك",
        },
        body: {
            en: "Warehouse Stock and Machine Stock no longer scroll sideways. Each item takes one short row: its name and code, then its box size underneath. In Warehouse Stock, anything a supplier still owes you shows under the stock number, and the hospital and hotel prices sit under the sell price. Empty items say “empty”, and machine items that are running low say so. Click any column title to sort by it.",
            ar: "لم تعد صفحتا «مخزون المستودع» (Warehouse Stock) و«مخزون المكائن» (Machine Stock) تحتاجان إلى تمرير جانبي. كل صنف يأخذ سطراً قصيراً واحداً: اسمه ورمزه، وتحته حجم الكرتون. في مخزون المستودع، يظهر ما لا يزال المورّد مديناً به تحت رقم المخزون، وتظهر أسعار المستشفى والفندق تحت سعر البيع. الأصناف الفارغة تُكتب بجانبها «empty»، وأصناف المكائن التي أوشكت على النفاد تُكتب بجانبها «Running low». اضغط على عنوان أي عمود للترتيب حسبه.",
        },
        href: "/admin/warehouse",
    },
    {
        id: "2026-09-receive-in-boxes",
        date: "2026-09-19",
        audience: ["admin"],
        title: {
            en: "Receive deliveries in boxes",
            ar: "استلام البضاعة بالكرتون",
        },
        body: {
            en: "When a delivery arrives, open Manage Orders → Pending Receipts and press Start Receipt. For each item, type how many boxes came and the price of one box, exactly as the supplier's invoice shows them — the app works out the pieces and the price of one piece. Stock is still counted and sent to drivers in pieces. If a box in this delivery holds a different number (20 instead of 24), change “Pcs / box” on that line; that changes this delivery only. Use “Loose pcs” for pieces that came outside a full box. If an orange note says one piece would cost more than it sells for, check the box size and the price before you finish. Order History now shows how each line was counted.",
            ar: "عند وصول شحنة، افتح «إدارة الطلبات» (Manage Orders) ثم «الاستلامات المعلّقة» (Pending Receipts) واضغط «بدء الاستلام» (Start Receipt). لكل صنف، اكتب عدد الكراتين وسعر الكرتون الواحد كما هو في فاتورة المورّد، والتطبيق يحسب عدد الحبّات وسعر الحبّة بنفسه. يبقى المخزون محسوباً بالحبّة ويُصرف للسائقين بالحبّة. إذا كان الكرتون في هذه الشحنة يحتوي عدداً مختلفاً (20 بدل 24)، غيّر خانة «Pcs / box» في ذلك السطر، وهذا يغيّر هذه الشحنة فقط. استخدم خانة «Loose pcs» للحبّات التي وصلت خارج كرتون كامل. إذا ظهر تنبيه برتقالي بأن سعر الحبّة أعلى من سعر بيعها، راجع حجم الكرتون والسعر قبل الإنهاء. ويظهر الآن في «سجل الطلبات» (Order History) كيف تم عدّ كل سطر.",
        },
        href: "/admin/orders",
        // "Box" was the packet for 26 items; receiving now counts cartons, packets and pieces.
        supersededBy: "2026-09-order-in-cartons",
    },
    {
        id: "2026-09-item-box-size",
        date: "2026-09-19",
        audience: ["admin"],
        title: {
            en: "Every item has a box size — here is how to change it",
            ar: "لكل صنف حجم كرتون — وهكذا تغيّره",
        },
        body: {
            en: "Items now show their box, for example “Box of 24 × 50 g”, on the Items, Orders and Warehouse Stock pages, and Warehouse Stock also shows how many boxes you have. New orders start at one box, and the + and − buttons add or remove a whole box. To change an item's box size: open Manage System and choose the Items tab. Search for the item, move the mouse over its card and click the pencil in the top corner. Change “Pieces per box” (and “Size of one piece” if needed), then press Save. Leave “Pieces per box” empty if the item comes loose. A few items don't have a box size yet — please add them the same way.",
            ar: "يظهر الآن حجم الكرتون لكل صنف، مثلاً «Box of 24 × 50 g» (كرتون فيه 24 حبة، وزن الحبة 50 غرام)، في صفحات الأصناف والطلبات ومخزون المستودع، ويعرض مخزون المستودع عدد الكراتين أيضاً. الطلبات الجديدة تبدأ بكرتون واحد، وزرّا + و − يضيفان أو ينقصان كرتوناً كاملاً. لتغيير حجم الكرتون لصنف: افتح «إدارة النظام» (Manage System) واختر تبويب «الأصناف» (Items). ابحث عن الصنف، ومرّر الفأرة فوق بطاقته واضغط على أيقونة القلم في الزاوية العليا. غيّر «Pieces per box» (وكذلك «Size of one piece» إن لزم)، ثم اضغط «Save». اترك «Pieces per box» فارغاً إذا كان الصنف يأتي بالحبّة. بعض الأصناف ليس لها حجم كرتون بعد — أضِفه بالطريقة نفسها.",
        },
        href: "/admin/manage",
        // "Pieces per box" is now "Packets per carton" + "Pieces per packet".
        supersededBy: "2026-09-order-in-cartons",
    },
    {
        id: "2026-09-return-to-warehouse",
        date: "2026-09-17",
        audience: ["admin"],
        title: {
            en: "Return a driver's leftover stock to the warehouse",
            ar: "إرجاع البضاعة المتبقية مع السائق إلى المستودع",
        },
        body: {
            en: "When a driver hands back what he didn't use, open Driver Stock, pick the driver, and press “Return Items to Warehouse”. Type how many of each item you received; anything you leave empty stays in his bag, so drinks kept in the van are not affected. The stock goes straight back into the warehouse count.",
            ar: "عندما يعيد السائق ما لم يستخدمه، افتح «مخزون السائق»، اختر السائق، واضغط «إرجاع الأصناف إلى المستودع». اكتب الكمية التي استلمتها من كل صنف؛ وما تتركه فارغاً يبقى في حقيبته، فالمشروبات التي تبقى في السيارة لا تتأثر. تعود البضاعة مباشرة إلى رصيد المستودع.",
        },
        href: "/admin/driver-stock",
    },
    {
        id: "2026-09-return-to-warehouse-driver",
        date: "2026-09-17",
        audience: ["driver"],
        title: {
            en: "Your bag updates when you hand stock back",
            ar: "حقيبتك تتحدّث عند تسليم البضاعة",
        },
        body: {
            en: "When the admin takes back your unused items at the end of the day, they now disappear from your bag in the app right away. You will get a short notification saying how many were checked back in.",
            ar: "عندما يستلم المسؤول أصنافك غير المستخدمة في نهاية اليوم، تختفي الآن من حقيبتك في التطبيق فوراً. ستصلك رسالة قصيرة توضح عدد القطع التي تم إرجاعها.",
        },
    },
    {
        id: "2026-09-report-a-problem",
        date: "2026-09-17",
        audience: ["admin", "driver"],
        title: {
            en: "Tell us when something goes wrong",
            ar: "أخبرنا عند حدوث أي مشكلة",
        },
        body: {
            en: "There is a new “Report a problem” button. Write what happened in Arabic or English and add a screenshot if you like. We automatically receive the page you were on and your device details, so you don't need to explain them.",
            ar: "أضفنا زر «الإبلاغ عن مشكلة». اكتب ما حدث بالعربية أو الإنجليزية، ويمكنك إرفاق لقطة شاشة. تصلنا تلقائياً الصفحة التي كنت فيها وبيانات جهازك، فلا حاجة لشرحها.",
        },
    },
    {
        id: "2026-09-error-codes",
        date: "2026-09-17",
        audience: ["admin", "driver"],
        title: {
            en: "Error messages now come with a code",
            ar: "رسائل الخطأ أصبحت تحمل رمزاً",
        },
        body: {
            en: "If the system fails, the message now appears in Arabic and English with a short code such as E-7K3Q9. Send us that code, or a screenshot of it, and we can see exactly what happened.",
            ar: "إذا حدث خطأ في النظام، تظهر الرسالة الآن بالعربية والإنجليزية مع رمز قصير مثل E-7K3Q9. أرسل لنا هذا الرمز أو صورة له، وسنعرف ما حدث بالضبط.",
        },
    },
    {
        id: "2026-09-enter-key-grids",
        date: "2026-09-17",
        audience: ["admin"],
        title: {
            en: "Press Enter to move to the next box",
            ar: "اضغط Enter للانتقال إلى الخانة التالية",
        },
        body: {
            en: "When typing a long list of quantities — receiving an order, counting stock, loading a driver — press Enter after each number and the cursor jumps to the next item. Shift+Enter goes back. No mouse needed.",
            ar: "عند إدخال قائمة طويلة من الكميات — استلام طلبية، أو جرد المخزون، أو تحميل السائق — اضغط Enter بعد كل رقم وسينتقل المؤشر إلى الصنف التالي. للرجوع اضغط Shift+Enter. لا حاجة لاستخدام الفأرة.",
        },
        media: {
            type: "video",
            src: "/whats-new/enter-key.mp4",
            poster: "/whats-new/enter-key.jpg",
            alt: {
                en: "Typing 12, Enter, 8, Enter — the cursor moves down the list by itself.",
                ar: "كتابة 12 ثم Enter ثم 8 ثم Enter — المؤشر ينتقل إلى الأسفل تلقائياً.",
            },
        },
        href: "/admin/driver-stock",
    },
    {
        id: "2026-09-order-case-packs",
        date: "2026-09-17",
        audience: ["admin"],
        title: {
            en: "Supplier orders start at one full case",
            ar: "طلبات الموردين تبدأ بكرتون كامل",
        },
        body: {
            en: "A new order line now starts at one case instead of 1 unit, with buttons to add or remove a case. “Repeat last order” copies your previous order so you only change what is different.",
            ar: "كل صنف جديد في الطلبية يبدأ الآن بكرتون كامل بدلاً من حبة واحدة، مع أزرار لإضافة كرتون أو إزالته. وزر «تكرار آخر طلبية» ينسخ طلبيتك السابقة لتعدّل ما اختلف فقط.",
        },
        href: "/admin/orders",
        // The "case" here was the driver batch; orders are now typed in the item's real cartons.
        supersededBy: "2026-09-order-in-cartons",
    },
    {
        id: "2026-09-driver-return",
        date: "2026-09-17",
        audience: ["admin"],
        title: {
            en: "Return a driver's unused stock to the warehouse",
            ar: "إرجاع بضاعة السائق غير المستخدمة إلى المستودع",
        },
        body: {
            en: "At the end of the day, open Driver Stock → Current Stock and press “Return Items to Warehouse”. Type only what came back; anything you leave empty stays with the driver.",
            ar: "في نهاية اليوم، افتح «مخزون السائق» ← «المخزون الحالي» واضغط «إرجاع الأصناف إلى المستودع». أدخل فقط ما تم إرجاعه، وما تتركه فارغاً يبقى مع السائق.",
        },
        href: "/admin/driver-stock",
        // Same feature announced twice by two parallel branches.
        supersededBy: "2026-09-return-to-warehouse",
    },
    {
        id: "2026-08-refill-last-visit",
        date: "2026-08-15",
        audience: ["driver"],
        title: {
            en: "One tap to repeat last visit's quantity",
            ar: "ضغطة واحدة لتكرار كمية الزيارة السابقة",
        },
        body: {
            en: "Items that probably need stock now appear first. Next to each one is a button with the quantity you loaded last time — tap it instead of typing. You can change how this works in Settings.",
            ar: "الأصناف التي تحتاج تعبئة غالباً تظهر الآن في الأعلى. وبجانب كل صنف زر بالكمية التي عبّأتها في الزيارة السابقة — اضغطه بدلاً من الكتابة. يمكنك تغيير الطريقة من «الإعدادات».",
        },
        href: "/driver/settings",
    },
    {
        id: "2026-08-push-notifications",
        date: "2026-08-10",
        audience: ["admin", "driver"],
        title: {
            en: "Get notified on your phone",
            ar: "استقبل الإشعارات على جوالك",
        },
        body: {
            en: "Turn on notifications in Settings. Drivers are told when stock is assigned to them; admins are told when a driver disputes a delivery or a machine is about to run empty. On iPhone, add the app to your Home Screen first.",
            ar: "فعّل الإشعارات من «الإعدادات». يصل السائق إشعار عند تسليمه بضاعة، ويصل المشرف إشعار عند اعتراض سائق على تسليم أو عند اقتراب نفاد آلة. على الآيفون، أضف التطبيق إلى الشاشة الرئيسية أولاً.",
        },
    },
];

/** At most this many cards in the auto-prompt; the rest wait on the list page. */
export const PROMPT_LIMIT = 3;

/** Session role → which notes apply. Super-admins see what the client's admins see. */
export function audienceForRole(role: string | null | undefined): Audience | null {
    if (role === "driver") return "driver";
    if (role === "admin" || role === "super_admin") return "admin";
    return null;
}

export function entriesFor(audience: Audience, entries: WhatsNewEntry[] = WHATS_NEW): WhatsNewEntry[] {
    return entries.filter((e) => e.audience.includes(audience));
}

/** Everything current this audience hasn't dismissed, newest first. Outdated notes are never prompted. */
export function unseenEntries(
    audience: Audience,
    seenIds: Iterable<string>,
    entries: WhatsNewEntry[] = WHATS_NEW,
): WhatsNewEntry[] {
    const seen = new Set(seenIds);
    return entriesFor(audience, entries).filter((e) => !e.supersededBy && !seen.has(e.id));
}

/** The newer note that replaced this one, if any. */
export function replacementFor(entry: WhatsNewEntry, entries: WhatsNewEntry[] = WHATS_NEW): WhatsNewEntry | undefined {
    return entry.supersededBy ? entries.find((e) => e.id === entry.supersededBy) : undefined;
}

/** How long a note keeps its "New on this page" strip. */
export const HINT_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Noon in Riyadh on the entry's day, so the day boundary can't flip it. */
const entryTime = (e: WhatsNewEntry) => new Date(`${e.date}T12:00:00+03:00`).getTime();

/**
 * The note to show as a "New on this page" strip on `pathname`, if any: the
 * newest current entry whose `href` is this page (or a page under it), shipped
 * within HINT_DAYS of `now`, and not closed on this device. Outdated notes
 * never hint — they would teach the old way on the very screen that changed.
 */
export function hintFor(
    pathname: string,
    entries: WhatsNewEntry[],
    dismissedIds: Iterable<string>,
    now: Date,
): WhatsNewEntry | null {
    const dismissed = new Set(dismissedIds);
    return (
        entries.find(
            (e) =>
                !e.supersededBy &&
                !!e.href &&
                (pathname === e.href || pathname.startsWith(`${e.href}/`)) &&
                !dismissed.has(e.id) &&
                now.getTime() - entryTime(e) <= HINT_DAYS * DAY_MS &&
                now.getTime() >= entryTime(e) - DAY_MS,
        ) ?? null
    );
}

/**
 * The notes worth sending to the browser for hints: current, with a page, and
 * young enough to hint (a day of slack either side, since `hintFor` re-checks
 * against the browser's clock). Keeps the whole catalogue out of every page.
 */
export function hintCandidates(entries: WhatsNewEntry[], now: Date): WhatsNewEntry[] {
    return entries.filter(
        (e) => !e.supersededBy && !!e.href && now.getTime() - entryTime(e) <= (HINT_DAYS + 1) * DAY_MS,
    );
}

/** At most this many notes open at the top of the page. */
export const LATEST_LIMIT = 3;

/**
 * How the What's New page lays notes out, so the reader meets the newest
 * release first and a short list of titles after it — not a wall of every
 * note ever written, in two languages.
 *
 * - `latest`: the newest release — current notes sharing the newest note's
 *   date, at most LATEST_LIMIT — shown open. Anchored on the newest note
 *   rather than today, so the page is the same however long ago it was built.
 *   (A 7-day window opened six notes on the day it was tried.)
 * - `earlier`: the other current notes, grouped by month ("YYYY-MM"), newest
 *   month first, shown as one title per row that opens on tap.
 * - `outdated`: notes a newer one replaced, behind a single link.
 */
export function pageSections(entries: WhatsNewEntry[]): {
    latest: WhatsNewEntry[];
    earlier: { month: string; entries: WhatsNewEntry[] }[];
    outdated: WhatsNewEntry[];
} {
    const current = entries.filter((e) => !e.supersededBy);
    const outdated = entries.filter((e) => !!e.supersededBy);
    const newestDate = current.reduce((max, e) => (e.date > max ? e.date : max), "");
    const latest = current.filter((e) => e.date === newestDate).slice(0, LATEST_LIMIT);
    const earlier: { month: string; entries: WhatsNewEntry[] }[] = [];
    for (const e of current) {
        if (latest.includes(e)) continue;
        const month = e.date.slice(0, 7);
        const group = earlier.find((g) => g.month === month);
        if (group) group.entries.push(e);
        else earlier.push({ month, entries: [e] });
    }
    return { latest, earlier, outdated };
}

/**
 * Filters client-supplied ids down to real entries for the caller's audience —
 * `markAnnouncementsSeen` is a public RPC endpoint, and without this it is a
 * way to write arbitrary strings into a table.
 */
export function validEntryIds(
    audience: Audience,
    ids: readonly unknown[],
    entries: WhatsNewEntry[] = WHATS_NEW,
): string[] {
    const allowed = new Set(entriesFor(audience, entries).map((e) => e.id));
    return [...new Set(ids.filter((id): id is string => typeof id === "string" && allowed.has(id)))];
}
