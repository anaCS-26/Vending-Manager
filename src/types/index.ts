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
        driver: true;
        DispatchItems: { include: { item: true } };
        RefillLogs: { include: { machine: true } };
    };
}>;

/** A dispatch item with its associated item */
export type DispatchItemWithItem = Prisma.DispatchItemGetPayload<{
    include: { item: true };
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
