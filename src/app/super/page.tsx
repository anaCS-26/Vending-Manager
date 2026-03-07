export const dynamic = 'force-dynamic';
import prisma from "@/lib/prisma";
import { Activity, Database, Users, LayoutDashboard } from "lucide-react";
import Link from "next/link";

export default async function SuperDashboardPage() {
    const adminCount = await prisma.admin.count({ where: { role: 'ADMIN' } });
    const superAdminCount = await prisma.admin.count({ where: { role: 'SUPER_ADMIN' } });

    // Very basic dummy metrics for now
    const stats = [
        { name: 'Tenant Admins', value: adminCount.toString(), desc: 'Active client accounts', icon: Users, color: 'text-brand-400', bg: 'bg-brand-500/10' },
        { name: 'Super Admins', value: superAdminCount.toString(), desc: 'Developer accounts', icon: Activity, color: 'text-purple-400', bg: 'bg-purple-500/10' },
        { name: 'Database Connection', value: 'Healthy', desc: 'Supabase PgSQL', icon: Database, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    ];

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-white mb-2">Provider Health</h1>
                <p className="text-slate-400">High-level overview of your infrastructure and tenants.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {stats.map((stat, i) => (
                    <div key={i} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden group hover:border-slate-700 transition-colors cursor-default">
                        <div className="flex justify-between items-start mb-4">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${stat.bg} relative z-10`}>
                                <stat.icon className={`w-6 h-6 ${stat.color}`} />
                            </div>
                        </div>
                        <h3 className="text-4xl font-black text-white mb-2 tracking-tight">{stat.value}</h3>
                        <p className="font-bold text-slate-300">{stat.name}</p>
                        <p className="text-sm text-slate-500">{stat.desc}</p>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
                    <h3 className="text-xl font-bold text-white mb-4">Infrastructure Links</h3>
                    <div className="space-y-4">
                        <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-4 bg-slate-950 border border-slate-800 rounded-2xl hover:bg-slate-800 transition-colors">
                            <div className="flex items-center gap-3">
                                <Database className="w-5 h-5 text-emerald-400" />
                                <span className="font-medium text-slate-200">Supabase Dashboard</span>
                            </div>
                            <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">External</span>
                        </a>
                        <a href="https://vercel.com/dashboard" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-4 bg-slate-950 border border-slate-800 rounded-2xl hover:bg-slate-800 transition-colors">
                            <div className="flex items-center gap-3">
                                <Activity className="w-5 h-5 text-white" />
                                <span className="font-medium text-slate-200">Vercel Deployments</span>
                            </div>
                            <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">External</span>
                        </a>
                    </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8">
                    <h3 className="text-xl font-bold text-white mb-4">Quick Actions</h3>
                    <p className="text-slate-400 mb-6 text-sm">Need to onboard a new client? Create their initial Tenant Admin account to get them started.</p>
                    <Link href="/super/admins" className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-bold transition-colors w-full">
                        <Users className="w-5 h-5" />
                        Manage Tenant Admins
                    </Link>
                </div>
            </div>
        </div>
    );
}
