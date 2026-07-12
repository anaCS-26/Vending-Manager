"use server";
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth-utils'
import { writeAuditLog } from '@/lib/audit-utils'
import { notifyClients } from '@/lib/notify'
import type { ActionResult, DispatchTemplateWithItems } from '@/types'

/**
 * ============================================================================
 * DISPATCH TEMPLATES
 * Reusable named presets of item quantities for driver stock pushes. Pure
 * configuration: loading a template only pre-fills the allocation grid on
 * /admin/driver-stock — the actual push still goes through assignToDriver,
 * which enforces warehouse stock in-DB. Nothing historical references a
 * template, so deletes are hard deletes (lines cascade).
 * ============================================================================
 */

const MAX_NAME_LENGTH = 80;
const MAX_LINES = 200;
const MAX_LINE_QTY = 10_000;

// Copied from driver-stock.ts — "use server" files may only export async
// functions, so the helper can't be shared from there.
function assertWholeNonNegative(value: number, label: string) {
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
        throw new Error(`${label} must be a whole number >= 0`)
    }
}

/**
 * Normalizes and validates a template payload: trims the name, drops zero
 * quantities, merges duplicate itemIds by summing (mirrors assignToDriver),
 * and verifies every item exists. Throws on invalid input.
 */
async function validateTemplateInput(name: string, items: { itemId: number; quantity: number }[]) {
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error("Template name is required");
    if (trimmedName.length > MAX_NAME_LENGTH) throw new Error(`Template name must be at most ${MAX_NAME_LENGTH} characters`);
    if (items.length > MAX_LINES) throw new Error(`A template can hold at most ${MAX_LINES} items`);

    const merged = new Map<number, number>();
    for (const i of items) {
        assertWholeNonNegative(i.quantity, `Quantity for item ${i.itemId}`);
        if (i.quantity === 0) continue;
        merged.set(i.itemId, (merged.get(i.itemId) || 0) + i.quantity);
    }
    if (!merged.size) throw new Error("Template must include at least one quantity > 0");
    for (const [itemId, quantity] of merged) {
        if (quantity > MAX_LINE_QTY) throw new Error(`Quantity for item ${itemId} exceeds the ${MAX_LINE_QTY} cap`);
    }

    const itemIds = Array.from(merged.keys());
    const dbItems = await prisma.item.findMany({ where: { id: { in: itemIds } } });
    if (dbItems.length !== itemIds.length) throw new Error("One or more items are invalid");

    return {
        name: trimmedName,
        lines: Array.from(merged, ([itemId, quantity]) => ({ itemId, quantity })),
    };
}

/** Slim state snapshot for SystemAuditLog rows (no joined item payloads). */
function auditSnapshot(template: { name: string; Items: { itemId: number; quantity: number }[] }) {
    return { name: template.name, items: template.Items.map(i => ({ itemId: i.itemId, quantity: i.quantity })) };
}

const TEMPLATE_INCLUDE = { Items: { include: { item: true } } } as const;

/** Fetches all templates with their item lines. Small config list — no pagination. */
export async function getDispatchTemplates(): Promise<DispatchTemplateWithItems[]> {
    await requireAdmin();
    return await prisma.dispatchTemplate.findMany({
        include: TEMPLATE_INCLUDE,
        orderBy: { name: 'asc' },
    });
}

/** Creates a template with its item lines. */
export async function createDispatchTemplate(
    name: string,
    items: { itemId: number; quantity: number }[]
): Promise<ActionResult<DispatchTemplateWithItems>> {
    const session = await requireAdmin();
    try {
        const { name: cleanName, lines } = await validateTemplateInput(name, items);

        const template = await prisma.dispatchTemplate.create({
            data: { name: cleanName, Items: { create: lines } },
            include: TEMPLATE_INCLUDE,
        });

        await writeAuditLog(session, 'CREATE_DISPATCH_TEMPLATE', 'DispatchTemplate', template.id, null, auditSnapshot(template));

        revalidatePath('/admin/manage');
        revalidatePath('/admin/driver-stock');
        notifyClients('dispatch-template');
        return { success: true, data: template };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create template";
        return { success: false, error: message };
    }
}

/** Updates a template's name and replaces its item lines wholesale. */
export async function updateDispatchTemplate(
    id: number,
    name: string,
    items: { itemId: number; quantity: number }[]
): Promise<ActionResult<DispatchTemplateWithItems>> {
    const session = await requireAdmin();
    try {
        const oldState = await prisma.dispatchTemplate.findUnique({
            where: { id },
            include: { Items: true },
        });
        if (!oldState) return { success: false, error: "Template not found" };

        const { name: cleanName, lines } = await validateTemplateInput(name, items);

        const template = await prisma.$transaction(async (tx) => {
            await tx.dispatchTemplateItem.deleteMany({ where: { templateId: id } });
            return tx.dispatchTemplate.update({
                where: { id },
                data: { name: cleanName, Items: { create: lines } },
                include: TEMPLATE_INCLUDE,
            });
        });

        await writeAuditLog(session, 'UPDATE_DISPATCH_TEMPLATE', 'DispatchTemplate', id, auditSnapshot(oldState), auditSnapshot(template));

        revalidatePath('/admin/manage');
        revalidatePath('/admin/driver-stock');
        notifyClients('dispatch-template');
        return { success: true, data: template };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to update template";
        return { success: false, error: message };
    }
}

/** Hard-deletes a template; its lines cascade. */
export async function deleteDispatchTemplate(id: number): Promise<ActionResult> {
    const session = await requireAdmin();
    try {
        const oldState = await prisma.dispatchTemplate.findUnique({
            where: { id },
            include: { Items: true },
        });
        if (!oldState) return { success: false, error: "Template not found" };

        await prisma.dispatchTemplate.delete({ where: { id } });

        await writeAuditLog(session, 'DELETE_DISPATCH_TEMPLATE', 'DispatchTemplate', id, auditSnapshot(oldState), null);

        revalidatePath('/admin/manage');
        revalidatePath('/admin/driver-stock');
        notifyClients('dispatch-template');
        return { success: true, data: undefined };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete template";
        return { success: false, error: message };
    }
}
