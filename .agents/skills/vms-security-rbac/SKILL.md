---
name: vms-security-rbac
description: Mandates Role-Based Access Control (RBAC) guards for all server actions in the vending manager.
---

# VMS Security & RBAC Guards

Security in NexGen Vending is enforced at the Server Action level. **Never assume a user has the correct permissions.**

## 🛡️ Available Guards (from `@/lib/auth-utils`)

- `requireAdmin()`: Broad admin access. Used for inventory oversight, procurement, and management.
- `requireSuperAdmin()`: Restricted for account creation or system-wide data resets.
- `requireDriver()`: Access for daily logistics, refills, and dispatch closure.
- `requireAdminOrDriverOwner(driverId)`: Ensures a driver can only modify their own dispatches. Admins bypass this.

## 📐 Implementation Checklist
1.  [ ] **Atomic Placement**: The guard MUST be the first call in the server action.
2.  [ ] **Specific guards**: Prefer `requireDriver` or `requireAdminOrDriverOwner` over a generic login check.
3.  [ ] **Error Handling**: Allow the guard's error to bubble up; do not wrap it in a try-catch that silences "FORBIDDEN" warnings.

## ✅ Correct Action Example:
```typescript
export async function createDispatch(data: object) {
    const session = await requireAdmin(); // AUTH MUST BE FIRST
    try {
        await prisma.dispatch.create({ ... });
        return { success: true };
    } catch (e) {
        return { success: false, error: "Failed" };
    }
}
```

## ❌ Avoid:
- Running `prisma` logic before calling a protection guard.
- Mixing roles within a single action without using the correct "Or" guard.
- Manual session checks (standardize on `require*` guards).
