"use client"

import { useState, useTransition } from "react";
import { resetPassword } from "@/actions/reset-password";
import { toast } from "sonner";
import { Lock, Loader2, Package, CheckCircle2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function ResetPasswordClient({ token }: { token: string }) {
    const [isPending, startTransition] = useTransition();
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [isSuccess, setIsSuccess] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (password !== confirmPassword) {
            toast.error("Passwords do not match");
            return;
        }

        if (password.length < 8) {
            toast.error("Password must be at least 8 characters");
            return;
        }

        startTransition(async () => {
            const res = await resetPassword(token, password);
            if (res.success) {
                setIsSuccess(true);
            } else {
                toast.error(res.error || "Failed to reset password.");
            }
        });
    }

    if (isSuccess) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-neo-bg text-slate-900 dark:text-white flex items-center justify-center p-4 transition-colors duration-300">
                <div className="text-center bg-white dark:bg-black/40 backdrop-blur-3xl border border-slate-200 dark:border-white/10 rounded-3xl p-10 shadow-2xl space-y-6 max-w-sm w-full">
                    <div className="w-20 h-20 bg-accent-green/10 text-accent-green rounded-[1.5rem] flex items-center justify-center mx-auto shadow-inner border border-accent-green/20">
                        <CheckCircle2 className="w-10 h-10" />
                    </div>
                    <h2 className="text-2xl font-black">Password Saved</h2>
                    <p className="text-slate-500 font-medium">Your account is now secured with a new password.</p>
                    <Link href="/login" className="flex items-center justify-center gap-2 h-12 w-full bg-accent-blue hover:bg-accent-blue/90 text-white rounded-xl font-bold transition-all group">
                        Sign In Now <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </Link>
                </div>
            </div>
        )
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
                        <p className="text-sm font-medium text-slate-500 tracking-wide uppercase">New Password</p>
                    </div>
                </div>

                <div className="bg-white dark:bg-black/40 backdrop-blur-3xl border border-slate-200 dark:border-white/10 rounded-3xl p-8 sm:p-10 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-accent-blue via-accent-pink to-accent-orange"></div>

                    <div className="text-center mb-8">
                        <h2 className="text-2xl font-bold mb-2">Create New Password</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Please choose a strong, secure password for your administrator account.</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">New Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        className="w-full bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-sm font-bold focus:outline-none focus:border-accent-blue transition-all"
                                        placeholder="Min. 8 characters"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Confirm Password</label>
                                <div className="relative">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                                    <input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        required
                                        className="w-full bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-2xl py-3.5 pl-12 pr-4 text-sm font-bold focus:outline-none focus:border-accent-blue transition-all"
                                        placeholder="Repeat your password"
                                    />
                                </div>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isPending || !password || !confirmPassword}
                            className="w-full flex items-center justify-center gap-2 h-12 bg-accent-blue hover:bg-accent-blue/90 text-white rounded-[1rem] font-bold transition-all disabled:opacity-50"
                        >
                            {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : "Secure & Save Password"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
