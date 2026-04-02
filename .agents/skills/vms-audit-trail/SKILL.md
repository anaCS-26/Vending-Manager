---
name: vms-audit-trail
description: Ensures every stock mutation has a corresponding record in the audit trail (RefillLog or InventoryAdjustment). 
---

# VMS Audit Trail: Stock Mutation Integrity

In NexGen Vending, **inventory must never change silently.** Every increment or decrement in any stock layer must be linked to a transactional record for financial and logistical accountability.

## 📋 Audit Models (from schema.prisma)

- **`RefillLog`**: Records stock moving from a Driver into a Vending Machine. Tracks items sold, damaged, and price/cost snapshots.
- **`InventoryAdjustment`**: Records manual corrections to stock (e.g., admin fixing a data error). Must include a `reason` and the `priceAtAdjustment`.
- **`PurchaseOrderItem`**: Captures received quantities and costs from suppliers.
- **`ReturnVerification`**: Pre-audit state for items returned in transit. Once approved, converts to an `InventoryAdjustment`.

## 📐 Implementation Checklist
1.  [ ] **No Naked Updates**: Never use `prisma.warehouseStock.update` without a corresponding `InventoryAdjustment` or `PurchaseOrder` transaction.
2.  [ ] **Reasoning**: Every `InventoryAdjustment` must have a descriptive `reason` (e.g., "Monthly Audit Cleanup," "Approved Driver Damage").
3.  [ ] **Snapshotting**: Capture the current `Item.cost` or `price_standard` AT THE TIME OF ADJUSTMENT to maintain historical financial accuracy.
4.  [ ] **Transactionality**: All stock changes and their audit records MUST be wrapped in a single `prisma.$transaction`.

## ✅ Correct Adjustment Example:
```typescript
await tx.$transaction(async (tx) => {
    // 1. Update the stock
    await tx.warehouseStock.update({ ... });

    // 2. CREATE THE AUDIT RECORD
    await tx.inventoryAdjustment.create({
        data: {
            itemId,
            quantity: -5, // Negative for write-off
            reason: "Damaged in warehouse",
            priceAtAdjustment: item.price_standard
        }
    });
});
```

## ❌ Avoid:
- Running `increment` or `decrement` on stock without a linked log model.
- Generic reasons like "update" or "fix" in the adjustment log.
- Forgetting to capture the item's price at the time of the record creation.
