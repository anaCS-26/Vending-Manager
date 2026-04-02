# Vending Management System (NexGen Vending)

A premium, high-performance Vending Management System (VMS) built with **Next.js 16 (App Router)** and **Prisma**. This system manages a complex three-tier inventory layer: Central Warehouses, Driver Transits (Dispatches), and Machine Terminals.

---

## 🏗️ Technical Architecture

- **Frontend**: Next.js 16, Tailwind CSS (Neo-Design System - Glassmorphism).
- **Backend**: Next.js Server Actions with Role-Based Access Control (RBAC).
- **Database**: Prisma ORM.
  - **Dev**: SQLite (`prisma/dev.db`).
  - **Prod**: PostgreSQL (Supabase/Mumbai region).
- **Authentication**: NextAuth.js with custom server-side guards (`src/lib/auth-utils.ts`).
- **Real-time Sync**: Lightweight file-based versioning (`.sse/version`) for triggering UI refreshes.

---

## 🧠 Core Business Logic & Models

### 🚛 Three-Tier Inventory Flow
1. **WarehouseStock**: Centralized storage. Tracks `pending_deficit` (Short-shipments from suppliers).
2. **DriverStock**: "Back-stock" carried by drivers between shifts. Managed via Dispatches.
3. **MachineStock**: Terminal inventory. Tracks `estimated_stock` based on refill logs and sales proxies.

### 📈 Accounting & Logistics Patterns
- **Weighted Average Cost (WAC)**: All items use WAC. Updated automatically in `completePurchaseOrder` using the formula: `((Existing Qty * Current Cost) + (New Qty * Purchase Cost)) / Total Qty`.
- **Supplier Deficit Resolution**: If a PO arrives short, the difference is added to `WarehouseStock.pending_deficit`. If a PO arrives with overages, it automatically resolves those deficits.
- **Dispatch Reconciliation**: When a driver returns, any "unaccounted" stock (Given - Refilled - Returned - Damaged) is automatically injected into their `DriverStock` (back-stock) for the next shift.

---

## 🎨 UI/UX Design System
- **Theme**: "Neo-Neo" Aesthetic. High contrast, slate-based dark/light modes.
- **Components**: Glassmorphism panels, subtle micro-animations, and vibrant accent colors for status flags.
- **Rule**: Avoid generic colors. Use the curated slate/glass palette defined in `tailwind.config.ts`.

---

## 🛠️ Operational Workflows
- **Seeding**: `npm run seed` for dev environment.
- **Reset**: `npm run reset` to wipe and re-provision the database.
- **Audit**: All changes to inventory must be logged in either `RefillLog` or `InventoryAdjustment` to maintain the audit trail.

---

## 💡 Maintenance & Future Roadmap

### 🔍 Manual Verification Checks (For Agents)
Until automated skills are created, agents should manually verify these high-risk areas:
- **WAC Consistency Audit**: Every change to `completePurchaseOrder` must the checked against the WAC formula to protect financial data integrity.
- **Inventory Adjustment Trail**: Every stock mutation must be accompanied by an `InventoryAdjustment` entry for the audit ledger.
- **Prisma Client Sync**: If you modify the schema, ensure `npx prisma generate` is run to avoid the "isActive" type errors encountered during early development.

### 🦾 Future Automation Candidates
Ideas for future skills to further optimize developer productivity:
- **Neo-Design Validator**: Automatically check if new UI follows the Slate glassmorphism tokens.
- **WAC Accounting Auditor**: A specialized script to verify the math in `src/actions/orders.ts`.

### Helpful Context for Agents
- Whenever modifying `src/actions`, ensure you add/update the **Standardized Documenting Headers** (Professional JSDoc blocks).
- Always verify if a stock change requires a corresponding `InventoryAdjustment` record for the financial ledger.
- Use `requireAdmin()` or `requireDriver()` guards at the beginning of every Server Action.
