/**
 * Centralised reads of build-time feature flags. NEXT_PUBLIC_* vars are
 * inlined into both server and client bundles at build time, so the same
 * helper works on both sides. After flipping a flag, restart the dev server
 * AND hard-refresh the browser once.
 */

/**
 * When true, the admin pushes items directly into a driver's DriverStock
 * (StockAssignment audit + ack flow) instead of creating Dispatch rows, and
 * the driver portal hydrates from DriverStock rather than getActiveDispatches.
 *
 * Phase B dual-run: the legacy dispatch flow still works; this just controls
 * which surface is visible. Cutover happens in Phase B3.
 */
export const USE_DISPATCHLESS = true;

/**
 * When true, the experimental "AI Lab" appears in the super-admin console
 * (/super/lab): the demand-forecasting Stockout Radar and Silent-Failure Watch.
 * Read-only, advisory, super-admin only. Off by default — env-driven so it can
 * be enabled per-environment without a code change. Set
 * NEXT_PUBLIC_ENABLE_AI_LAB=true, then restart the dev server AND hard-refresh.
 */
export const ENABLE_AI_LAB = process.env.NEXT_PUBLIC_ENABLE_AI_LAB === "true";
