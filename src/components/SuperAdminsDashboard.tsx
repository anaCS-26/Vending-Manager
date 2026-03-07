"use client"

import { useState, useTransition } from "react";
import { Plus, Trash2, Edit2, Loader2, Users, Search, MoreVertical, Copy } from "lucide-react";
import { toast } from "sonner";
import { createAdmin, updateAdmin, deleteAdmin } from "@/actions/super";
import { ConfirmModal } from "@/components/ConfirmModal";

type Admin = {
    id: number;
    email: string;
    name?: string | null;
    createdAt: Date;
};

export default function SuperAdminsDashboard({ admins }: { admins: Admin[] }) {
    const [isPending, startTransition] = useTransition();
    const [searchQuery, setSearchQuery] = useState("");
    const [isAdding, setIsAdding] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    const [adminForm, setAdminForm] = useState({ name: "", email: "", password: "" });
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; id: number | null }>({ isOpen: false, id: null });

    const resetForms = () => {
        setIsAdding(false);
        setEditingId(null);
        setAdminForm({ name: "", email: "", password: "" });
    };

    const handleSaveAdmin = (id?: number) => {
        startTransition(async () => {
            let res;
            if (id) res = await updateAdmin(id, adminForm.email, adminForm.password || undefined, adminForm.name);
            else res = await createAdmin(adminForm.email, adminForm.password, adminForm.name);

            if (res.success) {
                toast.success(`Admin ${id ? 'updated' : 'added'} successfully`);
                resetForms();
            } else toast.error(res.error);
        });
    };

    const confirmDelete = () => {
        if (!deleteModal.id) return;
        startTransition(async () => {
            const res = await deleteAdmin(deleteModal.id!);
            if (res.success) toast.success("Admin deleted");
            else toast.error(res.error);
            setDeleteModal({ isOpen: false, id: null });
        });
    }

    const filteredAdmins = admins.filter(a => a.email.toLowerCase().includes(searchQuery.toLowerCase()) || (a.name || "").toLowerCase().includes(searchQuery.toLowerCase()));

    return (
        <div className="space-y-6">
            <div className="flex flex-col lg:flex-row gap-4 justify-between items-start lg:items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-white mb-2">Tenant Admins</h1>
                    <p className="text-slate-400 font-medium">Create client accounts and distribute temporary credentials.</p>
                </div>
                {!isAdding && (
                    <button onClick={() => { resetForms(); setIsAdding(true); }} className="flex items-center gap-2 px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-bold transition-all shadow-[0_0_20px_rgba(59,130,246,0.2)] whitespace-nowrap">
                        <Plus className="w-5 h-5" /> Onboard Client
                    </button>
                )}
            </div>

            {/* Global Search Bar */}
            <div className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-4 py-3 flex items-center gap-2 mb-6 focus-within:border-brand-500/50 transition-all">
                <Search className="w-5 h-5 text-slate-500" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search client admins..."
                    className="bg-transparent border-none outline-none text-sm text-white w-full placeholder:text-slate-600"
                />
            </div>

            {isAdding && (
                <div className="bg-slate-900 border border-brand-500/30 p-8 rounded-[2rem] mb-8">
                    <h3 className="text-white font-bold text-lg mb-6">New Tenant Credentials</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                        <div>
                            <label className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2 block">Company / Name</label>
                            <input type="text" value={adminForm.name} onChange={e => setAdminForm({ ...adminForm, name: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:border-brand-500 focus:outline-none" placeholder="Acme Corp" />
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2 block">Email Address</label>
                            <input type="email" value={adminForm.email} onChange={e => setAdminForm({ ...adminForm, email: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:border-brand-500 focus:outline-none" placeholder="admin@acme.com" />
                        </div>
                        <div>
                            <label className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-2 block">Temporary Password</label>
                            <input type="text" value={adminForm.password} onChange={e => setAdminForm({ ...adminForm, password: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:border-brand-500 focus:outline-none" placeholder="Auto-gen or Enter Temp Pwd" />
                        </div>
                    </div>
                    <div className="flex gap-3 justify-end mt-4">
                        <button onClick={() => setIsAdding(false)} className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold transition-colors">Cancel</button>
                        <button onClick={() => handleSaveAdmin()} disabled={isPending || !adminForm.email || !adminForm.password} className="flex items-center gap-2 px-6 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50">
                            {isPending && <Loader2 className="w-4 h-4 animate-spin" />} Create Account
                        </button>
                    </div>
                </div>
            )}

            {filteredAdmins.length === 0 && !isAdding ? (
                <div className="border border-dashed border-slate-800 rounded-[2rem] p-16 flex flex-col items-center justify-center text-center">
                    <Users className="w-16 h-16 text-slate-700 mb-6" />
                    <h3 className="text-white text-xl font-bold mb-2">No Active Clients</h3>
                    <p className="text-slate-400 max-w-sm">No tenant administrators exist yet. Click onboard client to create one.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredAdmins.map(admin => (
                        <div key={admin.id} className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 hover:border-slate-700 transition-colors group relative overflow-hidden">
                            {editingId === admin.id ? (
                                <div className="space-y-4">
                                    <input type="text" value={adminForm.name} onChange={e => setAdminForm({ ...adminForm, name: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:border-brand-500 focus:outline-none" placeholder="Name" />
                                    <input type="email" value={adminForm.email} onChange={e => setAdminForm({ ...adminForm, email: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:border-brand-500 focus:outline-none" placeholder="Email" />
                                    <input type="text" value={adminForm.password} onChange={e => setAdminForm({ ...adminForm, password: e.target.value })} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:border-brand-500 focus:outline-none" placeholder="New Password (optional)" />
                                    <div className="flex gap-2 pt-2 border-t border-slate-800">
                                        <button onClick={() => setEditingId(null)} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold transition-colors">Cancel</button>
                                        <button onClick={() => handleSaveAdmin(admin.id)} disabled={isPending} className="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-bold transition-all">Save</button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex justify-between items-start mb-6">
                                        <div className="flex items-center gap-4">
                                            <div className="w-14 h-14 rounded-2xl bg-slate-800 flex items-center justify-center text-white font-bold text-xl border border-slate-700 shadow-inner">
                                                {admin.email.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-white text-lg leading-tight truncate max-w-[150px]">{admin.name || "Unnamed"}</h3>
                                                <p className="text-sm text-slate-400 mt-1">{admin.email}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-4 mt-6 border-t border-slate-800 flex justify-between items-center text-xs text-slate-500">
                                        <span>Joined: {new Date(admin.createdAt).toLocaleDateString()}</span>
                                        <div className="flex gap-2">
                                            <button onClick={() => { setEditingId(admin.id); setAdminForm({ email: admin.email, name: admin.name || "", password: "" }) }} className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-all"><Edit2 className="w-4 h-4" /></button>
                                            <button onClick={() => setDeleteModal({ isOpen: true, id: admin.id })} className="p-2 text-slate-400 hover:text-accent-pink bg-slate-800 hover:bg-slate-700 rounded-lg transition-all"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <ConfirmModal
                isOpen={deleteModal.isOpen}
                title="Revoke Admin Access?"
                message="Are you sure you want to permanently delete this tenant admin? This revokes their ability to log into the system immediately."
                confirmText="Revoke Access"
                onConfirm={confirmDelete}
                onCancel={() => setDeleteModal({ isOpen: false, id: null })}
            />
        </div>
    );
}
