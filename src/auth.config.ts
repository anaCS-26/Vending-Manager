import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
    pages: {
        signIn: '/login', // unified login page
    },
    trustHost: true,
    session: {
        strategy: "jwt",
        maxAge: 30 * 24 * 60 * 60, // 30 days
    },
    callbacks: {
        async jwt({ token, user }) {
            if (user) {
                // @ts-expect-error NextAuth default User/JWT types carry no role/phone
                token.role = user.role;
                token.id = user.id;
                // @ts-expect-error NextAuth default User/JWT types carry no role/phone
                token.phone = user.phone;
            }
            return token;
        },
        async session({ session, token }) {
            if (token) {
                // @ts-expect-error NextAuth default User/JWT types carry no role/phone
                session.user.role = token.role;
                session.user.id = token.id as string;
                // @ts-expect-error NextAuth default User/JWT types carry no role/phone
                session.user.phone = token.phone;
            }
            return session;
        }
    },
    providers: [], // Add providers with Node dependencies in auth.ts
} satisfies NextAuthConfig;
