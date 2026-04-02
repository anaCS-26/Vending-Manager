import NextAuth from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import prisma from "@/lib/prisma"
import { authConfig } from "./auth.config"

/** NextAuth Configuration: Handles Admin (Email/Pass) and Driver (Phone/PIN) login */
export const { handlers, auth, signIn, signOut } = NextAuth({
    ...authConfig,
    providers: [
        CredentialsProvider({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "text" },
                password: { label: "Password", type: "password" },
                phone: { label: "Phone", type: "text" },
                pin: { label: "PIN", type: "password" },
                type: { label: "Type", type: "text" } // 'admin' or 'driver'
            },
            async authorize(credentials) {
                if (!credentials) return null;

                const { type } = credentials;

                // --- ADMIN AUTHENTICATION ---
                if (type === 'admin') {
                    const email = credentials.email as string;
                    const password = credentials.password as string;

                    if (!email || !password) return null;

                    const admin = await prisma.admin.findUnique({ where: { email } });
                    if (!admin || !admin.password) return null;

                    const isValid = await bcrypt.compare(password, admin.password);
                    if (!isValid) return null;

                    const userRole = admin.role === 'SUPER_ADMIN' ? 'super_admin' : 'admin';
                    return { id: admin.id.toString(), email: admin.email, name: admin.name || "Admin", role: userRole };
                }
                // --- DRIVER AUTHENTICATION ---
                else if (type === 'driver') {
                    const phone = credentials.phone as string;
                    const pin = credentials.pin as string;

                    if (!phone || !pin) return null;

                    const driver = await prisma.driver.findUnique({ where: { phone } });
                    if (!driver || !driver.pin) return null;

                    const isValid = await bcrypt.compare(pin, driver.pin);
                    if (!isValid) return null;

                    return { id: driver.id.toString(), phone: driver.phone, name: driver.name, role: 'driver' };
                }

                return null;
            }
        })
    ]
})
