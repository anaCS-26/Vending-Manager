"use client"

import { useActionState, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react"
import { resetPassword } from "@/actions/password-reset"

const PASSWORD_MIN_LENGTH = 10

export default function ResetPasswordForm({ token }: { token: string }) {
    const [state, formAction, isPending] = useActionState(resetPassword, undefined)
    const [showPassword, setShowPassword] = useState(false)
    const [password, setPassword] = useState("")
    const [confirm, setConfirm] = useState("")

    // Strip the token from the address bar once it is held in this component's
    // props: keeps it out of browser history and out of the Referer header on
    // any later navigation. The form posts the prop, not the URL.
    useEffect(() => {
        window.history.replaceState(null, "", "/reset-password")
    }, [])

    const tooShort = password.length > 0 && password.length < PASSWORD_MIN_LENGTH
    const mismatch = confirm.length > 0 && password !== confirm

    if (state?.ok) {
        return (
            <div className="text-center space-y-5">
                <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-accent-green/10 border border-accent-green/20">
                    <CheckCircle2 className="w-7 h-7 text-accent-green" />
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{state.message}</p>
                <Link
                    href="/login"
                    className="inline-flex items-center justify-center w-full py-4 rounded-xl gap-3 text-white font-bold uppercase tracking-widest transition-all bg-accent-green hover:bg-emerald-400 hover:shadow-[0_0_20px_rgba(52,211,153,0.4)]"
                >
                    Go to sign in
                </Link>
            </div>
        )
    }

    return (
        <form action={formAction} className="space-y-5">
            <input type="hidden" name="token" value={token} />

            <div>
                <label
                    htmlFor="new-password"
                    className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1 mb-2 block"
                >
                    New Password
                </label>
                <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                        <KeyRound className="w-5 h-5" />
                    </div>
                    <input
                        id="new-password"
                        type={showPassword ? "text" : "password"}
                        name="password"
                        required
                        autoFocus
                        autoComplete="new-password"
                        minLength={PASSWORD_MIN_LENGTH}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••"
                        className="w-full pl-12 pr-12 py-4 rounded-xl bg-slate-100 dark:bg-black/60 border border-slate-200 dark:border-white/10 focus:ring-2 focus:ring-accent-green/50 focus:border-accent-green outline-none transition-all text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 font-medium tracking-widest"
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
                    >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                </div>
                <p className={`text-[10px] font-bold uppercase tracking-widest ml-1 mt-2 ${tooShort ? "text-accent-pink" : "text-slate-400 dark:text-slate-500"}`}>
                    Minimum {PASSWORD_MIN_LENGTH} characters
                </p>
            </div>

            <div>
                <label
                    htmlFor="confirm-password"
                    className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1 mb-2 block"
                >
                    Confirm Password
                </label>
                <div className="relative">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                        <KeyRound className="w-5 h-5" />
                    </div>
                    <input
                        id="confirm-password"
                        type={showPassword ? "text" : "password"}
                        name="confirmPassword"
                        required
                        autoComplete="new-password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        placeholder="••••••••••"
                        className="w-full pl-12 pr-4 py-4 rounded-xl bg-slate-100 dark:bg-black/60 border border-slate-200 dark:border-white/10 focus:ring-2 focus:ring-accent-green/50 focus:border-accent-green outline-none transition-all text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 font-medium tracking-widest"
                    />
                </div>
                {mismatch && (
                    <p className="text-[10px] font-bold uppercase tracking-widest ml-1 mt-2 text-accent-pink">
                        Passwords do not match
                    </p>
                )}
            </div>

            {state && !state.ok && (
                <div className="p-4 rounded-xl bg-accent-pink/10 border border-accent-pink/20 text-accent-pink text-xs font-bold flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-accent-pink animate-pulse" />
                    {state.error}
                </div>
            )}

            <button
                type="submit"
                disabled={isPending || tooShort || mismatch}
                className="w-full py-4 rounded-xl flex items-center justify-center gap-3 text-white font-bold uppercase tracking-widest transition-all mt-8 bg-accent-green hover:bg-emerald-400 hover:shadow-[0_0_20px_rgba(52,211,153,0.4)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <span>Update password</span>}
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
