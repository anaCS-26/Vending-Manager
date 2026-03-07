"use server"

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import type { ActionResult } from "@/types"
import bcrypt from "bcryptjs"
import { auth } from "@/auth"

// We must verify the person calling this is a super admin
async function verifySuperAdmin() {
    const session = await auth();
    // @ts-ignore
    if (session?.user?.role !== 'super_admin') {
        throw new Error("Unauthorized");
    }
}

export async function createAdmin(email: string, password?: string, name?: string): Promise<ActionResult> {
    try {
        await verifySuperAdmin();

        let hashedPassword = null;
        if (password) {
            hashedPassword = await bcrypt.hash(password, 10);
        } else {
            return { success: false, error: "Password is required for admins" };
        }

        await prisma.admin.create({
            data: {
                email,
                password: hashedPassword,
                name: name || null,
                role: "ADMIN" // Ensure they are exactly ADMIN, not super admin
            }
        })
        revalidatePath('/super')
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to create admin" }
    }
}

export async function updateAdmin(id: number, email: string, password?: string, name?: string): Promise<ActionResult> {
    try {
        await verifySuperAdmin();

        const updateData: any = { email, name: name || null };
        if (password) {
            updateData.password = await bcrypt.hash(password, 10);
        }

        await prisma.admin.update({
            where: { id },
            data: updateData
        })
        revalidatePath('/super')
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to update admin" }
    }
}

export async function deleteAdmin(id: number): Promise<ActionResult> {
    try {
        await verifySuperAdmin();

        await prisma.admin.delete({ where: { id } })
        revalidatePath('/super')
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: "Cannot delete admin" }
    }
}
