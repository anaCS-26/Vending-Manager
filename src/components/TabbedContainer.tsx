"use client";

import React, { useState } from "react";
import { Users, Target, TrendingUp, TrendingDown, Package, Activity } from "lucide-react";

export default function TabbedContainer({ tabs }: { tabs: { id: string, label: string, icon: React.ReactNode, content: React.ReactNode }[] }) {
    const [activeTab, setActiveTab] = useState(tabs[0].id);

    return (
        <div className="space-y-6">
            {/* Tab Headers */}
            <div className="flex flex-wrap gap-2 p-2 glass-panel border border-slate-200 dark:border-white/5 rounded-2xl w-fit">
                {tabs.map((tab) => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-300 ${
                                isActive 
                                ? "bg-accent-purple text-white shadow-lg shadow-accent-purple/20" 
                                : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
                            }`}
                        >
                            {tab.icon}
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Tab Content — only the active panel is mounted. Stacking the inactive ones
                with `absolute inset-0` sized them to the active tab but let their taller
                content paint past it, and that phantom overflow raised a second scrollbar
                on the admin layout column. */}
            <div key={activeTab} className="animate-in fade-in duration-300 fill-mode-both">
                {(tabs.find((t) => t.id === activeTab) ?? tabs[0]).content}
            </div>
        </div>
    );
}
