import { auth } from "@/proxy";

/**
 * Server-side guard to ensure only administrators or super admins can execute an action.
 * Throws an error if the session is invalid or the role is insufficient.
 */
export async function requireAdmin() {
    const session = await auth();
    
    if (!session || !session.user) {
        throw new Error("UNAUTHORIZED: No active session found.");
    }

    const userRole = (session.user as any).role;
    
    if (userRole !== "admin" && userRole !== "super_admin") {
        throw new Error("FORBIDDEN: Administrative privileges required.");
    }

    return session;
}

/**
 * Server-side guard specifically for Super Admin actions (like database resetting).
 */
export async function requireSuperAdmin() {
    const session = await auth();
    
    if (!session || !session.user) {
        throw new Error("UNAUTHORIZED: No active session found.");
    }

    const userRole = (session.user as any).role;
    
    if (userRole !== "super_admin") {
        throw new Error("FORBIDDEN: Super Administrative privileges required.");
    }

    return session;
}
