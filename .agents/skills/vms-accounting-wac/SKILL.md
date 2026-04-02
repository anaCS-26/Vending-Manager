---
name: vms-accounting-wac
description: Use when modifying procurement, ordering, or warehouse intake logic to establish proper Weighted Average Cost (WAC) and Supplier Deficits.
---

# Skill: VMS Accounting (WAC & Deficit)

## 🎯 Objective
Maintain absolute financial integrity and precise valuation tracking during the procurement lifecycle inside the Vending Management System.

## 🚨 Strict Constraints
- **Never** perform a simple hard-override of `cost` on a global Item record.
- **Always** calculate the exact Weighted Average Cost (WAC) factoring in all 3 inventory dimensions (Warehouse + Machine + Driver).
- **Always** use a Prisma `$transaction` for cost updates.

## ⚙️ WAC Calculation Steps
1. **Fetch Total Existing Stock:** Sum global quantity across `WarehouseStock`, `MachineStock`, and `DriverStock`.
2. **Determine Previous Value:** `(Current Total Stock) * (Current Item Cost)`
3. **Determine Incoming Value:** `(Incoming Qty) * (Incoming Price from PO)`
4. **Calculate New Cost:** `WAC = (Previous Value + Incoming Value) / (Current Total Stock + Incoming Qty)`
5. **Update Item:** Apply new WAC to `Item.cost`. Watch out for divide-by-zero!

## 📦 Supplier Deficit Resolution
When POs are short-shipped, track financial gaps:
1. `DeficitChange = Requested - Received`
2. Add `DeficitChange` to `WarehouseStock.pending_deficit` for exact auditing.
3. If `Received > Requested`, naturally deduct overage from `pending_deficit`.

## 📝 Example Output
### ✅ Valid Update Pattern
```typescript
const totalStock = await fetchAggregatedStock(tx, itemId);
const previousValue = totalStock * currentCost;
const incomingValue = receivedQty * receivedCost;
const newWAC = (previousValue + incomingValue) / (totalStock + receivedQty);

await tx.item.update({
    where: { id: itemId },
    data: { cost: newWAC }
});
```
### ❌ Invalid Pattern
```typescript
// NEVER overwrite cost linearly
await tx.item.update({ where: { id: itemId }, data: { cost: receivedCost }});
```
