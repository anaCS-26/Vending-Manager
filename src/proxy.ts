import NextAuth from "next-auth"
import { authConfig } from "./auth.config"

const { auth: baseAuth } = NextAuth(authConfig);
export const auth = baseAuth;

export default baseAuth((req) => {
    const isLoggedIn = !!req.auth;
    const { pathname } = req.nextUrl;

    // @ts-expect-error NextAuth default Session user carries no role
    const role = req.auth?.user?.role;

    // Protect /super routes
    if (pathname.startsWith('/super')) {
        if (!isLoggedIn) {
            return Response.redirect(new URL('/login', req.nextUrl));
        }
        if (role !== 'super_admin') {
            return Response.redirect(new URL('/login', req.nextUrl));
        }
    }

    // Protect /admin routes
    if (pathname.startsWith('/admin')) {
        if (!isLoggedIn) {
            return Response.redirect(new URL('/login', req.nextUrl));
        }
        if (role !== 'admin' && role !== 'super_admin') {
            // If a driver tries to view admin, kick them back to driver
            if (role === 'driver') {
                return Response.redirect(new URL('/driver', req.nextUrl));
            }
            return Response.redirect(new URL('/login', req.nextUrl));
        }
    }

    // Protect /driver routes
    if (pathname.startsWith('/driver')) {
        if (!isLoggedIn) {
            return Response.redirect(new URL('/login', req.nextUrl));
        }
        // Optional: Allow Admin to view Driver portal (impersonation/support)
        if (role !== 'driver' && role !== 'admin' && role !== 'super_admin') {
            return Response.redirect(new URL('/login', req.nextUrl));
        }
    }

    // If already logged in and visiting login page or home page
    if (pathname === '/login' || pathname === '/') {
        if (isLoggedIn) {
            if (role === 'super_admin' || role === 'admin') {
                return Response.redirect(new URL('/admin', req.nextUrl));
            } else if (role === 'driver') {
                return Response.redirect(new URL('/driver', req.nextUrl));
            }
        } else {
            // Redirect home to login if not logged in
            if (pathname === '/') {
                return Response.redirect(new URL('/login', req.nextUrl));
            }
        }
    }

})

export const config = {
    matcher: ['/((?!api|_next/static|_next/image|uploads|favicon.ico).*)'],
}
