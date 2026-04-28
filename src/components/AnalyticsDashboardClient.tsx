"use client";

import { useState, useEffect } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, TrendingDown, Target, MapPin, DollarSign, Package, AlertTriangle } from "lucide-react";
import { formatCurrency, formatSaudiDate } from "@/lib/utils";

type Props = {
    machinesData: any[]; // Has RefillLogs
    allRefillsData: { name: string, category: string, totalRefilled: number }[];
};

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

export default function AnalyticsDashboardClient({ machinesData, allRefillsData }: Props) {
    const [selectedMachineId, setSelectedMachineId] = useState<string>("all");
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    // 1. Process Category Distribution
    const categoryMap = allRefillsData.reduce((acc, curr) => {
        if (!acc[curr.category]) acc[curr.category] = 0;
        acc[curr.category] += curr.totalRefilled;
        return acc;
    }, {} as Record<string, number>);

    const categoryData = Object.keys(categoryMap).map(key => ({
        name: key,
        value: categoryMap[key]
    })).sort((a, b) => b.value - a.value);

    // 2. Process Machine Refill Trends
    let trendData: any[] = [];
    let machineTopItems: any[] = [];

    if (selectedMachineId === "all") {
        // Aggregate all refills by date across all machines
        const dateMap: Record<string, number> = {};
        machinesData.forEach(m => {
            m.RefillLogs?.forEach((rl: any) => {
                const date = formatSaudiDate(rl.refilled_at);
                if (!dateMap[date]) dateMap[date] = 0;
                dateMap[date] += rl.quantity_refilled;
            });
        });
        trendData = Object.keys(dateMap).map(date => ({
            date,
            refills: dateMap[date]
        })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(-14); // Last 14 active days
    } else {
        const machine = machinesData.find(m => m.id.toString() === selectedMachineId);
        if (machine) {
            const dateMap: Record<string, number> = {};
            const itemMap: Record<string, number> = {};

            machine.RefillLogs?.forEach((rl: any) => {
                const date = formatSaudiDate(rl.refilled_at);
                if (!dateMap[date]) dateMap[date] = 0;
                dateMap[date] += rl.quantity_refilled;

                const itemName = rl.item?.name || 'Unknown';
                if (!itemMap[itemName]) itemMap[itemName] = 0;
                itemMap[itemName] += rl.quantity_refilled;
            });

            trendData = Object.keys(dateMap).map(date => ({
                date,
                refills: dateMap[date]
            })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(-14);

            machineTopItems = Object.keys(itemMap).map(name => ({
                name,
                volume: itemMap[name]
            })).sort((a, b) => b.volume - a.volume).slice(0, 5);
        }
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700">
            {/* Interactive Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Refill Trends Chart */}
                <div className="lg:col-span-2 glass-panel border border-slate-200 dark:border-white/5 rounded-3xl overflow-hidden shadow-2xl p-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                        <h3 className="font-semibold text-slate-900 dark:text-white tracking-tight text-lg flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-accent-blue" />
                            Refill Volume Trends (Last 14 Days)
                        </h3>
                        <div className="relative">
                            <select
                                className="appearance-none bg-slate-100 dark:bg-black/40 border border-slate-200 dark:border-white/10 rounded-xl py-2 pl-4 pr-10 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-accent-blue transition-colors cursor-pointer"
                                value={selectedMachineId}
                                onChange={(e) => setSelectedMachineId(e.target.value)}
                            >
                                <option value="all">All Machines</option>
                                {machinesData.map(m => (
                                    <option key={m.id} value={m.id}>
                                        {m.id} - {m.location_name}
                                    </option>
                                ))}
                            </select>
                            <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                    </div>
                    
                    <div className="h-[300px] w-full">
                        {!isMounted ? (
                            <div className="w-full h-full flex items-center justify-center text-slate-500 animate-pulse bg-slate-100 dark:bg-white/5 rounded-xl">Loading chart...</div>
                        ) : trendData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                                <LineChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                    <XAxis 
                                        dataKey="date" 
                                        stroke="#888888" 
                                        fontSize={12} 
                                        tickLine={false} 
                                        axisLine={false} 
                                        tickFormatter={(val) => {
                                            const d = new Date(val);
                                            return isNaN(d.getTime()) ? val : d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
                                        }}
                                    />
                                    <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }}
                                        itemStyle={{ color: '#fff' }}
                                        labelFormatter={(val) => {
                                            const d = new Date(val);
                                            return isNaN(d.getTime()) ? val : d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                                        }}
                                    />
                                    <Line 
                                        type="monotone" 
                                        dataKey="refills" 
                                        stroke="#3b82f6" 
                                        strokeWidth={3} 
                                        dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }}
                                        activeDot={{ r: 6, strokeWidth: 0 }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-500 text-sm">No refill data available for this selection.</div>
                        )}
                    </div>
                </div>

                {/* Dynamic Right Panel (Category or Machine Top Items) */}
                <div className="glass-panel border border-slate-200 dark:border-white/5 rounded-3xl overflow-hidden shadow-2xl p-6 flex flex-col">
                    <h3 className="font-semibold text-slate-900 dark:text-white tracking-tight text-lg flex items-center gap-2 mb-6">
                        {selectedMachineId === "all" ? (
                            <><Package className="w-5 h-5 text-accent-purple" /> Category Breakdown</>
                        ) : (
                            <><Target className="w-5 h-5 text-accent-green" /> Machine Best Sellers</>
                        )}
                    </h3>

                    <div className="flex-1 w-full relative min-h-[200px]">
                        {!isMounted ? (
                            <div className="w-full h-full flex items-center justify-center text-slate-500 animate-pulse bg-slate-100 dark:bg-white/5 rounded-xl mt-4">Loading chart...</div>
                        ) : selectedMachineId === "all" ? (
                            categoryData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                                    <PieChart>
                                        <Pie
                                            data={categoryData}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={90}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {categoryData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Pie>
                                        <Tooltip 
                                            contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }}
                                            itemStyle={{ color: '#fff' }}
                                        />
                                        <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                    </PieChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-slate-500 text-sm">No category data.</div>
                            )
                        ) : (
                            machineTopItems.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                                    <BarChart data={machineTopItems} layout="vertical" margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={true} vertical={false} />
                                        <XAxis type="number" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} hide />
                                        <YAxis dataKey="name" type="category" stroke="#888888" fontSize={11} tickLine={false} axisLine={false} width={100} />
                                        <Tooltip 
                                            cursor={{fill: 'rgba(255,255,255,0.05)'}}
                                            contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }}
                                            itemStyle={{ color: '#fff' }}
                                        />
                                        <Bar dataKey="volume" fill="#10b981" radius={[0, 4, 4, 0]}>
                                            {machineTopItems.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-slate-500 text-sm">No items refilled yet.</div>
                            )
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
