# 🤖 GEMINI.md - Project Context for AI Models

This document provides a high-level overview of the **Vending Manager** project to help AI assistants (like Gemini, Cursor, or specialized models) understand the architecture, coding standards, and business logic of this application.

---

## 🏗️ 1. Project Identity & Purpose
**Vending Manager** is a premium, full-stack Enterprise Resource Planning (ERP) system designed to manage a fleet of vending machines. It tracks inventory across three levels: **Warehouses**, **Drivers (Dispatches)**, and **Machines**.

---

## 🛠️ 2. Technology Stack
*   **Framework**: Next.js 16 (App Router + Turbopack)
*   **Database**: PostgreSQL via **Supabase**
*   **ORM**: Prisma
*   **Styling**: Vanilla CSS + Tailwind CSS 4.0
*   **Animations**: Framer Motion
*   **Icons**: Lucide React
*   **Authentication**: NextAuth.js v5 (Beta)
*   **Storage**: Vercel Blob (for item images)

---

## 📂 3. Architecture & Logic Handling

### **Backend Logic (Server Actions)**
The application follows a **Server Actions** pattern. All mutations (database updates) and data fetching for interactive components are located in:
*   `src/actions/inventory.ts` — Core inventory, machines, and drivers.
*   `src/actions/warehouses.ts` — Warehouse location management.

### **Inventory Flow (Golden Path)**
1.  **WarehouseStock**: Items arrive at a warehouse.
2.  **Dispatch**: Admin assigns items to a **Driver**. This creates `DispatchItem` records and moves stock to `DriverStock`.
3.  **Refill**: Driver goes to a machine, takes items from `DriverStock`, and places them in `MachineStock`.
4.  **Reporting**: Driver reports "Route Returns" (damaged/expired), which are verified by admins.

### **Price Tiers**
The system supports tiered pricing based on the machine's location type:
*   `price_standard` — Default price.
*   `price_hospital` — Applied if the machine's company name/location contains "Hospital", "Clinic", or "Medical".
*   `price_hotel` — Applied if the machine is located in a hotel.

### **Security Safety Gates**
Destructive scripts in the `scripts/` folder (like `reset.ts`) require a mandatory **Safety Key** passed as a command-line argument:
*   Key: `PROD_FORCE_WIPE_2026` / `PROD_FORCE_SEED_2026`
*   Usage: `npx tsx scripts/reset.ts --confirm=PROD_FORCE_WIPE_2026`

---

## ⚠️ 4. Critical Implementation Nuances

### **Prisma Property Casing (IMPORTANT)**
Due to the schema design, there is a naming discrepancy in the Prisma client that often triggers build errors:
*   **Relations (includes)**: Use **PascalCase**. Example: `prisma.driver.findMany({ include: { DriverStock: true } })`.
*   **Database Methods (direct access)**: Use **camelCase**. Example: `tx.driverStock.findUnique(...)`.
*   **Build Fail-safe**: If Vercel build errors occur due to these types, use `(tx as any).driverStock` to bypass strict compiler checks during the transition.

### **Design Aesthetics**
*   **Theme**: Dark-first, glassmorphic aesthetic.
*   **Layout**: Mobile-first responsive cards. On mobile, cards should be horizontal with text on the left and visuals/quantities on the right.
*   **Components**: Use `framer-motion` for all transitions to maintain a "Premium" feel.

---

## 🚀 5. Common Commands
*   `npm run dev` — Start development server.
*   `npx prisma generate` — Regenerate types after schema changes.
*   `npx tsx scripts/reset.ts` — Wipe the database (requires safety key).

---

## 🎯 6. Instructions for AI Models
*   **DO NOT** Use placeholder images. Use the `generate_image` tool if visuals are needed.
*   **PRORITY**: Always prioritize **Mobile Responsiveness** and **Visual Polish**. Avoid generic "MVP" looks.
*   **SECURITY**: Never expose `.env` keys in the code.
*   **PRISMA**: When in doubt about PascalCase vs camelCase for `DriverStock`, refer to the `schema.prisma` definitions.
