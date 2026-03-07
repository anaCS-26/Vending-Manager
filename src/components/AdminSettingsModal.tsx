"use client"

import { useState, useTransition } from "react";
import { X, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { updateMyProfile } from "@/actions/settings";

export function AdminSettingsModal({ user, isOpen, onClose }: { user: any, isOpen: boolean, onClose: () => void }) {
    const [isPending, startTransition] = useTransition();
    const [form, setForm] = useState({ name: user?.name || "", password: "" });

    if (!isOpen) return null;

    const handleSave = () => {
        startTransition(async () => {
            const res = await updateMyProfile(form.name, form.password || undefined);
            if (res.success) {
                toast.success("Profile updated successfully");
                onClose();
            } else {
                toast.error(res.error);
            }
        });
    }

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-neo-bg border border-slate-200 dark:border-white/10 w-full max-w-md rounded-3xl p-6 shadow-2xl relative">
                <button onClick={onClose} className="absolute right-4 top-4 p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-full hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
                    <X className="w-5 h-5" />
                </button>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">My Profile Settings</h3>
                <p className="text-sm text-slate-500 mb-6">Update your personal account information.</p>

                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Display Name</label>
                        <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-accent-blue" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">Email Address (Read-only)</label>
                        <input type="email" readOnly value={user?.email || ""} className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-slate-400 opacity-70 cursor-not-allowed" />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 block">New Password</label>
                        <input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="Leave blank to keep current password" className="w-full bg-slate-50 dark:bg-black/50 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-accent-blue" />
                    </div>
                </div>

                <div className="mt-8 flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-900 dark:text-white rounded-xl text-sm font-bold transition-colors">Cancel</button>
                    <button onClick={handleSave} disabled={isPending || !form.name.trim()} className="flex-1 py-3 bg-accent-blue hover:bg-accent-blue/90 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2">
                        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    )
}
