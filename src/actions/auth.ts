"use server"

import { signIn, auth } from "@/auth"
import { AuthError } from "next-auth"
import { headers } from "next/headers"
import bcrypt from "bcryptjs"
import prisma from "@/lib/prisma"
import { loginRateLimit, pinChangeRateLimit } from "@/lib/rate-limit"
import { writeAuditLog } from "@/lib/audit-utils"
import type { ActionResult } from "@/types"

export async function authenticate(prevState: any, formData: FormData) {
    try {
        // --- RATE LIMITING ---
        const headersList = await headers();
        const ip = headersList.get("x-forwarded-for") || "127.0.0.1";

        // Limit based on IP address to prevent brute force
        const { success } = await loginRateLimit.limit(`login_attempt_${ip}`);
        if (!success) {
            return { error: 'Too many login attempts. Please try again later.' };
        }
        // ---------------------

        const type = formData.get('type') as string;

        await signIn("credentials", {
            type,
            email: formData.get('email'),
            password: formData.get('password'),
            phone: formData.get('phone'),
            pin: formData.get('pin'),
            redirectTo: type === 'admin' ? '/admin' : '/driver'
        })
    } catch (error) {
        if (error instanceof AuthError) {
            switch (error.type) {
                case 'CredentialsSignin':
                    return { error: 'Invalid credentials. Please try again.' }
                default:
                    return { error: "authentication error" }
            }
        }
        throw error;
    }
}

const PIN_MIN_LENGTH = 4;
const PIN_MAX_LENGTH = 12;

/**
 * Driver self-service PIN change. The driver may only change their own PIN —
 * admin sessions are rejected here on purpose, to keep the audit trail clean
 * (admins reset PINs through a separate flow, not through the driver portal).
 */
export async function changeDriverPin(
    currentPin: string,
    newPin: string
): Promise<ActionResult> {
    const session = await auth();
    if (!session || !session.user) {
        return { success: false, error: "Sign-in required." };
    }
    const role = (session.user as any).role;
    if (role !== "driver") {
        return { success: false, error: "Only drivers can change their own PIN." };
    }
    const driverId = parseInt((session.user as any).id, 10);
    if (!Number.isFinite(driverId)) {
        return { success: false, error: "Invalid session." };
    }

    // Per-driver rate limit on the bcrypt compare so a stolen session can't
    // grind through the current PIN.
    const { success: notLimited } = await pinChangeRateLimit.limit(`driver_${driverId}`);
    if (!notLimited) {
        return { success: false, error: "Too many attempts. Try again in a few minutes." };
    }

    if (typeof currentPin !== "string" || typeof newPin !== "string") {
        return { success: false, error: "Both PINs are required." };
    }
    if (newPin.length < PIN_MIN_LENGTH || newPin.length > PIN_MAX_LENGTH) {
        return { success: false, error: `New PIN must be ${PIN_MIN_LENGTH}-${PIN_MAX_LENGTH} characters.` };
    }
    if (!/^[0-9]+$/.test(newPin)) {
        return { success: false, error: "PIN must contain digits only." };
    }
    if (currentPin === newPin) {
        return { success: false, error: "New PIN must differ from the current one." };
    }

    // `pin` is omitted globally in the Prisma client; opt back in here because
    // verifying the current PIN needs the hash.
    const driver = await prisma.driver.findUnique({
        where: { id: driverId },
        omit: { pin: false },
    });
    if (!driver || !driver.pin) {
        return { success: false, error: "Driver record not found." };
    }

    const isValid = await bcrypt.compare(currentPin, driver.pin);
    if (!isValid) {
        return { success: false, error: "Current PIN is incorrect." };
    }

    const newHash = await bcrypt.hash(newPin, 10);
    await prisma.driver.update({
        where: { id: driverId },
        data: { pin: newHash },
    });

    // Audit only the event itself — never the PIN values.
    await writeAuditLog(
        session,
        "CHANGE_DRIVER_PIN",
        "Driver",
        driverId,
        null,
        null,
        "Driver self-service PIN change"
    );

    return { success: true, data: undefined };
}
