"use server";
import { PrismaClient } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth-utils'

const prisma = new PrismaClient()

export async function getWarehouses() {
    await requireAdmin();
    return await prisma.warehouse.findMany({
        where: { isActive: true },
        orderBy: { id: 'asc' }
    });
}

export async function createWarehouse(data: { name: string; location?: string; address?: string; latitude?: number; longitude?: number; operating_cost?: number; rental_cost?: number }) {
    await requireAdmin();
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
        revalidatePath('/admin/warehouse/locations');
        revalidatePath('/admin/manage');
        return { success: true, data: wh };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function updateWarehouse(id: number, data: { name: string; location?: string; address?: string; latitude?: number; longitude?: number; operating_cost?: number; rental_cost?: number }) {
    await requireAdmin();
    try {
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
        revalidatePath('/admin/warehouse/locations');
        revalidatePath('/admin/manage');
        return { success: true, data: wh };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function deleteWarehouse(id: number) {
    await requireAdmin();
    try {
        await prisma.warehouse.update({
            where: { id },
            data: { isActive: false }
        });
        revalidatePath('/admin/warehouse/locations');
        revalidatePath('/admin/manage');
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
