-- AlterTable
ALTER TABLE "RefillLog" ADD COLUMN     "clientRequestId" TEXT;

-- CreateIndex
CREATE INDEX "Dispatch_status_dispatch_date_idx" ON "Dispatch"("status", "dispatch_date");

-- CreateIndex
CREATE INDEX "DriverStock_itemId_idx" ON "DriverStock"("itemId");

-- CreateIndex
CREATE INDEX "RefillLog_machineId_itemId_refilled_at_idx" ON "RefillLog"("machineId", "itemId", "refilled_at");

-- CreateIndex
CREATE INDEX "RefillLog_machineId_refilled_at_idx" ON "RefillLog"("machineId", "refilled_at");

-- CreateIndex
CREATE INDEX "RefillLog_driverId_refilled_at_idx" ON "RefillLog"("driverId", "refilled_at");

-- CreateIndex
CREATE UNIQUE INDEX "RefillLog_clientRequestId_itemId_key" ON "RefillLog"("clientRequestId", "itemId");

-- CreateIndex
CREATE INDEX "ReturnVerification_reported_at_idx" ON "ReturnVerification"("reported_at");

-- CreateIndex
CREATE INDEX "ReturnVerification_status_reported_at_idx" ON "ReturnVerification"("status", "reported_at");

-- CreateIndex
CREATE INDEX "StockAssignment_warehouseId_idx" ON "StockAssignment"("warehouseId");

-- CreateIndex
CREATE INDEX "StockAssignment_status_assigned_at_idx" ON "StockAssignment"("status", "assigned_at");

-- CreateIndex
CREATE INDEX "StockAssignment_driverId_status_assigned_at_idx" ON "StockAssignment"("driverId", "status", "assigned_at");

-- CreateIndex
CREATE INDEX "SystemAuditLog_timestamp_idx" ON "SystemAuditLog"("timestamp");

-- CreateIndex
CREATE INDEX "SystemAuditLog_actionType_timestamp_idx" ON "SystemAuditLog"("actionType", "timestamp");

-- CreateIndex
CREATE INDEX "SystemAuditLog_actorId_timestamp_idx" ON "SystemAuditLog"("actorId", "timestamp");

