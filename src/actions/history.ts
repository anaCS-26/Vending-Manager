"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { notifyClients } from "@/lib/notify";
import type { ActionResult, PaginatedResult } from "@/types";
import { requireAdmin } from "@/lib/auth-utils";
import { startOfRiyadhDay, endOfRiyadhDay } from "@/lib/utils";
import type { Prisma } from "@prisma/client";

/**
 * ============================================================================
 * OPERATIONAL HISTORY ACTIONS
 * Tools for auditing and correcting historical refill and sales data.
 * ============================================================================
 */

/** Slim driver list (id + name) for populating the history filter dropdown. */
export async function getDriversForFilter() {
    await requireAdmin();
    return await prisma.driver.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' }
    });
}

export type RefillLogFilters = {
    driverId?: number | null;
    dateFrom?: string | null; // ISO date "YYYY-MM-DD"
    dateTo?: string | null;
    searchQuery?: string | null;
    page?: number;
    pageSize?: number;
};

export type RefillLogRow = Prisma.RefillLogGetPayload<{
    include: {
        machine: true;
        item: true;
        driver: true;
        dispatch: {
            include: {
                driver: true;
                warehouse: true;
                ReturnVerifications: true;
            };
        };
    };
}>;

const DEFAULT_PAGE_SIZE = 20;

/**
 * Server-side filterable + paginated refill-log feed for the "By Event" tab.
 * Replaces the unbounded findMany() that used to ship every row to the client.
 */
