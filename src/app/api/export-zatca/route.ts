import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
    try {
        // Fetch financial data to generate export
        const machinesData = await prisma.machine.findMany({
            include: { RefillLogs: { include: { item: true } } }
        });

        let totalRevenue = 0;
        machinesData.forEach(m => {
            const rev = m.RefillLogs.reduce((acc: any, log: any) => acc + (log.quantity_refilled * (log.item.price || 0)), 0);
            totalRevenue += rev;
        });

        // Fetch supplier purchases (if we had actual purchase data)
        // For the prototype, we assume we want to show a ZATCA CSV format

        const outputVAT = totalRevenue * 0.15; // Assuming 15% standard rate for sales

        // Let's assume some mock purchases for the sake of the ZATCA demo
        const totalPurchases = totalRevenue * 0.40;
        const inputVAT = totalPurchases * 0.15;

        // Construct CSV
        const csvRows = [
            ["ZATCA VAT REPORT"],
            ["Generated on", new Date().toISOString()],
            [""],
            ["CATEGORY", "BASE AMOUNT (⃁)", "15% VAT AMOUNT (⃁)", "TOTAL INCLUSIVE (⃁)"],
            ["Total Sales (Output)", totalRevenue.toFixed(2), outputVAT.toFixed(2), (totalRevenue + outputVAT).toFixed(2)],
            ["Total Purchases (Input)", totalPurchases.toFixed(2), inputVAT.toFixed(2), (totalPurchases + inputVAT).toFixed(2)],
            [""],
            ["NET VAT DUE", "", "", (outputVAT - inputVAT).toFixed(2)] // Positive means payable, negative means refundable
        ];

        const csvContent = csvRows.map(e => e.join(",")).join("\n");

        return new NextResponse(csvContent, {
            status: 200,
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="ZATCA_VAT_Export_${new Date().toISOString().split('T')[0]}.csv"`
            }
        });
    } catch (error) {
        return new NextResponse("Internal Error", { status: 500 });
    }
}
