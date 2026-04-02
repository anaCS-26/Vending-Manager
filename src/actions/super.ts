"use server"

import prisma from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import type { ActionResult } from "@/types"
import bcrypt from "bcryptjs"
import { auth } from "@/auth"

/**
 * ============================================================================
 * SUPER ADMIN PRIVILEGED ACTIONS
 * Sensitive system-wide administrative account and platform management.
 * Access is protected by internal verifySuperAdmin session checks.
 * ============================================================================
 */

/** Comprehensive session check to enforce Super Admin role-based access control. */
async function verifySuperAdmin() {
    const session = await auth();
    // @ts-ignore
    if (session?.user?.role !== 'super_admin') {
        throw new Error("UNAUTHORIZED: Super Admin credentials required.");
    }
}

/** 
 * Onboards a new platform Administrator. 
 * Performs encryption on provided credentials to secure system access. 
 */
export async function createAdmin(email: string, password?: string, name?: string): Promise<ActionResult> {
    try {
        await verifySuperAdmin();

        if (!password) {
            return { success: false, error: "Password is required for admins" };
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await prisma.admin.create({
            data: {
                email,
                password: hashedPassword,
                name: name || null,
                role: "ADMIN"
            }
        })
        revalidatePath('/super')
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "Failed to create admin" }
    }
}

/** Updates administrative profile metadata or rotates security credentials. */
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

/** 
 * Revokes administrative access by permanently deleting an Admin record. 
 * Use with caution as this action is irreversible. 
 */
export async function deleteAdmin(id: number): Promise<ActionResult> {
    try {
        await verifySuperAdmin();

        await prisma.admin.delete({ where: { id } })
        revalidatePath('/super')
        return { success: true, data: undefined }
    } catch (error) {
        return { success: false, error: "Cannot delete admin account" }
    }
}
