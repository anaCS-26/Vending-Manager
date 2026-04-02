"use server"

import prisma from "@/lib/prisma"
import { auth } from "@/auth"
import bcrypt from "bcryptjs"
import { revalidatePath } from "next/cache"
import type { ActionResult } from "@/types"

/**
 * ============================================================================
 * SELF-SERVICE ACCOUNT SETTINGS
 * Profile and security management for verified administrators.
 * ============================================================================
 */

/** 
 * Self-service profilc update (Name/Password rotation). 
 * Authenticates via the current session email to enforce atomic ownership. 
 */
export async function updateMyProfile(name: string, password?: string): Promise<ActionResult> {
    try {
        const session = await auth();
        if (!session?.user?.email) {
            return { success: false, error: "Not authenticated" };
        }

        const email = session.user.email;

        const updateData: any = { name: name || null };
        if (password) {
            updateData.password = await bcrypt.hash(password, 10);
        }

        await prisma.admin.update({
            where: { email },
            data: updateData
        })

        revalidatePath('/admin')
        return { success: true, data: undefined }

    } catch (e: any) {
        return { success: false, error: e.message || "Failed to update profile" }
    }
}
