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

            {/* Tab Content */}
            <div className="relative">
                {tabs.map((tab) => (
                    <div 
                        key={tab.id} 
                        className={`transition-all duration-500 ${activeTab === tab.id ? "opacity-100 translate-y-0 relative z-10" : "opacity-0 translate-y-4 absolute inset-0 pointer-events-none z-0"}`}
                    >
                        {tab.content}
                    </div>
                ))}
            </div>
        </div>
    );
}
