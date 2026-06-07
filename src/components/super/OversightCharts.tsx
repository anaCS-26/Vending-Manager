"use client";

import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { ActionTypeCount } from "@/actions/super-insights";

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#6366f1'];

/** Horizontal bar chart of audit action-type frequency over the oversight window. */
export default function OversightCharts({ data }: { data: ActionTypeCount[] }) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    const top = data.slice(0, 10);

    return (
        <div className="h-[360px] w-full">
            {!mounted ? (
                <div className="w-full h-full flex items-center justify-center text-slate-500 animate-pulse bg-slate-100 dark:bg-white/5 rounded-xl">
                    Loading chart…
                </div>
            ) : top.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                    <BarChart data={top} layout="vertical" margin={{ top: 0, right: 16, left: 10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" horizontal vertical={false} />
                        <XAxis type="number" stroke="#888888" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                        <YAxis dataKey="actionType" type="category" stroke="#888888" fontSize={10} tickLine={false} axisLine={false} width={150} />
                        <Tooltip
                            cursor={{ fill: "rgba(148,163,184,0.08)" }}
                            contentStyle={{ backgroundColor: "rgba(0,0,0,0.8)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", color: "#fff" }}
                            itemStyle={{ color: "#fff" }}
                            formatter={(value) => [Number(value), "Events"]}
                        />
                        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                            {top.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            ) : (
                <div className="h-full flex items-center justify-center text-slate-500 text-sm">No audit activity in this window.</div>
            )}
        </div>
    );
}
