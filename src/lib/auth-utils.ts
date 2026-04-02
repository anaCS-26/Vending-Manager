import { auth } from "@/proxy";

/**
 * ============================================================================
 * ACCOUNT AUTHENTICATION & ROLE GUARDS
 * Enforces Role-Based Access Control (RBAC) across the action layer.
 * Throws explicit authorization errors to terminate unauthorized sessions.
 * ============================================================================
 */

/** 
 * Enforces Administrator or Super Admin status. 
 * Essential for any destructive or high-impact state change. 
 */
export async function requireAdmin() {
    const session = await auth();
    
    if (!session || !session.user) {
        throw new Error("UNAUTHORIZED: Active session required.");
    }

    const userRole = (session.user as any).role;
    
    if (userRole !== "admin" && userRole !== "super_admin") {
        throw new Error("FORBIDDEN: Administrative privileges required.");
    }

    return session;
}

/** 
 * Restricts access to Super Admin accounts only. 
 * Used for platform-level management and broad data resets. 
 */
export async function requireSuperAdmin() {
    const session = await auth();
    
    if (!session || !session.user) {
        throw new Error("UNAUTHORIZED: Active Super Admin session required.");
    }

    const userRole = (session.user as any).role;
    
    if (userRole !== "super_admin") {
        throw new Error("FORBIDDEN: Super Admin privileges required.");
    }

    return session;
}

/** 
 * Broad guard for driver-portal and dispatch-management actions. 
 * Allows standard Admins and Super Admins for operational oversight. 
 */
export async function requireDriver() {
    const session = await auth();
    
    if (!session || !session.user) {
        throw new Error("UNAUTHORIZED: Active session required.");
    }

    const userRole = (session.user as any).role;
    
    if (userRole !== "driver" && userRole !== "admin" && userRole !== "super_admin") {
        throw new Error("FORBIDDEN: Driver privileges required.");
    }

    return session;
}

/** 
 * Enforces dispatch ownership for drivers to prevent unauthorized data spoofing. 
 * Bypasses ownership check for Admin sessions to support supervisory editing. 
 */
export async function requireAdminOrDriverOwner(driverId: number) {
    const session = await auth();
    
    if (!session || !session.user) {
        throw new Error("UNAUTHORIZED: Active session required.");
    }

    const userRole = (session.user as any).role;
    
    // Administrative oversight bypass
    if (userRole === "admin" || userRole === "super_admin") {
        return session;
    }

    // Driver-specific ownership check
    if (userRole === "driver") {
        const sessionUserId = parseInt((session.user as any).id, 10);
        if (sessionUserId !== driverId) {
            throw new Error("FORBIDDEN: Action restricted to the record owner.");
        }
        return session;
    }

    throw new Error("FORBIDDEN: Insufficient privileges.");
}
