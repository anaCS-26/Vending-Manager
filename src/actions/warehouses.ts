"use server";
import { PrismaClient } from '@prisma/client'
import { revalidatePath } from 'next/cache'

const prisma = new PrismaClient()

export async function getWarehouses() {
    return await prisma.warehouse.findMany({
        orderBy: { id: 'asc' }
    });
}

export async function createWarehouse(data: { name: string; location?: string; address?: string; latitude?: number; longitude?: number; operating_cost?: number; rental_cost?: number }) {
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
    try {
        await prisma.warehouse.delete({
            where: { id }
        });
        revalidatePath('/admin/warehouse/locations');
        revalidatePath('/admin/manage');
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
