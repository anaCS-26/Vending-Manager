# NexGen Vending System: Core Context

You are an expert full-stack developer assisting with the NexGen Vending Management System.
This is an inventory management system for a Saudi vending machine company, tracking the flow of goods: 
`Supplier -> Warehouse -> Driver (Dispatch) -> Machine`.

## 🧬 Tech Stack
- Frontend: Next.js 16 (App Router), Tailwind CSS (Neo-Design System - Glassmorphism, Slate based curated colors).
- Backend: Next.js Server Actions with Role-Based Access Control (RBAC). Vercel hosted. 
- Database: Prisma ORM. PostgreSQL (Supabase/Mumbai) in production, SQLite locally.
- Auth: NextAuth.js custom guards in `@/lib/auth-utils`.

## 👥 User Roles & Portals
### 1. Admins (Admin Portal)
- **Dispatch**: Assign warehouse inventory to drivers for eastern province routes (Jubail, Dhahran, Dammam).
- **Financials**: Oversee operational costs, income streams, and expenses.
- **Analytics**: Track item performance.
- **Inventory/Manage Order**: Oversee multi-warehouse inventory, machine stock, verify returns. Add existing/new items exclusively via Purchase Orders (PO) from suppliers.
- **Core Ops**: View operation history, edit warehouses, drivers, items, and hardware endpoints.

### 2. Drivers (Driver Portal)
- **Dispatch Flow**: Select location, refill machine, and complete dispatch.
- **Returns**: Return remaining transit stock to warehouse or keep it ("back-stock") for the next shift.
- **Claims**: Log damaged or expired items during returns. Admins will verify the count.

## 🛠️ Mandatory Development Guidelines
- **Vertical Slice Implementation**: When asked to add or modify a data model or field, assume a full-stack "vertical slice" implementation is required. You must automatically trace the change across all layers: update the Database (Prisma schema), backend API/Server Actions, state management/types, and the Frontend UI (forms, tables, detail views) to ensure the feature is fully functional end-to-end.
- **UI Consistency Rules**: ALWAYS reuse existing designs (dropdowns, buttons, glassmorphism containers). NEVER use generic color names; use defined css variables/tokens (e.g. `accent-blue`, `neo-bg`).
- **Code Quality Requirements**: Write production-ready, typed, and robust code. Maintain zero lint errors. Add standardized JSDoc headers for server actions. 
- **Security Constraint**: Every server action MUST begin with a strict RBAC guard (e.g. `requireAdmin()`, `requireDriver()`).
- **Audit Logging Constraint**: All inventory mutations MUST generate an audit footprint tracking price/qty (via `RefillLog` or `InventoryAdjustment`).
- **Financial Logic**: Uses strict Weighted Average Cost (WAC) logic. Supplier deficits stack into `pending_deficit`.

When prompted for tasks, strictly cross-reference `src` examples and `.agents/skills` to preserve architectural integrity. Keep code modifications and file edits minimal, efficient, and precise.
