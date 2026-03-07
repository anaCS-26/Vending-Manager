"use server"

import { signIn } from "@/auth"
import { AuthError } from "next-auth"

export async function authenticate(prevState: any, formData: FormData) {
    try {
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
