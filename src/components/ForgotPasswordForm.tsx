"use client"

import { useActionState } from "react"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, Loader2, Mail } from "lucide-react"
import { requestPasswordReset } from "@/actions/password-reset"

export default function ForgotPasswordForm() {
    const [state, formAction, isPending] = useActionState(requestPasswordReset, undefined)

    // The success copy is deliberately account-agnostic — it is the same whether
    // or not the address matched an admin.
    if (state?.ok) {
        return (
            <div className="text-center space-y-5">
                <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-accent-green/10 border border-accent-green/20">
                    <CheckCircle2 className="w-7 h-7 text-accent-green" />
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{state.message}</p>
                <Link
                    href="/login"
                    className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-slate-500 hover:text-accent-green transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to sign in
                </Link>
            </div>
        )
    }

    return (
        <form action={formAction} className="space-y-5">
            <div>
                <label
                    htmlFor="reset-email"
                    className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1 mb-2 block"
                >
                    Admin Email
                </label>
                <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                        <Mail className="w-5 h-5" />
                    </div>
                    <input
                        id="reset-email"
                        type="email"
                        name="email"
                        required
                        autoComplete="email"
                        autoFocus
                        placeholder="admin@vending.com"
                        className="w-full pl-12 pr-4 py-4 rounded-xl bg-slate-100 dark:bg-black/60 border border-slate-200 dark:border-white/10 focus:ring-2 focus:ring-accent-green/50 focus:border-accent-green outline-none transition-all text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 font-medium"
                    />
                </div>
            </div>

            {state && !state.ok && (
                <div className="p-4 rounded-xl bg-accent-pink/10 border border-accent-pink/20 text-accent-pink text-xs font-bold flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-accent-pink animate-pulse" />
                    {state.error}
                </div>
            )}

            <button
                type="submit"
                disabled={isPending}
                className="w-full py-4 rounded-xl flex items-center justify-center gap-3 text-white font-bold uppercase tracking-widest transition-all mt-8 bg-accent-green hover:bg-emerald-400 hover:shadow-[0_0_20px_rgba(52,211,153,0.4)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Send reset link</span>}
            </button>

            <div className="flex justify-center pt-2">
                <Link
                    href="/login"
                    className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-accent-green transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to sign in
                </Link>
            </div>
        </form>
    )
}