export async function getRefillLogsPaginated(
    filters: RefillLogFilters = {}
): Promise<PaginatedResult<any>> { // Changed to any to support mixed types
    await requireAdmin();

    const page = Math.max(1, filters.page ?? 1);
    const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.RefillLogWhereInput = {};
    const returnWhere: Prisma.ReturnVerificationWhereInput = {};

    if (filters.driverId) {
        where.dispatch = { driverId: filters.driverId };
        returnWhere.driverId = filters.driverId;
    }

    if (filters.dateFrom || filters.dateTo) {
        where.refilled_at = {};
        returnWhere.reported_at = {};
        if (filters.dateFrom) {
            // "YYYY-MM-DD" → 00:00 Riyadh on that calendar day
            const from = startOfRiyadhDay(filters.dateFrom);
            where.refilled_at.gte = from;
            returnWhere.reported_at.gte = from;
        }
        if (filters.dateTo) {
            // "YYYY-MM-DD" → 23:59:59.999 Riyadh on that calendar day
            const to = endOfRiyadhDay(filters.dateTo);
            where.refilled_at.lte = to;
            returnWhere.reported_at.lte = to;
        }
    }

    if (filters.searchQuery && filters.searchQuery.trim()) {
        const q = filters.searchQuery.trim();
        where.OR = [
            { machine: { location_name: { contains: q, mode: 'insensitive' } } },
            { item: { name: { contains: q, mode: 'insensitive' } } },
            { dispatch: { driver: { name: { contains: q, mode: 'insensitive' } } } },
        ];
        returnWhere.OR = [
            { item: { name: { contains: q, mode: 'insensitive' } } },
            { driver: { name: { contains: q, mode: 'insensitive' } } },
        ];
    }

    const takeCount = page * pageSize;

    const [refillRows, refillTotal, allReturns, surplusTotal] = await Promise.all([
        prisma.refillLog.findMany({
            where,
            orderBy: { refilled_at: 'desc' },
            include: {
                machine: true,
                item: true,
                driver: true,
                dispatch: {
                    include: {
                        driver: true,
                        warehouse: true,
                        ReturnVerifications: true
                    }
                }
            },
            take: takeCount,
        }),
        prisma.refillLog.count({ where }),
        prisma.returnVerification.findMany({
            where: returnWhere,
            orderBy: { reported_at: 'desc' },
            include: {
                item: true,
                driver: true,
                dispatch: {
                    include: {
                        driver: true,
                        warehouse: true
                    }
                }
            },
            take: takeCount * 2, // Fetch extra to ensure we find matches for refills
        }),
        prisma.returnVerification.count({ where: { ...returnWhere, reason: 'SURPLUS' } })
    ]);

    const surplusReturns = allReturns.filter(r => r.reason === 'SURPLUS');
    const machineReturns = allReturns.filter(r => r.reason !== 'SURPLUS');

    // Inject machine returns into refill logs
    refillRows.forEach((log: any) => {
        const matchingReturns = machineReturns.filter(r => 
            r.driverId === log.driverId && 
            r.itemId === log.itemId && 
            Math.abs(r.reported_at.getTime() - log.refilled_at.getTime()) < 60000 // 1 min window
        );
        log._customMachineReturnVerifs = matchingReturns;
    });

    const mappedReturns = surplusReturns.slice(0, takeCount).map(r => ({
        id: `return_${r.id}`, // String ID distinguishes it
        dispatchId: r.dispatchId,
        driverId: r.driverId,
        machineId: 0,
        itemId: r.itemId,
        quantity_refilled: 0,
        items_sold_since_last_refill: 0,
        sales_revenue: 0,
        price_at_refill: 0,
        cost_at_refill: 0,
        damaged_quantity: 0,
        expired_quantity: r.quantity, // Used by EditLogModal for Return visual
        refilled_at: r.reported_at,
        machine: null,
        item: r.item,
        driver: r.driver,
        dispatch: r.dispatch,
        isSurplusReturn: true,
        _customVerifiedCount: r.status === 'VERIFIED' || r.status === 'RESTOCK' || r.status === 'LOSS' || r.status === 'APPROVED' ? r.quantity : 0,
        _customPendingCount: r.status === 'PENDING' ? r.quantity : 0,
    }));

    const allEvents = [...refillRows, ...mappedReturns];
    allEvents.sort((a, b) => b.refilled_at.getTime() - a.refilled_at.getTime());

    const total = refillTotal + surplusTotal;
    const paginatedData = allEvents.slice((page - 1) * pageSize, page * pageSize);

    return {
        data: paginatedData,
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
}

/** 
 * Corrects historical refill or sales data. 
 * Atomic synchronization: Adjusts MachineStock based on the delta between 
 * the original and updated quantities to maintain inventory integrity.
 */
export async function updateRefillLog(
    logId: number,
    sold: number,
    refilled: number
): Promise<ActionResult> {
    await requireAdmin();
    try {
        if (sold < 0 || refilled < 0) {
            throw new Error("Quantities cannot be negative");
        }

        await prisma.$transaction(async (tx) => {
            // 1. Get current log to see delta
            const log = await tx.refillLog.findUnique({
                where: { id: logId }
            });

            if (!log) throw new Error("Log not found");

            const deltaRefilled = refilled - log.quantity_refilled;

            // 2. Update the log
            await tx.refillLog.update({
                where: { id: logId },
                data: {
                    items_sold_since_last_refill: sold,
                    quantity_refilled: refilled
                }
            });

            // 3. Update MachineStock estimated_stock based on refill delta
            if (deltaRefilled !== 0) {
                const machineStock = await tx.machineStock.findUnique({
                    where: {
                        machineId_itemId: {
                            machineId: log.machineId,
                            itemId: log.itemId
                        }
                    }
                });

                if (!machineStock) throw new Error("Machine stock record not found for this log");

                await tx.machineStock.update({
                    where: {
                        machineId_itemId: {
                            machineId: log.machineId,
                            itemId: log.itemId
                        }
                    },
                    data: {
                        estimated_stock: { increment: deltaRefilled }
                    }
                });
            }
        });

        revalidatePath('/admin/history');
        revalidatePath('/admin/financials'); // Financials depend on sold/refilled
        notifyClients('refill-update');
        return { success: true, data: undefined };

    } catch (error) {
        return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to update log"
        };
    }
}
