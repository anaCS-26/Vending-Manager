---
name: vms-audit-trail
description: Use when adding, deleting, or transferring stock between layers (Warehouse, Machine, Driver) to ensure proper logging entries exist.
---

# Skill: VMS Audit Trail Integrity

## 🎯 Objective
Ensure that **no inventory changes invisibly**. Every single stock increment, decrement, or transfer must be linked 1:1 with an audit-compliant transaction log to maintain financial traceability.

## 🚨 Strict Constraints
- **Never** execute an isolated `stock.update({ quantity: amount })` without creating an associated `InventoryAdjustment` or `RefillLog`.
- **Always** capture the item's historical cost (`priceAtAdjustment`) exactly when the record is created. Prices drift; audits must lock the temporal price.
- **Always** explicitly provide an actionable, human-readable reason for manual changes.

## 📋 Audit Models Reference
- `RefillLog`: Driver -> Machine stock flows. Records items solt/damaged with a price snapshot.
- `InventoryAdjustment`: Manual corrections, administrative resets, approved damage claims.
- `PurchaseOrderItem`: Supplier -> Warehouse intake logs.
- `ReturnVerification`: Pre-audit transit returns.

## ⚙️ Execution Steps for Adjustments
1. Wrap the entire operation in `prisma.$transaction`.
2. Execute the primary stock mutation (`increment` or `decrement` on the target stock model).
3. Immediately invoke `.create()` on the relevant audit table (e.g., `InventoryAdjustment`).
4. Ensure the `quantity` of the adjustment mirrors the exact state change (e.g., `-5` if losing stock). 

## 📝 Example Output
### ✅ Valid Audit Linking
```typescript
await tx.$transaction(async (tx) => {
    // 1. Stock Mutated
    await tx.warehouseStock.update({ ... });

    // 2. Audit Trail Created
    await tx.inventoryAdjustment.create({
        data: {
            itemId,
            quantity: -5,
            reason: "Admin write-off for damage",
            priceAtAdjustment: currentItem.cost // Snapshot vital for accounting 
        }
    });
});
```
### ❌ Invalid Pattern
- Using "Update" or "Fix" as an adjustment reason. 
- Forgetting `priceAtAdjustment`. 
