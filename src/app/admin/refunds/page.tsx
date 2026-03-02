import { CreditCard, Search, CheckCircle2, Clock, AlertTriangle, MessageSquare, Phone, Smartphone } from "lucide-react";
import prisma from "@/lib/prisma"; // Assuming a prisma client instance

export default async function RefundsPage() {
    // In a real implementation this would fetch from prisma:
    // const refunds = await prisma.customerRefund.findMany({ orderBy: { createdAt: 'desc' } });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const refunds: any[] = [];

    return (
        <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-20">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 py-4">
                <div>
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                        Customer Refunds
                    </h1>
                    <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">
                        Manage failed vends and process STC Pay/UrPay transfers.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <a href="/refund-request/DEMO123" target="_blank" className="px-5 py-2.5 bg-accent-blue/10 hover:bg-accent-blue/20 text-accent-blue border border-accent-blue/20 rounded-xl text-sm font-bold transition-colors flex gap-2 items-center">
                        <Smartphone className="w-4 h-4" />
                        View Live QR Portal
                    </a>
                    <div className="hidden md:flex w-12 h-12 rounded-xl bg-accent-blue/10 border border-accent-blue/20 items-center justify-center">
                        <CreditCard className="w-6 h-6 text-accent-blue" />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                        <Clock className="w-16 h-16 text-slate-900 dark:text-white" />
                    </div>
                    <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">Pending Approvals</p>
                    <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">0</p>
                </div>
                <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                        <CheckCircle2 className="w-16 h-16 text-slate-900 dark:text-white" />
                    </div>
                    <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">Completed (This Month)</p>
                    <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">0</p>
                </div>
                <div className="glass-panel p-6 rounded-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                        <CreditCard className="w-16 h-16 text-slate-900 dark:text-white" />
                    </div>
                    <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">Total Refunded Value</p>
                    <p className="text-3xl font-bold text-slate-900 dark:text-white mt-1">0 ⃁</p>
                </div>
            </div>

            <div className="glass-panel border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden relative">
                <div className="px-6 py-5 border-b border-slate-200 dark:border-white/5 flex items-center justify-between bg-slate-50 dark:bg-white/[0.02]">
                    <h3 className="font-semibold text-slate-900 dark:text-white text-sm flex items-center gap-2 tracking-tight">
                        <CreditCard className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                        Refund Requests
                    </h3>
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-600 dark:text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search SR# or Phone..."
                                className="pl-9 pr-4 py-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-blue/40 w-64"
                            />
                        </div>
                        <button className="px-5 py-2.5 bg-accent-blue/10 hover:bg-accent-blue/20 text-accent-blue border border-accent-blue/20 rounded-xl text-sm font-medium transition-colors">
                            + New Request
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto scroll-fade-right custom-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[800px]">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-white/5 text-xs text-slate-600 dark:text-slate-400 font-medium bg-slate-100 dark:bg-black/20">
                                <th className="px-6 py-4 font-medium uppercase tracking-wider">SR # / Refund Num</th>
                                <th className="px-6 py-4 font-medium uppercase tracking-wider">Phone Number</th>
                                <th className="px-6 py-4 font-medium uppercase tracking-wider">Item Price</th>
                                <th className="px-6 py-4 font-medium uppercase tracking-wider text-center">Status</th>
                                <th className="px-6 py-4 font-medium uppercase tracking-wider text-right">Received Money</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                            {refunds.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-600 dark:text-slate-400 text-sm">
                                        No refund records found.
                                    </td>
                                </tr>
                            )}
                            {refunds.map((refund) => (
                                <tr key={refund.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors duration-200">
                                    <td className="px-6 py-4 font-mono text-xs text-slate-500 dark:text-slate-400 dark:text-slate-300">
                                        {refund.refundNumber}
                                    </td>
                                    <td className="px-6 py-4 text-slate-900 dark:text-white text-sm">
                                        {refund.phoneNumber || "N/A"}
                                    </td>
                                    <td className="px-6 py-4 text-slate-900 dark:text-white text-sm">
                                        {refund.itemPrice.toFixed(2)} ⃁
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <span className={`inline - flex items - center gap - 1.5 px - 2.5 py - 1 text - xs font - semibold rounded - md ${refund.status === 'DONE' ? 'bg-accent-green/10 text-accent-green border border-accent-green/20' : 'bg-accent-orange/10 text-accent-orange border border-accent-orange/20'} `}>
                                            {refund.status}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right text-sm text-slate-900 dark:text-white font-medium">
                                        {refund.receivedMoney?.toFixed(2) || "0.00"} ⃁
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
