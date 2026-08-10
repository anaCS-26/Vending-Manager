import { Prisma } from "@prisma/client";

// ==========================================
// ENTITY TYPES (Prisma-derived)
// ==========================================

/** A warehouse stock record with its associated item */
export type WarehouseWithItem = Prisma.WarehouseStockGetPayload<{
    include: { item: true; warehouse: true };
}>;

/** A warehouse facility record */
export type WarehouseType = Prisma.WarehouseGetPayload<{}>;

/** A machine stock record with its associated item and machine */
export type MachineStockWithItem = Prisma.MachineStockGetPayload<{
    include: { item: true; machine: true };
}>;

/** A full dispatch with driver, items (including item details), and refill logs (including machine details) */
export type DispatchWithRelations = Prisma.DispatchGetPayload<{
    include: {
        // `pin` is omitted globally in the Prisma client (see src/lib/prisma.ts),
        // so the payload type has to omit it too or it won't match what queries
        // actually return. This type is also handed to client components — the
        // hash must never be in it.
        driver: { omit: { pin: true } };
        DispatchItems: { include: { item: true } };
        RefillLogs: { include: { machine: true } };
    };
}>;

/** A dispatch item with its associated item */
export type DispatchItemWithItem = Prisma.DispatchItemGetPayload<{
    include: { item: true };
}>;

/** A dispatch template with its item lines (and each line's item metadata) */
export type DispatchTemplateWithItems = Prisma.DispatchTemplateGetPayload<{
    include: { Items: { include: { item: true } } };
}>;

/** A refill log with its associated machine */
export type RefillLogWithMachine = Prisma.RefillLogGetPayload<{
    include: { machine: true };
}>;

/** A driver record with their current bag stock, excluding the PIN for security */
export type DriverType = Omit<Prisma.DriverGetPayload<{
    include: {
        DriverStock: { include: { item: true } };
    };
}>, "pin">;

/** A row of stock currently in the driver's bag (with item metadata). */
export type DriverBagRow = Prisma.DriverStockGetPayload<{
    include: { item: true };
}>;

/** A stock-assignment audit row, used by the driver-side acknowledgment banner. */
export type StockAssignmentWithItem = Prisma.StockAssignmentGetPayload<{
    include: { item: true };
}>;

/** A machine record */
export type MachineType = Prisma.MachineGetPayload<{}>;

/** A driver with all dispatches and nested relations (for analytics) */
export type DriverWithDispatches = Prisma.DriverGetPayload<{
    include: {
        Dispatches: {
            include: { DispatchItems: true; RefillLogs: true };
        };
    };
}>;

/** A raw system audit-log entry. Actor name is resolved separately (id → name). */
export type SystemAuditLogRow = Prisma.SystemAuditLogGetPayload<{}>;

// ==========================================
// SERVER ACTION RESULT TYPES
// ==========================================

/** Generic result type for all server actions */
export type ActionResult<T = undefined> =
    | { success: true; data: T }
    | { success: false; error: string };

// ==========================================
// PAGINATION TYPES
// ==========================================

export type PaginatedResult<T> = {
    data: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
};

// ==========================================
// PREDICTION TYPES
// ==========================================

export type DepletionPrediction = {
    machineId: number;
    machineName: string;
    district: string;
    itemId: number;
    itemName: string;
    refillsToday: number;
    consumptionRate: number; // units per hour
    predictedHoursUntilEmpty: number | null;
};

// ==========================================
// AI LAB (experimental — super-admin only)
// Demand forecasting & anomaly detection over RefillLog history. See
// src/actions/ai-lab.ts and src/lib/forecast.ts. Read-only / advisory.
// ==========================================

/** One at-risk machine-item row in the Stockout Radar. */
export type StockoutForecast = {
    machineId: number;
    machineName: string;
    district: string;
    itemId: number;
    itemName: string;
    /** MachineStock.estimated_stock — an estimate, not a meter reading. */
    currentStock: number;
    /** Recency-weighted units/day (EWMA of per-interval rates). */
    estDailyDemand: number;
    /** Estimated days until empty at the current demand; null = no measurable demand. */
    daysUntilEmpty: number | null;
    /** Average days between refills for this machine-item (the replenishment lead time). */
    visitCadenceDays: number;
    /** Item.default_assignment_qty as configured today. */
    currentAssignQty: number;
    /** Forecast lead-time demand + safety stock. */
    recommendedAssignQty: number;
    riskLevel: "critical" | "warning" | "ok";
    confidence: "low" | "medium" | "high";
    /** Number of closed refill intervals backing the estimate. */
    observations: number;
};

export type SilentFailureKind =
    | "demand_collapse"
    | "demand_spike"
    | "overdue_service"
    | "abnormal_shrinkage";

/** One anomaly flagged by Silent-Failure Watch. */
export type SilentFailureAlert = {
    /** Stable key, e.g. `demand_collapse-12-3`. */
    id: string;
    kind: SilentFailureKind;
    severity: "critical" | "warning" | "info";
    machineId: number;
    machineName: string;
    district: string;
    itemId: number | null;
    itemName: string | null;
    /** Plain-English one-liner. */
    headline: string;
    /** Supporting numbers / explanation. */
    detail: string;
    /** Compact right-aligned figure, e.g. "−92%". */
    metric: string;
    drillHref: string;
    confidence: "low" | "medium" | "high";
};

// ==========================================
// PUSH NOTIFICATIONS
// ==========================================

/** Everything the notification toggle needs to render, in one round trip. */
export type PushRegistrationStatus = {
    /** False when the server has no VAPID keys — the UI must say so, not offer a dead switch. */
    configured: boolean;
    /** VAPID application-server public key, served at runtime (never a NEXT_PUBLIC_ var). */
    publicKey: string | null;
    /** Devices this user currently has registered, across all their browsers. */
    deviceCount: number;
    maxDevices: number;
};
