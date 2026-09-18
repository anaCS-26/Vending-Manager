"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { CheckCircle2, ImagePlus, Loader2, MessageSquareWarning, Send, X } from "lucide-react";
import imageCompression from "browser-image-compression";
import { submitProblemReport } from "@/actions/support";
import { useModalBehavior } from "@/hooks/useModalBehavior";
import { Bi } from "@/components/Bi";

type Props = {
    isOpen: boolean;
    onClose: () => void;
    /** An error code / digest already on the user's screen, attached for them. */
    errorCode?: string | null;
};

/**
 * "Report a problem" — the client's way of telling the developer something is
 * wrong without having to describe it in a second language.
 *
 * The form asks for the two things only the reporter knows (what happened, and
 * optionally a picture) and attaches everything else itself: the page, the
 * device, the viewport, whether the app is installed, whether it was online.
 * The server adds who they are and, at /super/support, what errors that person
 * hit in the half hour before.
 *
 * Every string is shown in Arabic AND English rather than behind a language
 * switch: the admins read Arabic, the drivers' first language varies, and a
 * toggle is one more control on a screen whose whole job is to be effortless.
 * The textarea is `dir="auto"` so Arabic typing flows right-to-left unprompted.
 */
export function ReportProblemModal({ isOpen, onClose, errorCode }: Props) {
    const titleId = useId();
    const pathname = usePathname();
    const { resolvedTheme } = useTheme();
    const [note, setNote] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [sentCode, setSentCode] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const fileInput = useRef<HTMLInputElement>(null);
    const [mounted, setMounted] = useState(false);

    // Holds typed text, so a stray Escape must not bin it (the calibration-modal rule).
    const { panelRef, dialogProps } = useModalBehavior({
        isOpen,
        onClose,
        closeOnEscape: false,
        labelledBy: titleId,
    });

    useEffect(() => setMounted(true), []);

    useEffect(() => {
        if (!file) {
            setPreviewUrl(null);
            return;
        }
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    const close = () => {
        if (isPending) return;
        onClose();
        // Reset after a successful send; keep a draft the user closed by accident.
        if (sentCode) {
            setNote("");
            setFile(null);
            setSentCode(null);
        }
        setError(null);
    };

    const pickFile = async (picked: File | undefined) => {
        if (!picked) return;
        setError(null);
        try {
            // A phone screenshot is 2–6 MB; the action caps at 5 and the driver
            // is often on a weak signal. 1600px keeps small UI text legible.
            const compressed = await imageCompression(picked, { maxSizeMB: 1, maxWidthOrHeight: 1600 });
            setFile(new File([compressed], picked.name, { type: compressed.type || picked.type }));
        } catch {
            setFile(picked);
        }
    };

    const submit = () => {
        setError(null);
        if (typeof navigator !== "undefined" && !navigator.onLine) {
            setError("You're offline. Try again when you have a signal.\nأنت غير متصل بالإنترنت. حاول مرة أخرى عند توفر الشبكة.");
            return;
        }
        const form = new FormData();
        form.set("note", note);
        form.set("path", pathname ?? "");
        if (errorCode) form.set("errorCode", errorCode);
        if (file) form.set("screenshot", file);
        form.set(
            "device",
            JSON.stringify({
                viewport: `${window.innerWidth}x${window.innerHeight}`,
                dpr: window.devicePixelRatio,
                standalone: window.matchMedia("(display-mode: standalone)").matches,
                online: navigator.onLine,
                language: navigator.language,
                theme: resolvedTheme ?? "unknown",
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }),
        );

        startTransition(async () => {
            try {
                const result = await submitProblemReport(form);
                if (result.success) setSentCode(result.data.code);
                else setError(result.error);
            } catch {
                setError("Could not send the report. Please try again.\nتعذّر إرسال البلاغ. يرجى المحاولة مرة أخرى.");
            }
        });
    };

    if (!mounted || !isOpen) return null;

    const canSend = (note.trim().length > 0 || !!file || !!errorCode) && !isPending;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center sm:p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={close} />
            <div
                ref={panelRef}
                {...dialogProps}
                className="relative w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto overscroll-contain bg-white dark:bg-neo-bg border border-slate-200 dark:border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 sm:p-6 pb-safe"
                style={{ ["--safe-extra" as string]: "1.25rem" }}
            >
                <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 shrink-0 rounded-2xl bg-accent-blue/10 border border-accent-blue/20 text-accent-blue flex items-center justify-center">
                            <MessageSquareWarning className="w-5 h-5" />
                        </div>
                        <h2 id={titleId} className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                            <Bi en="Report a problem" ar="الإبلاغ عن مشكلة" />
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={close}
                        disabled={isPending}
                        aria-label="Close"
                        className="w-11 h-11 shrink-0 rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 disabled:opacity-40"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {sentCode ? (
                    <div className="text-center py-6">
                        <div className="mx-auto mb-4 w-16 h-16 rounded-2xl bg-accent-green/10 border border-accent-green/20 text-accent-green flex items-center justify-center">
                            <CheckCircle2 className="w-8 h-8" />
                        </div>
                        <p className="text-base font-bold text-slate-900 dark:text-white">
                            <Bi en="Sent. Thank you." ar="تم الإرسال. شكراً لك." />
                        </p>
                        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                            <Bi en="Your report number" ar="رقم البلاغ" />
                        </p>
                        <p className="mt-1 font-mono text-2xl font-bold tracking-widest text-slate-900 dark:text-white select-all">
                            {sentCode}
                        </p>
                        <button
                            type="button"
                            onClick={close}
                            className="mt-6 w-full min-h-[48px] rounded-xl bg-accent-blue text-white font-bold hover:bg-accent-blue/90"
                        >
                            <Bi inline en="Done" ar="تم" />
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <p className="text-sm text-slate-600 dark:text-slate-400">
                            <Bi
                                en="Write in Arabic or English. We automatically attach the page you are on and your device details."
                                ar="اكتب بالعربية أو الإنجليزية. نُرفق تلقائياً الصفحة التي أنت فيها وبيانات جهازك."
                            />
                        </p>

                        {errorCode && (
                            <p className="rounded-xl border border-accent-pink/20 bg-accent-pink/10 px-3 py-2 text-sm text-slate-700 dark:text-slate-200">
                                <Bi inline en="Error code attached" ar="تم إرفاق رمز الخطأ" />{" "}
                                <span className="font-mono font-bold">{errorCode}</span>
                            </p>
                        )}

                        <label className="block">
                            <span className="sr-only">What happened? ماذا حدث؟</span>
                            <textarea
                                dir="auto"
                                lang={/[\u0600-\u06FF]/.test(note) ? "ar" : undefined}
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                maxLength={2000}
                                rows={5}
                                placeholder="What happened? · ماذا حدث؟"
                                className="w-full rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] px-4 py-3 text-base text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-blue/40"
                            />
                        </label>

                        <input
                            ref={fileInput}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                                void pickFile(e.target.files?.[0]);
                                e.target.value = "";
                            }}
                        />
                        {previewUrl ? (
                            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-white/10 p-2">
                                {/* A local object URL — next/image can't optimise a blob: URL. */}
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={previewUrl} alt="" className="w-16 h-16 rounded-xl object-cover" />
                                <p className="flex-1 min-w-0 text-sm text-slate-700 dark:text-slate-200">
                                    <Bi en="Screenshot attached" ar="تم إرفاق لقطة الشاشة" />
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setFile(null)}
                                    aria-label="Remove screenshot"
                                    className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={() => fileInput.current?.click()}
                                className="w-full min-h-[52px] flex items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-300 dark:border-white/15 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.03]"
                            >
                                <ImagePlus className="w-5 h-5 shrink-0" />
                                <Bi en="Add a screenshot (optional)" ar="أضف لقطة شاشة (اختياري)" />
                            </button>
                        )}

                        {error && (
                            <p role="alert" className="whitespace-pre-line [unicode-bidi:plaintext] rounded-xl bg-accent-pink/10 border border-accent-pink/20 px-3 py-2 text-sm text-accent-pink">
                                {error}
                            </p>
                        )}

                        <button
                            type="button"
                            onClick={submit}
                            disabled={!canSend}
                            className="w-full min-h-[52px] flex items-center justify-center gap-2 rounded-xl bg-accent-blue text-white font-bold hover:bg-accent-blue/90 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                            <Bi inline en={isPending ? "Sending…" : "Send"} ar={isPending ? "جارٍ الإرسال…" : "إرسال"} />
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body,
    );
}
