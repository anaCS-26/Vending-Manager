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

/**
 * Server-side guard to ensure only drivers can execute an action.
 */
export async function requireDriver() {
    const session = await auth();
    
    if (!session || !session.user) {
        throw new Error("UNAUTHORIZED: No active session found.");
    }

    const userRole = (session.user as any).role;
    
    if (userRole !== "driver" && userRole !== "admin" && userRole !== "super_admin") {
        throw new Error("FORBIDDEN: Driver privileges required.");
    }

    return session;
}

/**
 * Server-side guard to prevent drivers from acting on behalf of other drivers.
 * Admins bypass this.
 */
export async function requireAdminOrDriverOwner(driverId: number) {
    const session = await auth();
    
    if (!session || !session.user) {
        throw new Error("UNAUTHORIZED: No active session found.");
    }

    const userRole = (session.user as any).role;
    
    if (userRole === "admin" || userRole === "super_admin") {
        return session;
    }

    if (userRole === "driver") {
        // If they are a driver, they MUST own the dispatch/action. session.user.id is a string.
        const sessionUserId = parseInt((session.user as any).id, 10);
        if (sessionUserId !== driverId) {
            throw new Error("FORBIDDEN: You do not have permission to act on this resource.");
        }
        return session;
    }

    throw new Error("FORBIDDEN: Insufficient privileges.");
}
