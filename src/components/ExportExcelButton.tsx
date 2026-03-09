"use client"

import * as XLSX from "xlsx";
import { Download } from "lucide-react";
import { toast } from "sonner";

export default function ExportExcelButton({
    data,
    filename,
    label = "Export to Excel"
}: {
    data: any[],
    filename: string,
    label?: string
}) {
    const handleExport = () => {
        try {
            if (!data || data.length === 0) {
                toast.error("No data available to export.");
                return;
            }

            // Create a new workbook and add the data
            const worksheet = XLSX.utils.json_to_sheet(data);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Data Export");

            // Generate Excel file and trigger download
            XLSX.writeFile(workbook, `${filename}.xlsx`);
            toast.success("Excel exported successfully!");
        } catch (error) {
            console.error("Export error:", error);
            toast.error("Failed to export Excel file.");
        }
    };

    return (
        <button
            onClick={handleExport}
            className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold transition-all flex gap-2 items-center shadow-[0_0_20px_rgba(16,185,129,0.2)]"
        >
            <Download className="w-4 h-4" />
            {label}
        </button>
    );
}
