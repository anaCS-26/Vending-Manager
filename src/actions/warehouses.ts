"use server";
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth-utils'
import { writeAuditLog } from '@/lib/audit-utils'

/**
 * ============================================================================
 * WAREHOUSE LOCATION MANAGEMENT
 * CRUD actions for physical storage facilities and logistics hubs.
 * ============================================================================
 */

/** Fetches the portfolio of active warehouses for tactical inventory planning. */
export async function getWarehouses() {
    await requireAdmin();
    return await prisma.warehouse.findMany({
        where: { isActive: true },
        orderBy: { id: 'asc' }
    });
}

/** 
 * Establishes a new storage facility record. 
 * Includes precise geographical data and fixed operational overhead metrics. 
 */
export async function createWarehouse(data: { name: string; location?: string; address?: string; latitude?: number; longitude?: number; operating_cost?: number; rental_cost?: number }) {
    const session = await requireAdmin();
    try {
        const wh = await prisma.warehouse.create({
            data: {
                name: data.name,
                location: data.location || null,
                address: data.address || null,
                latitude: data.latitude || null,
                longitude: data.longitude || null,
                operating_cost: data.operating_cost || 0,
                rental_cost: data.rental_cost || 0
            } as any
        });

        await writeAuditLog(session, 'CREATE_WAREHOUSE', 'Warehouse', wh.id, null, wh);
        
        revalidatePath('/admin/warehouse/locations');
        revalidatePath('/admin/manage');
        return { success: true, data: wh };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/** 
 * Updates organizational or financial attributes for a warehouse hub. 
 * Revalidation ensures real-time accurate overhead reporting in financials. 
 */
export async function updateWarehouse(id: number, data: { name: string; location?: string; address?: string; latitude?: number; longitude?: number; operating_cost?: number; rental_cost?: number }) {
    const session = await requireAdmin();
    try {
        const oldState = await prisma.warehouse.findUnique({ where: { id } });
        const wh = await prisma.warehouse.update({
            where: { id },
            data: {
                name: data.name,
                location: data.location || null,
                address: data.address || null,
                latitude: data.latitude || null,
                longitude: data.longitude || null,
                operating_cost: data.operating_cost || 0,
                rental_cost: data.rental_cost || 0
            } as any
        });
        
        await writeAuditLog(session, 'UPDATE_WAREHOUSE', 'Warehouse', wh.id, oldState, wh);
        
        revalidatePath('/admin/warehouse/locations');
        revalidatePath('/admin/manage');
        return { success: true, data: wh };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/** 
 * Soft-deactivates a warehouse. 
 * Blocks future logistical assignments while preserving historical transaction data. 
 */
export async function deleteWarehouse(id: number) {
    const session = await requireAdmin();
    try {
        const wh = await prisma.warehouse.update({
            where: { id },
            data: { isActive: false }
        });
        
        await writeAuditLog(session, 'DELETE_WAREHOUSE', 'Warehouse', id, null, wh);
        
        revalidatePath('/admin/warehouse/locations');
        revalidatePath('/admin/manage');
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
