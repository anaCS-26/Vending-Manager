import { cn } from "@/lib/utils";

/**
 * One string in both languages, shown together.
 *
 * Deliberately not a language switch. The client's admins read Arabic, the
 * drivers' first language varies, the developer reads English, and the screens
 * this is used on (What's New, Report a problem, error states) exist precisely
 * because those people can't assume a shared language — so both are always on
 * screen and nobody has to find a setting first. Full-app Arabic is a separate,
 * much larger piece of work (the parked next-intl branch).
 *
 * Block form stacks Arabic over English, each in its own direction. `inline`
 * is for buttons and chips: "Send · إرسال". Arabic carries `lang`/`dir` so
 * screen readers switch voice and punctuation lands on the correct side.
 *
 * No "use client": it renders the same on both sides of the RSC boundary.
 */
export function Bi({
    en,
    ar,
    inline = false,
    className,
}: {
    en: string;
    ar: string;
    inline?: boolean;
    className?: string;
}) {
    if (inline) {
        return (
            <span className={className}>
                {en} <span aria-hidden="true">·</span>{" "}
                <span lang="ar" dir="rtl">
                    {ar}
                </span>
            </span>
        );
    }
    return (
        <span className={cn("block", className)}>
            <span lang="ar" dir="rtl" className="block leading-relaxed">
                {ar}
            </span>
            <span className="block opacity-75 text-[0.9em]">{en}</span>
        </span>
    );
}
