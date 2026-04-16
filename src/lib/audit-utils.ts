import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * ============================================================================
 * SYSTEM AUDIT LOGGING UTILITY
 * Provides an immutable System of Record for all data mutation events.
 * Crucial for multi-account accountability and state-recovery.
 * ============================================================================
 */

export async function writeAuditLog(
    session: any,
    actionType: string,
    entityType: string,
    entityId: number | null = null,
    oldState: any = null,
    newState: any = null,
    message: string | null = null
) {
    try {
        if (!session || !session.user) {
            console.warn(`⚠️ [Audit Logger] Missing session context for action: ${actionType}`);
            return;
        }

        const actorId = session.user.id ? parseInt(session.user.id, 10) : null;
        let actorRole = 'UNKNOWN';
        
        if ('role' in session.user) {
            actorRole = (session.user as any).role || 'UNKNOWN';
        }

        // Avoid logging massive binaries if objects accidentally contain them
        const secureOldState = oldState ? JSON.stringify(oldState) : null;
        const secureNewState = newState ? JSON.stringify(newState) : null;

        await prisma.systemAuditLog.create({
            data: {
                actorId,
                actorRole,
                actionType,
                entityType,
                entityId,
                oldState: secureOldState,
                newState: secureNewState,
                message,
            }
        });
        
    } catch (err) {
        // We log error but do not throw to prevent blocking the actual user action
        console.error("❌ Failed to write audit log:", err);
    }
}
