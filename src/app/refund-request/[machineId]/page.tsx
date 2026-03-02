import { MapPin, Phone, MessageSquare, AlertCircle } from "lucide-react";
import prisma from "@/lib/prisma";
import Image from "next/image";

export default async function RefundPortal({ params }: { params: { machineId: string } }) {
    // In a real app we'd fetch the machine by ID/TerminalID
    // const machine = await prisma.machine.findFirst({ where: { terminalId: params.machineId }});
    // For prototype, just use mock data if not found.

    return (
        <div className="min-h-screen bg-[#050505] text-slate-900 dark:text-white flex flex-col items-center justify-center p-6 sm:p-12 relative overflow-hidden font-sans">
            {/* Ambient Backgrounds */}
            <div className="absolute top-0 right-1/4 w-96 h-96 bg-accent-blue/10 rounded-full blur-[120px] pointer-events-none"></div>
            <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-accent-pink/10 rounded-full blur-[120px] pointer-events-none"></div>

            <div className="glass-panel border-slate-200 dark:border-white/10 rounded-[2rem] p-8 md:p-10 max-w-lg w-full relative z-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
                <div className="flex justify-center mb-8">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-blue/20 to-accent-pink/20 border border-slate-200 dark:border-white/10 flex items-center justify-center shadow-[0_0_30px_rgba(59,130,246,0.2)]">
                        <AlertCircle className="w-8 h-8 text-slate-900 dark:text-white" />
                    </div>
                </div>

                <div className="text-center mb-10">
                    <h1 className="text-3xl font-bold tracking-tight mb-2">Issue with your order?</h1>
                    <p className="text-slate-600 dark:text-slate-400">
                        We're sorry for the inconvenience. Request a secure digital refund for Machine <strong>#{params.machineId}</strong> instantly.
                    </p>
                </div>

                <form className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-300 ml-1">Phone Number (STC Pay / UrPay)</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <Phone className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                            </div>
                            <input
                                type="tel"
                                placeholder="05XXXXXXXX"
                                className="w-full bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl py-3.5 pl-12 pr-4 text-slate-900 dark:text-white placeholder:text-slate-600 focus:outline-none focus:border-accent-blue focus:ring-1 focus:ring-accent-blue transition-all"
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-500 dark:text-slate-400 dark:text-slate-300 ml-1">What went wrong?</label>
                        <div className="relative">
                            <div className="absolute top-3.5 left-0 pl-4 pointer-events-none">
                                <MessageSquare className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                            </div>
                            <textarea
                                placeholder="E.g., Snickers stuck, paid 5 ⃁..."
                                rows={3}
                                className="w-full bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl py-3.5 pl-12 pr-4 text-slate-900 dark:text-white placeholder:text-slate-600 focus:outline-none focus:border-accent-pink focus:ring-1 focus:ring-accent-pink transition-all resize-none"
                                required
                            />
                        </div>
                    </div>

                    <div className="pt-2">
                        <button type="button" className="w-full py-4 rounded-xl bg-gradient-to-r from-accent-blue to-accent-pink text-slate-900 dark:text-white font-bold text-lg hover:shadow-[0_0_30px_rgba(236,72,153,0.4)] transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">
                            Submit Request
                        </button>
                    </div>
                </form>

                <p className="mt-8 text-center text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" /> Secure system tailored for Saudi operations.
                </p>
            </div>
        </div>
    );
}
