import Link from "next/link";
import { Package, Truck } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-neo-bg flex flex-col items-center justify-center p-4 transition-colors relative">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="glass-panel p-8 rounded-3xl max-w-md w-full text-center">
        <div className="w-16 h-16 bg-accent-blue/10 dark:bg-accent-blue/20 rounded-2xl flex items-center justify-center mx-auto mb-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-accent-blue/10 animate-pulse"></div>
          <Package className="w-8 h-8 text-accent-blue relative z-10" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2 tracking-tight">VendingPro</h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8 font-medium">Please select your portal to continue.</p>

        <div className="space-y-4">
          <Link href="/admin" className="flex items-center justify-center gap-3 w-full py-4 bg-slate-900 dark:bg-accent-blue hover:bg-slate-800 dark:hover:bg-accent-blue/90 text-white rounded-xl font-bold transition-colors shadow-lg shadow-slate-900/10 dark:shadow-accent-blue/20">
            <Package className="w-5 h-5" />
            Enter Admin Dashboard
          </Link>
          <Link href="/driver" className="flex items-center justify-center gap-3 w-full py-4 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-900 dark:text-white rounded-xl font-bold transition-colors border border-slate-200 dark:border-white/10">
            <Truck className="w-5 h-5 text-slate-500 dark:text-slate-400" />
            Launch Driver Portal
          </Link>
        </div>
      </div>
    </div>
  );
}
