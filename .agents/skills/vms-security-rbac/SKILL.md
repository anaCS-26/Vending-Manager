---
name: vms-security-rbac
description: Use when creating or modifying Server Actions to verify authentication and enforce strict Role-Based Access Control (RBAC). 
---

# Skill: VMS RBAC Security Gates

## 🎯 Objective
Prevent unauthorized access and privilege escalation within the VMS backend actions. The system contains sensitive financial data and hardware logistics that must be deeply gated.

## 🚨 Strict Constraints
- **Never** query the database or execute business logic before obtaining session verification.
- **Always** place the role-based auth guard as the absolute first line inside the `async function`.
- **Throw Early:** Let the underlying guard throw exceptions for 'Forbidden' access to bubble up consistently; do not suppress them with internal try-catch blocks unless returning strict formatted application errors.

## 🛡️ Validation Guards (`@/lib/auth-utils`)
Select the most restrictive necessary guard:
- `requireAdmin()`: Warehouse intake, financial overviews, system settings.
- `requireDriver()`: App logistics, terminal refills, dispatch actions.
- `requireAdminOrDriverOwner(driverId)`: Strict boundary so drivers can only mutate their *own* dispatches and returns.
- `requireSuperAdmin()`: Dangerous system operations (DB wipes, account provisioning).

## ⚙️ Execution Steps
1. Determine the exact permission scope of the new action.
2. Import the correct guard from `@/lib/auth-utils`.
3. Await the guard at line 1 of the action body.
4. Use the extracted session or user ID from the guard to ensure queries belong to the validated tenant if applicable.

## 📝 Example Output
### ✅ Valid Server Action Structure
```typescript
"use server";
import { requireAdmin } from "@/lib/auth-utils";

export async function submitPurchaseOrder(data: OrderPayload) {
    const session = await requireAdmin(); // LINE 1 GUARANTEED

    try {
        await prisma.purchaseOrder.create({ ... });
        return { success: true };
    } catch(err) {
        return { success: false, error: err.message };
    }
}
```
### ❌ Invalid Pattern
```typescript
export async function getStock() {
    // FAIL: Processing data before ensuring auth check 
    const stock = await prisma.warehouseStock.findMany(); 
    const session = await requireAdmin(); 
    return stock;
}
```
