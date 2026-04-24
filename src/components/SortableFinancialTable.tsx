"use client";

import { useState, useRef, useEffect } from "react";
import { formatCurrency } from "@/lib/utils";
import { ArrowUp, ArrowDown } from "lucide-react";

export type FinancialRowData = {
    id: string | number;
    label: string;
    subLabel: string;
    revenue: number;
    cogs: number;
    shrinkage: number;
    expenses: number;
    netProfit: number;
};

export default function SortableFinancialTable({ data }: { data: FinancialRowData[] }) {
    const topScrollRef = useRef<HTMLDivElement>(null);
    const tableScrollRef = useRef<HTMLDivElement>(null);
    const [tableWidth, setTableWidth] = useState<number>(1000);
    const [isScrollable, setIsScrollable] = useState(false);

    const [sortConfig, setSortConfig] = useState<{
        key: keyof FinancialRowData | null;
        direction: "asc" | "desc";
    }>({ key: "revenue", direction: "desc" });

    const handleSort = (key: keyof FinancialRowData) => {
        if (sortConfig.key === key) {
            // Toggle direction if clicking same column
            setSortConfig({ key, direction: sortConfig.direction === "desc" ? "asc" : "desc" });
        } else {
            // Default to desc for financial metrics as it's usually what you want to see first
            setSortConfig({ key, direction: key === "label" ? "asc" : "desc" });
        }
    };

    const sortedData = [...data].sort((a, b) => {
        if (!sortConfig.key) return 0;
        
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];

        if (aVal < bVal) {
            return sortConfig.direction === "asc" ? -1 : 1;
        }
        if (aVal > bVal) {
            return sortConfig.direction === "asc" ? 1 : -1;
        }
        return 0;
    });

    const SortIcon = ({ columnKey }: { columnKey: keyof FinancialRowData }) => {
        if (sortConfig.key !== columnKey) return <span className="w-4 h-4 inline-block ml-1 opacity-0 group-hover:opacity-30 transition-opacity" />;
        
        return sortConfig.direction === "desc" 
            ? <ArrowDown className="w-4 h-4 ml-1 inline-block text-brand-500" />
            : <ArrowUp className="w-4 h-4 ml-1 inline-block text-brand-500" />;
    };

    const handleTopScroll = () => {
        if (tableScrollRef.current && topScrollRef.current) {
            tableScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
        }
    };

    const handleTableScroll = () => {
        if (tableScrollRef.current && topScrollRef.current) {
            topScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft;
        }
    };

    // Keep the top scrollbar track perfectly synchronized with the true width of the table content
    useEffect(() => {
        if (!tableScrollRef.current) return;
        const observer = new ResizeObserver(() => {
            if (tableScrollRef.current) {
                const scrollW = tableScrollRef.current.scrollWidth;
                const clientW = tableScrollRef.current.clientWidth;
                setTableWidth(scrollW);
                setIsScrollable(scrollW > clientW);
            }
        });
        observer.observe(tableScrollRef.current);
        if (tableScrollRef.current.firstElementChild) {
            observer.observe(tableScrollRef.current.firstElementChild);
        }
        return () => observer.disconnect();
    }, [data]);

    return (
        <div className="relative">
            {/* Top Synchronized Scrollbar */}
            {isScrollable && (
                <div 
                    className="overflow-x-auto custom-scrollbar w-full border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02]" 
                    ref={topScrollRef} 
                    style={{ height: '14px' }}
                    onScroll={handleTopScroll}
                >
                    <div style={{ width: `${tableWidth}px`, height: '1px' }}></div>
                </div>
            )}
            
            <div 
                className="overflow-x-auto custom-scrollbar"
                ref={tableScrollRef}
                onScroll={handleTableScroll}
            >
            <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                    <tr className="border-b border-slate-200 dark:border-white/5 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 select-none">
                        <th className="py-3 pr-3 md:py-4 md:pr-6 cursor-pointer group hover:text-slate-700 dark:hover:text-slate-300 transition-colors whitespace-nowrap" onClick={() => handleSort("label")}>
                            <div className="flex items-center">
                                Segment Information
                                <SortIcon columnKey="label" />
                            </div>
                        </th>
                        <th className="py-3 px-3 md:py-4 md:px-6 cursor-pointer group hover:text-slate-700 dark:hover:text-slate-300 transition-colors whitespace-nowrap" onClick={() => handleSort("revenue")}>
                            <div className="flex items-center justify-end">
                                <SortIcon columnKey="revenue" />
                                Captured Revenue
                            </div>
                        </th>
                        <th className="py-3 px-3 md:py-4 md:px-6 cursor-pointer group hover:text-slate-700 dark:hover:text-slate-300 transition-colors whitespace-nowrap" onClick={() => handleSort("cogs")}>
                            <div className="flex items-center justify-end">
                                <SortIcon columnKey="cogs" />
                                Est. COGS
                            </div>
                        </th>
                        <th className="py-3 px-3 md:py-4 md:px-6 cursor-pointer group hover:text-slate-700 dark:hover:text-slate-300 transition-colors whitespace-nowrap" onClick={() => handleSort("shrinkage")}>
                            <div className="flex items-center justify-end">
                                <SortIcon columnKey="shrinkage" />
                                Shrinkage Loss
                            </div>
                        </th>
                        <th className="py-3 px-3 md:py-4 md:px-6 cursor-pointer group hover:text-slate-700 dark:hover:text-slate-300 transition-colors whitespace-nowrap" onClick={() => handleSort("expenses")}>
                            <div className="flex items-center justify-end">
                                <SortIcon columnKey="expenses" />
                                Operating Exp
                            </div>
                        </th>
                        <th className="py-3 pl-3 md:py-4 md:pl-6 cursor-pointer group hover:text-slate-700 dark:hover:text-slate-300 transition-colors whitespace-nowrap" onClick={() => handleSort("netProfit")}>
                            <div className="flex items-center justify-end">
                                <SortIcon columnKey="netProfit" />
                                Net Benefit
                            </div>
                        </th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/[0.03]">
                    {sortedData.length === 0 ? (
                        <tr>
                            <td colSpan={6} className="py-12 text-center text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest text-xs">
                                No telemetry matches selected segment filters.
                            </td>
                        </tr>
                    ) : (
                        sortedData.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.04] transition-all duration-300 border-b border-slate-200 dark:border-white/[0.02] last:border-0 flex-row">
                                <td className="py-3 pr-3 md:py-5 md:pr-6">
                                    <div className="font-bold text-slate-900 dark:text-white text-xs md:text-sm uppercase">{item.label}</div>
                                    <div className="text-[9px] md:text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">{item.subLabel}</div>
                                </td>
                                <td className="py-3 px-3 md:py-5 md:px-6 text-right">
                                    <span className="text-xs md:text-sm font-bold text-slate-900 dark:text-white font-mono">{formatCurrency(item.revenue)}</span>
                                </td>
                                <td className="py-3 px-3 md:py-5 md:px-6 text-right">
                                    <span className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 font-mono">{formatCurrency(item.cogs)}</span>
                                </td>
                                <td className="py-3 px-3 md:py-5 md:px-6 text-right">
                                    <span className="text-xs md:text-sm font-medium text-amber-500/80 font-mono">-{formatCurrency(item.shrinkage)}</span>
                                </td>
                                <td className="py-3 px-3 md:py-5 md:px-6 text-right">
                                    <span className="text-xs md:text-sm font-medium text-slate-500 dark:text-slate-400 font-mono">{formatCurrency(item.expenses)}</span>
                                </td>
                                <td className="py-3 pl-3 md:py-5 md:pl-6 text-right">
                                    <span className="text-sm md:text-base font-black text-brand-500 font-mono">{formatCurrency(item.netProfit)}</span>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
        </div>
    );
}
