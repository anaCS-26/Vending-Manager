"use client"

import { useState } from "react"
import Link from "next/link"
import { authenticate } from "@/actions/auth"
import { useActionState } from "react"
import { KeyRound, Phone, Mail, Eye, EyeOff, KeySquare, Loader2, ShieldCheck, Truck } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"

/**
 * Form only — the surrounding panel, heading and glow come from <AuthShell>,
 * which /forgot-password and /reset-password already use. This component used
 * to carry its own hand-copied version of that chrome, and it had already
 * drifted: raw `emerald-*` instead of the `accent-green` token, and `font-black`
 * on a face that caps at 800 (so the browser synthesised the weight).
 */
export default function LoginForm() {
    const [errorMessage, formAction, isPending] = useActionState(authenticate, undefined)
    const [loginMode, setLoginMode] = useState<"driver" | "admin">("driver")
    const [showPassword, setShowPassword] = useState(false)

    return (
        <>
                {/* Mode Toggles */}
                <div className="flex bg-slate-100 dark:bg-black/40 p-1.5 rounded-2xl mb-6 sm:mb-8 border border-slate-200 dark:border-white/5 relative">
                    <button
                        onClick={() => { setLoginMode("driver"); setShowPassword(false); }}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-[1rem] transition-all text-xs font-bold uppercase tracking-widest ${loginMode === "driver" ? "bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm" : "hover:bg-slate-200 dark:hover:bg-white/5 text-slate-500 dark:text-slate-400"}`}
                    >
                        <Truck className="w-4 h-4" />
                        Driver
                    </button>
                    <button
                        onClick={() => { setLoginMode("admin"); setShowPassword(false); }}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-[1rem] transition-all text-xs font-bold uppercase tracking-widest ${loginMode === "admin" ? "bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm" : "hover:bg-slate-200 dark:hover:bg-white/5 text-slate-500 dark:text-slate-400"}`}
                    >
                        <ShieldCheck className="w-4 h-4" />
                        Admin
                    </button>
                </div>

                <form action={formAction} className="space-y-5">
                    <input type="hidden" name="type" value={loginMode} />

                    <AnimatePresence mode="wait">
                        <motion.div
                            key={loginMode}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 10 }}
                            transition={{ duration: 0.2 }}
                            className="space-y-5"
                        >
                            {loginMode === "driver" ? (
                                <>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Phone Number</label>
                                        <div className="relative">
                                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                                                <Phone className="w-5 h-5" />
                                            </div>
                                            <input
                                                type="tel"
                                                name="phone"
                                                pattern="[0-9]*"
                                                inputMode="numeric"
                                                autoComplete="tel"
                                                required
                                                placeholder="05XXXXXXXX"
                                                className="w-full pl-12 pr-4 py-4 rounded-xl bg-slate-100 dark:bg-black/60 border border-slate-200 dark:border-white/10 focus:ring-2 focus:ring-accent-blue/50 focus:border-accent-blue outline-none transition-all text-slate-900 dark:text-white font-mono placeholder:text-slate-400 dark:placeholder:text-slate-600"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Password</label>
                                        <div className="relative">
                                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                                                <KeySquare className="w-5 h-5" />
                                            </div>
                                            <input
                                                type={showPassword ? "text" : "password"}
                                                inputMode="numeric"
                                                pattern="[0-9]*"
                                                name="pin"
                                                required
                                                placeholder="••••••••"
                                                className="w-full pl-12 pr-12 py-4 rounded-xl bg-slate-100 dark:bg-black/60 border border-slate-200 dark:border-white/10 focus:ring-2 focus:ring-accent-blue/50 focus:border-accent-blue outline-none transition-all text-slate-900 dark:text-white font-mono placeholder:text-slate-400 dark:placeholder:text-slate-600 tracking-widest text-lg"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
                                            >
                                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                            </button>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Admin Email</label>
                                        <div className="relative">
                                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                                                <Mail className="w-5 h-5" />
                                            </div>
                                            <input
                                                type="email"
                                                name="email"
                                                required
                                                placeholder="admin@vending.com"
                                                className="w-full pl-12 pr-4 py-4 rounded-xl bg-slate-100 dark:bg-black/60 border border-slate-200 dark:border-white/10 focus:ring-2 focus:ring-accent-green/50 focus:border-accent-green outline-none transition-all text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 font-medium"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Password</label>
                                        <div className="relative">
                                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                                                <KeyRound className="w-5 h-5" />
                                            </div>
                                            <input
                                                type={showPassword ? "text" : "password"}
                                                name="password"
                                                required
                                                placeholder="••••••••"
                                                className="w-full pl-12 pr-12 py-4 rounded-xl bg-slate-100 dark:bg-black/60 border border-slate-200 dark:border-white/10 focus:ring-2 focus:ring-accent-green/50 focus:border-accent-green outline-none transition-all text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-600 font-medium tracking-widest"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors"
                                            >
                                                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                            </button>
                                        </div>
                                        <div className="flex justify-end mt-2">
                                            <Link href="/forgot-password" className="text-xs font-bold text-slate-500 hover:text-accent-green transition-colors">Forgot password?</Link>
                                        </div>
                                    </div>
                                </>
                            )}
                        </motion.div>
                    </AnimatePresence>

                    {errorMessage && 'error' in errorMessage && (
                        <div className="p-4 rounded-xl bg-accent-pink/10 border border-accent-pink/20 text-accent-pink text-xs font-bold flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-accent-pink animate-pulse"></div>
                            {errorMessage.error as string}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isPending}
                        className={`w-full py-4 rounded-xl flex items-center justify-center gap-3 text-white font-bold uppercase tracking-widest transition-all mt-8
              ${loginMode === "admin" ? "bg-accent-green hover:bg-emerald-400 hover:shadow-[0_0_20px_rgba(52,211,153,0.4)]" : "bg-accent-blue hover:bg-blue-400 hover:shadow-[0_0_20px_rgba(59,130,246,0.4)]"} 
              disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                        {isPending ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <span>Authorize Access</span>
                        )}
                    </button>
                </form>
        </>
    )
}
