"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { notifyClients } from "@/lib/notify";
import type { ActionResult, PaginatedResult } from "@/types";
import { requireAdmin } from "@/lib/auth-utils";
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
): Promise<PaginatedResult<RefillLogRow>> {
    await requireAdmin();

    const page = Math.max(1, filters.page ?? 1);
    const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;

    const where: Prisma.RefillLogWhereInput = {};

    if (filters.driverId) {
        where.dispatch = { driverId: filters.driverId };
    }

    if (filters.dateFrom || filters.dateTo) {
        where.refilled_at = {};
        if (filters.dateFrom) {
            where.refilled_at.gte = new Date(filters.dateFrom);
        }
        if (filters.dateTo) {
            // Inclusive end-of-day so "to: 2026-04-29" includes events from that calendar day.
            const to = new Date(filters.dateTo);
            to.setHours(23, 59, 59, 999);
            where.refilled_at.lte = to;
        }
    }

    if (filters.searchQuery && filters.searchQuery.trim()) {
        const q = filters.searchQuery.trim();
        where.OR = [
            { machine: { location_name: { contains: q, mode: 'insensitive' } } },
            { item: { name: { contains: q, mode: 'insensitive' } } },
            { dispatch: { driver: { name: { contains: q, mode: 'insensitive' } } } },
        ];
    }

    const [rows, total] = await Promise.all([
        prisma.refillLog.findMany({
            where,
            orderBy: { refilled_at: 'desc' },
            include: {
                machine: true,
                item: true,
                dispatch: {
                    include: {
                        driver: true,
                        warehouse: true,
                        ReturnVerifications: true
                    }
                }
            },
            skip: (page - 1) * pageSize,
            take: pageSize,
        }),
        prisma.refillLog.count({ where })
    ]);

    return {
        data: rows,
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
