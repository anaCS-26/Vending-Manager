"use server"

import { signIn } from "@/auth"
import { AuthError } from "next-auth"
import { headers } from "next/headers"
import { loginRateLimit } from "@/lib/rate-limit"

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
