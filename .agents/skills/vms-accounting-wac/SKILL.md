---
name: vms-accounting-wac
description: Mathematical rules for Weighted Average Cost (WAC) and Supplier Deficit resolution in the vending system. Use when modifying procurement or stock integration logic.
---

# VMS Accounting: WAC & Deficit Logic

This skill ensures financial and inventory integrity during the procurement lifecycle.

## 🧠 Core Formula: Weighted Average Cost (WAC)

When new stock is received in a Purchase Order, the item's cost must be updated globally using the Weighted Average Cost formula to maintain accurate financial ledgers.

**Formula**:
`New WAC = ((Current Total Qty * Current WAC) + (Incoming Qty * Incoming Price)) / (Current Total Qty + Incoming Qty)`

### Mandatory Checklist for Procurement:
1.  [ ] **Global Stock Retrieval**: Aggregate current quantity from ALL three inventory layers:
    - `WarehouseStock`
    - `MachineStock`
    - `DriverStock`
2.  [ ] **Price Locking**: Fetch the current cost and incoming cost via Prisma transaction.
3.  [ ] **Divide-by-Zero Guard**: Ensure total quantity > 0 before division.
4.  [ ] **Global Update**: Apply the new WAC to the `Item` record globally.

## 🚛 Supplier Deficit Stacking

If a Purchase Order arrives with quantities lower than requested, the difference must be tracked as a "Deficit."

1.  [ ] **Calculate Shortage**: `DeficitChange = Requested - Received`.
2.  [ ] **Stacking logic**: Add `DeficitChange` to the warehouse's `pending_deficit` for that item.
3.  [ ] **Auto-Resolution**: If Received > Requested (overage), deduct the overage from the existing `pending_deficit`.

## ❌ Incorrect Example:
```typescript
// WRONG: Just overwriting cost
await tx.item.update({
    where: { id: itemId },
    data: { cost: newCost }
});
```

## ✅ Correct Example:
```typescript
// fetch total current stock
const totalStock = await fetchAggregatedStock(tx, itemId);
const previousValue = totalStock * currentCost;
const incomingValue = receivedQty * receivedCost;
const newWAC = (previousValue + incomingValue) / (totalStock + receivedQty);

await tx.item.update({
    where: { id: itemId },
    data: { cost: newWAC }
});
```
