"use server";
import { PrismaClient } from '@prisma/client'
import { revalidatePath } from 'next/cache'

const prisma = new PrismaClient()

export async function getWarehouses() {
    return await prisma.warehouse.findMany({
        orderBy: { id: 'asc' }
    });
}

export async function createWarehouse(data: { name: string; location?: string; address?: string; latitude?: number; longitude?: number }) {
    try {
        const warehouse = await prisma.warehouse.create({
            data: {
                name: data.name,
                location: data.location || null,
                address: data.address || null,
                latitude: data.latitude || null,
                longitude: data.longitude || null
            }
        });
        revalidatePath('/admin/warehouse/locations');
        revalidatePath('/admin/manage');
        return { success: true, data: warehouse };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function updateWarehouse(id: number, data: { name: string; location?: string; address?: string; latitude?: number; longitude?: number }) {
    try {
        const warehouse = await prisma.warehouse.update({
            where: { id },
            data: {
                name: data.name,
                location: data.location || null,
                address: data.address || null,
                latitude: data.latitude || null,
                longitude: data.longitude || null
            }
        });
        revalidatePath('/admin/warehouse/locations');
        revalidatePath('/admin/manage');
        return { success: true, data: warehouse };
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
