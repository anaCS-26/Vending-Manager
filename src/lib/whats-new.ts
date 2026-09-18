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
 *   1. Add an entry to the TOP of WHATS_NEW in the PR that ships the feature.
 *   2. Give it a short silent clip when the feature is a gesture ("press Enter,
 *      the cursor jumps") — a clip needs no translation. Drop the file in
 *      public/whats-new/ (mp4/H.264 — iOS Safari won't play webm).
 *   3. Write `en`, draft `ar`, and let the client correct the Arabic once.
 *
 * The first time each user opens the app after a deploy they get the unseen
 * entries as a card stack (WhatsNewPrompt); the full list lives permanently at
 * /admin/whats-new and /driver/whats-new. Dismissals are recorded server-side
 * (`AnnouncementSeen`) so /super/support can show who has seen what.
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
};

/** Newest first. */
export const WHATS_NEW: WhatsNewEntry[] = [
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

/** Everything this audience hasn't dismissed, newest first. */
export function unseenEntries(
    audience: Audience,
    seenIds: Iterable<string>,
    entries: WhatsNewEntry[] = WHATS_NEW,
): WhatsNewEntry[] {
    const seen = new Set(seenIds);
    return entriesFor(audience, entries).filter((e) => !seen.has(e.id));
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
