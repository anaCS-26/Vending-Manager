"use client";

import { useState, useEffect } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { formatCurrency } from "@/lib/utils";

/** 14-day revenue sparkline for the provider Overview. Data is pre-bucketed by Riyadh day. */
export default function SuperRevenueTrend({ data }: { data: { date: string; revenue: number }[] }) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const hasData = data.some((d) => d.revenue > 0);

    return (
        <div className="h-[260px] w-full">
            {!mounted ? (
                <div className="w-full h-full flex items-center justify-center text-slate-500 animate-pulse bg-slate-100 dark:bg-white/5 rounded-xl">
                    Loading chart…
                </div>
            ) : hasData ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                    <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <defs>
                            <linearGradient id="superRev" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" vertical={false} />
                        <XAxis
                            dataKey="date"
                            stroke="#888888"
                            fontSize={11}
                            tickLine={false}
                            axisLine={false}
                            tickFormatter={(val) => {
                                const d = new Date(val);
                                return isNaN(d.getTime())
                                    ? val
                                    : d.toLocaleDateString("en-US", { timeZone: "Asia/Riyadh", month: "numeric", day: "numeric" });
                            }}
                        />
                        <YAxis stroke="#888888" fontSize={11} tickLine={false} axisLine={false} width={48} />
                        <Tooltip
                            contentStyle={{ backgroundColor: "rgba(0,0,0,0.8)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", color: "#fff" }}
                            itemStyle={{ color: "#fff" }}
                            formatter={(value) => [formatCurrency(Number(value)), "Revenue"]}
                            labelFormatter={(val) => {
                                const d = new Date(val);
                                return isNaN(d.getTime())
                                    ? val
                                    : d.toLocaleDateString("en-US", { timeZone: "Asia/Riyadh", weekday: "short", month: "long", day: "numeric" });
                            }}
                        />
                        <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2.5} fill="url(#superRev)" dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
                    </AreaChart>
                </ResponsiveContainer>
            ) : (
                <div className="h-full flex items-center justify-center text-slate-500 text-sm">No revenue recorded in the last 14 days.</div>
            )}
        </div>
    );
}
