import NextAuth from 'next-auth';
import { authConfig } from '@/auth.config';

const { auth } = NextAuth(authConfig);

export default auth((req) => {
    const isLoggedIn = !!req.auth;
    const { nextUrl } = req;
    
    // Only protect operational dashboards
    const isProtectedRoute = nextUrl.pathname.startsWith('/admin') || 
                             nextUrl.pathname.startsWith('/driver') || 
                             nextUrl.pathname.startsWith('/super');
                             
    if (isProtectedRoute && !isLoggedIn) {
        return Response.redirect(new URL('/login', nextUrl));
    }
});

export const config = {
    // Only run middleware on essential routes to optimize edge performance
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
