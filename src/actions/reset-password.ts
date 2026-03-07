"use server"

import prisma from "@/lib/prisma"
import crypto from "crypto"
import { Resend } from "resend"
import bcrypt from "bcryptjs"

const resend = new Resend(process.env.RESEND_API_KEY || "re_dummy_key");

export async function requestPasswordReset(email: string) {
    try {
        const admin = await prisma.admin.findUnique({ where: { email } });
        if (!admin) {
            // For security, don't reveal if a user exists or not. Just return success.
            return { success: true };
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const tokenExpiry = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

        await prisma.admin.update({
            where: { id: admin.id },
            data: {
                resetToken,
                resetTokenExpiry: tokenExpiry
            }
        });

        const resetLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

        if (process.env.RESEND_API_KEY) {
            await resend.emails.send({
                from: 'VendingPro <noreply@vendingpro.com>',
                to: admin.email,
                subject: 'Reset your password',
                html: `
                    <h1>Password Reset Requested</h1>
                    <p>Click the link below to securely reset your password:</p>
                    <a href="${resetLink}">Reset Password</a>
                    <p>If you didn't request this, you can safely ignore this email.</p>
                `
            });
        } else {
            console.log("\n==================================");
            console.log("Mock Email Sent!");
            console.log(`To: ${admin.email}`);
            console.log(`Link: ${resetLink}`);
            console.log("==================================\n");
        }

        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to process request" };
    }
}

export async function resetPassword(token: string, newPassword: string) {
    try {
        const admin = await prisma.admin.findFirst({
            where: {
                resetToken: token,
                resetTokenExpiry: { gte: new Date() } // Must be greater than current time
            }
        });

        if (!admin) {
            return { success: false, error: "Invalid or expired reset token" };
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await prisma.admin.update({
            where: { id: admin.id },
            data: {
                password: hashedPassword,
                resetToken: null,
                resetTokenExpiry: null
            }
        });

        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to reset password" };
    }
}
