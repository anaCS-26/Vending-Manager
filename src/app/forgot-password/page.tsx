"use client"

import { useState, useTransition } from "react";
import { requestPasswordReset } from "@/actions/reset-password";
import { toast } from "sonner";
import { Mail, ArrowLeft, Loader2, Package } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function ForgotPasswordPage() {
    const [isPending, startTransition] = useTransition();
    const [email, setEmail] = useState("");
    const [isSent, setIsSent] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        startTransition(async () => {
            const res = await requestPasswordReset(email);
            if (res.success) {
                setIsSent(true);
            } else {
                toast.error(res.error || "Failed to request password reset.");
            }
        });
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-neo-bg text-slate-900 dark:text-white flex items-center justify-center p-4 transition-colors duration-300">
            <div className="absolute top-4 right-4 z-50">
                <ThemeToggle />
            </div>

            <div className="w-full max-w-md">
                <div className="flex items-center gap-3 justify-center mb-10">
                    <div className="w-12 h-12 bg-accent-blue/10 rounded-2xl flex items-center justify-center border border-accent-blue/20">
                        <Package className="w-6 h-6 text-accent-blue" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">VendingPro</h1>
                        <p className="text-sm font-medium text-slate-500 tracking-wide uppercase">Password Recovery</p>
                    </div>
                </div>

                <div className="bg-white dark:bg-black/40 backdrop-blur-3xl border border-slate-200 dark:border-white/10 rounded-3xl p-8 sm:p-10 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-accent-blue via-accent-pink to-accent-orange"></div>

                    {isSent ? (
                        <div className="text-center space-y-4">
                            <div className="w-16 h-16 bg-accent-green/10 text-accent-green rounded-full flex items-center justify-center mx-auto mb-6">
                                <Mail className="w-8 h-8" />
                            </div>
                            <h2 className="text-2xl font-bold">Check your inbox</h2>
                            <p className="text-slate-500 dark:text-slate-400">
                                If an account exists for <strong className="text-slate-900 dark:text-white">{email}</strong>, you will receive a secure link to reset your password shortly.
                            </p>
                            <Link href="/login" className="inline-flex items-center gap-2 text-sm font-bold text-accent-blue hover:text-accent-blue/80 mt-6 transition-colors">
                                <ArrowLeft className="w-4 h-4" /> Return to Login
                            </Link>
                        </div>
                    ) : (
                        <>
                            <div className="text-center mb-8">
                                <h2 className="text-2xl font-bold mb-2">Forgot Password?</h2>
                                <p className="text-sm text-slate-500 dark:text-slate-400">Enter your email address and we'll send you a link to reset your password securely.</p>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div>
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Company Email</label>
                                    <div className="relative">
                                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                            className="w-full bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-sm font-medium focus:outline-none focus:border-accent-blue transition-all placeholder:text-slate-400"
                                            placeholder="admin@yourcompany.com"
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isPending || !email}
                                    className="w-full flex items-center justify-center gap-2 h-12 bg-accent-blue hover:bg-accent-blue/90 text-white rounded-[1rem] font-bold transition-all disabled:opacity-50"
                                >
                                    {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Send Reset Link"}
                                </button>
                            </form>

                            <div className="mt-6 text-center">
                                <Link href="/login" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
                                    <ArrowLeft className="w-4 h-4" /> Back to Login
                                </Link>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
